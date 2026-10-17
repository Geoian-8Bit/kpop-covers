import { useEffect, type RefObject } from 'react';

/**
 * WCAG 2.4.11 (focus not obscured): the page's scroll padding at the bottom (see `html` in `index.css`) follows what
 * is pinned there, so a control that focus scrolls into view is never left under it.
 * - `useFabScrollPadding`: the quick-menu button, while the shell shows it (phones only, by the CSS).
 * - `useStickyBarPadding`: a sticky bar pinned to the bottom of a page, by its measured height.
 */

const bars = new Map<object, number>();

/** The tallest bar counts (they sit at the same bottom edge); 0 when none. Pure, for the tests. */
export function stickyBarPad(heights: Iterable<number>): number {
  let max = 0;
  for (const h of heights) if (Number.isFinite(h) && h > max) max = h;
  return Math.ceil(max);
}

function syncBars() {
  const pad = stickyBarPad(bars.values());
  const style = document.documentElement.style;
  if (pad > 0) style.setProperty('--sticky-bar-h', `${pad}px`);
  else style.removeProperty('--sticky-bar-h');
}

/** Pins the bottom scroll padding to the bar's height (plus its gap to the bottom edge) while `active`. */
export function useStickyBarPadding(ref: RefObject<HTMLElement | null>, active = true, gap = 12) {
  useEffect(() => {
    const node = ref.current;
    if (!node || !active || typeof document === 'undefined') return;
    const key = {};
    const measure = () => {
      bars.set(key, node.getBoundingClientRect().height + gap);
      syncBars();
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(node);
    return () => {
      observer?.disconnect();
      bars.delete(key);
      syncBars();
    };
  }, [ref, active, gap]);
}

/** The quick-menu button: 56 px + its 16 px margin, a little air, and the home bar. */
export function useFabScrollPadding(shown: boolean) {
  useEffect(() => {
    if (!shown || typeof document === 'undefined') return;
    const style = document.documentElement.style;
    style.setProperty('--fab-scroll-pad', 'calc(80px + env(safe-area-inset-bottom))');
    return () => {
      style.removeProperty('--fab-scroll-pad');
    };
  }, [shown]);
}
