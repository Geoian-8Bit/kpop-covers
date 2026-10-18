import { DEMUCS } from './separateRules';

/**
 * 18 · The signal processing HTDemucs does outside its ONNX graph (complex STFTs can't be exported): the
 * spectrogram it takes as input and the inverse transform of the spectrogram it returns. A faithful port of
 * Demucs' `_spec` / `_ispec` (facebookresearch/demucs, MIT) as reimplemented for the browser by demucs-web
 * (github.com/timcsy/demucs-web, MIT), which the exported models were validated against.
 *
 * Pure and synchronous (it runs in the separation worker). Two real channels go through one complex FFT
 * (left + i·right), which halves the work.
 */

export interface SpecConfig {
  nfft: number;
  hop: number;
  /** Samples per channel of a segment. */
  segment: number;
}

export const DEMUCS_SPEC: SpecConfig = { nfft: DEMUCS.nfft, hop: DEMUCS.hop, segment: DEMUCS.segment };

/** Frequency bins the model sees (the Nyquist bin is dropped) and frames (`ceil(segment / hop)`). */
export function specShape(cfg: SpecConfig): { bins: number; frames: number } {
  return { bins: cfg.nfft / 2, frames: Math.ceil(cfg.segment / cfg.hop) };
}

// ───────────────────────── FFT ─────────────────────────

interface FftPlan {
  n: number;
  rev: Uint32Array;
  cos: Float64Array;
  sin: Float64Array;
  window: Float32Array;
}

const plans = new Map<number, FftPlan>();

function plan(n: number): FftPlan {
  const known = plans.get(n);
  if (known) return known;
  if (n < 2 || (n & (n - 1)) !== 0) throw new Error(`FFT size ${n} is not a power of two`);
  const bits = Math.log2(n);
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0, x = i; b < bits; b++, x >>= 1) r = (r << 1) | (x & 1);
    rev[i] = r;
  }
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) {
    cos[k] = Math.cos((2 * Math.PI * k) / n);
    sin[k] = Math.sin((2 * Math.PI * k) / n);
  }
  // Periodic Hann, like torch.hann_window(n).
  const window = new Float32Array(n);
  for (let i = 0; i < n; i++) window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / n));
  const p = { n, rev, cos, sin, window };
  plans.set(n, p);
  return p;
}

/** In-place iterative radix-2 FFT of (re, im). `inverse` also divides by n. */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const { n, rev, cos, sin } = plan(re.length);
  for (let i = 0; i < n; i++) {
    const j = rev[i]!;
    if (j > i) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }
  const sign = inverse ? 1 : -1;
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const wr = cos[k]!;
        const wi = sign * sin[k]!;
        const a = start + j;
        const b = a + half;
        const xr = re[b]! * wr - im[b]! * wi;
        const xi = re[b]! * wi + im[b]! * wr;
        re[b] = re[a]! - xr;
        im[b] = im[a]! - xi;
        re[a] = re[a]! + xr;
        im[a] = im[a]! + xi;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] = re[i]! / n;
      im[i] = im[i]! / n;
    }
  }
}

/** numpy-style reflect padding (the edge sample is not repeated). `out` lets the caller reuse a buffer. */
export function reflectPad(
  signal: Float32Array,
  left: number,
  right: number,
  out: Float32Array = new Float32Array(left + signal.length + right),
): Float32Array {
  const n = signal.length;
  const at = (i: number) => {
    // Reflect into [0, n) as many times as needed (only matters for tiny signals).
    const period = 2 * (n - 1);
    if (period <= 0) return signal[0] ?? 0;
    let k = ((i % period) + period) % period;
    if (k >= n) k = period - k;
    return signal[k]!;
  };
  for (let i = 0; i < left; i++) out[i] = at(i - left);
  out.set(signal, left);
  for (let i = 0; i < right; i++) out[left + n + i] = at(n + i);
  return out;
}

/**
 * Scratch buffers kept between calls, by name and size. The worker runs one segment at a time, synchronously;
 * without them every segment allocated some 25 MB of padding, accumulators and spectrograms.
 */
const scratch32 = new Map<string, Float32Array>();
const scratch64 = new Map<string, Float64Array>();
function f32(name: string, size: number): Float32Array {
  const key = `${name}:${size}`;
  let found = scratch32.get(key);
  if (!found) {
    found = new Float32Array(size);
    scratch32.set(key, found);
  }
  return found;
}
function f64(name: string, size: number): Float64Array {
  const key = `${name}:${size}`;
  let found = scratch64.get(key);
  if (!found) {
    found = new Float64Array(size);
    scratch64.set(key, found);
  }
  return found;
}

// ───────────────────────── Demucs' spectrogram ─────────────────────────

/**
 * The model's `mag` input for one segment (each channel exactly `segment` samples, zero-padded by the caller):
 * `[4, bins, frames]` = left real, left imaginary, right real, right imaginary, each bin-major.
 *
 * Demucs: reflect-pad by 3·hop/2 (plus up to a whole hop on the right), centred STFT (another nfft/2 of reflect),
 * normalised (÷√nfft), periodic Hann; keep frames 2 … 2 + frames and drop the Nyquist bin.
 *
 * `out` (`4 · bins · frames`; every value is written) lets the caller reuse one buffer between segments.
 */
export function demucsSpec(
  left: Float32Array,
  right: Float32Array,
  cfg: SpecConfig = DEMUCS_SPEC,
  out?: Float32Array,
): Float32Array {
  const { nfft, hop, segment } = cfg;
  const { bins, frames } = specShape(cfg);
  const plane = bins * frames;
  const spec = out ?? new Float32Array(4 * plane);
  const pad = Math.floor(hop / 2) * 3;
  const padRight = pad + frames * hop - segment;
  const centre = nfft / 2;
  const inner = left.length + pad + padRight;
  const outer = inner + 2 * centre;
  const l = reflectPad(reflectPad(left, pad, padRight, f32('pad', inner)), centre, centre, f32('padL', outer));
  const r = reflectPad(reflectPad(right, pad, padRight, f32('pad', inner)), centre, centre, f32('padR', outer));
  const { window } = plan(nfft);
  const scale = 1 / Math.sqrt(nfft);
  const re = f64('re', nfft);
  const im = f64('im', nfft);
  for (let f = 0; f < frames; f++) {
    const start = (f + 2) * hop;
    for (let i = 0; i < nfft; i++) {
      re[i] = l[start + i]! * window[i]!;
      im[i] = r[start + i]! * window[i]!;
    }
    fft(re, im);
    // Unpack the two real spectra: L[k] = (Z[k] + conj Z[n−k]) / 2, R[k] = (Z[k] − conj Z[n−k]) / 2i.
    for (let k = 0; k < bins; k++) {
      const m = k === 0 ? 0 : nfft - k;
      const zr = re[k]!;
      const zi = im[k]!;
      const cr = re[m]!;
      const ci = -im[m]!;
      const idx = k * frames + f;
      spec[idx] = ((zr + cr) / 2) * scale;
      spec[plane + idx] = ((zi + ci) / 2) * scale;
      spec[2 * plane + idx] = ((zi - ci) / 2) * scale;
      spec[3 * plane + idx] = (-(zr - cr) / 2) * scale;
    }
  }
  return spec;
}

/** Window envelope over every frame, the empty padding frames included (as torch.istft does). Once per size. */
const envelopes = new Map<string, Float64Array>();
function windowEnvelope(nfft: number, hop: number, paddedFrames: number): Float64Array {
  const key = `${nfft}:${hop}:${paddedFrames}`;
  let envelope = envelopes.get(key);
  if (!envelope) {
    const { window } = plan(nfft);
    envelope = new Float64Array((paddedFrames - 1) * hop + nfft);
    for (let f = 0; f < paddedFrames; f++) {
      const start = f * hop;
      for (let i = 0; i < nfft; i++) envelope[start + i]! += window[i]! * window[i]!;
    }
    envelopes.set(key, envelope);
  }
  return envelope;
}

/**
 * Back to sound: `spec` is `[4, bins, frames]` like `demucsSpec`'s output (a source's spectrogram from the
 * model's `x`, or a sum of several — the transform is linear). Demucs' `_ispec`: put back the Nyquist bin and two
 * empty frames on each side, centred inverse STFT normalised by the window envelope of all frames, then cut
 * `nfft/2 + 3·hop/2` from the start. Writes `segment` samples into `outLeft` / `outRight` (added, not replaced).
 *
 * As in Demucs, the first and last ~1.000 samples come out quieter (½ at the very edge, whole from 2·hop): the
 * empty frames weigh in the envelope. Overlapping segments hide it; the song's own start and end are covered by
 * the worker's `DEMUCS.lead` of silence (see `planSegments`).
 */
export function demucsIspecAdd(
  spec: Float32Array,
  outLeft: Float32Array,
  outRight: Float32Array,
  cfg: SpecConfig = DEMUCS_SPEC,
  specOffset = 0,
): void {
  const { nfft, hop, segment } = cfg;
  const { bins, frames } = specShape(cfg);
  const plane = bins * frames;
  const paddedFrames = frames + 4;
  const length = (paddedFrames - 1) * hop + nfft;
  const accL = f64('accL', length).fill(0);
  const accR = f64('accR', length).fill(0);
  const { window } = plan(nfft);
  const scale = Math.sqrt(nfft);
  const re = f64('re', nfft);
  const im = f64('im', nfft);
  for (let f = 0; f < frames; f++) {
    re.fill(0);
    im.fill(0);
    // Z = L + i·R over the full (Hermitian) spectrum; the Nyquist bin stays 0 (Demucs pads it with zeros).
    for (let k = 0; k < bins; k++) {
      const idx = specOffset + k * frames + f;
      const lr = spec[idx]!;
      const li = k === 0 ? 0 : spec[idx + plane]!;
      const rr = spec[idx + 2 * plane]!;
      const ri = k === 0 ? 0 : spec[idx + 3 * plane]!;
      re[k] = lr - ri;
      im[k] = li + rr;
      if (k > 0) {
        re[nfft - k] = lr + ri;
        im[nfft - k] = -li + rr;
      }
    }
    fft(re, im, true);
    const start = (f + 2) * hop;
    for (let i = 0; i < nfft; i++) {
      const w = window[i]! * scale;
      accL[start + i]! += re[i]! * w;
      accR[start + i]! += im[i]! * w;
    }
  }
  const envelope = windowEnvelope(nfft, hop, paddedFrames);
  const offset = nfft / 2 + Math.floor(hop / 2) * 3;
  const n = Math.min(segment, outLeft.length, outRight.length);
  for (let i = 0; i < n; i++) {
    const e = envelope[offset + i]!;
    if (e > 1e-11) {
      outLeft[i]! += accL[offset + i]! / e;
      outRight[i]! += accR[offset + i]! / e;
    }
  }
}

/** The segment the model was given: its two channels and, when the caller has it, its `demucsSpec` (`mag`). */
export interface StemMix {
  left: Float32Array;
  right: Float32Array;
  spec?: Float32Array;
}

/** Energies (sums of squares over both channels): the mix, what the sources left out, and what came back. */
export interface ResidualStats {
  mix: number;
  residual: number;
  reclaimed: number;
}

/**
 * From the model's two outputs for one segment to the two tracks the app keeps: the voice and everything else
 * (drums + bass + other, which is how Demucs' `--two-stems` builds the accompaniment).
 *
 * `x` is `[4 sources, 4, bins, frames]` (the frequency branch, already masked), `xt` is `[4 sources, 2, segment]`
 * (the time branch); each source is `xt + ispec(x)`.
 *
 * Point 46 · With `mix` (the segment the model was given), the instrumental also takes back the music the four
 * sources left out (`reclaimResidual`): the plain sum sounded thin in places. `stats`, when given, adds up that
 * segment's energies (the worker logs them per song).
 */
export function twoStems(
  x: Float32Array,
  xt: Float32Array,
  cfg: SpecConfig = DEMUCS_SPEC,
  mix?: StemMix,
  stats?: ResidualStats,
): { vocals: [Float32Array, Float32Array]; instrumental: [Float32Array, Float32Array] } {
  const { segment } = cfg;
  const { bins, frames } = specShape(cfg);
  const specSize = 4 * bins * frames;
  const VOCALS = 3;
  const vocals: [Float32Array, Float32Array] = [new Float32Array(segment), new Float32Array(segment)];
  const instrumental: [Float32Array, Float32Array] = [new Float32Array(segment), new Float32Array(segment)];
  // Time branch.
  for (let s = 0; s < 4; s++) {
    const target = s === VOCALS ? vocals : instrumental;
    for (let c = 0; c < 2; c++) {
      const base = (s * 2 + c) * segment;
      const out = target[c]!;
      for (let i = 0; i < segment; i++) out[i]! += xt[base + i]!;
    }
  }
  // Frequency branch: the accompaniment's spectrogram is the sum of three (one inverse transform instead of three).
  const others = f32('others', specSize).fill(0);
  for (let s = 0; s < 4; s++) {
    if (s === VOCALS) continue;
    const base = s * specSize;
    for (let i = 0; i < specSize; i++) others[i]! += x[base + i]!;
  }
  demucsIspecAdd(x, vocals[0], vocals[1], cfg, VOCALS * specSize);
  demucsIspecAdd(others, instrumental[0], instrumental[1], cfg);
  if (mix) {
    const seg = reclaimResidual(mix, vocals, instrumental, cfg);
    if (stats) {
      stats.mix += seg.mix;
      stats.residual += seg.residual;
      stats.reclaimed += seg.reclaimed;
    }
  }
  return { vocals, instrumental };
}

/** Under this share of the segment's energy (−50 dB) the residual is not worth two spectrograms: left out. */
export const RESIDUAL_FLOOR = 1e-5;

/** Decibels of the energy `part` against `whole`; −Infinity for nothing. */
export function energyDb(part: number, whole: number): number {
  return part > 0 && whole > 0 ? 10 * Math.log10(part / whole) : Number.NEGATIVE_INFINITY;
}

/**
 * Point 46 · HTDemucs' four sources don't add up to the mix: what none of them took (some pads, synths, reverb
 * tails) was lost from «Sin voz», which then sounded thin in places. Demucs' `--other-method minus` (mix − voice)
 * gets it back but also every bit of voice the model missed. Here the residual (mix − voice − instrumental) is
 * shared out bin by bin like a Wiener filter, by how much each final track has there:
 * `|instrumental|² / (|instrumental|² + |voice|²)`, per channel, from the spectrograms of the tracks themselves
 * (both of the model's branches, time and frequency, carry sound across the whole band). Only the instrumental's
 * share is added to it: the music comes back where the music is, the voice's bins stay out, and «Voz» is not
 * touched. A bin that neither track claims goes to the music.
 *
 * Cost: one pass over the samples when the residual is under `RESIDUAL_FLOOR` of the mix; otherwise two
 * spectrograms and one inverse (the mix's spectrogram is the model's own input, `mix.spec`), on buffers kept
 * between segments. `instrumental` is changed in place.
 */
export function reclaimResidual(
  mix: StemMix,
  vocals: readonly [Float32Array, Float32Array],
  instrumental: [Float32Array, Float32Array],
  cfg: SpecConfig = DEMUCS_SPEC,
): ResidualStats {
  const { segment } = cfg;
  const { bins, frames } = specShape(cfg);
  const plane = bins * frames;
  const specSize = 4 * plane;
  const channels = [mix.left, mix.right] as const;
  let mixEnergy = 0;
  let residualEnergy = 0;
  for (let c = 0; c < 2; c++) {
    const m = channels[c];
    const v = vocals[c]!;
    const inst = instrumental[c]!;
    const n = Math.min(segment, m.length);
    for (let i = 0; i < n; i++) {
      const value = m[i]!;
      const rest = value - v[i]! - inst[i]!;
      mixEnergy += value * value;
      residualEnergy += rest * rest;
    }
  }
  const stats: ResidualStats = { mix: mixEnergy, residual: residualEnergy, reclaimed: 0 };
  if (!(residualEnergy > mixEnergy * RESIDUAL_FLOOR)) return stats;

  const mixSpec = mix.spec ?? demucsSpec(mix.left, mix.right, cfg, f32('mixSpec', specSize));
  const vocalsSpec = demucsSpec(vocals[0], vocals[1], cfg, f32('vocalsSpec', specSize));
  // The instrumental's spectrogram, overwritten bin by bin with its share of the residual.
  const share = demucsSpec(instrumental[0], instrumental[1], cfg, f32('shareSpec', specSize));
  let all = 0;
  let kept = 0;
  for (let c = 0; c < 2; c++) {
    const reBase = 2 * c * plane;
    const imBase = reBase + plane;
    for (let i = 0; i < plane; i++) {
      const vr = vocalsSpec[reBase + i]!;
      const vi = vocalsSpec[imBase + i]!;
      const ir = share[reBase + i]!;
      const ii = share[imBase + i]!;
      // The residual's spectrogram: the transform is linear, so it is the mix's minus the two tracks'.
      const rr = mixSpec[reBase + i]! - vr - ir;
      const ri = mixSpec[imBase + i]! - vi - ii;
      const pv = vr * vr + vi * vi;
      const pi = ir * ir + ii * ii;
      const w = pv + pi > 1e-20 ? pi / (pi + pv) : 1;
      share[reBase + i] = rr * w;
      share[imBase + i] = ri * w;
      const power = rr * rr + ri * ri;
      all += power;
      kept += power * w * w;
    }
  }
  demucsIspecAdd(share, instrumental[0], instrumental[1], cfg);
  stats.reclaimed = all > 0 ? residualEnergy * (kept / all) : 0;
  return stats;
}
