import { clamp, formatTime, MIN_LOOP_LENGTH, type Clip } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
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
  const crests = pts
    .map(([x, y], i) => ({ x: x / W, y: y / H, v: levels[i]! }))
    .filter((p, i) => i > 0 && i < POINTS && p.v > levels[i - 1]! && p.v >= levels[i + 1]! && p.v > 0.62);
  return { line, area: `${line} L${W},${H} L0,${H} Z`, crests };
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
  /** Slimmer track for the fullscreen overlay. */
  compact?: boolean;
}

export function Timeline({ seed, clips, onClipSelect, compact = false }: TimelineProps) {
  const duration = usePlayer((s) => s.duration);
  const time = usePlayer((s) => s.time);
  const loop = usePlayer((s) => s.loop);
  const activeClipId = usePlayer((s) => s.activeClipId);
  const railRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ mode: DragMode; anchor: number; x: number; moved: boolean } | null>(null);
  const [dragMode, setDragMode] = useState<DragMode | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const clipId = `tide-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const wave = useMemo(() => buildPaths(seededSwell(seed)), [seed]);
  const layout = useMemo(() => assignLanes(clips, duration), [clips, duration]);

  const pct = (t: number) => (duration > 0 ? clamp(t / duration, 0, 1) * 100 : 0);
  const played = pct(time);
  const fractionAt = (clientX: number) => {
    const rect = railRef.current!.getBoundingClientRect();
    return clamp((clientX - rect.left) / rect.width, 0, 1);
  };

  function begin(mode: DragMode, event: ReactPointerEvent) {
    if (!duration || event.button > 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.closest<HTMLElement>('[data-track],[data-lane]')?.setPointerCapture(event.pointerId);
    const t = fractionAt(event.clientX) * duration;
    const player = usePlayer.getState();
    if (mode === 'scrub') {
      player.setScrubbing(true);
      player.seek(t);
    }
    // A range only appears once the pointer actually travels; a plain tap on the lane just seeks.
    dragRef.current = { mode, anchor: t, x: event.clientX, moved: false };
    setDragMode(mode);
  }

  function move(event: ReactPointerEvent) {
    const f = fractionAt(event.clientX);
    setHover(f);
    const drag = dragRef.current;
    if (!drag) return;
    const t = f * duration;
    const player = usePlayer.getState();
    const { loop: current } = player;
    switch (drag.mode) {
      case 'scrub':
        player.seek(t);
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
        aria-label="Clips guardados · arrastra en el hueco para marcar un tramo"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          begin('select', e);
        }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={() => setHover(null)}
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
                'absolute min-w-2.5 rounded-[3px] transition-opacity',
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

      <div
        data-track
        role="slider"
        tabIndex={0}
        aria-label="Línea de tiempo"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(time)}
        aria-valuetext={formatTime(time)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            e.stopPropagation();
            usePlayer.getState().nudge((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 5));
          }
        }}
        onPointerDown={(e) => begin(e.shiftKey ? 'select' : 'scrub', e)}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={() => setHover(null)}
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
                <rect x="0" y="0" width={`${played}%`} height="100%" />
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
          {/* foam on the crests turns white once the song has passed it */}
          {wave.crests.map((c) => (
            <span
              key={c.x}
              aria-hidden
              className={cn(
                'absolute size-[5px] -translate-x-1/2 -translate-y-[140%] rounded-full transition-colors duration-500',
                c.x * 100 <= played ? 'bg-washi' : 'bg-ai-400',
              )}
              style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
            />
          ))}

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
                  loop.enabled
                    ? 'border-shu-500 bg-shu-500/[0.14]'
                    : 'border-dashed border-washi-subtle bg-washi/[0.04]',
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

          {/* hover guide */}
          {hover != null && duration > 0 && !dragMode && (
            <div
              className="pointer-events-none absolute inset-y-1 w-px bg-washi/35"
              style={{ left: `${hover * 100}%` }}
            >
              <span className="tabular absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[6px] bg-sumi-950 px-2 py-1 font-mono text-[11px] text-washi">
                {formatTime(hover * duration, { tenths: true })}
              </span>
            </div>
          )}

          {/* playhead */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-y-1 w-[2px] -translate-x-1/2 bg-kin-300"
            style={{ left: `${played}%` }}
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
              Toca para saltar · arrastra en la franja de clips para marcar un tramo
            </motion.span>
          )}
        </AnimatePresence>
        <span>{formatTime(duration)}</span>
      </div>
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
