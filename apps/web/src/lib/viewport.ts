import { pinnedViewport, strayScrollX } from './viewportRules';

/** Set once `keepViewportFitted` runs: re-fits the page now (pins the scale, then hands it back and re-centres). */
let refit: (() => void) | null = null;

/**
 * Phones can come back from landscape with the page still scaled or scrolled for the wider screen (everything
 * small in the top-left corner, or the page off centre with a gap on the right) until something forces a relayout.
 * After every rotation and every exit from fullscreen we briefly pin the viewport scale to 1 and then hand it back,
 * which makes iOS Safari and Android Chrome drop any zoom left over from the other orientation, and we put the page
 * back at its left edge.
 *
 * 47 · The gap on the right: leaving fullscreen in landscape and then turning the phone upright, the browser restored
 * a horizontal scroll position from the wider layout. The page never scrolls sideways (`#root` clips anything wider
 * than the screen, index.css), so any horizontal offset is stray and goes back to 0 — after a refit, a rotation or
 * any resize (cheap: only when there is an offset). The old refit kept it (`scrollTo(scrollX, …)`), and its pinned
 * meta equalled the base one (index.html already says `maximum-scale=1.0`), so it changed nothing.
 */
export function keepViewportFitted(): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  const base = meta?.content ?? '';
  let timers: ReturnType<typeof setTimeout>[] = [];
  let frame = 0;

  const straighten = () => {
    if (strayScrollX(window.scrollX)) window.scrollTo({ left: 0, top: window.scrollY, behavior: 'instant' });
  };
  const straightenSoon = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      straighten();
    });
  };

  refit = () => {
    for (const t of timers) clearTimeout(t);
    timers = [];
    if (meta) meta.content = pinnedViewport(base);
    straightenSoon();
    timers.push(
      setTimeout(() => {
        if (meta) meta.content = base;
        // Some phones only re-measure on the next resize: nudge it so layout uses the new width.
        window.dispatchEvent(new Event('resize'));
        straighten();
      }, 400),
      // Android turns the screen back only once the fullscreen lock is let go: that rotation can end later.
      setTimeout(straighten, 900),
    );
  };

  const orientation = window.screen.orientation;
  if (orientation) orientation.addEventListener('change', () => refit?.());
  else window.addEventListener('orientationchange', () => refit?.());
  // Any fullscreen exit (the studio, the Random Play Dance round…): the page under it was laid out for that screen.
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) refit?.();
  });
  window.addEventListener('resize', straightenSoon);
  window.visualViewport?.addEventListener('resize', straightenSoon);
}

/**
 * 47 · Re-fits the page now: for what the browser doesn't announce, like the studio's CSS fullscreen (iPhone) closing
 * after the phone turned. Does nothing before `keepViewportFitted` ran (tests, other entry points).
 */
export function refitViewport(): void {
  refit?.();
}
