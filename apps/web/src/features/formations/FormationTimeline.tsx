import { clamp, formatTime } from '@coverscape/shared';
import { motion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import type { FormationInput } from '@/data/formations';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { hasRange, usePlayer } from '@/player/store';
import { formatMoment, moveWindow } from './formationRules';

interface MarkerDrag {
  id: string;
  pointerId: number;
  x: number;
  at: number;
  moved: boolean;
}

/** The span the timeline draws: the player's duration once known, else enough to show every formation. */
export function timelineSpan(duration: number, list: readonly FormationInput[]): number {
  if (duration > 0) return duration;
  const last = list.length ? list[list.length - 1]!.at : 0;
  return Math.max(30, Math.ceil(last + 10));
}

/**
 * REQ-06 · The editor's timeline: a marker per formation (tap jumps to it, drag moves its moment) with its transition
 * drawn before it, and the track (dragging it moves the time; only a marker grabs, like the A/B seals of REQ-01).
 * `underlay` draws beneath the track (REQ-09: beats and the wave).
 */
export function FormationTimeline({
  list,
  selectedId,
  onMoveMarker,
  underlay,
  clashes = [],
  locked = false,
}: {
  list: FormationInput[];
  selectedId: string | null;
  onMoveMarker: (id: string, at: number) => void;
  underlay?: (span: number) => ReactNode;
  /** REQ-08 · Stretches with a clash, in red over the transitions. */
  clashes?: { start: number; end: number }[];
  /** A save conflict: markers still take you to their moment but can't be dragged. */
  locked?: boolean;
}) {
  const duration = usePlayer((s) => s.duration);
  const loop = usePlayer((s) => s.loop);
  const span = timelineSpan(duration, list);
  const railRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const scrub = useRef<number | null>(null);
  const [marker, setMarker] = useState<MarkerDrag | null>(null);
  const spanRef = useRef(span);
  spanRef.current = span;

  // The playhead follows the clock straight on the DOM (no render per frame).
  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    let width = rail.clientWidth;
    let lastSecond = -1;
    const paint = (time: number) => {
      const f = spanRef.current > 0 ? clamp(time / spanRef.current, 0, 1) : 0;
      playheadRef.current?.style.setProperty('transform', `translate3d(${f * width}px,0,0)`);
      const second = Math.floor(time);
      if (second !== lastSecond && trackRef.current) {
        lastSecond = second;
        trackRef.current.setAttribute('aria-valuenow', String(second));
        trackRef.current.setAttribute('aria-valuetext', formatTime(second));
      }
    };
    paint(usePlayer.getState().time);
    const resize = new ResizeObserver(() => {
      width = rail.clientWidth;
      paint(usePlayer.getState().time);
    });
    resize.observe(rail);
    const unsubscribe = usePlayer.subscribe((s, prev) => {
      if (s.time !== prev.time || s.duration !== prev.duration) paint(s.time);
    });
    return () => {
      unsubscribe();
      resize.disconnect();
    };
  }, []);
  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const f = span > 0 ? clamp(usePlayer.getState().time / span, 0, 1) : 0;
    playheadRef.current?.style.setProperty('transform', `translate3d(${f * rail.clientWidth}px,0,0)`);
  }, [span]);

  useEffect(
    () => () => {
      if (scrub.current != null) usePlayer.getState().setScrubbing(false);
    },
    [],
  );

  const timeAt = (clientX: number) => {
    const rect = railRef.current!.getBoundingClientRect();
    return clamp((clientX - rect.left) / rect.width, 0, 1) * span;
  };
  const pct = (t: number) => (span > 0 ? clamp(t / span, 0, 1) * 100 : 0);
  const ready = duration > 0;

  function trackDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!ready || e.button > 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    scrub.current = e.pointerId;
    const p = usePlayer.getState();
    p.setScrubbing(true);
    p.scrubTo(timeAt(e.clientX));
  }
  function trackMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (marker && marker.pointerId === e.pointerId) {
      const moved = !locked && (marker.moved || Math.abs(e.clientX - marker.x) > 6);
      setMarker({ ...marker, moved, at: moved ? timeAt(e.clientX) : marker.at });
      return;
    }
    if (scrub.current === e.pointerId) usePlayer.getState().scrubTo(timeAt(e.clientX));
  }
  function trackUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (marker && marker.pointerId === e.pointerId) {
      const f = list.find((x) => x.id === marker.id);
      setMarker(null);
      if (!f) return;
      if (marker.moved && !locked) onMoveMarker(f.id, marker.at);
      else usePlayer.getState().seek(f.at);
      return;
    }
    if (scrub.current === e.pointerId) {
      scrub.current = null;
      usePlayer.getState().setScrubbing(false);
    }
  }

  function markerDown(id: string, e: ReactPointerEvent<HTMLButtonElement>) {
    if (e.button > 0) return;
    e.preventDefault();
    e.stopPropagation();
    const f = list.find((x) => x.id === id);
    if (!f) return;
    e.currentTarget.closest<HTMLElement>('[data-track]')?.setPointerCapture(e.pointerId);
    setMarker({ id, pointerId: e.pointerId, x: e.clientX, at: f.at, moved: false });
  }

  const range = hasRange(loop) ? loop : null;

  return (
    <div className="select-none px-4 pb-2 pt-3 sm:px-5">
      <div
        ref={trackRef}
        data-track
        role="slider"
        tabIndex={0}
        aria-label="Línea de tiempo de las formaciones"
        aria-valuemin={0}
        aria-valuemax={Math.round(span)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            e.stopPropagation();
            usePlayer.getState().nudge((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 5));
          }
        }}
        onPointerDown={trackDown}
        onPointerMove={trackMove}
        onPointerUp={trackUp}
        onPointerCancel={trackUp}
        className={cn(
          'well relative h-[68px] touch-none rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-kin-300',
          ready ? 'cursor-pointer' : 'cursor-wait',
        )}
      >
        <div ref={railRef} className="absolute inset-x-3 inset-y-0">
          {underlay?.(span)}
          {range && (
            <div
              aria-hidden
              className="absolute inset-y-2 rounded-[3px] border-x-2 border-shu-500 bg-shu-500/[0.12]"
              style={{ left: `${pct(range.start)}%`, width: `${pct(range.end) - pct(range.start)}%` }}
            />
          )}
          {/* Transitions: the stretch before each formation where people move. */}
          {list.map((f, i) => {
            if (i === 0) return null;
            const { start, end } = moveWindow(list[i - 1]!, f);
            if (end <= start) return null;
            return (
              <div
                key={`t-${f.id}`}
                aria-hidden
                className="absolute bottom-3 h-1.5 rounded-full bg-ai-400/45"
                style={{ left: `${pct(start)}%`, width: `${pct(end) - pct(start)}%` }}
              />
            );
          })}
          {clashes.map((c, i) => (
            <div
              key={`c-${i}`}
              aria-hidden
              className="absolute bottom-2 h-2.5 min-w-1.5 rounded-full bg-shu-500 shadow-[0_0_6px_rgb(226_103_77/0.6)]"
              style={{ left: `${pct(c.start)}%`, width: `${Math.max(0, pct(c.end) - pct(c.start))}%` }}
            />
          ))}
          {list.map((f, i) => {
            const dragging = marker?.id === f.id && marker.moved;
            const at = dragging ? marker.at : f.at;
            const selected = selectedId === f.id;
            return (
              <motion.button
                key={f.id}
                type="button"
                aria-label={`Formación ${i + 1} en ${formatMoment(f.at)}${f.note ? `: ${f.note}` : ''}. Toca para ir${locked ? '' : '; arrastra para moverla'}.`}
                title={f.note ?? undefined}
                onPointerDown={(e) => markerDown(f.id, e)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    usePlayer.getState().seek(f.at);
                  }
                }}
                animate={{ scale: dragging ? 1.15 : 1 }}
                transition={jelly}
                className={cn('absolute top-1 z-10 grid size-11 -translate-x-1/2 touch-none place-items-center', locked ? 'cursor-pointer' : 'cursor-ew-resize')}
                style={{ left: `${pct(at)}%` }}
              >
                <span
                  className={cn(
                    'grid h-7 min-w-6 place-items-center rounded-[5px] px-1 font-display text-[12px] font-extrabold shadow-[0_4px_10px_-4px_rgb(0_0_0/0.8)]',
                    selected ? 'bg-kin-300 text-sumi-900' : 'bg-washi text-sumi-900',
                    f.note && 'ring-2 ring-ai-400',
                  )}
                >
                  {i + 1}
                </span>
              </motion.button>
            );
          })}
          <div ref={playheadRef} aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-20 w-0">
            <div className="absolute inset-y-0 -left-px w-0.5 bg-shu-400 shadow-[0_0_8px_rgb(226_103_77/0.7)]" />
          </div>
        </div>
      </div>
      {marker?.moved && (
        <p className="tabular mt-1 text-center font-mono text-xs text-kin-200" aria-live="polite">
          {formatMoment(marker.at)}
        </p>
      )}
    </div>
  );
}
