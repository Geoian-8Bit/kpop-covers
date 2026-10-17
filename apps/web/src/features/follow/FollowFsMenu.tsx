import type { FollowPath, Video } from '@coverscape/shared';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Crosshair, FileVideo, MapPin, MapPinOff, PenLine, UserRoundSearch, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { zoomAvailability } from '@/features/studio/ZoomControls';
import { fsChrome } from '@/features/studio/fullscreenChrome';
import { cn } from '@/lib/cn';
import { jelly, snappy } from '@/lib/motion';
import { rememberStage } from '@/lib/stagePref';
import { useBackToClose } from '@/lib/useBackToClose';
import { usePlayer } from '@/player/store';
import { NO_ZOOM } from '@/player/zoom';
import { FollowNameForm, followNameHelp } from './FollowRow';
import {
  followUi,
  jobLine,
  jobMilestone,
  jobPercent,
  rememberFollowOpener,
  useFollowUi,
  type FollowDraft,
  type PickMode,
} from './followUi';
import { useFollowActions } from './useFollowActions';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/**
 * 14 · «Seguir a un bailarín» in fullscreen: one small button in the top bar (it hides with the rest of the
 * controls) that opens a compact panel under it — who to follow, start following (then tap the dancer on the
 * video or draw a box), correct, the manual mode, the analysis' progress and stop. Over the video, nothing else:
 * the progress is a thin line along its top (FollowStageLayer). Mounted only while fullscreen is on.
 *
 * The wrapper is not positioned: the panel sits against the top bar, whatever the button's place in it.
 */
export function FollowFsButton({ video }: { video: Video }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const draft = useFollowUi((s) => s.draft);
  const following = usePlayer((s) => s.followPathId != null);
  const working = useFollowUi((s) => s.job != null);
  const titleId = useId();

  // While mounted, the name is asked here (FollowRow's dialog would open under the fullscreen).
  useEffect(() => {
    followUi.fsHost(1);
    return () => followUi.fsHost(-1);
  }, []);
  // A dancer just chosen on the video: the panel opens on the name.
  useEffect(() => {
    if (draft) setOpen(true);
  }, [draft]);
  // An open panel keeps the controls up (they don't hide under it).
  useEffect(() => {
    fsChrome.setMenu(open);
    return () => fsChrome.setMenu(false);
  }, [open]);

  const close = (focusBack = true) => {
    setOpen(false);
    if (useFollowUi.getState().draft) followUi.draft(null);
    if (focusBack && panelRef.current?.contains(document.activeElement)) buttonRef.current?.focus();
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  useBackToClose(open, () => closeRef.current());
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      const field = panel?.querySelector<HTMLElement>('input');
      // On a phone the keyboard would cover the video for nothing: the field waits for a tap.
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      (field && !coarse ? field : panel?.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    });
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      closeRef.current(false);
      // 13 · The tap only closes the panel: its click doesn't go on to the stage (pause/play) or a control.
      const swallow = (click: MouseEvent) => {
        click.preventDefault();
        click.stopPropagation();
        stop();
      };
      const stop = () => {
        clearTimeout(timer);
        window.removeEventListener('click', swallow, true);
      };
      const timer = setTimeout(stop, 700);
      window.addEventListener('click', swallow, true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
        return;
      }
      // Modal while open (the studio's shortcuts are off): Tab stays in the panel.
      const panel = panelRef.current;
      if (e.key !== 'Tab' || !panel) return;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!nodes.length) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      const outside = !panel.contains(document.activeElement);
      if (e.shiftKey && (outside || document.activeElement === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (outside || document.activeElement === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div className="fs-hit pointer-events-none shrink-0">
      <motion.button
        ref={buttonRef}
        type="button"
        aria-label={following ? 'Seguir a un bailarín (siguiendo a alguien)' : 'Seguir a un bailarín'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        whileTap={{ scale: 0.88 }}
        transition={jelly}
        className={cn(
          'relative -my-1.5 grid size-11 place-items-center rounded-full transition-colors hover:bg-washi/15 active:bg-washi/20',
          following || open ? 'text-kin-300' : 'text-washi',
        )}
      >
        <UserRoundSearch className="size-5" />
        {(following || working) && <StateDot working={working} />}
      </motion.button>
      {/* 14 · The one live region while in fullscreen (the row under the player stays quiet meanwhile). */}
      <JobMilestone />
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
            transition={snappy}
            className={cn(
              'absolute right-[max(12px,env(safe-area-inset-right))] top-[calc(max(12px,env(safe-area-inset-top))+48px)] z-10',
              'w-[min(340px,calc(100vw-24px))] origin-top-right overflow-y-auto overscroll-contain rounded-[14px]',
              // Down to the bottom of the screen (in landscape it covers the bottom bar while open; a tap outside closes it).
              'max-h-[calc(100dvh-max(12px,env(safe-area-inset-top))-48px-max(12px,env(safe-area-inset-bottom)))]',
              'bg-sumi-950/95 p-3 text-washi shadow-xl ring-1 ring-washi/15',
            )}
          >
            {draft ? (
              <>
                <PanelHeader id={titleId} title="¿A quién sigues?" onClose={() => close()} />
                <p className="mb-3 text-[12px] leading-snug text-washi-muted">{followNameHelp(draft)}</p>
                <NameStep video={video} draft={draft} onDone={() => close()} />
              </>
            ) : (
              <>
                <PanelHeader id={titleId} title="Seguir a un bailarín" onClose={() => close()} />
                <PanelBody video={video} onPick={() => setOpen(false)} buttonRef={buttonRef} />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NameStep({ video, draft, onDone }: { video: Video; draft: FollowDraft; onDone: () => void }) {
  const actions = useFollowActions(video);
  return <FollowNameForm draft={draft} onDone={onDone} actions={actions} compact />;
}

function JobMilestone() {
  const text = useFollowUi((s) => (s.job ? jobMilestone(s.job) : ''));
  return (
    <p className="sr-only" aria-live="polite">
      {text}
    </p>
  );
}

function StateDot({ working }: { working: boolean }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      className="absolute right-2 top-2 size-2 rounded-full bg-kin-300 ring-2 ring-sumi-950"
      animate={working && !reduce ? { opacity: [1, 0.35, 1] } : { opacity: 1 }}
      transition={working && !reduce ? { duration: 1.4, repeat: Infinity } : { duration: 0.2 }}
    />
  );
}

function PanelHeader({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <h2
        id={id}
        className="min-w-0 flex-1 truncate text-[12px] font-bold uppercase tracking-[0.12em] text-washi-subtle"
      >
        {title}
      </h2>
      <Button variant="ghost" size="icon" aria-label="Cerrar" className="-my-1 -mr-1.5" onClick={onClose}>
        <X className="size-4.5" />
      </Button>
    </div>
  );
}

function PanelBody({
  video,
  onPick,
  buttonRef,
}: {
  video: Video;
  onPick: () => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const stage = usePlayer((s) => s.stage);
  const ready = usePlayer((s) => s.ready);
  const followId = usePlayer((s) => s.followPathId);
  const { can, reason } = zoomAvailability(video, stage, ready);
  const actions = useFollowActions(video);
  const paths = actions.paths.data ?? [];
  const selected = paths.find((p) => p.id === followId) ?? null;
  const job = useFollowUi((s) => s.job);
  const picking = useFollowUi((s) => s.picking);
  const busy = Boolean(job) || actions.saving;
  const choosing = (Boolean(job) && !job?.ready) || actions.saving;
  const nearPoint = usePlayer((s) =>
    selected?.source === 'manual' ? selected.keyframes.some((k) => Math.abs(k[0] - s.time) <= 0.25) : false,
  );

  function startPicking(mode: PickMode) {
    // Focus goes back to the fullscreen button when the choice on the video ends.
    rememberFollowOpener(buttonRef.current);
    usePlayer.getState().pause();
    onPick();
    followUi.pick(mode);
  }

  function follow(path: FollowPath | null) {
    usePlayer.getState().setFollowPath(path?.id ?? null);
    if (!path) usePlayer.getState().setZoom(NO_ZOOM);
  }

  return (
    <div className="space-y-3">
      {job && (
        <div>
          <p className="mb-1.5 text-[13px] leading-snug" aria-hidden>
            {jobLine(job)}
          </p>
          <div className="flex items-center gap-2">
            <div
              role="progressbar"
              aria-label="Progreso del análisis"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={jobPercent(job)}
              className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-sumi-700"
            >
              <motion.div
                className="h-full origin-left rounded-full bg-kin-300"
                initial={false}
                animate={{ scaleX: jobPercent(job) / 100 }}
                transition={snappy}
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="min-h-11"
              data-follow-cancel
              disabled={job.phase === 'saving'}
              aria-label={job.ready ? 'Parar el análisis (se guarda lo analizado)' : 'Cancelar el análisis'}
              onClick={() => job.abort.abort()}
            >
              {job.ready ? 'Parar' : 'Cancelar'}
            </Button>
          </div>
        </div>
      )}

      {paths.length > 0 && (
        <div role="radiogroup" aria-label="¿A quién sigues?" className="flex flex-wrap gap-1.5">
          {[null, ...paths].map((p) => {
            const on = (p?.id ?? null) === (selected?.id ?? null);
            return (
              <motion.button
                key={p?.id ?? 'none'}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={choosing}
                onClick={() => follow(p)}
                whileTap={{ scale: 0.92 }}
                transition={jelly}
                className={cn(
                  'flex min-h-11 max-w-full items-center rounded-[10px] border px-3 text-[13px] font-medium transition-colors disabled:opacity-40',
                  on
                    ? 'border-washi bg-washi text-sumi-900'
                    : 'border-line text-washi-muted hover:text-washi',
                )}
              >
                <span className="truncate">{p ? p.label : 'Nadie'}</span>
              </motion.button>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Button
          variant="secondary"
          className="min-h-11 justify-start"
          disabled={!can || busy || picking != null}
          onClick={() => startPicking({ kind: 'auto' })}
        >
          <UserRoundSearch className="size-4" /> Seguir a alguien
        </Button>
        {selected?.source === 'auto' && can && (
          <Button
            variant="ghost"
            className="min-h-11 justify-start"
            disabled={busy || picking != null}
            onClick={() => startPicking({ kind: 'correct', pathId: selected.id })}
          >
            <Crosshair className="size-4" /> Corregir desde aquí
          </Button>
        )}
        {selected?.source === 'manual' && (
          <Button
            variant="ghost"
            className="min-h-11 justify-start"
            disabled={busy || picking != null}
            onClick={() => startPicking({ kind: 'point', pathId: selected.id })}
          >
            <MapPin className="size-4" /> {nearPoint ? 'Mover el punto' : 'Añadir punto aquí'}
          </Button>
        )}
        {selected?.source === 'manual' && nearPoint && (
          <Button
            variant="ghost"
            className="min-h-11 justify-start"
            disabled={busy || picking != null}
            onClick={() => void actions.removePoint(selected, usePlayer.getState().time)}
          >
            <MapPinOff className="size-4" /> Quitar punto
          </Button>
        )}
        <Button
          variant="ghost"
          className="min-h-11 justify-start"
          disabled={busy || picking != null}
          onClick={() => startPicking({ kind: 'manual' })}
        >
          <PenLine className="size-4" /> Modo manual
        </Button>
      </div>

      <p className="text-[12px] leading-snug text-washi-subtle">
        {reason === 'link' ? (
          'Con YouTube la app no puede ver la imagen: solo hay modo manual. El zoom que sigue se ve con el archivo.'
        ) : reason === 'switch' ? (
          <span className="flex flex-wrap items-center gap-x-2">
            Para analizar y ver el zoom que sigue, usa el archivo.
            <button
              type="button"
              onClick={() => {
                usePlayer.getState().setStage('file');
                rememberStage(video.id, 'file');
              }}
              className="inline-flex min-h-11 items-center gap-1 font-medium text-kin-300 hover:underline"
            >
              <FileVideo className="size-3.5" /> Usar el archivo
            </button>
          </span>
        ) : selected ? (
          `Siguiendo a «${selected.label}». Si salta a otra persona, pausa ahí y pulsa «Corregir desde aquí».`
        ) : (
          'Pulsa «Seguir a alguien» y toca al bailarín en el vídeo (o dibuja un recuadro a su alrededor).'
        )}
      </p>
    </div>
  );
}
