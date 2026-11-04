import { AnimatePresence, motion } from 'motion/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { guardNav } from '@/components/AppShell';
import { ButtonSkin } from '@/components/ui/ButtonSkin';
import type { ClipWithVideo } from '@/data/clips';
import { cn } from '@/lib/cn';
import { nudgeAll, setBreeze } from '@/lib/hanging';
import { fadeUp, jelly, stagger } from '@/lib/motion';
import { Norigae, RailDrag } from './pinned/Norigae';
import { TextureDefs } from './pinned/TextureDefs';
import { HangingViewContext, useHangingView } from './pinned/usePendulum';

function clipLabel(clip: ClipWithVideo) {
  return `${clip.name}${clip.video?.title ? ` · ${clip.video.title}` : ''}${clip.is_pinned ? ' · fijado' : ''}`;
}

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
      // REQ-21.6 · Its own layer: the drop-shadow is not rasterised again on every frame of the jelly scale.
      transition={jelly}
      className={cn(
        'absolute top-[-6px] z-20 size-10 rounded-full will-change-transform drop-shadow-[0_6px_8px_rgb(0_0_0/0.7)] sm:size-11',
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

  // REQ-22 · The edges are read once per frame, not on every scroll event (each read after the swing's writes forced
  // a layout).
  const measureFrame = useRef(0);
  const measureSoon = useCallback(() => {
    if (measureFrame.current) return;
    measureFrame.current = requestAnimationFrame(() => {
      measureFrame.current = 0;
      measure();
    });
  }, [measure]);
  useEffect(() => () => cancelAnimationFrame(measureFrame.current), []);
  const view = useHangingView(scroller, ITEM_W + 16, clips.length);

  if (clips.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-washi-muted">
        Aquí salen primero los clips fijados en la portada y después los más recientes. Marca un tramo en el
        estudio y pulsa <span className="font-mono text-washi">S</span>.
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
      <HangingViewContext.Provider value={view}>
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
              measureSoon();
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
                  // Named by its visible text (clip, song, speed): an aria-label that left part of it out fails
                  // «label in name» (WCAG 2.5.3). The tooltip keeps the full title.
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
      </HangingViewContext.Provider>
    </RailDrag.Provider>
  );
});
