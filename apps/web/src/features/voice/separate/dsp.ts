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

/** numpy-style reflect padding (the edge sample is not repeated). */
export function reflectPad(signal: Float32Array, left: number, right: number): Float32Array {
  const n = signal.length;
  const out = new Float32Array(left + n + right);
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

// ───────────────────────── Demucs' spectrogram ─────────────────────────

/**
 * The model's `mag` input for one segment (each channel exactly `segment` samples, zero-padded by the caller):
 * `[4, bins, frames]` = left real, left imaginary, right real, right imaginary, each bin-major.
 *
 * Demucs: reflect-pad by 3·hop/2 (plus up to a whole hop on the right), centred STFT (another nfft/2 of reflect),
 * normalised (÷√nfft), periodic Hann; keep frames 2 … 2 + frames and drop the Nyquist bin.
 */
export function demucsSpec(left: Float32Array, right: Float32Array, cfg: SpecConfig = DEMUCS_SPEC): Float32Array {
  const { nfft, hop, segment } = cfg;
  const { bins, frames } = specShape(cfg);
  const pad = Math.floor(hop / 2) * 3;
  const padRight = pad + frames * hop - segment;
  const centre = nfft / 2;
  const l = reflectPad(reflectPad(left, pad, padRight), centre, centre);
  const r = reflectPad(reflectPad(right, pad, padRight), centre, centre);
  const { window } = plan(nfft);
  const scale = 1 / Math.sqrt(nfft);
  const out = new Float32Array(4 * bins * frames);
  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);
  const plane = bins * frames;
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
      out[idx] = ((zr + cr) / 2) * scale;
      out[plane + idx] = ((zi + ci) / 2) * scale;
      out[2 * plane + idx] = ((zi - ci) / 2) * scale;
      out[3 * plane + idx] = (-(zr - cr) / 2) * scale;
    }
  }
  return out;
}

/**
 * Back to sound: `spec` is `[4, bins, frames]` like `demucsSpec`'s output (a source's spectrogram from the
 * model's `x`, or a sum of several — the transform is linear). Demucs' `_ispec`: put back the Nyquist bin and two
 * empty frames on each side, centred inverse STFT normalised by the window envelope of all frames, then cut
 * `nfft/2 + 3·hop/2` from the start. Writes `segment` samples into `outLeft` / `outRight` (added, not replaced).
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
  const accL = new Float64Array(length);
  const accR = new Float64Array(length);
  const { window } = plan(nfft);
  const scale = Math.sqrt(nfft);
  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);
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
  // Window envelope over every frame, the empty padding frames included (as torch.istft does).
  const envelope = new Float64Array(length);
  for (let f = 0; f < paddedFrames; f++) {
    const start = f * hop;
    for (let i = 0; i < nfft; i++) envelope[start + i]! += window[i]! * window[i]!;
  }
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

/**
 * From the model's two outputs for one segment to the two tracks the app keeps: the voice and everything else
 * (drums + bass + other, which is how Demucs' `--two-stems` builds the accompaniment).
 *
 * `x` is `[4 sources, 4, bins, frames]` (the frequency branch, already masked), `xt` is `[4 sources, 2, segment]`
 * (the time branch); each source is `xt + ispec(x)`.
 */
export function twoStems(
  x: Float32Array,
  xt: Float32Array,
  cfg: SpecConfig = DEMUCS_SPEC,
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
  const others = new Float32Array(specSize);
  for (let s = 0; s < 4; s++) {
    if (s === VOCALS) continue;
    const base = s * specSize;
    for (let i = 0; i < specSize; i++) others[i]! += x[base + i]!;
  }
  demucsIspecAdd(x, vocals[0], vocals[1], cfg, VOCALS * specSize);
  demucsIspecAdd(others, instrumental[0], instrumental[1], cfg);
  return { vocals, instrumental };
}
