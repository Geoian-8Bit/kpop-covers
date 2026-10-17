/**
 * 18 · Separar voz y música con IA — the pure part of the separation: how the song is cut into the model's
 * segments and put back together, which engine this device can run, how long it may take, how big the two tracks
 * will be against the group's space, and how far the encoded tracks lag behind the file. No Web APIs here;
 * covered by `separateRules.test.ts`.
 */

import { videosBucketHasRoom } from '@/features/studio/cloudCopyRules';

/** HTDemucs (Hybrid Transformer Demucs, Meta) as exported for the browser: fixed 7.8 s stereo segments at 44.1 kHz. */
export const DEMUCS = {
  sampleRate: 44100,
  /** Samples per channel the model takes at once (its training length). */
  segment: 343980,
  nfft: 4096,
  hop: 1024,
  /** Demucs' default: consecutive segments share a quarter of their length. */
  overlap: 0.25,
  /** Order of the model's outputs. */
  sources: ['drums', 'bass', 'other', 'vocals'] as const,
} as const;

/**
 * Longest song this app separates. Memory: the whole song and both tracks (four stereo arrays at 44.1 kHz) live in
 * the worker at once, plus the decoded song in the page while it's read: ~1,3 GB at 15 min, ~0,9 GB at 10.
 */
export const MAX_SEPARATE_SECONDS = 10 * 60;

/** The longest song for this device: 10 min, 7 with less than 8 GB of memory (browsers report 8 at most). */
export function maxSeparateSeconds(deviceMemoryGb: number | null): number {
  return deviceMemoryGb != null && deviceMemoryGb < 8 ? 7 * 60 : MAX_SEPARATE_SECONDS;
}

// ───────────────────────── Segments and overlap-add ─────────────────────────

export interface Segment {
  start: number;
  /** Real samples in it (the last one is shorter; the model gets it padded with silence). */
  length: number;
}

/**
 * Where each segment starts: every `segment·(1 − overlap)` samples, until one reaches the end. Like Demucs'
 * `apply_model(split=True)`, minus the trailing segments that would only repeat the end.
 */
export function planSegments(total: number, segment: number = DEMUCS.segment, overlap: number = DEMUCS.overlap): Segment[] {
  if (!(total > 0) || !(segment > 0)) return [];
  const stride = Math.max(1, Math.floor(segment * (1 - Math.min(0.9, Math.max(0, overlap)))));
  const out: Segment[] = [];
  for (let start = 0; start < total; start += stride) {
    out.push({ start, length: Math.min(segment, total - start) });
    if (start + segment >= total) break;
  }
  return out;
}

/**
 * Demucs' blending weight: a triangle over the whole segment (1 … peak … 1, never 0), so where two segments
 * overlap each counts more near its own centre, where the model saw the most context.
 */
export function triangleWeights(segment: number): Float32Array {
  const w = new Float32Array(segment);
  const half = Math.floor(segment / 2);
  const peak = Math.max(half, segment - half);
  for (let i = 0; i < half; i++) w[i] = (i + 1) / peak;
  for (let i = half; i < segment; i++) w[i] = (segment - i) / peak;
  return w;
}

/** Adds `weight · chunk` (first `length` samples) at `start`, and the weight to `sum`. */
export function accumulate(
  out: Float32Array,
  sum: Float32Array,
  chunk: ArrayLike<number>,
  start: number,
  length: number,
  weights: ArrayLike<number>,
): void {
  const n = Math.min(length, out.length - start);
  for (let i = 0; i < n; i++) {
    const w = weights[i]!;
    out[start + i]! += chunk[i]! * w;
    if (sum !== out) sum[start + i]! += w;
  }
}

/** Divides by the summed weights (in place). */
export function normalize(out: Float32Array, sum: Float32Array): void {
  for (let i = 0; i < out.length; i++) {
    const w = sum[i]!;
    if (w > 0) out[i] = out[i]! / w;
  }
}

// ───────────────────────── Which engine ─────────────────────────

export type EngineKind = 'fp16' | 'fp32';
export type UnsupportedReason = 'no-webgpu' | 'low-memory' | 'small-gpu';
export type EngineChoice =
  | { kind: EngineKind; /** A phone or tablet: it can, but it is slow and drains the battery. */ mobile: boolean }
  | { kind: 'none'; reason: UnsupportedReason };

export interface DeviceCaps {
  webgpu: boolean;
  /** The GPU adapter can run half-precision shaders (the faster, smaller model). */
  shaderF16: boolean;
  /** `navigator.deviceMemory` (GB, rounded down, capped at 8 by browsers), null when unknown. */
  deviceMemoryGb: number | null;
  /** Adapter limit `maxStorageBufferBindingSize` (bytes), null when unknown. */
  maxBindingBytes: number | null;
  mobile: boolean;
}

const MiB = 1024 * 1024;

/**
 * The separation needs WebGPU (the model on the CPU would take most of an hour), ≥ 4 GB of memory, and room for
 * the attention matrices: ~115 MB in half precision, ~230 MB in full precision.
 */
export function chooseEngine(caps: DeviceCaps): EngineChoice {
  if (!caps.webgpu) return { kind: 'none', reason: 'no-webgpu' };
  if (caps.deviceMemoryGb != null && caps.deviceMemoryGb < 4) return { kind: 'none', reason: 'low-memory' };
  const binding = caps.maxBindingBytes ?? 128 * MiB;
  if (caps.shaderF16 && binding >= 128 * MiB) return { kind: 'fp16', mobile: caps.mobile };
  if (binding >= 256 * MiB) return { kind: 'fp32', mobile: caps.mobile };
  return { kind: 'none', reason: 'small-gpu' };
}

export function unsupportedCopy(reason: UnsupportedReason): string {
  switch (reason) {
    case 'low-memory':
      return 'Este dispositivo no tiene memoria suficiente para separar la voz; hazlo desde el ordenador.';
    case 'small-gpu':
      return 'La tarjeta gráfica de este dispositivo no da para separar la voz; hazlo desde el ordenador.';
    case 'no-webgpu':
    default:
      return 'Este dispositivo no puede separar la voz; hazlo desde el ordenador.';
  }
}

// ───────────────────────── Time ─────────────────────────

/**
 * Rough range of how long separating takes, in seconds, before starting (not measured on this device yet): the
 * half-precision model runs at ~8–20× real time on a desktop GPU (published figures), the full-precision one at
 * about 2.4× less; integrated and phone GPUs are several times slower. Plus the work on the processor.
 */
export function estimateSeparationRange(durationSeconds: number, kind: EngineKind, mobile = false): [number, number] {
  const d = Math.max(0, durationSeconds);
  const [fast, slow] = kind === 'fp16' ? [0.1, 0.6] : [0.25, 1.4];
  const factor = mobile ? 3 : 1;
  return [d * fast * factor, d * slow * factor];
}

/**
 * Time left from the segments measured so far (ms each): the first one is left out once there are others (it
 * includes compiling the GPU programs), and the recent ones weigh the most (the mean of the last five).
 */
export function estimateRemainingSeconds(durationsMs: readonly number[], remaining: number): number | null {
  if (remaining <= 0) return 0;
  const usable = durationsMs.length > 1 ? durationsMs.slice(1) : durationsMs;
  if (usable.length === 0) return null;
  const recent = usable.slice(-5);
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  return (mean * remaining) / 1000;
}

/** «menos de 1 min», «1 min», «unos 4 min». */
export function formatMinutes(seconds: number): string {
  if (!(seconds >= 60)) return 'menos de 1 min';
  const minutes = Math.round(seconds / 60);
  return minutes <= 1 ? '1 min' : `unos ${minutes} min`;
}

/** «entre 1 y 3 min», or a single figure when both ends round the same. */
export function formatRange([low, high]: [number, number]): string {
  const a = Math.max(1, Math.round(low / 60));
  const b = Math.max(1, Math.round(high / 60));
  if (high < 60) return 'menos de 1 min';
  return a === b ? formatMinutes(high) : `entre ${a} y ${b} min`;
}

// ───────────────────────── Size of the tracks ─────────────────────────

/** Cap per track (the database refuses bigger files). */
export const STEM_MAX_BYTES = 16 * MiB;
/** The group's free cloud space (the Supabase free plan). */
export const GROUP_STORAGE_BYTES = 1024 * MiB;

export type StemCodec = 'aac' | 'opus';

/** Good quality for practice (transparent-ish for AAC at 160, Opus at 128), lowered for very long songs. */
export function stemBitrate(durationSeconds: number, codec: StemCodec): number | null {
  const preferred = codec === 'aac' ? 160_000 : 128_000;
  const min = 64_000;
  const budget = STEM_MAX_BYTES * 0.92;
  const fits = Math.floor(((budget - 8192) * 8) / Math.max(1, durationSeconds));
  const rate = Math.min(preferred, Math.floor(fits / 1000) * 1000);
  return rate >= min ? rate : null;
}

/** Bytes of one track: the bitrate, ~2 % of frame overhead and a few KB of container. */
export function estimateStemBytes(durationSeconds: number, bitrate: number): number {
  return Math.ceil((Math.max(0, durationSeconds) * bitrate) / 8 * 1.02 + 8192);
}

export interface SpaceVerdict {
  ok: boolean;
  /** What both tracks will take. */
  needed: number;
  /** What the group has left now. */
  free: number;
}

/**
 * Whether both tracks fit in what the group has left, as the database decides it (20261017130000): the first track
 * goes up only with room for the two at the cap (16 MiB each) and 50 MB still free for one shared take, so a
 * separation never stops half uploaded for lack of space.
 */
export function spaceVerdict(usedBytes: number, neededBytes: number, limit = GROUP_STORAGE_BYTES): SpaceVerdict {
  const free = Math.max(0, limit - Math.max(0, usedBytes));
  const counted = Math.max(2 * STEM_MAX_BYTES, neededBytes);
  return { ok: videosBucketHasRoom(usedBytes, counted, limit), needed: neededBytes, free };
}

/** What a separation row says about where it came from (see `video_stems`). */
export interface PendingStemsRow {
  id: string;
  source_file_name: string;
  source_file_size: number;
  model: string;
  mime_type: string;
  delay_seconds: number;
  vocals_path: string | null;
  instrumental_path: string | null;
}

/**
 * The row an earlier try on this device left without its tracks, to retry on it instead of making a new one (each
 * new row means new names, so whatever the earlier try uploaded would stay in the bucket for ever and count in the
 * group's space). Only that very row (`rememberedId`), still without tracks, for the same file, model, format and
 * encoder delay (the row's delay can't be changed afterwards).
 */
export function reusablePendingStems<T extends PendingStemsRow>(
  rows: readonly T[],
  want: { fileName: string; fileSize: number; model: string; mime: string; delaySeconds: number },
  rememberedId: string | null,
): T | null {
  if (!rememberedId) return null;
  const row = rows.find((r) => r.id === rememberedId);
  if (!row || row.vocals_path || row.instrumental_path) return null;
  const same =
    row.source_file_name === want.fileName &&
    Number(row.source_file_size) === Number(want.fileSize) &&
    row.model === want.model &&
    row.mime_type === want.mime &&
    Math.abs(Number(row.delay_seconds) - want.delaySeconds) < 0.002;
  return same ? row : null;
}

/**
 * Whether a model that didn't load looks like a broken copy on this device (then forgetting it is worth the
 * 120–172 MB download again): the manifest or a file that can't be read (protobuf, «invalid model»), or a model
 * whose inputs/outputs don't fit. A GPU that can't build the session (memory, an unsupported operator) is not the
 * copy's fault: the cache stays.
 */
export function modelCacheLooksBroken(message: string): boolean {
  if (/web ?gpu|gpu|memory|\boom\b|operator|kernel|device|adapter|backend/i.test(message)) return false;
  return /manifest|protobuf|invalid (onnx )?model|pars(e|ing)|corrupt|unexpected end|outputs|missing /i.test(message);
}

/** «8 MB», «1,2 GB» (Spanish decimal comma). */
export function formatBytes(bytes: number): string {
  if (bytes >= 1000 * MiB) return `${(bytes / (1024 * MiB)).toFixed(1).replace('.', ',')} GB`;
  if (bytes >= 10 * MiB) return `${Math.round(bytes / MiB)} MB`;
  return `${Math.max(0.1, bytes / MiB).toFixed(1).replace('.', ',')} MB`;
}

// ───────────────────────── Encoder delay ─────────────────────────

export interface LagEstimate {
  /** Samples the encoded track is late by (negative: early). */
  lag: number;
  /** Normalised correlation at the peak, 0…1: how sure. */
  confidence: number;
}

/** Start of the loudest `window`-long stretch of `signal` (within `from`…`to`), stepping by a quarter window. */
export function loudestWindow(signal: ArrayLike<number>, window: number, from = 0, to = signal.length): number {
  let best = from;
  let bestEnergy = -1;
  const step = Math.max(1, Math.floor(window / 4));
  for (let start = from; start + window <= to; start += step) {
    let e = 0;
    for (let i = start; i < start + window; i += 4) e += signal[i]! * signal[i]!;
    if (e > bestEnergy) {
      bestEnergy = e;
      best = start;
    }
  }
  return best;
}

function correlationAt(a: ArrayLike<number>, b: ArrayLike<number>, start: number, length: number, lag: number, step = 1) {
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = start; i < start + length; i += step) {
    const j = i + lag;
    if (j < 0 || j >= b.length) continue;
    const x = a[i]!;
    const y = b[j]!;
    ab += x * y;
    aa += x * x;
    bb += y * y;
  }
  const d = Math.sqrt(aa * bb);
  return d > 1e-12 ? ab / d : 0;
}

/**
 * How many samples `test` (the track after encoding and decoding) is shifted against `reference` (what was
 * encoded), within ±`maxLag`: cross-correlation on the loudest second, coarse (every 4th lag) then exact around
 * the best. Encoders add a fixed delay (AAC priming, Opus pre-skip); the player compensates it.
 */
export function estimateLag(
  reference: ArrayLike<number>,
  test: ArrayLike<number>,
  maxLag: number,
  window: number,
): LagEstimate | null {
  const usable = Math.min(reference.length, test.length) - maxLag;
  if (usable <= maxLag + window) return null;
  const start = loudestWindow(reference, window, maxLag, usable);
  // Coarse: both signals averaged over 4 samples (a low-pass, so the peak is wide enough to land on), every lag.
  const q = 4;
  const decimate = (s: ArrayLike<number>) => {
    const from = Math.max(0, start - maxLag);
    const to = Math.min(s.length, start + window + maxLag);
    const out = new Float32Array(Math.floor((to - from) / q));
    for (let i = 0; i < out.length; i++) {
      const k = from + i * q;
      out[i] = (s[k]! + s[k + 1]! + s[k + 2]! + s[k + 3]!) / 4;
    }
    return { out, from };
  };
  const a = decimate(reference);
  const b = decimate(test);
  const aStart = Math.floor((start - a.from) / q);
  let coarse = 0;
  let coarseScore = -Infinity;
  const maxLagQ = Math.ceil(maxLag / q);
  for (let lag = -maxLagQ; lag <= maxLagQ; lag++) {
    const score = correlationAt(a.out, b.out, aStart, Math.floor(window / q), lag);
    if (score > coarseScore) {
      coarseScore = score;
      coarse = lag * q;
    }
  }
  // Exact: every lag around the coarse one, at full rate.
  let best = coarse;
  let bestScore = -Infinity;
  for (let lag = coarse - 2 * q; lag <= coarse + 2 * q; lag++) {
    if (lag < -maxLag || lag > maxLag) continue;
    const score = correlationAt(reference, test, start, window, lag);
    if (score > bestScore) {
      bestScore = score;
      best = lag;
    }
  }
  return { lag: best, confidence: Math.max(0, bestScore) };
}

// ───────────────────────── Progress copy ─────────────────────────

export type ProgressState =
  | { phase: 'read' }
  | { phase: 'model'; loaded: number; total: number }
  | { phase: 'compile' }
  | { phase: 'separate'; done: number; total: number; etaSeconds: number | null }
  | { phase: 'encode' }
  | { phase: 'upload' };

/** 0–100 for the phases that can tell, null for the ones that can't (an indeterminate bar). */
export function progressPercent(p: ProgressState): number | null {
  if (p.phase === 'model') return p.total > 0 ? Math.min(100, Math.floor((p.loaded / p.total) * 100)) : null;
  if (p.phase === 'separate') return p.total > 0 ? Math.min(100, Math.floor((p.done / p.total) * 100)) : null;
  return null;
}

export function progressLabel(p: ProgressState): string {
  switch (p.phase) {
    case 'read':
      return 'Leyendo el audio de la canción…';
    case 'model':
      return `Bajando el modelo de IA: ${progressPercent(p) ?? 0} %`;
    case 'compile':
      return 'Preparando el modelo en la tarjeta gráfica…';
    case 'separate': {
      const pct = progressPercent(p) ?? 0;
      const left = p.etaSeconds == null ? 'calculando el tiempo' : `quedan ${formatMinutes(p.etaSeconds)}`;
      return `Separando la voz: ${pct} % · ${left}`;
    }
    case 'encode':
      return 'Preparando las pistas…';
    case 'upload':
      return 'Subiendo las pistas a la nube del grupo…';
  }
}

/** What a screen reader hears: each phase once, and the percentages only every 25 %. */
export function progressMilestone(p: ProgressState): string {
  const pct = progressPercent(p);
  const step = pct == null ? null : Math.floor(pct / 25) * 25;
  switch (p.phase) {
    case 'model':
      return `Bajando el modelo de IA: ${step ?? 0} %`;
    case 'separate':
      return `Separando la voz: ${step ?? 0} %`;
    default:
      return progressLabel(p);
  }
}
