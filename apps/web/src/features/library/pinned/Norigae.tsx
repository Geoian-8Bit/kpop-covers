import type { ClipColor } from '@coverscape/shared';
import { formatSpeed } from '@coverscape/shared';
import { FlipHorizontal2 } from 'lucide-react';
import { createContext, memo, useContext, useRef } from 'react';
import type { ClipWithVideo } from '@/data/clips';
import { cn } from '@/lib/cn';
import { Rope, type PendulumConfig } from '@/lib/hanging';
import { HANGING, usePendulum } from './usePendulum';

// REQ-27 · Split out of PinnedClips.tsx: one hanging item (the norigae) and the rail it hangs from.

/** Clip colour as a CSS custom property, usable in SVG fills. */
const TINT: Record<ClipColor, string> = {
  wine: 'var(--color-enji-500)',
  plum: 'var(--color-murasaki)',
  orchid: 'var(--color-fuji)',
  rose: 'var(--color-sakura)',
  gold: 'var(--color-kin-400)',
  teal: 'var(--color-rokusho)',
};
/** Clip colour deepened towards ink, so washi text stays readable on light hues. */
const dyed = (c: ClipColor, amount = 58) =>
  `color-mix(in oklab, ${TINT[c]} ${amount}%, var(--color-sumi-950))`;

/** Slides the row by a pixel delta; provided by the list so any rail segment can drag it. */
export const RailDrag = createContext<((dx: number) => void) | null>(null);

/**
 * The wooden rail behind each hanging item. It is also the handle that slides the whole row:
 * grab the rail to scroll, grab the item to play with it.
 */
function RailSegment() {
  const slide = useContext(RailDrag);
  const s = useRef({ down: false, sliding: false, x: 0, y: 0 });
  return (
    <span
      aria-hidden
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.button > 0) return;
        s.current = { down: true, sliding: false, x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        const st = s.current;
        if (!st.down) return;
        if (!st.sliding) {
          // `touch-pan-y`: an up/down drag on the rail still scrolls the page; only a sideways one slides the row.
          const ax = Math.abs(e.clientX - st.x);
          if (ax < 6 || ax < Math.abs(e.clientY - st.y)) return;
          st.sliding = true;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* pointer already gone */
          }
        }
        const dx = e.clientX - st.x;
        st.x = e.clientX;
        slide?.(dx);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        s.current.down = false;
      }}
      onPointerCancel={() => {
        s.current.down = false;
      }}
      // The rail never opens the clip.
      onClick={(e) => e.preventDefault()}
      className="absolute -inset-x-2 -top-3 z-10 h-8 cursor-grab touch-pan-y active:cursor-grabbing"
    >
      <span className="absolute inset-x-0 top-3 h-2 rounded-full bg-kiji-700 shadow-[0_3px_6px_-2px_rgb(0_0_0/0.7)]" />
    </span>
  );
}

/* ───────────── Norigae: hanbok pendant — knot, jade medallion, silk tassel ───────────── */

const NORIGAE_SWING: PendulumConfig = { period: 1.45, damping: 0.75, maxAngle: 1.15 };
const NORI_PIVOT = { x: 66, y: 3 };
const TASSEL_TOP = 155;
const STRANDS = [-9, -5.5, -2, 2, 5.5, 9];

export const Norigae = memo(function Norigae({ clip }: { clip: ClipWithVideo }) {
  const wrap = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const strandEls = useRef<(SVGPathElement | null)[]>([]);
  /** Last `d` written per strand: settled threads round to the same path, so the DOM isn't touched. */
  const strandPaths = useRef<string[]>([]);
  const ropes = useRef(
    STRANDS.map((ox, i) => new Rope(7, 10.5 + (i % 3) * 0.8, NORI_PIVOT.x + ox, TASSEL_TOP)),
  );

  const grab = usePendulum(wrap, body, NORI_PIVOT, NORIGAE_SWING, (p, dt, draw) => {
    const sin = Math.sin(p.theta);
    const cos = Math.cos(p.theta);
    const dy = TASSEL_TOP - NORI_PIVOT.y;
    let speed = 0;
    ropes.current.forEach((rope, i) => {
      const ox = STRANDS[i]!;
      // The threads hang from the swinging cap: rotate (ox, dy) about the pivot.
      speed = Math.max(
        speed,
        rope.step(dt, NORI_PIVOT.x + ox * cos + dy * sin, NORI_PIVOT.y - ox * sin + dy * cos),
      );
      // REQ-22 · Replaying the time spent off screen only moves the threads; the path is written once in view.
      if (!draw) return;
      const d = rope.path();
      if (strandPaths.current[i] !== d) {
        strandPaths.current[i] = d;
        strandEls.current[i]?.setAttribute('d', d);
      }
    });
    return speed > 0.02;
  });

  const jade = dyed(clip.color, 62);
  const knot = clip.is_pinned ? 'var(--color-kin-400)' : 'var(--color-shu-500)';
  return (
    <div ref={wrap} {...grab} className={cn(HANGING, 'h-[236px] w-[132px]')}>
      <RailSegment />
      <svg viewBox="0 0 132 236" className="absolute inset-0 size-full overflow-visible" aria-hidden>
        {STRANDS.map((_, i) => (
          <path
            key={i}
            ref={(el) => {
              strandEls.current[i] = el;
            }}
            fill="none"
            style={{ stroke: i % 2 ? `color-mix(in oklab, ${TINT[clip.color]} 75%, white)` : jade }}
            strokeWidth={i % 2 ? 1.4 : 2.4}
            strokeLinecap="round"
          />
        ))}
      </svg>
      <div
        ref={body}
        className="absolute inset-0"
        // REQ-22 · Its own layer (`will-change`) only while in view: usePendulum drops it off screen.
        style={{ transformOrigin: `${NORI_PIVOT.x}px ${NORI_PIVOT.y}px`, willChange: 'transform' }}
      >
        <svg viewBox="0 0 132 236" className="absolute inset-0 size-full" aria-hidden>
          <path d="M66 3 V16 M66 36 V46" stroke="var(--color-kin-400)" strokeWidth="2" />
          <g transform="translate(66 26)">
            <path
              d="M0 -11 L11 0 L0 11 L-11 0 Z"
              fill="none"
              stroke={knot}
              strokeWidth="4"
              strokeLinejoin="round"
            />
            <path d="M-5.5 -5.5 L5.5 5.5 M5.5 -5.5 L-5.5 5.5" stroke={knot} strokeWidth="3" />
          </g>
          <ellipse cx="66" cy="94" rx="60" ry="48" style={{ fill: jade }} filter="url(#os-paper)" />
          <ellipse
            cx="66"
            cy="94"
            rx="54"
            ry="42"
            fill="none"
            stroke="var(--color-kin-400)"
            strokeWidth="1.5"
          />
          <ellipse
            cx="48"
            cy="70"
            rx="22"
            ry="7"
            fill="var(--color-washi)"
            opacity="0.13"
            transform="rotate(-18 48 70)"
          />
        </svg>
        <div className="absolute inset-x-[20px] top-[60px] flex h-[68px] flex-col items-center justify-center text-center text-washi">
          <span className="line-clamp-2 font-display text-[14px] font-extrabold leading-[1.15] [text-shadow:0_1px_2px_rgb(0_0_0/0.45)]">
            {clip.name}
          </span>
          <span className="mt-1 line-clamp-1 max-w-full text-[10.5px] font-medium text-washi/80">
            {clip.video?.title}
          </span>
        </div>
        {/* Gold cap where the tassel is tied; it carries the speed. */}
        <span className="tabular absolute left-1/2 top-[141px] flex h-[15px] -translate-x-1/2 items-center gap-0.5 whitespace-nowrap rounded-[3px] bg-kin-400 px-1.5 font-mono text-[9.5px] font-semibold text-sumi-900">
          {formatSpeed(clip.speed)}
          {clip.mirrored && <FlipHorizontal2 className="size-2.5" aria-label="espejo" />}
        </span>
      </div>
    </div>
  );
});
