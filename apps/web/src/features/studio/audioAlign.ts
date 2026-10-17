/**
 * 13 · Does the copy start exactly with the original? Compares the sound of both (decoded, same sample rate) and
 * says how late the copy is. Pure maths on sample arrays, no DOM.
 *
 * Two steps: a coarse search on the onset envelopes (2 ms steps, up to ±0.5 s), then a fine one on the waveform
 * itself around it (one-sample steps). Lossy encoders keep onsets and, closely enough, the waveform.
 */

export interface ShiftMeasure {
  /** How late the copy's sound is, in seconds (negative: it starts early). */
  seconds: number;
  /** 0–1: how alike both sounds are at that shift (below ~0.5 the measure isn't trustworthy). */
  confidence: number;
}

/** Mono mix of up to two channels, `length` samples from `from` (zeros past the end). */
export function monoWindow(channels: readonly Float32Array[], from: number, length: number): Float32Array {
  const out = new Float32Array(Math.max(0, length));
  const used = channels.slice(0, 2);
  if (!used.length) return out;
  const gain = 1 / used.length;
  for (const ch of used) {
    const end = Math.min(ch.length, from + length);
    for (let i = Math.max(0, from); i < end; i++) out[i - from]! += ch[i]! * gain;
  }
  return out;
}

/** Onset strength per hop: how much the (log) energy rises from one hop to the next. */
export function onsetEnvelope(x: Float32Array, hop: number): Float32Array {
  const n = Math.floor(x.length / hop);
  const out = new Float32Array(n);
  let prev = 0;
  for (let k = 0; k < n; k++) {
    let sum = 0;
    for (let i = k * hop, end = i + hop; i < end; i++) sum += x[i]! * x[i]!;
    const e = Math.log(1e-9 + sum / hop);
    out[k] = k === 0 ? 0 : Math.max(0, e - prev);
    prev = e;
  }
  return out;
}

function withoutMean(x: Float32Array): Float32Array {
  let mean = 0;
  for (let i = 0; i < x.length; i++) mean += x[i]!;
  mean /= x.length || 1;
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i]! - mean;
  return out;
}

/**
 * Normalised cross-correlation of `b` against `a` for lags in [minLag, maxLag]: lag L means b[i + L] ≈ a[i].
 * `a` is compared whole; `b` is read where it exists (zeros elsewhere).
 */
export function bestLag(a: Float32Array, b: Float32Array, minLag: number, maxLag: number): { lag: number; score: number } {
  let energyA = 0;
  for (let i = 0; i < a.length; i++) energyA += a[i]! * a[i]!;
  let best = { lag: 0, score: -Infinity };
  for (let lag = minLag; lag <= maxLag; lag++) {
    let dot = 0;
    let energyB = 0;
    const start = Math.max(0, -lag);
    const end = Math.min(a.length, b.length - lag);
    for (let i = start; i < end; i++) {
      const v = b[i + lag]!;
      dot += a[i]! * v;
      energyB += v * v;
    }
    const score = energyA > 0 && energyB > 0 ? dot / Math.sqrt(energyA * energyB) : 0;
    if (score > best.score) best = { lag, score };
  }
  return best.score === -Infinity ? { lag: 0, score: 0 } : best;
}

/** Start of the loudest `length`-sample stretch of `x` (in `step` jumps), at least `margin` from both ends. */
export function loudestStart(x: Float32Array, length: number, step: number, margin: number): number {
  let best = margin;
  let bestEnergy = -1;
  for (let s = margin; s + length + margin <= x.length; s += step) {
    let e = 0;
    for (let i = s; i < s + length; i += 4) e += x[i]! * x[i]!;
    if (e > bestEnergy) {
      bestEnergy = e;
      best = s;
    }
  }
  return best;
}

/**
 * How late the copy's sound is against the original's. Both as planar channels at `sampleRate`. Looks at the first
 * `windowSeconds` (the start is what matters) and shifts of up to `maxShiftSeconds`. Null when there's nothing to
 * compare (silence, too short).
 */
export function measureShift(
  original: readonly Float32Array[],
  copy: readonly Float32Array[],
  sampleRate: number,
  { windowSeconds = 40, maxShiftSeconds = 0.5 }: { windowSeconds?: number; maxShiftSeconds?: number } = {},
): ShiftMeasure | null {
  const origLength = original[0]?.length ?? 0;
  const window = Math.min(Math.floor(windowSeconds * sampleRate), origLength);
  const maxShift = Math.floor(maxShiftSeconds * sampleRate);
  if (window < sampleRate) return null;

  // Coarse: onset envelopes, 2 ms per step.
  const hop = Math.max(1, Math.round(sampleRate * 0.002));
  const a = monoWindow(original, 0, window);
  const b = monoWindow(copy, 0, window + maxShift);
  const envA = withoutMean(onsetEnvelope(a, hop));
  const envB = withoutMean(onsetEnvelope(b, hop));
  const maxHops = Math.ceil(maxShift / hop);
  const coarse = bestLag(envA, envB, -maxHops, maxHops);
  if (!(coarse.score > 0.2)) return null;

  // Fine: the waveform of the loudest second, one sample at a time around the coarse shift.
  const segment = Math.min(sampleRate, Math.floor(window / 2));
  // Keeps the fine search inside both arrays whatever the coarse shift was.
  const margin = maxHops * hop + 4 * hop;
  if (window < segment + 2 * margin) {
    return { seconds: (coarse.lag * hop) / sampleRate, confidence: Math.max(0, coarse.score) };
  }
  const start = loudestStart(a, segment, Math.max(1, Math.floor(sampleRate / 10)), margin);
  const piece = a.subarray(start, start + segment);
  const around = coarse.lag * hop;
  const fromB = b.subarray(start + around - 2 * hop, start + around + segment + 2 * hop);
  const fine = bestLag(piece, fromB, 0, 4 * hop);
  const lag = around - 2 * hop + fine.lag;
  return { seconds: lag / sampleRate, confidence: Math.max(0, Math.min(1, fine.score)) };
}
