import { minutesPhrase } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Trash2 } from 'lucide-react';
import { memo, useLayoutEffect, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { soft } from '@/lib/motion';
import type { Leftover } from '../takeStore';
import { formatZoom, type ZoomChip } from '../useCamera';
import { useCameraZoom } from '../zoomStore';
import { Shutter } from './progress';
import { preloadClapArm } from './lazyPanels';
import { RailButton } from './RailButton';
import type { Phase, Span } from './types';

/** Bottom controls (a right-hand column when the phone is turned): notices, lenses and zoom, the shutter row. */
export const BottomControls = memo(function BottomControls({
  phase,
  span,
  camReady,
  canTweak,
  supported,
  notice,
  leftover,
  leftoverCount,
  videoId,
  lowSpace,
  spaceMinutes,
  benchRunning,
  digital,
  chips,
  activeChip,
  canChangeCamera,
  clapArmed,
  hint,
  onRecover,
  onDropLeftover,
  onChip,
  onArm,
  onDiscard,
  onShutter,
  onFinish,
}: {
  phase: Phase;
  span: Span | null;
  camReady: boolean;
  canTweak: boolean;
  supported: boolean;
  notice: string;
  leftover: Leftover | null;
  leftoverCount: number;
  videoId: string;
  lowSpace: boolean;
  spaceMinutes: number | null;
  benchRunning: boolean;
  digital: boolean;
  chips: ZoomChip[];
  activeChip: string;
  canChangeCamera: boolean;
  clapArmed: boolean;
  /** The line under the shutter. */
  hint: string;
  onRecover: () => void;
  onDropLeftover: () => void;
  onChip: (chip: ZoomChip) => void;
  onArm: () => void;
  onDiscard: () => void;
  onShutter: () => void;
  onFinish: () => void;
}) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-4 bg-gradient-to-t from-black/80 to-transparent px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-12 landscape:inset-x-auto landscape:right-0 landscape:top-0 landscape:flex-row landscape:bg-gradient-to-l landscape:pb-0 landscape:pl-12 landscape:pr-[max(16px,env(safe-area-inset-right))] landscape:pt-0">
      <AnimatePresence>
        {notice && (
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={soft}
            role="status"
            className="max-w-sm rounded-[10px] bg-sumi-900/90 px-3 py-2 text-center text-[13px] leading-snug text-washi landscape:absolute landscape:bottom-[max(16px,env(safe-area-inset-bottom))] landscape:right-[max(16px,env(safe-area-inset-right))] landscape:w-72"
          >
            {notice}
          </motion.p>
        )}
      </AnimatePresence>

      {phase === 'idle' && leftover && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={soft}
          role="status"
          aria-label="Toma sin guardar"
          className="w-full max-w-sm rounded-[14px] border border-kin-400/45 bg-sumi-900/95 p-3 text-[13px] leading-snug landscape:absolute landscape:bottom-[max(16px,env(safe-area-inset-bottom))] landscape:right-[max(16px,env(safe-area-inset-right))] landscape:z-20 landscape:w-80"
        >
          <p className="font-bold text-washi">
            {leftover.meta.videoId === videoId
              ? 'Hay una toma sin guardar de esta canción'
              : `Hay una toma sin guardar de «${leftover.meta.title || 'otra canción'}»`}
          </p>
          <p className="mt-0.5 text-washi-muted">
            Del{' '}
            {new Date(leftover.meta.startedAt).toLocaleString('es-ES', {
              dateStyle: 'short',
              timeStyle: 'short',
            })}{' '}
            · {(leftover.size / 1_048_576).toFixed(1).replace('.', ',')} MB. No llegó a guardarse en el móvil.
            {leftoverCount > 1 && ` Hay ${leftoverCount} en total.`}
          </p>
          <div className="mt-2.5 flex gap-3">
            <Button onClick={onRecover}>Recuperar</Button>
            <Button variant="ghost" onClick={onDropLeftover}>
              Descartar
            </Button>
          </div>
        </motion.div>
      )}

      {phase === 'idle' && camReady && lowSpace && (
        <p
          role="status"
          className="max-w-sm rounded-[10px] border border-shu-400/70 bg-enji-700/95 px-3 py-2 text-center text-[13px] font-bold leading-snug text-washi"
        >
          Queda poco espacio en el móvil: {minutesPhrase(spaceMinutes ?? 0)} de grabación en esta calidad.
          Libera espacio antes de una toma larga.
        </p>
      )}

      {/* P19 review · The rehearsal costs a couple of seconds of encoding on a slow phone: say what it is. */}
      <AnimatePresence>
        {camReady && phase === 'idle' && benchRunning && !notice && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={soft}
            role="status"
            className="pointer-events-none rounded-full bg-sumi-900/90 px-3 py-1 text-[12px] font-bold text-washi landscape:hidden"
          >
            Comprobando que el móvil va fluido…
          </motion.p>
        )}
      </AnimatePresence>

      {/* Q7: a crop of the frame is less sharp than the lens's own zoom; say so while it's on. */}
      <AnimatePresence>
        {camReady && digital && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={soft}
            role="status"
            className="pointer-events-none rounded-full bg-sumi-900/90 px-3 py-1 text-[12px] font-bold text-washi"
          >
            Zoom digital: menos nitidez
          </motion.p>
        )}
      </AnimatePresence>

      {camReady && (canTweak || phase === 'recording') && (
        // P23 · Lenses and zoom like the phone's camera app: 0,5× is the ultra-wide, 1× the main lens, «Tele» the
        // telephoto; a rear camera the browser doesn't identify is «Otra». Switching lens reopens the camera, so
        // while rolling only the zooms of the lens in use are offered.
        <div
          role="group"
          aria-label="Lentes y zoom"
          // Solid ink behind the 12 px numbers: readable over a white wall too (WCAG 1.4.3).
          className="flex items-center gap-1 rounded-full bg-sumi-900/90 p-1 landscape:flex-col"
        >
          {chips
            .filter((c) => canTweak || c.key === activeChip || !c.switches)
            .map((c) => (
              <ChipButton
                key={c.key}
                chip={c}
                active={c.key === activeChip}
                canChangeCamera={canChangeCamera}
                onChip={onChip}
              />
            ))}
        </div>
      )}

      <div className="flex items-center justify-center gap-10 landscape:flex-col-reverse landscape:gap-6">
        <div className="grid size-14 place-items-center">
          {/* F7: arm, and the take starts with a double clap from wherever the dancer stands. */}
          {phase === 'idle' && camReady && supported && (
            <RailButton
              label="Armar"
              ariaLabel="Armar: empezar a grabar con un doble aplauso"
              pressed={clapArmed}
              onClick={onArm}
              onPointerDown={preloadClapArm}
            >
              <span aria-hidden className="font-display text-[19px] font-extrabold leading-none">
                拍
              </span>
            </RailButton>
          )}
          {phase === 'paused' && (
            // Same verb as its dialog («¿Descartar la toma?»).
            <RailButton label="Descartar" ariaLabel="Descartar la toma" onClick={onDiscard}>
              <Trash2 className="size-5" />
            </RailButton>
          )}
        </div>
        <Shutter
          phase={phase}
          span={span}
          disabled={!supported || (!camReady && (phase === 'idle' || phase === 'paused'))}
          onPress={onShutter}
        />
        <div className="grid size-14 place-items-center">
          {(phase === 'paused' || phase === 'recording') && (
            <RailButton label="Listo" ariaLabel="Terminar la toma" tone="light" onClick={onFinish}>
              <Check className="size-6" strokeWidth={2.6} />
            </RailButton>
          )}
        </div>
      </div>

      <p className="tabular min-h-4 text-center text-[12px] text-washi/75 landscape:hidden">{hint}</p>
    </div>
  );
});

/** What a chip says: the zoom really in use, when a pinch moved it off the active button's own number. */
function chipText(c: ZoomChip, active: boolean, zoom: number): { shown: string; ariaLabel: string } {
  const shown = active && c.zoom != null && Math.abs(zoom - c.zoom) > 0.05 ? formatZoom(zoom) : c.label;
  return { shown, ariaLabel: shown !== c.label ? `${c.ariaLabel}; ahora ${shown}` : c.ariaLabel };
}

/**
 * P23 · A lens or zoom button. REQ-23 · The active one follows a pinch from the zoom store, written straight on the
 * button (its number and its label): the pinch never re-renders the recorder.
 */
function ChipButton({
  chip: c,
  active,
  canChangeCamera,
  onChip,
}: {
  chip: ZoomChip;
  active: boolean;
  canChangeCamera: boolean;
  onChip: (chip: ZoomChip) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (!active || c.zoom == null) return;
    let last = chipText(c, active, useCameraZoom.getState().zoom).shown;
    return useCameraZoom.subscribe((z) => {
      const el = ref.current;
      const next = chipText(c, active, z.zoom);
      if (!el || next.shown === last) return;
      last = next.shown;
      el.textContent = next.shown;
      el.setAttribute('aria-label', next.ariaLabel);
    });
  }, [c, active]);
  const { shown, ariaLabel } = chipText(c, active, useCameraZoom.getState().zoom);
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={active}
      // The zoom really in use, when a pinch moved it off the button's own number.
      aria-label={ariaLabel}
      aria-disabled={(c.switches && !canChangeCamera) || undefined}
      onClick={() => onChip(c)}
      className={cn(
        'tabular grid h-11 min-w-11 place-items-center rounded-full px-1.5 font-mono text-[12px] font-bold transition-colors',
        active ? 'bg-washi text-sumi-900' : 'text-washi',
      )}
    >
      {shown}
    </button>
  );
}
