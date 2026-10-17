import type { EngineKind } from './separateRules';

/**
 * 18 · Where the separation model comes from. Both are HTDemucs (Meta's Hybrid Transformer Demucs, the
 * `htdemucs` weights, MIT) exported to ONNX for onnxruntime-web; the outputs are the same (the fp16 export was
 * validated against the fp32 one: per-stem correlation ≥ 0.9998). Pinned to a commit so they never change under
 * the app; downloaded from Hugging Face once and kept in this device's Cache Storage (not the offline precache).
 *
 * - fp16: huggingface.co/monteslu/htdemucs-web-onnx (MIT) — half precision except the convolutions, cut into 21
 *   pieces run in order (≈126 MB, ~2.4× faster). Needs the GPU's `shader-f16`.
 * - fp32: huggingface.co/timcsy/demucs-web-onnx (`htdemucs_embedded.onnx`, ≈181 MB), one piece; for GPUs
 *   without half precision. The JS pre/post-processing of github.com/timcsy/demucs-web (MIT) is ported in dsp.ts.
 */

export interface ModelPiece {
  url: string;
  /** Tensor names in and out (from the manifest); empty for the single-file model (read from the session). */
  inputs: readonly string[];
  outputs: readonly string[];
}

export interface ModelDescriptor {
  kind: EngineKind;
  /** Stored with the tracks (`video_stems.model`): which model and revision made them. */
  id: string;
  /** Total download (manifest included), for the progress bar and the confirmation. */
  bytes: number;
  /**
   * Exact size of each file at the pinned revision (Hugging Face's file list), so a download cut short or a changed
   * file is never kept. Checked against the repositories' trees on 2026-10-17.
   */
  fileBytes?: Readonly<Record<string, number>>;
  /** `null`: the pieces come from a manifest file at `manifestUrl`. */
  pieces: readonly ModelPiece[] | null;
  manifestUrl?: string;
  baseUrl: string;
  /** Node names that must run on the CPU in piece 0 (fp16-fragile normalisation; NaN on WebGPU otherwise). */
  cpuNodes?: readonly string[];
}

const FP16_REVISION = 'a4a57cc0cf707e5b9a3e6ad3c2c4b21fcbe608c1';
const FP32_REVISION = '92e33df61cfc9eb820272aaa62d2ef6dcf4d950d';

export const MODELS: Record<EngineKind, ModelDescriptor> = {
  fp16: {
    kind: 'fp16',
    id: 'htdemucs-fp16@a4a57cc',
    bytes: 125_886_563,
    fileBytes: {
      'htdemucs_split_manifest.json': 5318,
      'htdemucs_p00.onnx': 28110,
      'htdemucs_p01.onnx': 16551977,
      'htdemucs_p02.onnx': 293808,
      'htdemucs_p03.onnx': 6207085,
      'htdemucs_p04.onnx': 21052,
      'htdemucs_p05.onnx': 36401,
      'htdemucs_p06.onnx': 293435,
      'htdemucs_p07.onnx': 6205601,
      'htdemucs_p08.onnx': 16789948,
      'htdemucs_p09.onnx': 12663168,
      'htdemucs_p10.onnx': 12656234,
      'htdemucs_p11.onnx': 12663251,
      'htdemucs_p12.onnx': 12655956,
      'htdemucs_p13.onnx': 22007636,
      'htdemucs_p14.onnx': 5149584,
      'htdemucs_p15.onnx': 884773,
      'htdemucs_p16.onnx': 441716,
      'htdemucs_p17.onnx': 184145,
      'htdemucs_p18.onnx': 43437,
      'htdemucs_p19.onnx': 73203,
      'htdemucs_p20.onnx': 30725,
    },
    pieces: null,
    baseUrl: `https://huggingface.co/monteslu/htdemucs-web-onnx/resolve/${FP16_REVISION}/`,
    manifestUrl: `https://huggingface.co/monteslu/htdemucs-web-onnx/resolve/${FP16_REVISION}/htdemucs_split_manifest.json`,
    cpuNodes: [
      '/ReduceMean', '/Sub', '/Pow', '/ReduceMean_1', '/Clip', '/Sqrt', '/Add', '/Div',
      '/ReduceMean_2', '/Sub_1', '/Pow_1', '/ReduceMean_3', '/Clip_1', '/Sqrt_1', '/Add_1', '/Div_1',
    ],
  },
  fp32: {
    kind: 'fp32',
    id: 'htdemucs-fp32@92e33df',
    bytes: 180_534_758,
    fileBytes: { 'htdemucs_embedded.onnx': 180_534_758 },
    baseUrl: `https://huggingface.co/timcsy/demucs-web-onnx/resolve/${FP32_REVISION}/`,
    pieces: [
      {
        url: `https://huggingface.co/timcsy/demucs-web-onnx/resolve/${FP32_REVISION}/htdemucs_embedded.onnx`,
        inputs: [],
        outputs: [],
      },
    ],
  },
};

/** The exact size of a model file (by its URL), when the descriptor knows it. */
export function expectedFileBytes(model: ModelDescriptor, url: string): number | undefined {
  const name = url.split('/').pop() ?? '';
  return url.startsWith(model.baseUrl) ? model.fileBytes?.[name] : undefined;
}

/** Cache Storage bucket for the model files (outside the service worker's precache, so installs stay light). */
export const MODEL_CACHE = 'stem-models-v1';

export interface Manifest {
  pieces: { file: string; inputs: string[]; outputs: string[] }[];
  outputs: { freq: string; time: string };
}

export function isManifest(value: unknown): value is Manifest {
  const m = value as Manifest;
  return (
    Boolean(m) &&
    Array.isArray(m.pieces) &&
    m.pieces.length > 0 &&
    m.pieces.every(
      (p) => typeof p.file === 'string' && /^[\w.-]+\.onnx$/.test(p.file) && Array.isArray(p.inputs) && Array.isArray(p.outputs),
    ) &&
    typeof m.outputs?.freq === 'string' &&
    typeof m.outputs?.time === 'string'
  );
}

async function openCache(): Promise<Cache | null> {
  try {
    return typeof caches !== 'undefined' ? await caches.open(MODEL_CACHE) : null;
  } catch {
    return null; // private mode, blocked storage: download every time
  }
}

/** Header kept with each cached file: how many bytes it had when it was stored. */
const BYTES_HEADER = 'X-Model-Bytes';

/**
 * Whether a download is whole: as long as the server said (`Content-Length`, unless the body came compressed,
 * when that counts the compressed bytes) and, when the app knows it, as long as the file should be. A download
 * cut short without an error must never be kept: every later try would fail with it.
 */
export function downloadComplete(input: {
  read: number;
  contentLength: string | null;
  contentEncoding: string | null;
  expected?: number;
}): boolean {
  if (!(input.read > 0)) return false;
  if (input.expected != null && input.read !== input.expected) return false;
  const encoded = input.contentEncoding != null && !/^\s*identity\s*$/i.test(input.contentEncoding);
  const length = input.contentLength != null && /^\d+$/.test(input.contentLength.trim()) ? Number(input.contentLength) : null;
  return encoded || length == null || length === input.read;
}

/** Whether a cached copy is the file it was when stored (and the size the app expects, when it knows it). */
export function cachedComplete(input: { bytes: number; stored: string | null; expected?: number }): boolean {
  if (!(input.bytes > 0)) return false;
  if (input.expected != null && input.bytes !== input.expected) return false;
  return input.stored == null || Number(input.stored) === input.bytes;
}

/**
 * The bytes of a model file, from this device's cache or downloaded (and then cached). `onBytes` gets the bytes
 * read so far of this file, for the overall progress. `expectedBytes`: the file's exact size, when known. A cached
 * copy that doesn't add up is thrown away and downloaded again; a download that doesn't add up is never kept.
 */
export async function fetchModelFile(
  url: string,
  onBytes: (read: number) => void,
  signal?: AbortSignal,
  expectedBytes?: number,
): Promise<ArrayBuffer> {
  const cache = await openCache();
  const cached = await cache?.match(url).catch(() => undefined);
  if (cached) {
    const bytes = await cached.arrayBuffer();
    if (cachedComplete({ bytes: bytes.byteLength, stored: cached.headers.get(BYTES_HEADER), expected: expectedBytes })) {
      onBytes(bytes.byteLength);
      return bytes;
    }
    await cache?.delete(url).catch(() => false);
  }
  const res = await fetch(url, { signal, mode: 'cors', credentials: 'omit' });
  if (!res.ok || !res.body) throw new Error(`model-http-${res.status}`);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let read = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    read += value.byteLength;
    onBytes(read);
  }
  const bytes = new Uint8Array(read);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  if (
    !downloadComplete({
      read,
      contentLength: res.headers.get('Content-Length'),
      contentEncoding: res.headers.get('Content-Encoding'),
      expected: expectedBytes,
    })
  ) {
    throw new Error(`model-truncated ${read}`);
  }
  try {
    // `put` reads the whole body before it resolves, so the same bytes can be handed to the model afterwards.
    await cache?.put(
      url,
      new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream', [BYTES_HEADER]: String(read) } }),
    );
  } catch {
    /* no room to keep it: it will be downloaded again next time */
  }
  return bytes.buffer;
}

/**
 * Forgets the downloaded models on this device (a broken download, or to free the space): the next separation
 * downloads again. True when there was something to forget.
 */
export async function clearModelCache(): Promise<boolean> {
  try {
    return typeof caches !== 'undefined' ? await caches.delete(MODEL_CACHE) : false;
  } catch {
    return false;
  }
}

/** Whether any model file is kept on this device (for «Borrar el modelo de IA»). */
export async function hasModelCache(): Promise<boolean> {
  try {
    if (typeof caches === 'undefined' || !(await caches.has(MODEL_CACHE))) return false;
    return (await (await caches.open(MODEL_CACHE)).keys()).length > 0;
  } catch {
    return false;
  }
}

/** Whether every file of a model is already on this device (no download needed). */
export async function isModelCached(kind: EngineKind): Promise<boolean> {
  const cache = await openCache();
  if (!cache) return false;
  const model = MODELS[kind];
  try {
    if (model.pieces) return (await Promise.all(model.pieces.map((p) => cache.match(p.url)))).every(Boolean);
    const manifest = await cache.match(model.manifestUrl!);
    if (!manifest) return false;
    const parsed: unknown = await manifest.json();
    if (!isManifest(parsed)) return false;
    return (await Promise.all(parsed.pieces.map((p) => cache.match(model.baseUrl + p.file)))).every(Boolean);
  } catch {
    return false;
  }
}
