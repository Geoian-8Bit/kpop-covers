import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { hasRange, usePlayer } from '@/player/store';
import { clamp, type Clip, formatTime, MIN_LOOP_LENGTH, type Note } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  memo,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  assignLanes,
  buildPaths,
  H,
  LANE_GAP,
  LANE_H,
  LANE_MIN,
  LANE_PAD,
  seededSwell,
  W,
} from './timelineGeometry';
import { ClipLane } from './ClipLane';
import { Handle, type HoverControl, HoverGuide } from './TimelineHandles';
import { NoteBubble, NoteDots } from './TimelineNotes';

type DragMode = 'scrub' | 'select' | 'start' | 'end';

interface TimelineProps {
  seed: string;
  clips: Clip[];
  onClipSelect: (clip: Clip) => void;
  /** Timed notes, drawn as dots on the wave. */
  notes?: Note[];
  onNoteOpen?: (note: Note) => void;
  /** Slimmer track for the fullscreen overlay. */
  compact?: boolean;
}

const NO_NOTES: Note[] = [];

function TimelineView({
  seed,
  clips,
  onClipSelect,
  notes = NO_NOTES,
  onNoteOpen,
  compact = false,
}: TimelineProps) {
  const duration = usePlayer((s) => s.duration);
  const loop = usePlayer((s) => s.loop);
  const railRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  // REQ-21 · The «played» wave sits in its own composited layer: a window (tideRef) slid in from the left and the
  // wave inside it slid back the same amount (tideWaveRef), so the visible part grows with the time while both
  // layers only move. The old clipPath rect repainted the whole wave on every frame.
  const tideRef = useRef<HTMLDivElement>(null);
  const tideWaveRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<HoverControl>(null);
  const dragRef = useRef<{ mode: DragMode; anchor: number; x: number; moved: boolean } | null>(null);
  const [dragMode, setDragMode] = useState<DragMode | null>(null);
  /** Rail rect cached for the whole drag: no forced layout on every pointermove. */
  const dragRect = useRef<DOMRect | null>(null);
  /**
   * REQ-21 · The pointer's latest position, applied once per frame (requestAnimationFrame): a burst of pointermoves
   * makes one range/scrub update and one render. pointerup/cancel apply what is pending first, so the range a drag
   * ends on is exactly the one the last move asked for.
   */
  const pendingMove = useRef<{ clientX: number; pointerType: string } | null>(null);
  const moveFrame = useRef(0);
  // Unmounting mid-drag (route change, fullscreen) has no pointerup: never leave the player scrubbing.
  useEffect(
    () => () => {
      cancelAnimationFrame(moveFrame.current);
      if (dragRef.current) usePlayer.getState().setScrubbing(false);
    },
    [],
  );
  const wave = useMemo(() => buildPaths(seededSwell(seed)), [seed]);
  const layout = useMemo(() => assignLanes(clips, duration), [clips, duration]);

  // The playhead moves every frame: paint it straight onto the DOM instead of re-rendering the whole timeline.
  useLayoutEffect(() => {
    const rail = railRef.current;
    const track = trackRef.current;
    if (!rail || !track) return;
    let width = rail.clientWidth;
    let lastTime = Number.NaN;
    let lastDuration = Number.NaN;
    let lastSecond = Number.NaN;
    const paint = (time: number, total: number, force = false) => {
      if (!force && time === lastTime && total === lastDuration) return;
      lastTime = time;
      lastDuration = total;
      const f = total > 0 ? clamp(time / total, 0, 1) : 0;
      playheadRef.current?.style.setProperty('transform', `translate3d(${f * width}px,0,0)`);
      tideRef.current?.style.setProperty('transform', `translate3d(${(f - 1) * 100}%,0,0)`);
      tideWaveRef.current?.style.setProperty('transform', `translate3d(${(1 - f) * 100}%,0,0)`);
      const second = Math.floor(time);
      if (second !== lastSecond) {
        lastSecond = second;
        track.setAttribute('aria-valuenow', String(second));
        track.setAttribute('aria-valuetext', formatTime(second));
      }
    };
    const repaint = () => {
      const { time, duration: total } = usePlayer.getState();
      paint(time, total, true);
    };
    repaint();
    const resize = new ResizeObserver(() => {
      width = rail.clientWidth;
      repaint();
    });
    resize.observe(rail);
    // Under the recorder (`covered`) nothing is painted; uncovering repaints once.
    const unsubscribe = usePlayer.subscribe((s, prev) => {
      if (s.covered) return;
      if (prev.covered) repaint();
      else paint(s.time, s.duration);
    });
    return () => {
      unsubscribe();
      resize.disconnect();
    };
  }, []);

  const pct = (t: number) => (duration > 0 ? clamp(t / duration, 0, 1) * 100 : 0);
  const fractionAt = (clientX: number) => {
    const rect = (dragRef.current && dragRect.current) || railRef.current!.getBoundingClientRect();
    return clamp((clientX - rect.left) / rect.width, 0, 1);
  };
  const clearHover = () => {
    // A hover still waiting for its frame must not bring the guide back after the pointer left.
    if (!dragRef.current) {
      cancelAnimationFrame(moveFrame.current);
      moveFrame.current = 0;
      pendingMove.current = null;
    }
    hoverRef.current?.(null);
  };

  function begin(mode: DragMode, event: ReactPointerEvent) {
    if (!duration || event.button > 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.closest<HTMLElement>('[data-track],[data-lane]')?.setPointerCapture(event.pointerId);
    // A mouse hover move still waiting for its frame must not land as a drag move with a stale clientX.
    cancelAnimationFrame(moveFrame.current);
    moveFrame.current = 0;
    pendingMove.current = null;
    dragRect.current = railRef.current!.getBoundingClientRect();
    const t = fractionAt(event.clientX) * duration;
    const player = usePlayer.getState();
    if (mode === 'scrub') {
      player.setScrubbing(true);
      player.scrubTo(t);
    }
    // A range only appears once the pointer actually travels; a plain tap on the lane just seeks.
    dragRef.current = { mode, anchor: t, x: event.clientX, moved: false };
    setDragMode(mode);
  }

  function move(event: ReactPointerEvent) {
    // Fingers have no hover: skip the guide (and the rect read) unless a drag needs the position.
    if (!dragRef.current && event.pointerType === 'touch') return;
    pendingMove.current = { clientX: event.clientX, pointerType: event.pointerType };
    moveFrame.current ||= requestAnimationFrame(applyMove);
  }

  /** Lands a move still waiting for its frame (before the drag ends). */
  function flushMove() {
    if (!moveFrame.current) return;
    cancelAnimationFrame(moveFrame.current);
    applyMove();
  }

  function applyMove() {
    moveFrame.current = 0;
    const event = pendingMove.current;
    pendingMove.current = null;
    if (!event) return;
    const drag = dragRef.current;
    if (!drag && event.pointerType === 'touch') return;
    const f = fractionAt(event.clientX);
    if (event.pointerType !== 'touch') hoverRef.current?.(f);
    if (!drag) return;
    const t = f * duration;
    const player = usePlayer.getState();
    const { loop: current } = player;
    switch (drag.mode) {
      case 'scrub':
        player.scrubTo(t);
        break;
      case 'select':
        if (!drag.moved && Math.abs(event.clientX - drag.x) < 6) break;
        drag.moved = true;
        player.setRange(Math.min(drag.anchor, t), Math.max(drag.anchor, t));
        break;
      case 'start':
        if (current.end != null) player.setRange(Math.min(t, current.end - MIN_LOOP_LENGTH), current.end);
        break;
      case 'end':
        if (current.start != null)
          player.setRange(current.start, Math.max(t, current.start + MIN_LOOP_LENGTH));
        break;
    }
  }

  function end(event: ReactPointerEvent) {
    if (!dragRef.current) return;
    flushMove();
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.mode === 'select' && !drag.moved) usePlayer.getState().seek(drag.anchor);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    dragRect.current = null;
    usePlayer.getState().setScrubbing(false);
    setDragMode(null);
  }

  const range = hasRange(loop) ? loop : null;

  return (
    <div className={cn('select-none', compact ? 'px-0 py-1' : 'px-3 pb-4 pt-4 sm:px-5')}>
      {/* saved clips lane */}
      {/* Saved clips lane. Dragging on its empty space marks a new range — the quick way to cut a clip. */}
      <div
        data-lane
        role="group"
        aria-label="Clips guardados"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          begin('select', e);
        }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onPointerLeave={clearHover}
        className={cn(
          'group/lane relative mb-2 touch-none rounded-[8px] border border-dashed border-washi/15 px-3 transition-colors',
          duration ? 'cursor-crosshair hover:border-shu-400/50 hover:bg-shu-500/[0.05]' : 'cursor-wait',
          dragMode === 'select' && 'border-shu-400/70 bg-shu-500/[0.08]',
        )}
        style={{ height: Math.max(LANE_MIN, layout.count * (LANE_H + LANE_GAP) - LANE_GAP + LANE_PAD * 2) }}
      >
        {clips.length === 0 && !compact && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-xs text-washi-subtle group-hover/lane:text-shu-400">
            Arrastra aquí para marcar un clip
          </span>
        )}
        <ClipLane clips={clips} duration={duration} lanes={layout.lanes} onClipSelect={onClipSelect} />
      </div>

      {/* aria-valuenow / aria-valuetext are written once per second by the paint effect above. */}
      <div
        ref={trackRef}
        data-track
        role="slider"
        tabIndex={0}
        aria-label="Línea de tiempo"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            e.stopPropagation();
            usePlayer.getState().nudge((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 5));
          } else if ((e.key === 'Home' || e.key === 'End') && duration > 0) {
            e.preventDefault();
            e.stopPropagation();
            usePlayer.getState().seek(e.key === 'Home' ? 0 : duration);
          }
        }}
        onPointerDown={(e) => begin(e.shiftKey ? 'select' : 'scrub', e)}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onPointerLeave={clearHover}
        className={cn(
          'well relative touch-none rounded-[12px]',
          compact ? 'h-[60px]' : 'h-[96px]',
          duration ? (dragMode ? 'cursor-grabbing' : 'cursor-pointer') : 'cursor-wait',
        )}
      >
        <div ref={railRef} className="absolute inset-x-3 inset-y-0">
          {/* the swell */}
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 size-full"
            aria-hidden
          >
            <path d={wave.area} fill="#1f3b60" fillOpacity="0.85" />
            <path
              d={wave.line}
              fill="none"
              stroke="#7c9cc4"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {/* REQ-21 · The tide: same viewBox and stretch as the swell, moved by the paint effect above. */}
          <div
            ref={tideRef}
            aria-hidden
            className="absolute inset-0 overflow-hidden will-change-transform"
            style={{ transform: 'translate3d(-100%,0,0)' }}
          >
            <div
              ref={tideWaveRef}
              className="absolute inset-0 will-change-transform"
              style={{ transform: 'translate3d(100%,0,0)' }}
            >
              <svg
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                className="absolute inset-0 size-full"
              >
                <path d={wave.area} fill="#4d73a3" />
                <path
                  d={wave.line}
                  fill="none"
                  stroke="#efe6d4"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>
          </div>
          <NoteDots notes={notes} levels={wave.levels} duration={duration} onOpen={onNoteOpen} />
          <NoteBubble notes={notes} duration={duration} />

          {/* A–B band */}
          <AnimatePresence>
            {range && (
              <motion.div
                key="range"
                initial={{ opacity: 0, scaleY: 0.5 }}
                animate={{ opacity: 1, scaleY: 1 }}
                exit={{ opacity: 0, scaleY: 0.5, transition: { duration: 0.14 } }}
                transition={jelly}
                className={cn(
                  'absolute inset-y-0 border-x-2 transition-colors duration-300',
                  // Always the solid vermilion edges; a paused loop is just dimmer.
                  loop.enabled ? 'border-shu-500 bg-shu-500/[0.14]' : 'border-shu-500/55 bg-shu-500/[0.06]',
                )}
                style={{ left: `${pct(range.start)}%`, width: `${pct(range.end) - pct(range.start)}%` }}
              >
                <Handle
                  label="A"
                  side="start"
                  onPointerDown={(e) => begin('start', e)}
                  active={dragMode === 'start'}
                />
                <Handle
                  label="B"
                  side="end"
                  onPointerDown={(e) => begin('end', e)}
                  active={dragMode === 'end'}
                />
              </motion.div>
            )}
            {!range && loop.start != null && (
              <motion.div
                key="a-only"
                initial={{ opacity: 0, scaleY: 0 }}
                animate={{ opacity: 1, scaleY: 1 }}
                exit={{ opacity: 0 }}
                transition={jelly}
                className="absolute inset-y-0 w-0.5 bg-shu-500"
                style={{ left: `${pct(loop.start)}%` }}
              >
                <span className="absolute -top-2.5 left-1/2 grid size-5 -translate-x-1/2 place-items-center rounded-[4px] bg-shu-500 font-display text-[11px] font-extrabold text-washi">
                  A
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <HoverGuide control={hoverRef} duration={duration} hidden={dragMode != null} />

          {/* playhead (moved with a transform by the paint effect) */}
          <div
            ref={playheadRef}
            aria-hidden
            className="pointer-events-none absolute -inset-y-1 left-0 w-[2px] -translate-x-1/2 bg-kin-300 will-change-transform"
          >
            <span className="absolute -top-1 left-1/2 size-2.5 -translate-x-1/2 rotate-45 bg-kin-300" />
          </div>
        </div>
      </div>

      <div className="tabular mt-2 flex items-center justify-between px-1 font-mono text-xs text-washi-subtle">
        <span>0:00</span>
        <AnimatePresence mode="wait">
          {range ? (
            <motion.span
              key="len"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="text-shu-400"
            >
              A–B · {formatTime(range.end - range.start, { tenths: true })}
            </motion.span>
          ) : (
            <motion.span
              key="hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={cn(
                'hidden min-w-0 text-balance px-2 text-center font-sans',
                !compact && 'sm:inline',
              )}
            >
              Toca para saltar · arrastra en la franja de clips para marcar un tramo · los puntos son notas
            </motion.span>
          )}
        </AnimatePresence>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}

/** REQ-21 · Memoised: the studio re-renders for unrelated state and the timeline paints itself from the store. */
export const Timeline = memo(TimelineView);
