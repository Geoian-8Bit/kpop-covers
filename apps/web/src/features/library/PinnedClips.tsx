import { formatSpeed, type ClipColor } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { FlipHorizontal2 } from 'lucide-react';
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { Link } from 'react-router';
import { guardNav } from '@/components/AppShell';
import { ButtonSkin } from '@/components/ui/ButtonSkin';
import type { ClipWithVideo } from '@/data/clips';
import { cn } from '@/lib/cn';
import {
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

/* ───────────────────────────── Shared bits ───────────────────────────── */

/**
 * Shared SVG filter: silk/paper fibres for the jade medallion. Only used on a surface that never changes
 * shape (it moves as a whole composited layer), so it is rasterised once.
 */
function TextureDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden focusable="false">
      <defs>
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
  /**
   * At rest with everything attached settled: frames skip all work (the loop may still be running for
   * another item) until a nudge, the breeze or the pointer disturbs it again.
   */
  const asleep = useRef(false);
  const frameCb = useRef(onFrame);
  frameCb.current = onFrame;

  useEffect(() => {
    let shown = Number.NaN;
    asleep.current = false;
    return subscribeTick(
      (dt) => {
        if (asleep.current) return false;
        const st = p.current;
        const moving = stepPendulum(st, cfg, dt);
        if (body.current && st.theta !== shown) {
          shown = st.theta;
          body.current.style.transform = `rotate(${(-st.theta).toFixed(4)}rad)`;
        }
        const attached = frameCb.current?.(st, dt) ?? false;
        asleep.current = !moving && !attached;
        return !asleep.current;
      },
      (impulse) => {
        p.current.omega += impulse;
        asleep.current = false;
      },
    );
  }, [body, cfg]);

  const rouse = () => {
    asleep.current = false;
    wake();
  };

  // The item's box, read once per grab instead of on every pointermove; a scroll (page or row) moves it.
  const rect = useRef<DOMRect | null>(null);
  const untrack = useRef<(() => void) | null>(null);
  const stopTracking = () => {
    untrack.current?.();
    untrack.current = null;
    rect.current = null;
  };
  useEffect(() => stopTracking, []);

  const aim = (x: number, y: number) => {
    const r = (rect.current ??= wrap.current!.getBoundingClientRect());
    const ang = Math.atan2(x - (r.left + pivot.x), Math.max(y - (r.top + pivot.y), 24));
    p.current.target = Math.max(-cfg.maxAngle, Math.min(cfg.maxAngle, ang));
    rouse();
  };
  return useGrab({
    onGrab: (x, y) => {
      stopTracking();
      const stale = () => {
        rect.current = null;
      };
      window.addEventListener('scroll', stale, { capture: true, passive: true });
      untrack.current = () => window.removeEventListener('scroll', stale, { capture: true });
      aim(x, y);
    },
    onDrag: aim,
    onRelease: () => {
      stopTracking();
      p.current.target = null;
      rouse();
    },
    onBrush: (dx) => {
      p.current.omega += dx * 0.012;
      rouse();
    },
  });
}

/* ───────────── Norigae: hanbok pendant — knot, jade medallion, silk tassel ───────────── */

const NORIGAE_SWING: PendulumConfig = { period: 1.45, damping: 0.75, maxAngle: 1.15 };
const NORI_PIVOT = { x: 66, y: 3 };
const TASSEL_TOP = 155;
const STRANDS = [-9, -5.5, -2, 2, 5.5, 9];

const Norigae = memo(function Norigae({ clip }: { clip: ClipWithVideo }) {
  const wrap = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const strandEls = useRef<(SVGPathElement | null)[]>([]);
  /** Last `d` written per strand: settled threads round to the same path, so the DOM isn't touched. */
  const strandPaths = useRef<string[]>([]);
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

/* ───────────────────────────── The row ───────────────────────────── */

const ITEM_W = 132;

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
      {/* Same crest as the back button; mirrored to point forward. */}
      <span className={cn('block size-full', side === 'end' && '-scale-x-100')}>
        <ButtonSkin kind="back" />
      </span>
    </motion.button>
  );
}

/**
 * Quick access: pinned clips first, then recent ones, in one row that slides sideways. One tap opens
 * the studio already looping the clip. Hanging styles are little toys: drag an item sideways to play
 * with it; drag the wooden rail (or use the arrows) to slide the row, and everything on it sways.
 */
export const PinnedClips = memo(function PinnedClips({ clips }: { clips: ClipWithVideo[] }) {
  const scroller = useRef<HTMLUListElement>(null);
  const lastLeft = useRef(0);
  /** A finger is on the row: its scrolls (including the momentum after a fling) are the user's. */
  const touching = useRef(false);
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
  }, [measure, clips.length]);

  // Rail drags can fire several pointermoves per frame: add them up and scroll once per frame.
  const slideDx = useRef(0);
  const slideFrame = useRef(0);
  const slide = useCallback((dx: number) => {
    userScrollUntil.current = Math.max(userScrollUntil.current, performance.now() + 250);
    slideDx.current += dx;
    if (slideFrame.current) return;
    slideFrame.current = requestAnimationFrame(() => {
      slideFrame.current = 0;
      const left = -slideDx.current;
      slideDx.current = 0;
      scroller.current?.scrollBy({ left });
    });
  }, []);
  useEffect(() => () => cancelAnimationFrame(slideFrame.current), []);

  if (clips.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-washi-muted">
        Aquí salen primero los clips fijados en la portada y después los más recientes. Marca un tramo en el estudio y pulsa{' '}
        <span className="font-mono text-washi">S</span>.
      </p>
    );
  }

  const endTouch = () => {
    touching.current = false;
    // Momentum scrolling keeps going a little after the finger lifts.
    userScrollUntil.current = performance.now() + 900;
  };

  const page = (dir: 1 | -1) => {
    byUser(900);
    const el = scroller.current;
    el?.scrollBy({ left: dir * Math.max(el.clientWidth * 0.8, ITEM_W), behavior: 'smooth' });
  };

  return (
    <RailDrag.Provider value={slide}>
      <div className="relative">
        <TextureDefs />
        <motion.ul
          ref={scroller}
          variants={stagger(0.04)}
          initial="hidden"
          animate="show"
          onScroll={(e) => {
            const el = e.currentTarget;
            const dx = el.scrollLeft - lastLeft.current;
            lastLeft.current = el.scrollLeft;
            if (touching.current) byUser(2000);
            // The rail slides with the row; whatever hangs from it lags behind and swings — but only
            // when the user is the one sliding it, never in reaction to the items' own movement.
            if (performance.now() < userScrollUntil.current) {
              nudgeAll(Math.max(-1.2, Math.min(1.2, dx * 0.02)));
            }
            measure();
          }}
          onWheel={() => byUser(300)}
          // Short window, refreshed by every scroll while the finger is down: a finger resting on the
          // row (or a lost touchend) can't keep the feedback guard open for long.
          onTouchStart={() => {
            touching.current = true;
            byUser(2000);
          }}
          onTouchEnd={endTouch}
          onTouchCancel={endTouch}
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
                onClick={guardNav}
                className="block rounded-[10px] [-webkit-touch-callout:none]"
              >
                <Norigae clip={clip} />
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
});
