/**
 * 47 · The pure part of keeping the page fitted to the phone's width (lib/viewport.ts): no DOM here, covered by
 * `viewportRules.test.ts`.
 */

const SCALE_KEYS = new Set(['initial-scale', 'minimum-scale', 'maximum-scale']);

/**
 * The viewport meta pinned at scale 1 for a moment: the base's own scale entries (index.html already carries
 * `maximum-scale=1.0`, so only appending one changed nothing) give way to all three set to 1, which makes the browser
 * recompute the page's scale and width for the new orientation. The rest (width, viewport-fit, interactive-widget)
 * stays as it is.
 */
export function pinnedViewport(base: string): string {
  const kept = base
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !SCALE_KEYS.has(part.split('=')[0]!.trim().toLowerCase()));
  return [...kept, 'initial-scale=1', 'minimum-scale=1', 'maximum-scale=1'].join(', ');
}

/**
 * The app never scrolls sideways (nothing is wider than the screen, see `#root` in index.css): any horizontal offset
 * the page is left with — a rotation or a fullscreen exit restoring a position measured on the wider screen — is
 * stray, and puts the page off centre with a gap on one side. Sub-pixel offsets (zoom rounding) count too.
 */
export function strayScrollX(scrollX: number): boolean {
  return Number.isFinite(scrollX) && Math.abs(scrollX) >= 0.5;
}
