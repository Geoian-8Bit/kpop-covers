/**
 * P49 · The quick light bar: a small vertical slider that appears beside the focus ring when the preview is tapped,
 * like the sun of the phone's camera app. Pure rules: where it goes (beside the ring, never over a button) and which
 * exposure a drag gives (the panel's «Luz»: the same value, the same camera steps).
 */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ExposureRange {
  min: number;
  max: number;
  step?: number;
}

/** The bar: a 44 px wide touch strip with its track inside. */
export const QUICK_BAR_WIDTH = 44;
export const QUICK_BAR_HEIGHT = 176;
/** The draggable length (the sun's travel): the bar minus the sun itself. */
export const QUICK_TRACK = 148;
/** Half the focus ring (76 px) plus the gap to the bar. */
const RING_HALF = 38;
const GAP = 10;
/** Room kept clear around buttons, and from the screen's edges. */
const CLEARANCE = 6;
const EDGE = 8;
/** Room above the bar for its number while dragging (it sits 28 px over the bar). */
export const QUICK_LABEL_ROOM = 30;
/** Seconds the bar stays without being touched. */
export const QUICK_HIDE_MS = 3000;

function overlap(a: Box, b: Box): number {
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Where the bar goes for a tap at (`x`, `y`): to the right of the ring, else to its left, else centred over the ring
 * — vertically centred on the tap and kept inside `bounds`. Each place is tried at the tap's height and, when that
 * covers a control (`obstacles`: the buttons on screen), slid up or down to clear it; the place covering the least
 * wins.
 */
export function placeQuickBar(x: number, y: number, bounds: Box, obstacles: readonly Box[]): Box {
  const w = QUICK_BAR_WIDTH;
  const h = QUICK_BAR_HEIGHT;
  const clampX = (l: number) => Math.min(bounds.left + bounds.width - w - EDGE, Math.max(bounds.left + EDGE, l));
  const clampY = (t: number) =>
    Math.min(bounds.top + bounds.height - h - EDGE, Math.max(bounds.top + EDGE + QUICK_LABEL_ROOM, t));
  // The ring itself is kept clear too (a side pushed back on screen would land on it).
  const ring = { left: x - RING_HALF, top: y - RING_HALF, width: RING_HALF * 2, height: RING_HALF * 2 };
  const grown = [...obstacles, ring].map((o) => ({
    left: o.left - CLEARANCE,
    top: o.top - CLEARANCE,
    width: o.width + CLEARANCE * 2,
    height: o.height + CLEARANCE * 2,
  }));
  const cost = (b: Box) => grown.reduce((sum, o) => sum + overlap(b, o), 0);
  const sides = [x + RING_HALF + GAP, x - RING_HALF - GAP - w, x - w / 2].map(clampX);
  // First each side at the tap's height; then each side slid just past each thing it covers, above or below.
  const candidates: Box[] = sides.map((left) => ({ left, top: clampY(y - h / 2), width: w, height: h }));
  for (const left of sides)
    for (const o of grown)
      for (const top of [clampY(o.top - h), clampY(o.top + o.height)]) candidates.push({ left, top, width: w, height: h });
  let best = candidates[0]!;
  let bestCost = Infinity;
  for (const box of candidates) {
    const c = cost(box);
    if (c === 0) return box;
    // Equal cover: the one nearest the tap.
    if (c < bestCost - 0.5 || (Math.abs(c - bestCost) <= 0.5 && distance(box, x, y) < distance(best, x, y))) {
      best = box;
      bestCost = c;
    }
  }
  return best;
}

function distance(b: Box, x: number, y: number): number {
  return Math.hypot(b.left + b.width / 2 - x, b.top + b.height / 2 - y);
}

/** A value on the camera's grid (counted from the minimum) and inside its range. */
export function snapExposure(value: number, range: ExposureRange): number {
  const lo = Math.min(range.min, range.max);
  const hi = Math.max(range.min, range.max);
  let v = Math.min(hi, Math.max(lo, value));
  const step = range.step && range.step > 0 && Number.isFinite(range.step) ? range.step : 0;
  if (step) {
    v = lo + Math.round((v - lo) / step) * step;
    if (v > hi + 1e-9) v -= step;
    v = Math.round(v * 1000) / 1000;
  }
  // No «−0».
  return Object.is(v, -0) ? 0 : v;
}

/**
 * The value after dragging `dy` px (down is positive) from where it was at the start: the whole track is the whole
 * range, up is brighter. Relative, like the camera app's sun: grabbing the bar anywhere never jumps.
 */
export function exposureFromDrag(start: number, dy: number, range: ExposureRange, track = QUICK_TRACK): number {
  const span = Math.abs(range.max - range.min);
  if (!(span > 0) || !(track > 0)) return snapExposure(start, range);
  return snapExposure(start - (dy / track) * span, range);
}

/** Where the sun sits for a value: 0 at the top (brightest) to `track` at the bottom. */
export function sunOffset(value: number, range: ExposureRange, track = QUICK_TRACK): number {
  const span = range.max - range.min;
  if (!(span > 0)) return track / 2;
  const f = (Math.min(range.max, Math.max(range.min, value)) - range.min) / span;
  return (1 - f) * track;
}

/** «+0,7», «−1», «0»: the quick bar and the panel write it alike. */
export function formatExposure(value: number): string {
  const v = Math.round(value * 10) / 10;
  if (v === 0) return '0';
  return `${v > 0 ? '+' : '−'}${String(Math.abs(v)).replace('.', ',')}`;
}
