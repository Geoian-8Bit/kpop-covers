import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { formatTime } from '@coverscape/shared';
import { motion } from 'motion/react';
import { type PointerEvent as ReactPointerEvent, type Ref, useImperativeHandle, useState } from 'react';

export type HoverControl = (fraction: number | null) => void;

/** Mouse-only time guide; owns its state so hovering never re-renders the timeline. */
export function HoverGuide({
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
    <div
      className="pointer-events-none absolute inset-y-1 w-px bg-washi/35"
      style={{ left: `${hover * 100}%` }}
    >
      <span className="tabular absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[6px] bg-sumi-950 px-2 py-1 font-mono text-[11px] text-washi">
        {formatTime(hover * duration, { tenths: true })}
      </span>
    </div>
  );
}

export function Handle({
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
    // Only the seal grabs (a 44 px target centred on it); the red edge lets touches through to the track,
    // so scrubbing over the edge — or over the playhead sitting on it — moves the time.
    <div
      onPointerDown={onPointerDown}
      className={cn(
        'absolute z-10 grid size-11 -translate-x-1/2 cursor-ew-resize touch-none place-items-center',
        // A sits above the band, B below it, so short loops never stack the two seals.
        side === 'start' ? '-top-6 left-[-1px]' : '-bottom-6 left-[calc(100%+1px)]',
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
