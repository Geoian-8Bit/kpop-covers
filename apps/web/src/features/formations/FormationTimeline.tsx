import { clamp, formatTime } from '@coverscape/shared';
import { motion } from 'motion/react';
import { Plus } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { Button } from '@/components/ui/Button';
import type { FormationInput } from '@/data/formations';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { hasRange, usePlayer } from '@/player/store';
import { formatMoment, moveWindow } from './formationRules';
import { inView, needsWindow, timelineWindow, viewPct, type TimelineView } from './timelineRules';

interface MarkerDrag {
  id: string;
  pointerId: number;
  x: number;
  at: number;
  moved: boolean;
}

/** Two taps on the same marker within this time (ms) open it. */
const DOUBLE_TAP_MS = 320;

/** The span the timeline draws: the player's duration once known, else enough to show every formation. */
function timelineSpan(duration: number, list: readonly FormationInput[]): number {
  if (duration > 0) return duration;
  const last = list.length ? list[list.length - 1]!.at : 0;
  return Math.max(30, Math.ceil(last + 10));
}

export interface FormationTimelineProps {
  list: FormationInput[];
  selectedId: string | null;
  onMoveMarker: (id: string, at: number) => void;
  /** Drawn beneath the track for the stretch shown (REQ-09: beats and the wave). */
  underlay?: (view: TimelineView) => ReactNode;
  /** REQ-08 · Stretches with a clash, in red over the transitions. */
  clashes?: { start: number; end: number }[];
  /** A save conflict: markers still take you to their moment but can't be dragged. */
  locked?: boolean;
  /** «Añadir formación en este momento» (disabled while `locked`). */
  onAdd?: () => void;
  /** Double tap on a marker: go to that formation and open its details (transition, note). */
  onOpenMarker?: (id: string) => void;
}

/**
 * REQ-06 · The editor's timeline. With no formation yet it is the place of the one first step (a big «Añadir la
 * primera formación», never over the stage). Then: a marker per formation (tap jumps to it, double tap opens its
 * note, drag moves its moment), the transition drawn before each one, the track (dragging it moves the time) and a
 * «+ Añadir» beside it. A long song shows a window of a few seconds that pages with the playhead, so markers never
 * pile up, and a strip of the whole song under it (drag it to travel far).
 */
export function FormationTimeline(props: FormationTimelineProps) {
  if (props.list.length === 0 && props.onAdd) return <EmptyTimeline onAdd={props.onAdd} locked={props.locked ?? false} />;
  return <TimelineTrack {...props} />;
}

function EmptyTimeline({ onAdd, locked }: { onAdd: () => void; locked: boolean }) {
  return (
    <div className="px-3 pb-2 pt-2 sm:px-4">
      <div className="well flex flex-col items-center gap-2 rounded-[12px] px-3 py-3 text-center">
        <p className="text-[13px] leading-snug text-washi-muted">
          <span className="font-bold text-washi">Paso 1.</span> Coloca a cada persona en el escenario y guarda cómo empieza la coreo.
        </p>
        <Button className="w-full max-w-[340px]" onClick={onAdd} disabled={locked}>
          <Plus className="size-4" aria-hidden /> Añadir la primera formación
        </Button>
      </div>
    </div>
  );
}

function TimelineTrack({ list, selectedId, onMoveMarker, underlay, clashes = [], locked = false, onAdd, onOpenMarker }: FormationTimelineProps) {
  /** The last tap on a marker, to tell a double tap. */
  const lastTap = useRef<{ id: string; at: number } | null>(null);
  const duration = usePlayer((s) => s.duration);
  const loop = usePlayer((s) => s.loop);
  const span = timelineSpan(duration, list);
  const windowed = needsWindow(span);
  const railRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const overviewRailRef = useRef<HTMLDivElement>(null);
  const overviewHeadRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const scrub = useRef<number | null>(null);
  const overviewScrub = useRef<number | null>(null);
  const [marker, setMarker] = useState<MarkerDrag | null>(null);
  /** A finger on the track: the window holds still under it. */
  const holding = useRef(false);
  const [view, setView] = useState<TimelineView>(() => timelineWindow(usePlayer.getState().time, span));
  const viewRef = useRef(view);
  const spanRef = useRef(span);

  // The window follows the playhead (a render only when it pages).
  useEffect(() => {
    spanRef.current = span;
    const sync = (time: number) => {
      if (holding.current) return;
      const next = timelineWindow(time, span);
      const cur = viewRef.current;
      if (next.from !== cur.from || next.to !== cur.to) {
        viewRef.current = next;
        setView(next);
      }
    };
    sync(usePlayer.getState().time);
    return usePlayer.subscribe((s, prev) => {
      if (s.time !== prev.time) sync(s.time);
    });
  }, [span]);

  // The playheads follow the clock straight on the DOM (no render per frame).
  useLayoutEffect(() => {
    viewRef.current = view;
    const rail = railRef.current;
    if (!rail) return;
    let lastSecond = -1;
    const paint = (time: number) => {
      const v = viewRef.current;
      const head = playheadRef.current;
      if (head) {
        head.style.setProperty('transform', `translate3d(${(viewPct(time, v) / 100) * rail.clientWidth}px,0,0)`);
        head.style.setProperty('opacity', inView(time, v, 0.05) ? '1' : '0');
      }
      const oRail = overviewRailRef.current;
      if (oRail && spanRef.current > 0) {
        overviewHeadRef.current?.style.setProperty('transform', `translate3d(${clamp(time / spanRef.current, 0, 1) * oRail.clientWidth}px,0,0)`);
      }
      const second = Math.floor(time);
      if (second !== lastSecond && trackRef.current) {
        lastSecond = second;
        trackRef.current.setAttribute('aria-valuenow', String(second));
        trackRef.current.setAttribute('aria-valuetext', formatTime(second));
      }
    };
    paint(usePlayer.getState().time);
    const resize = new ResizeObserver(() => paint(usePlayer.getState().time));
    resize.observe(rail);
    const unsubscribe = usePlayer.subscribe((s, prev) => {
      if (s.time !== prev.time || s.duration !== prev.duration) paint(s.time);
    });
    return () => {
      unsubscribe();
      resize.disconnect();
    };
  }, [view, windowed]);

  useEffect(
    () => () => {
      if (scrub.current != null || overviewScrub.current != null) usePlayer.getState().setScrubbing(false);
    },
    [],
  );

  const timeAt = (clientX: number) => {
    const rect = railRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return v.from + clamp((clientX - rect.left) / rect.width, 0, 1) * (v.to - v.from);
  };
  const pct = (t: number) => viewPct(t, view);
  const ready = duration > 0;

  function release() {
    holding.current = false;
    const next = timelineWindow(usePlayer.getState().time, spanRef.current);
    viewRef.current = next;
    setView(next);
  }

  function trackDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!ready || e.button > 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    scrub.current = e.pointerId;
    holding.current = true;
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
      holding.current = false;
      if (!f) return;
      if (marker.moved && !locked) {
        onMoveMarker(f.id, marker.at);
        lastTap.current = null;
        return;
      }
      usePlayer.getState().seek(f.at);
      const now = performance.now();
      const prev = lastTap.current;
      if (onOpenMarker && prev && prev.id === f.id && now - prev.at < DOUBLE_TAP_MS) {
        lastTap.current = null;
        onOpenMarker(f.id);
      } else lastTap.current = { id: f.id, at: now };
      return;
    }
    if (scrub.current === e.pointerId) {
      scrub.current = null;
      usePlayer.getState().setScrubbing(false);
      release();
    }
  }

  function markerDown(id: string, e: ReactPointerEvent<HTMLButtonElement>) {
    if (e.button > 0) return;
    e.preventDefault();
    e.stopPropagation();
    const f = list.find((x) => x.id === id);
    if (!f) return;
    e.currentTarget.closest<HTMLElement>('[data-track]')?.setPointerCapture(e.pointerId);
    holding.current = true;
    setMarker({ id, pointerId: e.pointerId, x: e.clientX, at: f.at, moved: false });
  }

  // The strip of the whole song: dragging it travels anywhere (the window follows).
  const overviewTime = (clientX: number) => {
    const rect = overviewRailRef.current!.getBoundingClientRect();
    return clamp((clientX - rect.left) / rect.width, 0, 1) * spanRef.current;
  };
  function overviewDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!ready || e.button > 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    overviewScrub.current = e.pointerId;
    const p = usePlayer.getState();
    p.setScrubbing(true);
    p.scrubTo(overviewTime(e.clientX));
  }
  function overviewMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (overviewScrub.current === e.pointerId) usePlayer.getState().scrubTo(overviewTime(e.clientX));
  }
  function overviewUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (overviewScrub.current !== e.pointerId) return;
    overviewScrub.current = null;
    usePlayer.getState().setScrubbing(false);
  }

  const range = hasRange(loop) ? loop : null;
  const whole = { from: 0, to: span };

  return (
    <div className="select-none px-3 pb-1.5 pt-2 sm:px-4">
      <div className="flex items-stretch gap-1.5">
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
            'well relative h-[60px] min-w-0 flex-1 touch-none rounded-[10px] max-lg:landscape:h-[52px] outline-none focus-visible:ring-2 focus-visible:ring-kin-300',
            ready ? 'cursor-pointer' : 'cursor-wait',
          )}
        >
          <div ref={railRef} className="absolute inset-x-3 inset-y-0">
            {underlay?.(view)}
            {range && range.end >= view.from && range.start <= view.to && (
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
              if (end <= start || end < view.from || start > view.to) return null;
              return (
                <div
                  key={`t-${f.id}`}
                  aria-hidden
                  className="absolute bottom-2.5 h-1.5 rounded-full bg-ai-400/45"
                  style={{ left: `${pct(start)}%`, width: `${pct(end) - pct(start)}%` }}
                />
              );
            })}
            {clashes.map((c, i) =>
              c.end < view.from || c.start > view.to ? null : (
                <div
                  key={`c-${i}`}
                  aria-hidden
                  className="absolute bottom-2 h-2.5 min-w-1.5 rounded-full bg-shu-500"
                  style={{ left: `${pct(c.start)}%`, width: `${Math.max(0, pct(c.end) - pct(c.start))}%` }}
                />
              ),
            )}
            {list.map((f, i) => {
              const dragging = marker?.id === f.id && marker.moved;
              const at = dragging ? marker.at : f.at;
              if (!dragging && !inView(at, view)) return null;
              const selected = selectedId === f.id;
              return (
                <motion.button
                  key={f.id}
                  type="button"
                  aria-label={`Formación ${i + 1} en ${formatMoment(f.at)}${f.note ? `: ${f.note}` : ''}. Toca para ir${onOpenMarker ? ', doble toque para abrir su nota' : ''}${locked ? '' : '; arrastra para moverla'}.`}
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
                  className={cn('absolute top-0.5 z-30 grid size-11 -translate-x-1/2 touch-none place-items-center', locked ? 'cursor-pointer' : 'cursor-ew-resize')}
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
              <div className="absolute inset-y-0 -left-px w-0.5 bg-shu-400" />
            </div>
          </div>
        </div>
        {onAdd && (
          <motion.button
            type="button"
            aria-label="Añadir formación en este momento"
            title="Añadir formación en este momento"
            disabled={locked}
            onClick={onAdd}
            whileTap={locked ? undefined : { scale: 0.88 }}
            transition={jelly}
            className="flex w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[10px] border border-shu-400/70 bg-shu-700 text-washi transition-colors hover:bg-shu-600 disabled:opacity-40"
          >
            <Plus className="size-5" aria-hidden />
            <span className="text-[11px] font-bold leading-none">Añadir</span>
          </motion.button>
        )}
      </div>

      {windowed && (
        <div
          role="slider"
          tabIndex={-1}
          aria-label="Toda la canción: arrastra para ir lejos"
          aria-valuemin={0}
          aria-valuemax={Math.round(span)}
          onPointerDown={overviewDown}
          onPointerMove={overviewMove}
          onPointerUp={overviewUp}
          onPointerCancel={overviewUp}
          className={cn('relative mt-1 h-6 touch-none max-lg:landscape:mt-0.5 max-lg:landscape:h-5', onAdd && 'mr-[62px]', ready ? 'cursor-pointer' : 'cursor-wait')}
        >
          <div ref={overviewRailRef} className="absolute inset-x-3 inset-y-0">
            <div aria-hidden className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line-strong" />
            <div
              aria-hidden
              className="absolute inset-y-1 rounded-[4px] border border-washi/35 bg-washi/[0.07]"
              style={{ left: `${viewPct(view.from, whole)}%`, width: `${viewPct(view.to, whole) - viewPct(view.from, whole)}%` }}
            />
            {list.map((f) => (
              <span
                key={f.id}
                aria-hidden
                className={cn('absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full', selectedId === f.id ? 'bg-kin-300' : 'bg-washi-muted')}
                style={{ left: `${viewPct(f.at, whole)}%` }}
              />
            ))}
            <div ref={overviewHeadRef} aria-hidden className="pointer-events-none absolute inset-y-0.5 left-0 w-0">
              <div className="absolute inset-y-0 -left-px w-0.5 rounded-full bg-shu-400" />
            </div>
          </div>
        </div>
      )}

      {marker?.moved ? (
        <p className="tabular mt-1 text-center font-mono text-xs text-kin-200" aria-live="polite">
          {formatMoment(marker.at)}
        </p>
      ) : (
        list.length === 1 && (
          <p className="mt-1 text-center text-[12px] leading-snug text-washi-subtle">
            Paso 2: mueve el tiempo, recoloca y pulsa «Añadir».
          </p>
        )
      )}
    </div>
  );
}
