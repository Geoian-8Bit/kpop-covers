import { AnimatePresence, animate, motion, useMotionValue, usePresence, useTransform } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent } from 'react';
import { cn } from '@/lib/cn';
import { jelly, snappy, soft } from '@/lib/motion';
import { KAKEJIKU_BAND, KAKEJIKU_GAP, KAKEJIKU_ROD, KAKEJIKU_ROLLER, kakejikuLayout } from '../navRules';
import {
  CurrentGlyph,
  EntryIcon,
  EntryLink,
  QuickNavRoot,
  QuickNavScrim,
  QuickNavTrigger,
  useQuickNav,
  type NavEntry,
  type QuickNavApi,
  type QuickNavProps,
} from '../quickNavCore';

/** ms between the hanko stamp landing on the picked line and leaving. */
const STAMP_MS = 200;

/**
 * P1 · Prototype «Kakejiku»: a hanging scroll rolled up just above the button. Tapped, its top rod rises and the
 * paper unrolls upwards behind it, one destination per line, written in ink with its kanji in the margin (yours
 * stamped in vermilion); picking one presses a hanko on it. Closing rolls it back down. The unrolling is a window
 * that slides up while its content slides down by the same amount (one motion value), so only transforms and
 * opacity move. Delete this file if another prototype is chosen.
 */
export default function NavKakejiku(props: QuickNavProps) {
  const api = useQuickNav(props);
  return (
    <QuickNavRoot api={api}>
      <QuickNavScrim api={api} />
      <AnimatePresence>{api.open && api.stage && <Scroll key="scroll" api={api} />}</AnimatePresence>
      <QuickNavTrigger
        api={api}
        face={
          <span className="grid size-14 place-items-center rounded-full border-2 border-kin-400 bg-sumi-950 shadow-[0_10px_22px_-8px_rgb(0_0_0/0.95)]">
            {/* A tiny scroll: rod, a strip of washi with your section's kanji, roller. */}
            <span className="flex flex-col items-center">
              <span className="h-[3px] w-7 rounded-full bg-kin-400" />
              <span className="grid h-7 w-5 place-items-center bg-washi">
                <CurrentGlyph api={api} className="text-[14px] text-sumi-900" />
              </span>
              <span className="h-[5px] w-7 rounded-full bg-kin-400" />
            </span>
          </span>
        }
      />
    </QuickNavRoot>
  );
}

function Scroll({ api }: { api: QuickNavApi }) {
  const stage = api.stage!;
  const reduce = api.reduce;
  const layout = kakejikuLayout(api.entries.length, stage.buttonTop, api.top);
  const { rowH, viewH } = layout;
  const [isPresent, safeToRemove] = usePresence();
  const [picked, setPicked] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // How rolled up it is (1 = rolled, 0 = open), and the paper's height as a motion value: the rod's distance from
  // the top of the paper is their product. Kept apart so a new size (the phone turned while the menu was closed,
  // first measured after this mounts) applies before the first frame instead of starting from the old one.
  const rolled = useMotionValue(reduce ? 0 : 1);
  const view = useMotionValue(viewH);
  useLayoutEffect(() => view.set(viewH), [view, viewH]);
  const offset = useTransform([rolled, view], ([u, h]: number[]) => (u ?? 0) * (h ?? 0));
  const counter = useTransform(offset, (v) => -v);
  const opacity = useMotionValue(0);

  useEffect(() => {
    let cancelled = false;
    if (isPresent) {
      // Opening (or reopened while still rolling up, then without the stamp of a pick that was cancelled):
      // appear, then unroll with a soft spring.
      setPicked(null);
      const controls = [animate(opacity, 1, { duration: reduce ? 0.2 : 0.1 })];
      if (!reduce) controls.push(animate(rolled, 0, { ...soft, delay: 0.05 }));
      return () => controls.forEach((c) => c.stop());
    }
    // Closing: the inverse, quicker (the rod drops back onto the roller), then a short fade.
    const roll = reduce ? null : animate(rolled, 1, snappy);
    const fade = animate(opacity, 0, { duration: 0.12, delay: reduce ? 0 : 0.15 });
    fade.then(() => {
      if (!cancelled) safeToRemove?.();
    });
    return () => {
      cancelled = true;
      roll?.stop();
      fade.stop();
    };
  }, [isPresent, reduce, rolled, opacity, safeToRemove]);

  // The core keeps focus inside with `preventScroll`: when the paper scrolls, bring the focused line into view by
  // hand (scrollIntoView would also scroll the clipping window and spoil the unrolling).
  const keepInView = (event: FocusEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;
    const line = (event.target as HTMLElement).closest<HTMLElement>('[data-nav-entry]');
    if (!layout.scrolls || !scroller || !line) return;
    // Measured against the paper itself (offsetTop depends on which ancestor is positioned).
    const top = line.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    const bottom = top + line.getBoundingClientRect().height;
    if (top < scroller.scrollTop) scroller.scrollTop = top - KAKEJIKU_BAND;
    else if (bottom > scroller.scrollTop + scroller.clientHeight)
      scroller.scrollTop = bottom - scroller.clientHeight + KAKEJIKU_BAND;
  };

  // One stamp: a second tap while the first pick is under way changes nothing (the core ignores it too).
  const pickOnce = (id: string) => setPicked((current) => current ?? id);

  const width = Math.min(280, stage.w - 32);
  const sections = api.entries.filter((e) => e.to != null);
  const who = api.entries.find((e) => e.to == null);

  return (
    <motion.div
      // No name of its own: the dialog around it is already «Secciones».
      role="group"
      className="pointer-events-none absolute"
      style={{
        opacity,
        width,
        height: KAKEJIKU_ROD + viewH + KAKEJIKU_ROLLER,
        // Right edge over the button's, 12 px above it.
        right: stage.w - stage.ax - 28,
        bottom: stage.h - stage.buttonTop + 12,
      }}
    >
      {/* The paper: a window sliding up over content sliding down by as much, so the writing stays put. */}
      <motion.div
        className="absolute inset-x-0 overflow-hidden"
        style={{ top: KAKEJIKU_ROD, height: viewH, y: offset }}
      >
        <motion.div
          ref={scrollerRef}
          onFocus={keepInView}
          className={cn(
            'pointer-events-auto h-full overscroll-contain bg-ai-800 px-[7px]',
            layout.scrolls ? 'overflow-y-auto' : 'overflow-hidden',
          )}
          style={{ y: counter }}
        >
          {/* Brocade strips (ichimonji) above and below the writing. */}
          <span aria-hidden className="block bg-kin-300" style={{ height: KAKEJIKU_BAND }} />
          <ul className="bg-washi text-sumi-900">
            {sections.map((entry) => (
              <li key={entry.id}>
                <Line api={api} entry={entry} rowH={rowH} picked={picked === entry.id} onPicked={pickOnce} />
              </li>
            ))}
            {who && (
              <li className="relative" style={{ marginTop: KAKEJIKU_GAP }}>
                <span aria-hidden className="absolute inset-x-3 -top-[3px] border-t border-dashed border-sumi-950/30" />
                <Line api={api} entry={who} rowH={rowH} picked={false} onPicked={pickOnce} />
              </li>
            )}
          </ul>
          <span aria-hidden className="block bg-kin-300" style={{ height: KAKEJIKU_BAND }} />
        </motion.div>
      </motion.div>

      {/* Bottom roller (jiku) with its knobs: stays above the button while the paper unrolls from it. */}
      <Rod className="bottom-0" height={KAKEJIKU_ROLLER} />
      {/* Top rod (hassō), with the hanging cord: rides up on the edge of the paper. */}
      <motion.div aria-hidden className="pointer-events-none absolute inset-x-0 top-0" style={{ y: offset }}>
        <svg className="absolute bottom-0 left-1/2 -translate-x-1/2 overflow-visible" width={48} height={8}>
          <path d="M3 8 L24 1 L45 8" fill="none" stroke="var(--color-kin-400)" strokeOpacity={0.8} strokeWidth={1.5} />
        </svg>
        <Rod className="top-0" height={KAKEJIKU_ROD} />
      </motion.div>
    </motion.div>
  );
}

/** A lacquer rod a little wider than the paper, with gold knobs at both ends. Decorative. */
function Rod({ className, height }: { className: string; height: number }) {
  return (
    <span
      aria-hidden
      className={cn('pointer-events-none absolute -inset-x-2 flex items-center rounded-full bg-sumi-950', className)}
      style={{ height }}
    >
      <span className="absolute inset-x-2 top-1/2 h-px bg-kin-400/50" />
      <span className="absolute left-0 h-full w-2 rounded-l-full bg-kin-400" />
      <span className="absolute right-0 h-full w-2 rounded-r-full bg-kin-400" />
    </span>
  );
}

function Line({
  api,
  entry,
  rowH,
  picked,
  onPicked,
}: {
  api: QuickNavApi;
  entry: NavEntry;
  rowH: number;
  picked: boolean;
  onPicked: (id: string) => void;
}) {
  const reduce = api.reduce;
  return (
    <EntryLink
      api={api}
      entry={entry}
      // Sections wait for the stamp; «¿Quién eres?» opens its dialog straight away.
      delay={reduce ? 0 : STAMP_MS}
      onPicked={() => onPicked(entry.id)}
      whileTap={reduce ? undefined : { scale: 0.98 }}
      transition={soft}
      style={{ height: rowH }}
      className={cn(
        'relative flex items-center gap-3 border-b border-sumi-950/10 px-3 outline-none',
        'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ai-600',
        entry.active ? 'bg-shu-500/10' : 'hover:bg-sumi-950/5',
      )}
    >
      {/* The margin kanji: ink, or a vermilion seal for where you are. */}
      <span
        aria-hidden
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-[4px] font-display text-[17px] font-extrabold leading-none',
          entry.active ? 'bg-shu-600 text-washi' : 'text-sumi-900',
        )}
      >
        {entry.kanji}
      </span>
      <span aria-hidden className={cn('grid shrink-0', entry.active ? 'text-shu-700' : 'text-sumi-700')}>
        <EntryIcon entry={entry} />
      </span>
      <span className={cn('min-w-0 truncate text-[15px] font-bold', entry.active && 'text-shu-700')}>
        {entry.label}
      </span>
      <AnimatePresence>
        {picked && (
          <motion.span
            key="stamp"
            aria-hidden
            className="pointer-events-none absolute right-3 top-1/2 -mt-[15px] grid size-[30px] place-items-center rounded-[5px] border-2 border-shu-600 font-display text-[15px] font-extrabold text-shu-600"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.7, rotate: -12 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, rotate: -6 }}
            transition={reduce ? { duration: 0.12 } : jelly}
          >
            {entry.kanji}
          </motion.span>
        )}
      </AnimatePresence>
    </EntryLink>
  );
}
