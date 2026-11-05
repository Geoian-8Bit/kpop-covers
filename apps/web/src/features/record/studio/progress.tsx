import { clamp, formatTime } from '@coverscape/shared';
import { motion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { jelly } from '@/lib/motion';
import { usePlayer } from '@/player/store';
import { HEX, type Phase, type Span } from './types';

function songProgress(span: Span | null, time: number): number {
  return span && Number.isFinite(span.end) && span.end > span.start
    ? clamp((time - span.start) / (span.end - span.start), 0, 1)
    : 0;
}

/**
 * P4 · The song's progress painted straight on the DOM (like the studio's FsProgress): playback never re-renders
 * the bar or the shutter. `paint` gets each new value; the render sets the value of that moment.
 */
function useSongProgressPaint(span: Span | null, paint: (progress: number) => void): void {
  const paintRef = useRef(paint);
  paintRef.current = paint;
  const start = span?.start;
  const end = span?.end;
  useLayoutEffect(() => {
    const range = start != null && end != null ? { start, end } : null;
    let last = Number.NaN;
    const run = (time: number) => {
      // P19: the clock ticks every frame; a step of 1/500 of the song is plenty for a 3 px bar and a ring, and
      // spares a paint over the camera on most frames.
      const p = Math.round(songProgress(range, time) * 500) / 500;
      if (p === last) return;
      last = p;
      paintRef.current(p);
    };
    run(usePlayer.getState().time);
    return usePlayer.subscribe((s) => run(s.time));
  }, [start, end]);
}

/** P19 · The take's clock on its own: a whole second changes once a second, and only this text re-renders. */
export function TakeClock({ read, running }: { read: () => number; running: boolean }) {
  const readRef = useRef(read);
  readRef.current = read;
  const [shown, setShown] = useState(() => Math.max(0, Math.floor(read())));
  useEffect(() => {
    setShown(Math.max(0, Math.floor(readRef.current())));
    if (!running) return;
    const id = setInterval(() => setShown(Math.max(0, Math.floor(readRef.current()))), 250);
    return () => clearInterval(id);
  }, [running]);
  return <>{formatTime(shown)}</>;
}

export function SongBar({ span }: { span: Span }) {
  const fill = useRef<HTMLDivElement>(null);
  useSongProgressPaint(span, (p) => fill.current?.style.setProperty('transform', `scaleX(${p})`));
  return (
    <div className="absolute inset-x-0 top-0 z-20 h-[3px] bg-washi/20">
      <div
        ref={fill}
        className="h-full origin-left bg-shu-400 will-change-transform"
        style={{ transform: `scaleX(${songProgress(span, usePlayer.getState().time)})` }}
      />
    </div>
  );
}

/** Shutter in the app's crest: a hexagon frame that fills with the song while rolling. */
export function Shutter({
  phase,
  span,
  disabled,
  onPress,
}: {
  phase: Phase;
  span: Span | null;
  disabled: boolean;
  onPress: () => void;
}) {
  const ring = useRef<SVGPolygonElement>(null);
  useSongProgressPaint(span, (p) => ring.current?.setAttribute('stroke-dashoffset', String(1 - p)));
  const rolling = phase === 'recording' || phase === 'arming';
  const label =
    phase === 'recording' || phase === 'arming'
      ? 'Pausar la grabación'
      : phase === 'paused'
        ? 'Seguir grabando'
        : phase === 'countdown'
          ? 'Cancelar la cuenta atrás'
          : 'Empezar a grabar';
  return (
    <motion.button
      type="button"
      data-record-shutter
      aria-label={label}
      disabled={disabled || phase === 'finishing'}
      onClick={onPress}
      whileTap={{ scale: 0.9 }}
      transition={jelly}
      className="relative size-20 shrink-0 disabled:opacity-40"
    >
      <svg viewBox="0 0 48 48" className="size-full overflow-visible" aria-hidden>
        <polygon
          points={HEX}
          fill="rgb(0 0 0 / 0.25)"
          stroke="var(--color-kin-400)"
          strokeOpacity={0.7}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        {span && phase !== 'idle' && (
          <polygon
            ref={ring}
            points={HEX}
            pathLength={1}
            fill="none"
            stroke="var(--color-shu-400)"
            strokeWidth="2.6"
            strokeLinejoin="round"
            strokeDasharray="1 1"
            strokeDashoffset={1 - songProgress(span, usePlayer.getState().time)}
          />
        )}
        <motion.rect
          initial={false}
          animate={
            rolling
              ? { x: 16, y: 16, width: 16, height: 16, rx: 3 }
              : { x: 10, y: 10, width: 28, height: 28, rx: 14 }
          }
          transition={jelly}
          fill="var(--color-shu-500)"
        />
      </svg>
    </motion.button>
  );
}
