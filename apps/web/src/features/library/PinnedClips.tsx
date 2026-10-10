import { formatSpeed, formatTime, type ClipColor } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { FlipHorizontal2 } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { Link } from 'react-router';
import { Segmented } from '@/components/ui/Segmented';
import type { ClipWithVideo } from '@/data/clips';
import { cn } from '@/lib/cn';
import {
  fibreTexture,
  nudgeAll,
  Rope,
  setBreeze,
  stepPendulum,
  subscribeTick,
  wake,
  type Pendulum,
  type PendulumConfig,
} from '@/lib/hanging';
import { fadeUp, jelly, stagger } from '@/lib/motion';

export type QuickStyle = 'ema' | 'norigae' | 'noren' | 'hanko';

const STYLE_KEY = 'coverscape.quickStyle';
const STYLES: { value: QuickStyle; label: string }[] = [
  { value: 'ema', label: 'Ema' },
  { value: 'norigae', label: 'Norigae' },
  { value: 'noren', label: 'Noren' },
  { value: 'hanko', label: 'Hanko' },
];

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
const dyed = (c: ClipColor, amount = 58) => `color-mix(in oklab, ${TINT[c]} ${amount}%, var(--color-sumi-950))`;

function readStyle(): QuickStyle {
  try {
    const saved = localStorage.getItem(STYLE_KEY);
    if (STYLES.some((s) => s.value === saved)) return saved as QuickStyle;
  } catch {
    /* storage blocked: fall back to the default */
  }
  return 'ema';
}

/** Per-device choice of how quick-access clips are drawn. */
export function useQuickStyle() {
  const [style, setStyle] = useState<QuickStyle>(readStyle);
  const choose = (next: QuickStyle) => {
    setStyle(next);
    try {
      localStorage.setItem(STYLE_KEY, next);
    } catch {
      /* not persisted, still applied for this visit */
    }
  };
  return [style, choose] as const;
}

export function QuickStylePicker({ value, onChange }: { value: QuickStyle; onChange: (s: QuickStyle) => void }) {
  return (
    <Segmented
      label="Estilo del acceso rápido"
      layoutId="quick-style"
      size="sm"
      value={value}
      onChange={onChange}
      options={STYLES}
    />
  );
}

/** Two letters for the seal: initials of the first two words, or the first two letters. */
export function sealLetters(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const raw = words.length >= 2 ? words[0]![0]! + words[1]![0]! : (words[0] ?? '?').slice(0, 2);
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

/* ───────────────────────────── Shared bits ───────────────────────────── */

/**
 * Shared SVG filters: wood grain, rough seal ink, washi fibres. Only used on surfaces that never
 * change shape (they move as whole composited layers), so each is rasterised once.
 */
function TextureDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden focusable="false">
      <defs>
        <filter id="os-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.018 0.55" numOctaves="3" seed="4" />
          <feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.22  0 0 0 0 0.1  0 0 0 0.55 0" />
          <feComposite in2="SourceGraphic" operator="in" />
          <feBlend in2="SourceGraphic" mode="multiply" />
        </filter>
        <filter id="os-ink">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" />
          <feComponentTransfer>
            <feFuncA type="discrete" tableValues="0 1 1 1 1 1 0.85 1" />
          </feComponentTransfer>
        </filter>
        <filter id="os-paper" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" seed="2" />
          <feColorMatrix values="0 0 0 0 0.6  0 0 0 0 0.55  0 0 0 0 0.45  0 0 0 0.2 0" />
          <feComposite in2="SourceGraphic" operator="in" />
          <feBlend in2="SourceGraphic" mode="multiply" />
        </filter>
      </defs>
    </svg>
  );
}

/** Time range on one line, speed (and mirror) as a small chip on the next. */
function ClipMeta({ clip, className, chip }: { clip: ClipWithVideo; className?: string; chip: string }) {
  return (
    <span className={cn('tabular flex flex-col items-center gap-1 whitespace-nowrap font-mono text-[10.5px]', className)}>
      <span>
        {formatTime(clip.start_seconds)}–{formatTime(clip.end_seconds)}
      </span>
      <span className={cn('flex items-center gap-1 rounded-[4px] px-1.5 py-px', chip)}>
        {formatSpeed(clip.speed)}
        {clip.mirrored && <FlipHorizontal2 className="size-3" aria-label="espejo" />}
      </span>
    </span>
  );
}

function clipLabel(clip: ClipWithVideo) {
  return `${clip.name}${clip.video?.title ? ` · ${clip.video.title}` : ''}${clip.is_pinned ? ' · fijado' : ''}`;
}

/** Slides the row by a pixel delta; provided by the list so any rail segment can drag it. */
const RailDrag = createContext<((dx: number) => void) | null>(null);

/**
 * The wooden rail behind each hanging item. It is also the handle that slides the whole row:
 * grab the rail to scroll, grab the item to play with it.
 */
function RailSegment() {
  const slide = useContext(RailDrag);
  const s = useRef({ down: false, x: 0 });
  return (
    <span
      aria-hidden
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.button > 0) return;
        s.current = { down: true, x: e.clientX };
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* pointer already gone */
        }
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        if (!s.current.down) return;
        const dx = e.clientX - s.current.x;
        s.current.x = e.clientX;
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
      className="absolute -inset-x-2 -top-3 z-10 h-8 cursor-grab touch-none active:cursor-grabbing"
    >
      <span className="absolute inset-x-0 top-3 h-2 rounded-full bg-kiji-700 shadow-[0_3px_6px_-2px_rgb(0_0_0/0.7)]" />
    </span>
  );
}

interface GrabHandlers {
  /** Pointer pressed and moved past the tap threshold (client coordinates of the press). */
  onGrab: (x: number, y: number) => void;
  onDrag: (x: number, y: number) => void;
  onRelease: () => void;
  /** A mouse brushing past without pressing; `dx` is the horizontal movement. */
  onBrush?: (dx: number) => void;
}

/**
 * Drag-to-swing on top of a link: a press that moves more than a few pixels becomes a grab and the
 * following click is swallowed; a plain tap still opens the clip. Items use `touch-action: pan-y`,
 * so on phones a sideways drag grabs the item at once while an up/down drag still scrolls the page.
 */
function useGrab(h: GrabHandlers) {
  const handlers = useRef(h);
  handlers.current = h;
  const s = useRef({ down: false, moved: false, sx: 0, sy: 0 });
  return {
    onPointerDown(e: ReactPointerEvent<HTMLElement>) {
      if (e.button > 0) return;
      s.current = { down: true, moved: false, sx: e.clientX, sy: e.clientY };
    },
    onPointerMove(e: ReactPointerEvent<HTMLElement>) {
      const st = s.current;
      if (!st.down) {
        if (e.pointerType === 'mouse') handlers.current.onBrush?.(e.movementX);
        return;
      }
      if (!st.moved) {
        if (Math.hypot(e.clientX - st.sx, e.clientY - st.sy) < 6) return;
        st.moved = true;
        handlers.current.onGrab(st.sx, st.sy);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* pointer already gone; the drag still works while it stays over the item */
        }
      }
      handlers.current.onDrag(e.clientX, e.clientY);
    },
    onPointerUp(e: ReactPointerEvent<HTMLElement>) {
      s.current.down = false;
      if (s.current.moved) {
        handlers.current.onRelease();
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      }
    },
    onPointerCancel() {
      if (s.current.moved) handlers.current.onRelease();
      s.current.down = false;
      s.current.moved = false;
    },
    onClickCapture(e: React.MouseEvent) {
      if (s.current.moved) {
        e.preventDefault();
        e.stopPropagation();
        s.current.moved = false;
      }
    },
    // A long press on a link would open the system preview / context menu.
    onContextMenu(e: React.MouseEvent) {
      if (s.current.down) e.preventDefault();
    },
  };
}

const HANGING = 'relative touch-pan-y select-none [-webkit-touch-callout:none]';

/**
 * A rigid body hanging from `pivot` (px inside `wrap`): the pointer pulls it towards its angle and
 * releasing lets it swing back under gravity. `onFrame` runs after each step for attached effects and
 * returns whether they are still moving.
 */
function usePendulum(
  wrap: RefObject<HTMLDivElement | null>,
  body: RefObject<HTMLDivElement | null>,
  pivot: { x: number; y: number },
  cfg: PendulumConfig,
  onFrame?: (p: Pendulum, dt: number) => boolean,
) {
  const p = useRef<Pendulum>({ theta: 0, omega: 0, target: null });
  const frameCb = useRef(onFrame);
  frameCb.current = onFrame;

  useEffect(() => {
    let shown = Number.NaN;
    return subscribeTick(
      (dt) => {
        const st = p.current;
        const moving = stepPendulum(st, cfg, dt);
        if (body.current && st.theta !== shown) {
          shown = st.theta;
          body.current.style.transform = `rotate(${(-st.theta).toFixed(4)}rad)`;
        }
        const attached = frameCb.current?.(st, dt) ?? false;
        return moving || attached;
      },
      (impulse) => {
        p.current.omega += impulse;
      },
    );
  }, [body, cfg]);

  const aim = (x: number, y: number) => {
    const r = wrap.current!.getBoundingClientRect();
    const ang = Math.atan2(x - (r.left + pivot.x), Math.max(y - (r.top + pivot.y), 24));
    p.current.target = Math.max(-cfg.maxAngle, Math.min(cfg.maxAngle, ang));
    wake();
  };
  return useGrab({
    onGrab: aim,
    onDrag: aim,
    onRelease: () => {
      p.current.target = null;
      wake();
    },
    onBrush: (dx) => {
      p.current.omega += dx * 0.012;
      wake();
    },
  });
}

/* ───────────── Ema: wooden votive plaques hanging from a rail ───────────── */

const EMA_SWING: PendulumConfig = { period: 1.25, damping: 0.9, maxAngle: 1.1 };

function Ema({ clip }: { clip: ClipWithVideo }) {
  const wrap = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const grab = usePendulum(wrap, body, { x: 66, y: 3 }, EMA_SWING);
  return (
    <div ref={wrap} {...grab} className={cn(HANGING, 'h-[184px] w-[132px]')}>
      <RailSegment />
      <div ref={body} className="absolute inset-0 will-change-transform" style={{ transformOrigin: '66px 3px' }}>
        <svg viewBox="0 0 132 184" className="absolute inset-0 size-full" aria-hidden>
          <path d="M66 2 L46 38 M66 2 L86 38" stroke={TINT[clip.color]} strokeWidth="2.2" fill="none" />
          <circle cx="66" cy="3" r="3.2" style={{ fill: `color-mix(in oklab, ${TINT[clip.color]} 55%, black)` }} />
          <path
            d="M66 22 L126 46 V176 Q126 182 120 182 H12 Q6 182 6 176 V46 Z"
            fill="var(--color-kiji-300)"
            filter="url(#os-grain)"
          />
          <path
            d="M66 22 L126 46 V176 Q126 182 120 182 H12 Q6 182 6 176 V46 Z"
            fill="none"
            stroke="var(--color-kiji-900)"
            strokeOpacity="0.5"
            strokeWidth="2"
          />
          <path d="M66 30 L119 51 V174 H13 V51 Z" fill="none" stroke="var(--color-kiji-900)" strokeOpacity="0.2" />
          <circle cx="46" cy="38" r="2.6" fill="var(--color-sumi-800)" />
          <circle cx="86" cy="38" r="2.6" fill="var(--color-sumi-800)" />
          {clip.is_pinned && (
            <g transform="translate(108 164) rotate(-8)" filter="url(#os-ink)">
              <rect x="-9" y="-9" width="18" height="18" rx="2" fill="var(--color-shu-500)" />
            </g>
          )}
        </svg>
        <div className="absolute inset-x-3 top-[60px] flex flex-col items-center text-center text-kiji-900">
          <span className="line-clamp-2 font-display text-[17px] font-extrabold leading-[1.15]">{clip.name}</span>
          <span className="mt-1 line-clamp-1 max-w-full text-[10.5px] font-medium opacity-70">{clip.video?.title}</span>
          <ClipMeta clip={clip} className="mt-2 text-kiji-900/80" chip="bg-sumi-800 text-washi" />
        </div>
      </div>
    </div>
  );
}

/* ───────────── Norigae: hanbok pendant — knot, jade medallion, silk tassel ───────────── */

const NORIGAE_SWING: PendulumConfig = { period: 1.45, damping: 0.75, maxAngle: 1.15 };
const NORI_PIVOT = { x: 66, y: 3 };
const TASSEL_TOP = 155;
const STRANDS = [-9, -5.5, -2, 2, 5.5, 9];

function Norigae({ clip }: { clip: ClipWithVideo }) {
  const wrap = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const strandEls = useRef<(SVGPathElement | null)[]>([]);
  const ropes = useRef(STRANDS.map((ox, i) => new Rope(7, 10.5 + (i % 3) * 0.8, NORI_PIVOT.x + ox, TASSEL_TOP)));

  const grab = usePendulum(wrap, body, NORI_PIVOT, NORIGAE_SWING, (p, dt) => {
    const sin = Math.sin(p.theta);
    const cos = Math.cos(p.theta);
    const dy = TASSEL_TOP - NORI_PIVOT.y;
    let speed = 0;
    ropes.current.forEach((rope, i) => {
      const ox = STRANDS[i]!;
      // The threads hang from the swinging cap: rotate (ox, dy) about the pivot.
      speed = Math.max(speed, rope.step(dt, NORI_PIVOT.x + ox * cos + dy * sin, NORI_PIVOT.y - ox * sin + dy * cos));
      strandEls.current[i]?.setAttribute('d', rope.path());
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
        className="absolute inset-0 will-change-transform"
        style={{ transformOrigin: `${NORI_PIVOT.x}px ${NORI_PIVOT.y}px` }}
      >
        <svg viewBox="0 0 132 236" className="absolute inset-0 size-full" aria-hidden>
          <path d="M66 3 V16 M66 36 V46" stroke="var(--color-kin-400)" strokeWidth="2" />
          <g transform="translate(66 26)">
            <path d="M0 -11 L11 0 L0 11 L-11 0 Z" fill="none" stroke={knot} strokeWidth="4" strokeLinejoin="round" />
            <path d="M-5.5 -5.5 L5.5 5.5 M5.5 -5.5 L-5.5 5.5" stroke={knot} strokeWidth="3" />
          </g>
          <ellipse cx="66" cy="94" rx="60" ry="48" style={{ fill: jade }} filter="url(#os-paper)" />
          <ellipse cx="66" cy="94" rx="54" ry="42" fill="none" stroke="var(--color-kin-400)" strokeWidth="1.5" />
          <ellipse cx="48" cy="70" rx="22" ry="7" fill="var(--color-washi)" opacity="0.13" transform="rotate(-18 48 70)" />
        </svg>
        <div className="absolute inset-x-[16px] top-[62px] flex h-[64px] flex-col items-center justify-center text-center text-washi">
          <span className="line-clamp-2 font-display text-[15px] font-extrabold leading-[1.15] [text-shadow:0_1px_2px_rgb(0_0_0/0.45)]">
            {clip.name}
          </span>
          <span className="tabular mt-1 whitespace-nowrap font-mono text-[10.5px] text-washi/80">
            {formatTime(clip.start_seconds)}–{formatTime(clip.end_seconds)}
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
}

/* ───────────── Noren: split curtain, each half a damped panel hinged on the rod ───────────── */

const NOREN_W = 150;
const NOREN_H = 184;
const NOREN_TOP = 9;
const SEAM = NOREN_W / 2;
/** Stiff, well damped and capped at ~17°: it sways and settles but never folds into odd shapes. */
const NOREN_HALF: PendulumConfig = { period: 1.7, damping: 2.4, maxAngle: 0.3 };
const HALVES = [
  { x: 4, w: SEAM - 4 },
  { x: SEAM, w: SEAM - 4 },
] as const;

/** The dye: laid out over the whole curtain and shown once in each half, so the halves meet at the seam. */
function NorenDye({ clip, offset }: { clip: ClipWithVideo; offset: number }) {
  return (
    <div className="absolute top-[-9px]" style={{ left: -offset, width: NOREN_W, height: NOREN_H }}>
      <span
        className={cn(
          'absolute left-[61px] top-[30px] size-7 rounded-full',
          clip.is_pinned ? 'bg-washi' : 'border-2 border-washi',
        )}
      />
      <div className="absolute inset-x-3 top-[66px] flex flex-col items-center text-center text-washi">
        <span className="line-clamp-2 font-display text-[16px] font-extrabold leading-[1.15] [text-shadow:0_1px_2px_rgb(0_0_0/0.5)]">
          {clip.name}
        </span>
        <span className="mt-1 line-clamp-1 max-w-full text-[10.5px] text-washi/70">{clip.video?.title}</span>
        <ClipMeta clip={clip} className="mt-1.5 text-washi/85" chip="bg-sumi-950/60 text-washi" />
      </div>
      <svg viewBox="0 0 150 8" className="absolute inset-x-0 bottom-[14px] h-2 w-full" aria-hidden>
        <path
          d="M4 6 q12 -6 23.7 0 q12 -6 23.7 0 q12 -6 23.7 0 q12 -6 23.6 0 q12 -6 23.7 0 q12 -6 23.6 0"
          fill="none"
          stroke="var(--color-washi)"
          strokeOpacity="0.3"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
}

function Noren({ clip }: { clip: ClipWithVideo }) {
  const box = useRef<HTMLDivElement>(null);
  const halves = useRef<(HTMLDivElement | null)[]>([]);
  const pend = useRef<Pendulum[]>([
    { theta: 0, omega: 0, target: null },
    { theta: 0, omega: 0, target: null },
  ]);
  const held = useRef<{ i: number; x0: number; depth: number } | null>(null);

  useEffect(
    () =>
      subscribeTick(
        (dt) => {
          const [a, b] = pend.current as [Pendulum, Pendulum];
          // The halves share the rod and hem, so each tugs gently on the other.
          const pull = (b.theta - a.theta) * 4 * dt;
          a.omega += pull;
          b.omega -= pull;
          let moving = false;
          pend.current.forEach((p, i) => {
            if (stepPendulum(p, NOREN_HALF, dt)) moving = true;
            // Hinged on the rod: a GPU-composited skew about the top edge, no repaint per frame.
            const el = halves.current[i];
            if (el) el.style.transform = `skewX(${p.theta.toFixed(4)}rad)`;
          });
          return moving;
        },
        (impulse) => {
          pend.current.forEach((p, i) => {
            p.omega += impulse * (0.45 + i * 0.15);
          });
        },
      ),
    [],
  );

  const toLocal = (x: number, y: number) => {
    const r = box.current!.getBoundingClientRect();
    return { x: ((x - r.left) * NOREN_W) / r.width, y: ((y - r.top) * NOREN_H) / r.height };
  };
  const grab = useGrab({
    onGrab: (x, y) => {
      const local = toLocal(x, y);
      held.current = { i: local.x < SEAM ? 0 : 1, x0: local.x, depth: Math.max(local.y - NOREN_TOP, 40) };
    },
    onDrag: (x, y) => {
      const h = held.current;
      if (!h) return;
      const local = toLocal(x, y);
      const angle = Math.atan2(local.x - h.x0, h.depth);
      pend.current[h.i]!.target = Math.max(-NOREN_HALF.maxAngle, Math.min(NOREN_HALF.maxAngle, angle));
      wake();
    },
    onRelease: () => {
      if (held.current) pend.current[held.current.i]!.target = null;
      held.current = null;
      wake();
    },
    onBrush: (dx) => {
      pend.current.forEach((p) => {
        p.omega += dx * 0.01;
      });
      wake();
    },
  });

  const texture = fibreTexture();
  return (
    <div ref={box} {...grab} className={HANGING} style={{ width: NOREN_W, height: NOREN_H }}>
      {HALVES.map((h, i) => (
        <div
          key={i}
          ref={(el) => {
            halves.current[i] = el;
          }}
          className={cn(
            'absolute overflow-hidden rounded-b-[3px] will-change-transform',
            i === 0 ? 'shadow-[inset_-1px_0_0_rgb(0_0_0/0.45)]' : 'shadow-[inset_1px_0_0_rgb(0_0_0/0.45)]',
          )}
          style={{
            left: h.x,
            top: NOREN_TOP,
            width: h.w,
            height: NOREN_H - NOREN_TOP - 4,
            transformOrigin: '50% 0',
            backgroundColor: dyed(clip.color),
            backgroundImage: texture ? `url(${texture})` : undefined,
          }}
        >
          <NorenDye clip={clip} offset={h.x} />
        </div>
      ))}
      <RailSegment />
    </div>
  );
}

/* ───────────── Hanko: vermilion seal impressions on washi ───────────── */

function Hanko({ clip }: { clip: ClipWithVideo }) {
  const letters = sealLetters(clip.name);
  return (
    <motion.div
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.9, rotate: -3 }}
      transition={jelly}
      className="relative flex h-[200px] w-[132px] flex-col items-center overflow-hidden rounded-[8px] bg-washi px-2.5 pb-3 pt-3.5 text-sumi-900 shadow-[0_14px_24px_-16px_rgb(0_0_0/0.95)]"
    >
      <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden>
        <rect width="100%" height="100%" fill="var(--color-washi)" filter="url(#os-paper)" />
      </svg>
      <svg viewBox="-46 -46 92 92" className="relative size-[78px] shrink-0" aria-hidden>
        <g transform={clip.is_pinned ? 'rotate(5)' : 'rotate(-7)'} filter="url(#os-ink)">
          {clip.is_pinned ? (
            <>
              <rect x="-38" y="-38" width="76" height="76" rx="7" fill="var(--color-shu-500)" />
              <rect x="-31" y="-31" width="62" height="62" rx="4" fill="none" stroke="var(--color-washi)" strokeWidth="1.5" />
            </>
          ) : (
            <>
              <circle r="40" fill="none" stroke="var(--color-shu-500)" strokeWidth="5" />
              <circle r="33" fill="none" stroke="var(--color-shu-500)" strokeWidth="1.5" />
            </>
          )}
          <text
            y="13"
            textAnchor="middle"
            fontFamily="var(--font-display)"
            fontSize="36"
            fontWeight="800"
            fill={clip.is_pinned ? 'var(--color-washi)' : 'var(--color-shu-500)'}
          >
            {letters}
          </text>
        </g>
      </svg>
      <span className="relative mt-2 line-clamp-2 shrink-0 text-center font-display text-[15px] font-extrabold leading-[1.2]">
        {clip.name}
      </span>
      <span className="relative mt-auto line-clamp-1 max-w-full pt-1 text-[10.5px] text-sumi-600">{clip.video?.title}</span>
      <ClipMeta clip={clip} className="relative mt-1 text-sumi-600" chip="bg-sumi-900 text-washi" />
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-1" style={{ background: TINT[clip.color] }} />
    </motion.div>
  );
}

function Item({ clip, style }: { clip: ClipWithVideo; style: QuickStyle }) {
  switch (style) {
    case 'ema':
      return <Ema clip={clip} />;
    case 'norigae':
      return <Norigae clip={clip} />;
    case 'noren':
      return <Noren clip={clip} />;
    default:
      return <Hanko clip={clip} />;
  }
}

/* ───────────────────────────── The row ───────────────────────────── */

const ITEM_W: Record<QuickStyle, number> = { ema: 132, norigae: 132, noren: 150, hanko: 132 };

/** A brush-stroke chevron: thick where the brush lands, tapering into the tip. Points right. */
const BRUSH_ARROW =
  'M8.2 4.6C10.9 6.9 14 9.6 16.9 11.6c.4.3.4.6 0 .9-2.7 2.1-5.6 4.7-8.2 7.1-.5.4-1.1-.1-.7-.6 2-2.4 4.2-4.7 6.2-6.9-2.1-2.1-4.3-4.5-6.6-6.8-.4-.5.1-1.1.6-.7Z';

/**
 * Slide arrows as the lacquered end caps of the wooden rail: a dark urushi disc with a gold rim and a
 * gold brush-stroke arrow. They sit at rail height so they never cover a clip's name.
 */
function ScrollButton({ side, onClick }: { side: 'start' | 'end'; onClick: () => void }) {
  const dir = side === 'start' ? -1 : 1;
  return (
    <motion.button
      type="button"
      aria-label={side === 'start' ? 'Ver clips anteriores' : 'Ver más clips'}
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.6, rotate: -30 * dir }}
      animate={{ opacity: 1, scale: 1, rotate: 0 }}
      exit={{ opacity: 0, scale: 0.6, rotate: 30 * dir }}
      whileHover={{ scale: 1.08, rotate: 10 * dir }}
      whileTap={{ scale: 0.86, rotate: 22 * dir }}
      transition={jelly}
      className={cn(
        'absolute top-[-6px] z-20 size-10 rounded-full drop-shadow-[0_6px_8px_rgb(0_0_0/0.7)] sm:size-11',
        side === 'start' ? '-left-2 sm:-left-3' : '-right-2 sm:-right-3',
      )}
    >
      <svg viewBox="0 0 44 44" className="size-full" aria-hidden>
        <circle cx="22" cy="22" r="21" fill="var(--color-kin-400)" />
        <circle cx="22" cy="22" r="19.2" fill="var(--color-sumi-950)" />
        <circle cx="22" cy="22" r="19.2" fill="var(--color-enji-500)" fillOpacity="0.28" />
        <circle cx="22" cy="22" r="16" fill="none" stroke="var(--color-kin-300)" strokeOpacity="0.35" strokeWidth="0.8" />
        {/* lacquer sheen */}
        <ellipse cx="16" cy="13" rx="9" ry="4.5" fill="var(--color-washi)" fillOpacity="0.1" transform="rotate(-28 16 13)" />
        <g transform={`translate(10 10)${side === 'start' ? ' translate(24 0) scale(-1 1)' : ''}`}>
          <path d={BRUSH_ARROW} fill="var(--color-kin-300)" />
          <circle cx="7.9" cy="5" r="1.15" fill="var(--color-kin-300)" />
        </g>
      </svg>
    </motion.button>
  );
}

/**
 * Quick access: pinned clips first, then recent ones, in one row that slides sideways. One tap opens
 * the studio already looping the clip. Hanging styles are little toys: drag an item sideways to play
 * with it; drag the wooden rail (or use the arrows) to slide the row, and everything on it sways.
 */
export function PinnedClips({ clips, style }: { clips: ClipWithVideo[]; style: QuickStyle }) {
  const scroller = useRef<HTMLUListElement>(null);
  const lastLeft = useRef(0);
  /**
   * Until when a scroll counts as the user's own. Only those swing the items: swinging items can nudge
   * the scroll width, and if that fed back into the swing the row would keep moving on its own.
   */
  const userScrollUntil = useRef(0);
  const byUser = (ms: number) => {
    userScrollUntil.current = Math.max(userScrollUntil.current, performance.now() + ms);
  };
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdges((prev) => {
      const next = { start: el.scrollLeft > 4, end: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 };
      return prev.start === next.start && prev.end === next.end ? prev : next;
    });
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // No breeze while the row is off screen.
    const io = new IntersectionObserver(([entry]) => setBreeze(Boolean(entry?.isIntersecting)));
    io.observe(el);
    return () => {
      ro.disconnect();
      io.disconnect();
      setBreeze(true);
    };
  }, [measure, style, clips.length]);

  const slide = useCallback((dx: number) => {
    userScrollUntil.current = performance.now() + 250;
    scroller.current?.scrollBy({ left: -dx });
  }, []);

  if (clips.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-washi-muted">
        Aquí aparecerán los clips fijados y los más recientes. Marca un tramo en el estudio y pulsa{' '}
        <span className="font-mono text-washi">S</span>.
      </p>
    );
  }

  const page = (dir: 1 | -1) => {
    byUser(900);
    const el = scroller.current;
    el?.scrollBy({ left: dir * Math.max(el.clientWidth * 0.8, ITEM_W[style]), behavior: 'smooth' });
  };

  return (
    <RailDrag.Provider value={slide}>
      <div className="relative">
        <TextureDefs />
        <motion.ul
          ref={scroller}
          key={style}
          variants={stagger(0.04)}
          initial="hidden"
          animate="show"
          onScroll={(e) => {
            const el = e.currentTarget;
            const dx = el.scrollLeft - lastLeft.current;
            lastLeft.current = el.scrollLeft;
            // The rail slides with the row; whatever hangs from it lags behind and swings — but only
            // when the user is the one sliding it, never in reaction to the items' own movement.
            if (style !== 'hanko' && performance.now() < userScrollUntil.current) {
              nudgeAll(Math.max(-1.2, Math.min(1.2, dx * 0.02)));
            }
            measure();
          }}
          onWheel={() => byUser(300)}
          onTouchStart={() => byUser(60_000)}
          onTouchEnd={() => {
            // Momentum scrolling keeps going a little after the finger lifts.
            userScrollUntil.current = performance.now() + 900;
          }}
          // No scroll snapping: the row stays exactly where it is left, even half way.
          className="scrollbar-none -mx-2 flex gap-x-4 overflow-x-auto overscroll-x-contain px-2 pb-3 pt-3 [overflow-anchor:none]"
        >
          {clips.map((clip) => (
            <motion.li key={clip.id} variants={fadeUp} className="shrink-0">
              <Link
                to={`/v/${clip.video_id}?clip=${clip.id}`}
                aria-label={clipLabel(clip)}
                title={clipLabel(clip)}
                draggable={false}
                className="block rounded-[10px] [-webkit-touch-callout:none]"
              >
                <Item clip={clip} style={style} />
              </Link>
            </motion.li>
          ))}
        </motion.ul>
        <AnimatePresence>
          {edges.start && <ScrollButton key="start" side="start" onClick={() => page(-1)} />}
          {edges.end && <ScrollButton key="end" side="end" onClick={() => page(1)} />}
        </AnimatePresence>
      </div>
    </RailDrag.Provider>
  );
}
