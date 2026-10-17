import { clamp, formatTime, MIN_LOOP_LENGTH, type Clip, type Note } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import {
  Fragment,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react';
import { CLIP_SWATCH } from '@/data/clips';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { hasRange, usePlayer } from '@/player/store';

type DragMode = 'scrub' | 'select' | 'start' | 'end';
const POINTS = 90;
const W = 1000;
const H = 100;

/** Deterministic swell per song: a few long sines plus a little chop, 0..1. */
function seededSwell(seed: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
  const p1 = rand() * 6.28;
  const p2 = rand() * 6.28;
  const k1 = 2 + rand() * 2;
  const k2 = 5 + rand() * 4;
  let chop = 0;
  return Array.from({ length: POINTS + 1 }, (_, i) => {
    const x = i / POINTS;
    chop = chop * 0.6 + (rand() - 0.5) * 0.4;
    const v = 0.55 * Math.sin(x * Math.PI * k1 + p1) + 0.3 * Math.sin(x * Math.PI * k2 + p2) + chop;
    return clamp(0.5 + v * 0.5, 0.05, 1);
  });
}

function buildPaths(levels: number[]) {
  const pts = levels.map((v, i) => [(i / POINTS) * W, H - (14 + v * 70)] as const);
  let line = `M${pts[0]![0]},${pts[0]![1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i]!;
    const [nx, ny] = pts[i + 1]!;
    line += ` Q${x},${y} ${(x + nx) / 2},${(y + ny) / 2}`;
  }
  const last = pts[pts.length - 1]!;
  line += ` L${last[0]},${last[1]}`;
  return { line, area: `${line} L${W},${H} L0,${H} Z`, levels };
}

/**
 * Packs clips into lanes so overlapping ones never stack on the same row.
 * A small gap (1.5% of the song) also separates clips that would touch visually.
 */
export function assignLanes(clips: Clip[], duration: number) {
  const pad = duration * 0.015;
  const sorted = [...clips].sort(
    (a, b) => a.start_seconds - b.start_seconds || a.end_seconds - b.end_seconds,
  );
  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();
  for (const clip of sorted) {
    let lane = laneEnds.findIndex((end) => end + pad <= clip.start_seconds);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(clip.end_seconds);
    } else {
      laneEnds[lane] = clip.end_seconds;
    }
    lanes.set(clip.id, lane);
  }
  return { lanes, count: laneEnds.length };
}

const LANE_H = 10;
const LANE_GAP = 5;
const LANE_PAD = 7;
const LANE_MIN = 30;

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

export function Timeline({ seed, clips, onClipSelect, notes = NO_NOTES, onNoteOpen, compact = false }: TimelineProps) {
  const duration = usePlayer((s) => s.duration);
  const loop = usePlayer((s) => s.loop);
  const activeClipId = usePlayer((s) => s.activeClipId);
  const railRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const tideRef = useRef<SVGRectElement>(null);
  const hoverRef = useRef<HoverControl>(null);
  const dragRef = useRef<{ mode: DragMode; anchor: number; x: number; moved: boolean } | null>(null);
  const [dragMode, setDragMode] = useState<DragMode | null>(null);
  /** Rail rect cached for the whole drag: no forced layout on every pointermove. */
  const dragRect = useRef<DOMRect | null>(null);
  // Unmounting mid-drag (route change, fullscreen) has no pointerup: never leave the player scrubbing.
  useEffect(
    () => () => {
      if (dragRef.current) usePlayer.getState().setScrubbing(false);
    },
    [],
  );
  const clipId = `tide-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
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
      tideRef.current?.setAttribute('width', `${f * 100}%`);
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
    const unsubscribe = usePlayer.subscribe((s) => paint(s.time, s.duration));
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
  const clearHover = () => hoverRef.current?.(null);

  function begin(mode: DragMode, event: ReactPointerEvent) {
    if (!duration || event.button > 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.closest<HTMLElement>('[data-track],[data-lane]')?.setPointerCapture(event.pointerId);
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
    const drag = dragRef.current;
    // Fingers have no hover: skip the guide (and the rect read) unless a drag needs the position.
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
        <div className="relative size-full">
        {duration > 0 &&
          clips.map((clip) => (
            <motion.button
              key={clip.id}
              type="button"
              title={`${clip.name} · ${formatTime(clip.start_seconds)}–${formatTime(clip.end_seconds)}`}
              aria-label={`Reproducir clip ${clip.name}`}
              onClick={() => onClipSelect(clip)}
              whileHover={{ scaleY: 1.35 }}
              whileTap={{ scaleY: 0.9 }}
              transition={jelly}
              className={cn(
                // The bar is thin; an invisible margin around it makes it easy to hit with a finger.
                "absolute min-w-2.5 rounded-[3px] transition-opacity before:absolute before:-inset-x-1 before:-inset-y-1.5 before:content-['']",
                CLIP_SWATCH[clip.color].dot,
                activeClipId === clip.id
                  ? 'opacity-100 ring-1 ring-washi/70'
                  : 'opacity-60 hover:opacity-100',
              )}
              style={{
                left: `${pct(clip.start_seconds)}%`,
                width: `${pct(clip.end_seconds) - pct(clip.start_seconds)}%`,
                top: LANE_PAD + (layout.lanes.get(clip.id) ?? 0) * (LANE_H + LANE_GAP),
                height: LANE_H,
              }}
            />
          ))}
        </div>
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
            <defs>
              <clipPath id={clipId}>
                <rect ref={tideRef} x="0" y="0" height="100%" />
              </clipPath>
            </defs>
            <path d={wave.area} fill="#1f3b60" fillOpacity="0.85" />
            <path
              d={wave.line}
              fill="none"
              stroke="#7c9cc4"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
            <g clipPath={`url(#${clipId})`}>
              <path d={wave.area} fill="#4d73a3" />
              <path
                d={wave.line}
                fill="none"
                stroke="#efe6d4"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          </svg>
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
              className={cn('hidden truncate px-2 font-sans', !compact && 'sm:inline')}
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

/** Height of the wave line at a fraction of the song (0..1), as a fraction of the track height. */
function waveY(levels: number[], fraction: number): number {
  const p = clamp(fraction, 0, 1) * POINTS;
  const i = Math.min(Math.floor(p), POINTS - 1);
  const v = levels[i]! + (levels[i + 1]! - levels[i]!) * (p - i);
  return (H - (14 + v * 70)) / H;
}

/** Highest point of the wave (smallest y fraction) within ±`span` samples of a position. */
function localPeakY(levels: number[], fraction: number, span = 4): number {
  const centre = Math.round(clamp(fraction, 0, 1) * POINTS);
  let peak = 1;
  for (let i = Math.max(0, centre - span); i <= Math.min(POINTS, centre + span); i++) {
    peak = Math.min(peak, (H - (14 + levels[i]! * 70)) / H);
  }
  return peak;
}

/**
 * Where each note's dot floats: a little above the nearest crest (higher hills lift it higher), so a
 * note in a valley never hides in the wave. Notes close together step up alternately so their dots
 * don't sit on top of each other. Fractions of the track height, 0 = top.
 */
function layoutNoteDots(notes: Note[], levels: number[], duration: number) {
  let prevF = -1;
  let stack = 0;
  return notes.map((note) => {
    const f = note.at_seconds / duration;
    stack = f - prevF < 0.035 ? stack + 1 : 0;
    prevF = f;
    const anchor = waveY(levels, f);
    const dot = Math.max(0.1, localPeakY(levels, f) - 0.12 - (stack % 3) * 0.13);
    return { note, f, anchor, dot };
  });
}

/**
 * The group's notes as blue dots floating over the wave, each tied to its exact moment on the line by a
 * dashed thread. A dot turns white once the song has passed it (the component re-renders only when a
 * note is crossed). Tapping one jumps there and opens it.
 */
function NoteDots({
  notes,
  levels,
  duration,
  onOpen,
}: {
  notes: Note[];
  levels: number[];
  duration: number;
  onOpen?: (note: Note) => void;
}) {
  const passed = usePlayer((s) => {
    let n = 0;
    while (n < notes.length && notes[n]!.at_seconds <= s.time) n++;
    return n;
  });
  const placed = useMemo(
    () => (duration > 0 ? layoutNoteDots(notes, levels, duration) : []),
    [notes, levels, duration],
  );
  return placed.map(({ note, f, anchor, dot }, i) => {
    const done = i < passed;
    return (
      <Fragment key={note.id}>
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute w-0 -translate-x-1/2 border-l border-dashed transition-colors duration-300',
            done ? 'border-washi/50' : 'border-ai-400/90',
          )}
          style={{ left: `${f * 100}%`, top: `${dot * 100}%`, height: `${Math.max(0, anchor - dot) * 100}%` }}
        />
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute size-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full',
            done ? 'bg-washi/70' : 'bg-ai-400',
          )}
          style={{ left: `${f * 100}%`, top: `${anchor * 100}%` }}
        />
        <button
          type="button"
          aria-label={`Nota en ${formatTime(note.at_seconds)}: ${note.body}`}
          title={`${formatTime(note.at_seconds)} · ${note.body}`}
          // Keep the track from starting a scrub under the finger.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            usePlayer.getState().seek(note.at_seconds);
            onOpen?.(note);
          }}
          className="group/note absolute z-10 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center"
          style={{ left: `${f * 100}%`, top: `${dot * 100}%` }}
        >
          <span
            className={cn(
              'size-[11px] rounded-full ring-2 ring-sumi-950/80 transition-[background-color,transform,box-shadow] duration-300 group-hover/note:scale-150',
              done
                ? 'bg-washi shadow-[0_0_8px_rgb(243_236_223/0.45)]'
                : 'bg-ai-400 shadow-[0_0_10px_var(--color-ai-300)]',
            )}
          />
        </button>
      </Fragment>
    );
  });
}

/** Shows each note for a few seconds as natural playback reaches it (not on scrubs or jumps). */
export function useNoteAlert(notes: Note[]): Note | null {
  const [shown, setShown] = useState<Note | null>(null);
  const notesRef = useRef(notes);
  notesRef.current = notes;

  useEffect(() => {
    let last = usePlayer.getState().time;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = usePlayer.subscribe((s) => {
      const now = s.time;
      // Only natural forward playback announces a note: not scrubs, and not jumps longer than a
      // throttled frame (a phone saving battery can tick as slowly as ~1 s).
      if (s.playing && !s.scrubbing && now > last && now - last < 2.5) {
        const hit = notesRef.current.find((n) => n.at_seconds > last && n.at_seconds <= now);
        if (hit) {
          setShown(hit);
          clearTimeout(timer);
          timer = setTimeout(() => setShown(null), 4200);
        }
      }
      last = now;
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  return shown;
}

/**
 * While the song plays, each note pops up above its dot for a few seconds as the playhead reaches it,
 * so the dancers read "this step needs work" right when it matters.
 */
function NoteBubble({ notes, duration }: { notes: Note[]; duration: number }) {
  const shown = useNoteAlert(notes);
  const f = shown && duration > 0 ? clamp(shown.at_seconds / duration, 0.12, 0.88) : 0.5;
  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          key={shown.id}
          role="status"
          initial={{ opacity: 0, y: 8, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          transition={jelly}
          className="pointer-events-none absolute bottom-[calc(100%+10px)] z-20 w-max max-w-[min(260px,80vw)] -translate-x-1/2 rounded-[10px] bg-washi px-3 py-2 text-[13px] font-medium leading-snug text-sumi-900 shadow-[0_10px_24px_-10px_rgb(0_0_0/0.9)]"
          style={{ left: `${f * 100}%` }}
        >
          <span className="tabular mr-1.5 font-mono text-[11px] text-shu-500">{formatTime(shown.at_seconds)}</span>
          {shown.body}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

type HoverControl = (fraction: number | null) => void;

/** Mouse-only time guide; owns its state so hovering never re-renders the timeline. */
function HoverGuide({
  control,
  duration,
  hidden,
}: {
  control: Ref<HoverControl>;
  duration: number;
  hidden: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  useImperativeHandle(control, () => setHover, []);
  if (hover == null || duration <= 0 || hidden) return null;
  return (
    <div className="pointer-events-none absolute inset-y-1 w-px bg-washi/35" style={{ left: `${hover * 100}%` }}>
      <span className="tabular absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[6px] bg-sumi-950 px-2 py-1 font-mono text-[11px] text-washi">
        {formatTime(hover * duration, { tenths: true })}
      </span>
    </div>
  );
}

function Handle({
  label,
  side,
  active,
  onPointerDown,
}: {
  label: string;
  side: 'start' | 'end';
  active: boolean;
  onPointerDown: (e: ReactPointerEvent) => void;
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      className={cn(
        'absolute -inset-y-3.5 z-10 flex w-7 cursor-ew-resize touch-none justify-center',
        // A sits above the band, B below it, so short loops never stack the two seals.
        side === 'start' ? '-left-[15px] items-start' : '-right-[15px] items-end',
      )}
    >
      <motion.span
        animate={{ y: active ? -2 : 0, scale: active ? 1.15 : 1, rotate: active ? 0 : -4 }}
        whileHover={{ scale: 1.12, rotate: 0 }}
        transition={jelly}
        className="grid size-6 place-items-center rounded-[4px] bg-shu-500 font-display text-[12px] font-extrabold text-washi shadow-[0_4px_10px_-4px_rgb(0_0_0/0.8)]"
      >
        {label}
      </motion.span>
    </div>
  );
}
