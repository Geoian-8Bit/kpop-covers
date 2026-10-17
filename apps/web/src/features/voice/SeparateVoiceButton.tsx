import type { Video } from '@coverscape/shared';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AudioLines, Check, Info, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { currentMemberId, useMembers } from '@/data/members';
import { useCurrentStems, useRefreshStems, useRemoveStems } from '@/data/stems';
import { cn } from '@/lib/cn';
import { snappy, soft } from '@/lib/motion';
import { friendlyError } from '@/lib/supabase';
import { useToast } from '@/providers/ToastProvider';
import type { SeparationPreview } from './separate/runSeparation';
import {
  formatBytes,
  formatRange,
  progressLabel,
  progressMilestone,
  progressPercent,
  unsupportedCopy,
  type ProgressState,
} from './separate/separateRules';

type State =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'unsupported'; message: string }
  | { kind: 'confirm'; preview: SeparationPreview }
  | { kind: 'running'; progress: ProgressState; abort: AbortController }
  | { kind: 'error'; message: string }
  /** «Quitar las pistas separadas», asked first. */
  | { kind: 'remove' };

/**
 * 18 · «Separar voz y música»: one button, once per song, on a device that can (the computer). The AI model
 * separates the voice from the music of the linked file and the two tracks go to the group's cloud; from then on
 * «Sin voz» and «Voz» use them on every phone. Says first how long it takes, the model's download and the space it
 * needs; then shows the progress with the time left, and can be cancelled. All its heavy code (the model runtime,
 * the worker) loads only when it is pressed.
 *
 * Only for a file playing on the stage: YouTube's terms forbid separating or modifying its audio.
 */
export function SeparateVoiceButton({ video, available }: { video: Video; available: boolean }) {
  const hasFile = Boolean(video.file_name) && (video.source === 'upload' || video.source === 'youtube');
  const stems = useCurrentStems(video, available && hasFile);
  const members = useMembers();
  const refresh = useRefreshStems();
  const remove = useRemoveStems();
  const toast = useToast();
  const reduce = useReducedMotion() ?? false;
  const [state, setState] = useState<State>({ kind: 'idle' });
  const mounted = useRef(true);
  const job = useRef<AbortController | null>(null);
  const isRunning = state.kind === 'running';

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Leaving the song (or the studio) mid-way stops the work: nothing half-done is shared.
      job.current?.abort();
    };
  }, [video.id]);
  // Closing the tab mid-way would lose the work: the browser asks first.
  useEffect(() => {
    if (!isRunning) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isRunning]);
  const running = state.kind === 'running' ? state : null;

  // Each step replaces the button that was pressed: focus goes to what comes next (the confirmation's title, then
  // «Cancelar», then the result), never to the page body. The next view mounts after the exit animation, so it
  // takes the focus from its own ref when it appears.
  const focusNext = useRef<string | null>(null);
  const focusOnMount = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      if (el && focusNext.current === key) {
        focusNext.current = null;
        el.focus({ preventScroll: true });
      }
    },
    [],
  );

  const set = (next: State, focus?: string) => {
    if (!mounted.current) return;
    if (focus) focusNext.current = focus;
    setState(next);
  };

  if (!available || !hasFile) return null;

  if (stems && state.kind !== 'running') {
    if (state.kind === 'remove') {
      return (
        <div className="mt-2.5 rounded-[12px] border border-line-strong px-3.5 py-3" role="group" aria-labelledby={`stems-remove-${video.id}`}>
          <p
            id={`stems-remove-${video.id}`}
            ref={focusOnMount('remove')}
            tabIndex={-1}
            className="text-[14px] font-bold text-washi outline-none"
          >
            ¿Quitar las pistas separadas?
          </p>
          <p className="mt-1 text-[13px] leading-snug text-washi-muted">
            «Sin voz» y «Voz» volverán a la separación aproximada en todos los móviles. Después se puede volver a separar.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button
              variant="danger"
              className="min-h-11"
              loading={remove.isPending}
              onClick={() =>
                remove.mutate(video, {
                  onSuccess: () => {
                    set({ kind: 'idle' }, 'idle');
                    toast('Pistas separadas quitadas: «Sin voz» y «Voz» usan la separación aproximada', 'success');
                  },
                  onError: (error) => toast(friendlyError(error), 'error'),
                })
              }
            >
              Quitar
            </Button>
            <Button variant="ghost" className="min-h-11" onClick={() => set({ kind: 'idle' }, 'stems-done')}>
              Cancelar
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="mt-2">
        <p
          ref={focusOnMount('stems-done')}
          tabIndex={-1}
          className="flex items-start gap-2 text-[13px] leading-snug text-washi-muted outline-none"
          role="status"
        >
          <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-kin-300" />
          <span>Voz y música separadas con IA: «Sin voz» y «Voz» usan las pistas separadas.</span>
        </p>
        <Button variant="ghost" size="sm" className="mt-1 min-h-11 px-2" onClick={() => set({ kind: 'remove' }, 'remove')}>
          Quitar las pistas separadas
        </Button>
      </div>
    );
  }

  async function check() {
    set({ kind: 'checking' });
    try {
      const flow = await import('./separate/runSeparation');
      const choice = await flow.checkDevice();
      if (choice.kind === 'none') {
        set({ kind: 'unsupported', message: unsupportedCopy(choice.reason) }, 'notice');
        return;
      }
      set({ kind: 'confirm', preview: await flow.previewSeparation(video, choice.kind, choice.mobile) }, 'confirm');
    } catch (error) {
      set({ kind: 'error', message: friendlyError(error) }, 'notice');
    }
  }

  /** «Borrar el modelo de IA»: frees its space on this device (a broken download goes too); the next time downloads it. */
  async function forgetModel(preview: SeparationPreview) {
    const model = await import('./separate/model');
    await model.clearModelCache();
    toast('Modelo de IA borrado de este dispositivo', 'success');
    set(
      { kind: 'confirm', preview: { ...preview, modelBytes: model.MODELS[preview.engine].bytes, hasModelCache: await model.hasModelCache() } },
      'confirm',
    );
  }

  async function start(preview: SeparationPreview) {
    const abort = new AbortController();
    job.current = abort;
    set({ kind: 'running', progress: { phase: 'read' }, abort }, 'cancel');
    try {
      const flow = await import('./separate/runSeparation');
      const row = await flow.runSeparation({
        video,
        engine: preview.engine,
        memberId: currentMemberId(members.data),
        signal: abort.signal,
        onProgress: (progress) => set({ kind: 'running', progress, abort }),
      });
      refresh(video.id, row);
      set({ kind: 'idle' }, 'stems-done');
      toast('Listo: «Sin voz» y «Voz» ya usan las pistas separadas en todos los móviles', 'success');
    } catch (error) {
      if (abort.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        set({ kind: 'idle' }, 'idle');
        return;
      }
      console.error('[separate]', error);
      set({ kind: 'error', message: friendlyError(error) }, 'notice');
    } finally {
      if (job.current === abort) job.current = null;
    }
  }

  const fade = reduce ? { duration: 0.12 } : snappy;

  return (
    <div className="mt-2.5">
      {/* Read out only at milestones (each phase, every 25 %). */}
      <p className="sr-only" aria-live="polite">
        {running ? progressMilestone(running.progress) : ''}
      </p>
      <AnimatePresence initial={false} mode="wait">
        {state.kind === 'idle' || state.kind === 'checking' || state.kind === 'remove' ? (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={soft}>
            <Button
              ref={focusOnMount('idle')}
              variant="secondary"
              className="min-h-11 w-full sm:w-auto"
              loading={state.kind === 'checking'}
              onClick={() => void check()}
            >
              <Sparkles aria-hidden className="size-4" />
              Separar voz y música
            </Button>
            <p className="mt-1.5 text-[12px] leading-snug text-washi-subtle">
              Con IA, una sola vez por canción y mejor desde el ordenador: después «Sin voz» y «Voz» funcionan en
              todos los móviles.
            </p>
          </motion.div>
        ) : state.kind === 'unsupported' || state.kind === 'error' ? (
          <motion.div
            key="notice"
            role="alert"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={soft}
            className="rounded-[12px] border border-line-strong px-3.5 py-3"
          >
            <p
              ref={focusOnMount('notice')}
              tabIndex={-1}
              className="flex items-start gap-2 text-[13px] leading-snug text-washi outline-none"
            >
              <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-kin-300" />
              <span>{state.message}</span>
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {state.kind === 'error' && (
                <Button variant="secondary" className="min-h-11" onClick={() => void check()}>
                  Reintentar
                </Button>
              )}
              <Button variant="ghost" className="min-h-11" onClick={() => set({ kind: 'idle' }, 'idle')}>
                {state.kind === 'error' ? 'Cerrar' : 'Entendido'}
              </Button>
            </div>
          </motion.div>
        ) : state.kind === 'confirm' ? (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, y: reduce ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={fade}
            className="rounded-[12px] border border-line-strong px-3.5 py-3"
          >
            <p
              ref={focusOnMount('confirm')}
              tabIndex={-1}
              className="flex items-center gap-2 text-[14px] font-bold text-washi outline-none"
            >
              <AudioLines aria-hidden className="size-4 text-kin-300" />
              Separar la voz de la música
            </p>
            <ul className="mt-2 space-y-1.5 text-[13px] leading-snug text-washi-muted">
              <li>En este dispositivo tarda {formatRange(state.preview.estimate)}.</li>
              {state.preview.mobile && (
                <li className="text-kin-300">En el móvil va más lento y gasta batería: mejor desde el ordenador.</li>
              )}
              {state.preview.modelBytes > 0 && (
                <li>
                  La primera vez se baja el modelo de IA ({formatBytes(state.preview.modelBytes)}, de Hugging Face);
                  luego queda guardado en este dispositivo.
                </li>
              )}
              <li className={cn(!state.preview.space.ok && 'text-shu-400')}>
                {state.preview.space.ok
                  ? `Las dos pistas ocuparán unos ${formatBytes(state.preview.space.needed)} en la nube del grupo${
                      Number.isFinite(state.preview.space.free) ? ` (quedan ${formatBytes(state.preview.space.free)})` : ''
                    }.`
                  : `No hay espacio en la nube del grupo: hacen falta unos ${formatBytes(state.preview.space.needed)} y quedan ${formatBytes(state.preview.space.free)}.`}
              </li>
              <li>No cierres esta pestaña mientras tanto.</li>
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                className="min-h-11"
                disabled={!state.preview.space.ok}
                onClick={() => void start(state.preview)}
              >
                Empezar
              </Button>
              <Button variant="ghost" className="min-h-11" onClick={() => set({ kind: 'idle' }, 'idle')}>
                Ahora no
              </Button>
            </div>
            {/* Also with a download left halfway: its pieces are on this device too (the privacy page says so). */}
            {state.preview.hasModelCache && (
              <Button variant="ghost" size="sm" className="mt-1 min-h-11 px-2 text-washi-subtle" onClick={() => void forgetModel(state.preview)}>
                Borrar el modelo de IA de este dispositivo
              </Button>
            )}
          </motion.div>
        ) : (
          <motion.div key="running" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={soft}>
            <Progress progress={state.progress} reduce={reduce} />
            <div className="mt-2 flex items-center justify-between gap-3">
              <p id={`stems-cancel-note-${video.id}`} className="text-[12px] leading-snug text-washi-subtle">
                {state.progress.phase === 'upload'
                  ? 'Ya se están subiendo las pistas: en un momento está. No cierres esta pestaña.'
                  : 'No cierres esta pestaña.'}
              </p>
              <Button
                ref={focusOnMount('cancel')}
                variant="secondary"
                // Not \`disabled\` while uploading: the focus stays on it instead of falling to the page.
                className={cn('min-h-11', state.progress.phase === 'upload' && 'cursor-not-allowed opacity-40')}
                aria-disabled={state.progress.phase === 'upload' || undefined}
                aria-describedby={`stems-cancel-note-${video.id}`}
                onClick={() => {
                  if (state.progress.phase !== 'upload') state.abort.abort();
                }}
              >
                Cancelar
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Progress({ progress, reduce }: { progress: ProgressState; reduce: boolean }) {
  const pct = progressPercent(progress);
  return (
    <div>
      <p className="mb-1 text-[13px] text-washi" aria-hidden>
        {progressLabel(progress)}
      </p>
      <div
        role="progressbar"
        aria-label="Progreso de la separación"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
        aria-valuetext={progressLabel(progress)}
        className="h-2 overflow-hidden rounded-full bg-sumi-700"
      >
        {pct == null ? (
          // A phase that can't tell how far it is: a soft pulse instead of a number.
          <motion.div
            className="h-full w-full origin-left rounded-full bg-kin-300/60"
            initial={{ opacity: 0.35 }}
            animate={reduce ? { opacity: 0.6 } : { opacity: [0.35, 0.8, 0.35] }}
            transition={reduce ? { duration: 0.12 } : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          />
        ) : (
          <motion.div
            className="h-full w-full origin-left rounded-full bg-kin-300"
            initial={false}
            animate={{ scaleX: Math.max(0.02, pct / 100) }}
            transition={reduce ? { duration: 0.12 } : snappy}
          />
        )}
      </div>
    </div>
  );
}
