/**
 * F17 · The waves drawn by the voice/music control («La ola partida», `VoiceOnda`) — the pure part: periodic wave
 * shapes, drawn once as a long strip and slid by one period, so the loop is seamless and nothing is stretched.
 * No DOM, no Web Audio; covered by `waveRules.test.ts`.
 */

/** How wide the long strips are drawn (px). Wider than any row the control sits in; the box clips the rest. */
export const STRIP_WIDTH = 2400;

/** y for x (px), periodic with the layer's period. */
export type WaveFn = (x: number) => number;

const TAU = Math.PI * 2;
const r1 = (n: number) => (Math.round(n * 10) / 10).toString();

/** A sum of sines that repeats exactly every `period` px: every harmonic has a whole number of cycles in it. */
export function sineWave(
  period: number,
  base: number,
  harmonics: readonly { amp: number; cycles: number; phase?: number }[],
): WaveFn {
  return (x) =>
    harmonics.reduce(
      (y, h) => y - h.amp * Math.sin((TAU * Math.max(1, Math.round(h.cycles)) * x) / period + (h.phase ?? 0)),
      base,
    );
}

/**
 * A trochoid (Gerstner) wave: sharp crests and wide troughs, the shape of a real sea swell. `sharpness` 0…0.95
 * (0 = a plain cosine). The crest sits at x = period / 2 (+ k · period). Sampled and interpolated, so it is a
 * plain function of x.
 */
export function trochoidWave(period: number, base: number, amp: number, sharpness: number): WaveFn {
  const q = Math.min(0.95, Math.max(0, sharpness));
  const n = 96;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = -Math.PI + (TAU * i) / n;
    xs.push(period / 2 + (period * (t - q * Math.sin(t))) / TAU);
    ys.push(base - amp * Math.cos(t));
  }
  return (x) => {
    const u = ((x % period) + period) % period;
    let i = 1;
    while (i < n && xs[i]! < u) i++;
    const x0 = xs[i - 1]!;
    const x1 = xs[i]!;
    const f = x1 > x0 ? (u - x0) / (x1 - x0) : 0;
    return ys[i - 1]! + (ys[i]! - ys[i - 1]!) * f;
  };
}

function xsUpTo(width: number, step: number): number[] {
  const xs: number[] = [];
  for (let x = 0; x < width; x += step) xs.push(x);
  xs.push(width);
  return xs;
}

/** A filled band from `top` down to `bottom` (a function, or a flat y), over 0…width. */
export function bandPath(top: WaveFn, bottom: WaveFn | number, width: number, step = 4): string {
  const xs = xsUpTo(width, step);
  const low = typeof bottom === 'number' ? () => bottom : bottom;
  const upper = xs.map((x, i) => `${i ? 'L' : 'M'}${r1(x)} ${r1(top(x))}`).join('');
  const lower = [...xs]
    .reverse()
    .map((x) => `L${r1(x)} ${r1(low(x))}`)
    .join('');
  return `${upper}${lower}Z`;
}

/** An open line along `y`, over 0…width (foam, engraving lines). */
export function linePath(y: WaveFn, width: number, step = 4): string {
  return xsUpTo(width, step)
    .map((x, i) => `${i ? 'L' : 'M'}${r1(x)} ${r1(y(x))}`)
    .join('');
}

/** x of every crest of a trochoid wave (period / 2 + k · period) inside 0…width. */
export function crestXs(period: number, width: number): number[] {
  const xs: number[] = [];
  for (let x = period / 2; x <= width; x += period) xs.push(x);
  return xs;
}
