import { formatSpeed, formatTime, type ClipColor } from '@coverscape/shared';
import { motion } from 'motion/react';
import { FlipHorizontal2 } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { Link } from 'react-router';
import { Segmented } from '@/components/ui/Segmented';
import type { ClipWithVideo } from '@/data/clips';
import { cn } from '@/lib/cn';
import { Cloth, Rope, stepPendulum, subscribeTick, type Pendulum, type PendulumConfig } from '@/lib/hanging';
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

/** Shared SVG filters: wood grain, rough seal ink, washi / silk fibres. Rendered once per list. */
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

/** A length of wooden rail behind each hanging item; neighbours overlap so a row reads as one beam. */
function RailSegment() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -inset-x-2 top-0 h-2 rounded-full bg-kiji-700 shadow-[0_3px_6px_-2px_rgb(0_0_0/0.7)]"
    />
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
 * following click is swallowed; a plain tap still opens the clip.
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
  };
}

/**
 * A rigid body hanging from `pivot` (px inside `wrap`): the pointer pulls it towards its angle and
 * releasing lets it swing back under gravity. `onFrame` runs after each step for attached effects.
 */
function usePendulum(
  wrap: RefObject<HTMLDivElement | null>,
  body: RefObject<HTMLDivElement | null>,
  pivot: { x: number; y: number },
  cfg: PendulumConfig,
  onFrame?: (p: Pendulum, dt: number) => void,
) {
  const p = useRef<Pendulum>({ theta: 0, omega: 0, target: null });
  const frameCb = useRef(onFrame);
  frameCb.current = onFrame;

  useEffect(
    () =>
      subscribeTick(
        (dt) => {
          const st = p.current;
          stepPendulum(st, cfg, dt);
          if (body.current) body.current.style.transform = `rotate(${(-st.theta).toFixed(4)}rad)`;
          frameCb.current?.(st, dt);
        },
        (strength) => {
          p.current.omega += (Math.random() < 0.5 ? -1 : 1) * strength;
        },
      ),
    [body, cfg],
  );

  const aim = (x: number, y: number) => {
    const r = wrap.current!.getBoundingClientRect();
    const ang = Math.atan2(x - (r.left + pivot.x), Math.max(y - (r.top + pivot.y), 24));
    p.current.target = Math.max(-cfg.maxAngle, Math.min(cfg.maxAngle, ang));
  };
  return useGrab({
    onGrab: aim,
    onDrag: aim,
    onRelease: () => {
      p.current.target = null;
    },
    onBrush: (dx) => {
      p.current.omega += dx * 0.012;
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
    <div ref={wrap} {...grab} className="relative h-[184px] w-[132px] touch-pan-y select-none">
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
    ropes.current.forEach((rope, i) => {
      const ox = STRANDS[i]!;
      // The threads hang from the swinging cap: rotate (ox, dy) about the pivot.
      rope.step(dt, NORI_PIVOT.x + ox * cos + dy * sin, NORI_PIVOT.y - ox * sin + dy * cos);
      strandEls.current[i]?.setAttribute('d', rope.path());
    });
  });

  const jade = dyed(clip.color, 62);
  const knot = clip.is_pinned ? 'var(--color-kin-400)' : 'var(--color-shu-500)';
  return (
    <div ref={wrap} {...grab} className="relative h-[236px] w-[132px] touch-pan-y select-none">
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

/* ───────────── Noren: dyed split curtains, simulated as cloth ───────────── */

const NOREN_W = 150;
const NOREN_H = 184;

function Noren({ clip }: { clip: ClipWithVideo }) {
  const svg = useRef<SVGSVGElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const fills = useRef<(SVGPathElement | null)[]>([]);
  const hems = useRef<(SVGPathElement | null)[]>([]);
  const cloths = useRef([new Cloth(5, 7, 4, 9, 70, 164), new Cloth(5, 7, 76, 9, 70, 164)]);
  const held = useRef<Cloth | null>(null);

  useEffect(
    () =>
      subscribeTick(
        (dt) => {
          cloths.current.forEach((cloth, i) => {
            cloth.step(dt);
            fills.current[i]?.setAttribute('d', cloth.outline());
            hems.current[i]?.setAttribute('d', cloth.rowPath(cloth.rows - 1, 7));
          });
          const [a, b] = cloths.current.map((c) => c.pose());
          if (label.current && a && b) {
            const dx = (a.dx + b.dx) / 2;
            const dy = (a.dy + b.dy) / 2;
            const ang = (a.angle + b.angle) / 2;
            label.current.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) rotate(${(-ang).toFixed(4)}rad)`;
          }
        },
        (strength) => {
          const dir = Math.random() < 0.5 ? -1 : 1;
          cloths.current.forEach((c, i) => c.push(dir * strength * (2.2 + i * 0.6)));
        },
      ),
    [],
  );

  const toLocal = (x: number, y: number) => {
    const m = svg.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const pt = new DOMPoint(x, y).matrixTransform(m.inverse());
    return { x: pt.x, y: Math.max(pt.y, 14) };
  };
  const grab = useGrab({
    onGrab: (x, y) => {
      const local = toLocal(x, y);
      const cloth = cloths.current[local.x < NOREN_W / 2 ? 0 : 1]!;
      cloth.grabbed = cloth.nearest(local.x, local.y);
      cloth.grabX = local.x;
      cloth.grabY = local.y;
      held.current = cloth;
    },
    onDrag: (x, y) => {
      const cloth = held.current;
      if (!cloth) return;
      const local = toLocal(x, y);
      cloth.grabX = local.x;
      cloth.grabY = local.y;
    },
    onRelease: () => {
      if (held.current) held.current.grabbed = -1;
      held.current = null;
    },
    onBrush: (dx) => {
      cloths.current.forEach((c) => c.push(dx * 0.12));
    },
  });

  const cloth = dyed(clip.color);
  return (
    <div {...grab} className="relative touch-pan-y select-none" style={{ width: NOREN_W, height: NOREN_H }}>
      <svg
        ref={svg}
        viewBox={`0 0 ${NOREN_W} ${NOREN_H}`}
        className="absolute inset-0 size-full overflow-visible"
        aria-hidden
      >
        {[0, 1].map((i) => (
          <g key={i}>
            <path
              ref={(el) => {
                fills.current[i] = el;
              }}
              style={{ fill: cloth }}
              filter="url(#os-paper)"
            />
            <path
              ref={(el) => {
                hems.current[i] = el;
              }}
              fill="none"
              stroke="var(--color-washi)"
              strokeOpacity="0.3"
              strokeWidth="1.5"
            />
          </g>
        ))}
        <rect x="0" y="2" width={NOREN_W} height="8" rx="4" fill="var(--color-kiji-700)" />
      </svg>
      <div
        ref={label}
        className="pointer-events-none absolute inset-x-3 top-[30px] flex flex-col items-center text-center text-washi will-change-transform"
        style={{ transformOrigin: '50% 0' }}
      >
        <svg viewBox="-16 -16 32 32" className="size-8" aria-hidden>
          <g filter="url(#os-ink)">
            {clip.is_pinned ? (
              <circle r="14" fill="var(--color-washi)" />
            ) : (
              <circle r="14" fill="none" stroke="var(--color-washi)" strokeWidth="2" />
            )}
          </g>
        </svg>
        <span className="mt-3 line-clamp-2 font-display text-[16px] font-extrabold leading-[1.15] [text-shadow:0_1px_2px_rgb(0_0_0/0.5)]">
          {clip.name}
        </span>
        <span className="mt-1 line-clamp-1 max-w-full text-[10.5px] text-washi/70">{clip.video?.title}</span>
        <ClipMeta clip={clip} className="mt-1.5 text-washi/85" chip="bg-sumi-950/60 text-washi" />
      </div>
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

/**
 * Quick access: pinned clips first, then recent ones. One tap opens the studio already looping the clip.
 * Hanging styles are little toys: drag them (or brush past with the mouse) and they swing for real.
 */
export function PinnedClips({ clips, style }: { clips: ClipWithVideo[]; style: QuickStyle }) {
  if (clips.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-washi-muted">
        Aquí aparecerán los clips fijados y los más recientes. Marca un tramo en el estudio y pulsa{' '}
        <span className="font-mono text-washi">S</span>.
      </p>
    );
  }

  return (
    <>
      <TextureDefs />
      <motion.ul
        key={style}
        variants={stagger(0.04)}
        initial="hidden"
        animate="show"
        // Wrapping rows instead of a horizontal scroller, so dragging a hanging item never fights a scroll.
        className={cn('flex flex-wrap gap-x-4 pt-0.5 max-sm:justify-center', style === 'hanko' ? 'gap-y-4' : 'gap-y-6')}
      >
        {clips.map((clip) => (
          <motion.li key={clip.id} variants={fadeUp}>
            <Link
              to={`/v/${clip.video_id}?clip=${clip.id}`}
              aria-label={clipLabel(clip)}
              title={clipLabel(clip)}
              draggable={false}
              className="block rounded-[10px]"
            >
              <Item clip={clip} style={style} />
            </Link>
          </motion.li>
        ))}
      </motion.ul>
    </>
  );
}
