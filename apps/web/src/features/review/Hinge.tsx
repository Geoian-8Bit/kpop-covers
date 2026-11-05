import { cn } from '@/lib/cn';
import { useRef } from 'react';
import { capturePointer } from './pointer';
import { HINGE } from './stageLayout';

/**
 * «Separados»: the gold hinge between the panels; drag it (or use the arrows) to share the space, within what keeps
 * YouTube's player whole. While dragging only the hinge moves (a transform): the panels — and YouTube's iframe — take
 * their new size once, on release.
 */
export function Hinge({
  row,
  at,
  split,
  bounds,
  total,
  onChange,
}: {
  row: boolean;
  /** Where the hinge starts (px from the frame's start). */
  at: number;
  split: number;
  bounds: { min: number; max: number };
  total: number;
  onChange: (split: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ start: number; split: number; next: number } | null>(null);
  const centre = at + HINGE / 2;
  const clampTo = (value: number) => Math.min(bounds.max, Math.max(bounds.min, value));
  const end = (commit: boolean) => {
    const d = drag.current;
    drag.current = null;
    ref.current?.style.removeProperty('transform');
    if (commit && d && d.next !== d.split) onChange(d.next);
  };
  return (
    <div
      ref={ref}
      role="separator"
      tabIndex={0}
      aria-orientation={row ? 'vertical' : 'horizontal'}
      aria-label="Reparto entre el original y la toma"
      aria-valuemin={Math.round(bounds.min * 100)}
      aria-valuemax={Math.round(bounds.max * 100)}
      aria-valuenow={Math.round(split * 100)}
      onPointerDown={(e) => {
        e.stopPropagation();
        capturePointer(e);
        drag.current = { start: row ? e.clientX : e.clientY, split, next: split };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || total <= 0) return;
        e.stopPropagation();
        d.next = clampTo(d.split + ((row ? e.clientX : e.clientY) - d.start) / total);
        const px = (d.next - d.split) * total;
        ref.current?.style.setProperty('transform', row ? `translateX(${px}px)` : `translateY(${px}px)`);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        end(true);
      }}
      onPointerCancel={() => end(false)}
      onKeyDown={(e) => {
        const back = row ? 'ArrowLeft' : 'ArrowUp';
        const fwd = row ? 'ArrowRight' : 'ArrowDown';
        if (e.key !== back && e.key !== fwd) return;
        e.preventDefault();
        e.stopPropagation();
        onChange(clampTo(split + (e.key === fwd ? 0.05 : -0.05)));
      }}
      className={cn(
        'group absolute z-[4] flex items-center justify-center rounded-[8px] outline-none will-change-transform focus-visible:bg-kin-300/15',
        row ? 'top-0 h-full w-11 cursor-col-resize' : 'left-0 h-11 w-full cursor-row-resize',
      )}
      style={row ? { left: centre - 22 } : { top: centre - 22 }}
    >
      {/* A gold rod with two hinge plates; the grip in the middle lights up under the finger or the focus. */}
      <span
        aria-hidden
        className={cn('relative', row ? 'h-full w-px bg-kin-400/50' : 'h-px w-full bg-kin-400/50')}
      >
        {[0.22, 0.78].map((f) => (
          <span
            key={f}
            className={cn(
              'absolute rounded-[2px] bg-kin-400',
              row ? 'left-1/2 h-5 w-[5px] -translate-x-1/2' : 'top-1/2 h-[5px] w-5 -translate-y-1/2',
            )}
            style={row ? { top: `calc(${f * 100}% - 10px)` } : { left: `calc(${f * 100}% - 10px)` }}
          />
        ))}
        <span
          className={cn(
            'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-kin-300 shadow-[0_0_0_3px_var(--color-sumi-950)] group-hover:scale-125 group-focus-visible:scale-125 group-active:scale-125',
            row ? 'h-8 w-[5px]' : 'h-[5px] w-8',
          )}
        />
      </span>
    </div>
  );
}
