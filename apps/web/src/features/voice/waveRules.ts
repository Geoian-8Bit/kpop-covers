/**
 * F17 · The waves drawn by the voice/music control (lab moment `voice-split`) — the pure part: periodic wave
 * shapes (drawn once as a long strip and slid by one period, so the loop is seamless and nothing is stretched),
 * the song's envelope (voice = centre/mid, music = sides/side) and the paths that draw it. No DOM, no Web Audio;
 * covered by `waveRules.test.ts`.
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

/* ───────────── The song's envelope (variant B) ───────────── */

/** Levels per slice of the song, 0…1 each: `mid` (centre: the voice, mostly) and `side` (what differs: music). */
export interface VoiceEnvelope {
  mid: number[];
  side: number[];
}

/** How many slices the envelope has (enough detail for a 1.400 px row, cheap to draw). */
export const ENVELOPE_BINS = 360;

/** One-pole high-pass coefficient for `cutoffHz` at `sampleRate`. */
function highPassAlpha(cutoffHz: number, sampleRate: number): number {
  const rc = 1 / (TAU * cutoffHz);
  const dt = 1 / sampleRate;
  return rc / (rc + dt);
}

/** The value under which `share` of the values fall (values are not modified). */
export function percentile(values: readonly number[], share: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const at = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * share)));
  return sorted[at]!;
}

/** Each value over the series' loud level (97th percentile), clamped to 0…1; silence stays 0. */
export function normalise(values: readonly number[]): number[] {
  const top = percentile(values, 0.97);
  if (!(top > 1e-6)) return values.map(() => 0);
  return values.map((v) => Math.min(1, Math.max(0, v / top)));
}

/** Moving average over ±`radius` items (edges average what they have). */
export function smooth(values: readonly number[], radius: number): number[] {
  if (radius <= 0) return [...values];
  return values.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(values.length - 1, i + radius); j++) {
      sum += values[j]!;
      count++;
    }
    return sum / count;
  });
}

/**
 * The envelope of a stereo song: RMS of the centre (mid, high-passed above ~180 Hz so kick and bass don't pass
 * for the voice) and of the sides (side) per slice, each normalised to its own loud level. A mono song has no
 * sides: `side` comes out flat at 0, which is the truth (there is no music apart from the voice to show).
 */
export function envelopeFromChannels(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  bins = ENVELOPE_BINS,
): VoiceEnvelope {
  const length = Math.min(left.length, right.length);
  if (length === 0 || bins <= 0) return { mid: [], side: [] };
  const per = length / bins;
  const a = highPassAlpha(180, sampleRate);
  const midSq = new Float64Array(bins);
  const sideSq = new Float64Array(bins);
  const counts = new Float64Array(bins);
  let prevIn = 0;
  let prevOut = 0;
  for (let i = 0; i < length; i++) {
    const l = left[i]!;
    const r = right[i]!;
    const m = (l + r) / 2;
    const hp = a * (prevOut + m - prevIn);
    prevIn = m;
    prevOut = hp;
    const s = (l - r) / 2;
    const b = Math.min(bins - 1, Math.floor(i / per));
    midSq[b] = (midSq[b] ?? 0) + hp * hp;
    sideSq[b] = (sideSq[b] ?? 0) + s * s;
    counts[b] = (counts[b] ?? 0) + 1;
  }
  const rms = (sq: Float64Array) => Array.from(sq, (v, i) => (counts[i]! ? Math.sqrt(v / counts[i]!) : 0));
  // A side far below the centre is leakage (a mono song encoded as stereo): show it as it is, relative to the mid.
  const mid = rms(midSq);
  const side = rms(sideSq);
  const midTop = percentile(mid, 0.97);
  const sideTop = percentile(side, 0.97);
  const sideShare = midTop > 1e-6 ? sideTop / midTop : sideTop > 1e-6 ? 1 : 0;
  const sideScale = sideShare < 0.05 ? sideShare / 0.05 : 1;
  return {
    mid: smooth(normalise(mid), 1),
    side: smooth(normalise(side), 1).map((v) => v * sideScale),
  };
}

/** A believable envelope from a seed (demo, and while the real one is unavailable): verses, a chorus, breaks. */
export function syntheticEnvelope(seed: string, bins = ENVELOPE_BINS): VoiceEnvelope {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
  const p1 = rand() * TAU;
  const p2 = rand() * TAU;
  let chopM = 0;
  let chopS = 0;
  const mid: number[] = [];
  const side: number[] = [];
  for (let i = 0; i < bins; i++) {
    const x = i / Math.max(1, bins - 1);
    chopM = chopM * 0.55 + (rand() - 0.5) * 0.5;
    chopS = chopS * 0.7 + (rand() - 0.5) * 0.25;
    // The voice comes and goes in phrases (gaps between lines), louder in the choruses.
    const phrase = Math.max(0, Math.sin(x * Math.PI * 22 + p1)) ** 0.6;
    const chorus = 0.55 + 0.45 * Math.max(0, Math.sin(x * Math.PI * 3 + p2));
    const intro = Math.min(1, x / 0.08);
    mid.push(Math.min(1, Math.max(0, intro * (phrase * chorus + chopM * 0.4))));
    side.push(Math.min(1, Math.max(0.08, 0.35 + 0.35 * chorus + chopS + 0.1 * Math.sin(x * Math.PI * 9))));
  }
  return { mid: smooth(mid, 1), side: smooth(side, 2) };
}

/** Geometry of the envelope drawing, in viewBox units (the box is `width` × `height`). */
export interface EnvelopeLayout {
  width: number;
  height: number;
  /** Lowest the music's surface goes (quiet song), from the bottom. */
  floor: number;
  /** How tall the music body can grow, and the voice crest above it. */
  bodyRange: number;
  crestRange: number;
}

export interface EnvelopePaths {
  /** Music (side): a body from the bottom up to its surface. */
  body: string;
  /** Voice (mid): from its top down to the bottom (drawn behind the body, so the visible part rides on it). */
  crest: string;
  /** The body's surface, where the crest flattens into foam. */
  surface: string;
  /** The crest's top edge. */
  crestTop: string;
}

/** Smooth path through points (quadratic midpoints, like the timeline's swell). */
function smoothLine(points: readonly (readonly [number, number])[]): string {
  if (points.length === 0) return '';
  const first = points[0]!;
  let d = `M${r1(first[0])} ${r1(first[1])}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i]!;
    const [nx, ny] = points[i + 1]!;
    d += `Q${r1(x)} ${r1(y)} ${r1((x + nx) / 2)} ${r1((y + ny) / 2)}`;
  }
  const last = points[points.length - 1]!;
  return `${d}L${r1(last[0])} ${r1(last[1])}`;
}

export function envelopePaths(envelope: VoiceEnvelope, layout: EnvelopeLayout): EnvelopePaths {
  const { width, height, floor, bodyRange, crestRange } = layout;
  const n = Math.min(envelope.mid.length, envelope.side.length);
  if (n < 2) {
    const flat = height - floor;
    const line = `M0 ${r1(flat)}L${width} ${r1(flat)}`;
    return {
      body: `${line}L${width} ${height}L0 ${height}Z`,
      crest: `${line}L${width} ${height}L0 ${height}Z`,
      surface: line,
      crestTop: line,
    };
  }
  const surface: [number, number][] = [];
  const top: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * width;
    const s = height - floor - envelope.side[i]! * bodyRange;
    surface.push([x, s]);
    top.push([x, s - 1 - envelope.mid[i]! * crestRange]);
  }
  const close = `L${width} ${height}L0 ${height}Z`;
  const surfaceLine = smoothLine(surface);
  const topLine = smoothLine(top);
  return { body: surfaceLine + close, crest: topLine + close, surface: surfaceLine, crestTop: topLine };
}

/** Playhead position 0…1 for a time and a duration (0 while the duration is unknown). */
export function playheadFraction(time: number, duration: number): number {
  if (!(duration > 0) || !Number.isFinite(time)) return 0;
  return Math.min(1, Math.max(0, time / duration));
}

/** Designs on trial in the lab (moment `voice-split`), by variant id: `VoiceSplitControl` has one component each. */
export const VOICE_DESIGNS = ['onda', 'audio', 'hokusai', 'seigaiha', 'compacta', 'fusuma', 'capas'] as const;
export type VoiceDesign = (typeof VOICE_DESIGNS)[number];

export function isVoiceDesign(id: string): id is VoiceDesign {
  return (VOICE_DESIGNS as readonly string[]).includes(id);
}
