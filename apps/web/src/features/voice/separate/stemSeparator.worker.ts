/**
 * 18 · The separation itself, off the page: downloads (or reads from the cache) the HTDemucs model, runs it on the
 * GPU with onnxruntime-web segment by segment, blends the segments back (overlap-add) and hands back two tracks:
 * the voice and the rest. This file (and onnxruntime-web inside it) only loads when someone taps «Separar voz y
 * música»: nothing of it is in the app's start-up or in the studio's code. Cancelling terminates the worker, which
 * frees the GPU and the memory at once.
 */
import * as ort from 'onnxruntime-web/webgpu';
// Served from our own domain (Vite emits it under /assets/, not precached: the precache only takes js/css/…).
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import { demucsSpec, twoStems } from './dsp';
import { clearModelCache, expectedFileBytes, fetchModelFile, isManifest, MODELS, type ModelDescriptor } from './model';
import type { RunRequest, SeparationErrorCode, WorkerMessage } from './protocol';
import {
  accumulate,
  DEMUCS,
  estimateRemainingSeconds,
  normalize,
  planSegments,
  triangleWeights,
  type EngineKind,
} from './separateRules';

const scope = self as unknown as {
  postMessage(message: WorkerMessage, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<RunRequest>) => void) | null;
  navigator: { gpu?: unknown };
};

ort.env.wasm.wasmPaths = { wasm: wasmUrl };
// No SharedArrayBuffer without cross-origin isolation (the YouTube player rules COEP out): one CPU thread. The
// heavy work is on the GPU anyway.
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.logLevel = 'warning';
// A laptop with two GPUs: the dedicated one.
ort.env.webgpu.powerPreference = 'high-performance';

class SeparationError extends Error {
  constructor(
    readonly code: SeparationErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const post = (message: WorkerMessage, transfer?: Transferable[]) => scope.postMessage(message, transfer);

interface Runner {
  run(mix: Float32Array, mag: Float32Array): Promise<{ x: Float32Array; xt: Float32Array }>;
}

/** Downloads every file of the model first (one progress bar), then builds the sessions. */
async function loadModel(kind: EngineKind): Promise<Runner> {
  const model: ModelDescriptor = MODELS[kind];
  const total = model.bytes;
  const done = new Map<string, number>();
  const report = () => {
    let loaded = 0;
    for (const v of done.values()) loaded += v;
    post({ type: 'progress', phase: 'model', loaded: Math.min(loaded, total), total });
  };
  const file = async (url: string, expected: number | undefined = expectedFileBytes(model, url)) => {
    try {
      return await fetchModelFile(
        url,
        (read) => {
          done.set(url, read);
          report();
        },
        undefined,
        expected,
      );
    } catch (error) {
      throw new SeparationErrorWithCause('model-download', error);
    }
  };

  if (model.pieces) {
    const [only] = model.pieces;
    const bytes = await file(only!.url);
    post({ type: 'progress', phase: 'compile' });
    const session = await create(new Uint8Array(bytes), {
      executionProviders: ['webgpu'],
      graphOptimizationLevel: 'basic',
    });
    return singleRunner(session);
  }

  const manifestBytes = await file(model.manifestUrl!);
  let manifest: unknown = null;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  } catch {
    /* unreadable: same as a wrong one */
  }
  // A broken manifest is a broken copy on this device (runSeparation forgets the cache for it).
  if (!isManifest(manifest)) throw new SeparationError('model-load', 'manifest');
  // Up to three files at a time: the 21 pieces download in about the time of the biggest few.
  const buffers: ArrayBuffer[] = new Array(manifest.pieces.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (next < manifest.pieces.length) {
        const i = next++;
        buffers[i] = await file(model.baseUrl + manifest.pieces[i]!.file);
      }
    }),
  );
  // The pieces have no sizes of their own in the manifest, but together they must weigh what the model does: a
  // piece cut short (or changed) is never kept, and everything downloads again next time.
  const sum = buffers.reduce((a, b) => a + b.byteLength, 0) + manifestBytes.byteLength;
  if (sum !== model.bytes) {
    await clearModelCache();
    throw new SeparationError('model-download', `pieces ${sum} of ${model.bytes} bytes`);
  }
  post({ type: 'progress', phase: 'compile' });
  const sessions: ort.InferenceSession[] = [];
  for (let i = 0; i < manifest.pieces.length; i++) {
    sessions.push(
      await create(new Uint8Array(buffers[i]!), {
        executionProviders: [
          i === 0 && model.cpuNodes ? { name: 'webgpu', forceCpuNodeNames: model.cpuNodes } : { name: 'webgpu' },
        ],
        graphOptimizationLevel: 'all',
        preferredOutputLocation: 'gpu-buffer',
      }),
    );
    buffers[i] = new ArrayBuffer(0); // let the bytes go once the session has them
  }
  return chainRunner(sessions, manifest.pieces, manifest.outputs);
}

class SeparationErrorWithCause extends SeparationError {
  constructor(code: SeparationErrorCode, cause: unknown) {
    super(code, cause instanceof Error ? cause.message : String(cause));
  }
}

async function create(bytes: Uint8Array, options: ort.InferenceSession.SessionOptions) {
  try {
    return await ort.InferenceSession.create(bytes, options);
  } catch (error) {
    throw new SeparationErrorWithCause('model-load', error);
  }
}

/** The single-file model: its own input/output names (`mix`/`mag`, or waveform first as in demucs-web). */
function singleRunner(session: ort.InferenceSession): Runner {
  const names = session.inputNames;
  const waveName = names.includes('mix') ? 'mix' : names[0]!;
  const specName = names.includes('mag') ? 'mag' : names.find((n) => n !== waveName);
  return {
    async run(mix, mag) {
      const feeds: Record<string, ort.Tensor> = {
        [waveName]: new ort.Tensor('float32', mix, [1, 2, DEMUCS.segment]),
      };
      if (specName) feeds[specName] = new ort.Tensor('float32', mag, [1, 4, DEMUCS.nfft / 2, Math.ceil(DEMUCS.segment / DEMUCS.hop)]);
      const out = await session.run(feeds);
      let x: Float32Array | null = null;
      let xt: Float32Array | null = null;
      for (const name of session.outputNames) {
        const t = out[name]!;
        // [1, 4, 4, bins, frames] is the frequency branch, [1, 4, 2, samples] the time branch.
        if (t.dims.length === 5) x = (await t.getData(true)) as Float32Array;
        else if (t.dims.length === 4) xt = (await t.getData(true)) as Float32Array;
        t.dispose();
      }
      if (!x || !xt) throw new SeparationError('model-load', 'outputs');
      return { x, xt };
    },
  };
}

/** The 21-piece model: a name → tensor map fed piece by piece; intermediate tensors stay on the GPU. */
function chainRunner(
  sessions: ort.InferenceSession[],
  pieces: { inputs: string[]; outputs: string[] }[],
  outputs: { freq: string; time: string },
): Runner {
  return {
    async run(mix, mag) {
      const map = new Map<string, ort.Tensor>([
        ['mix', new ort.Tensor('float32', mix, [1, 2, DEMUCS.segment])],
        ['mag', new ort.Tensor('float32', mag, [1, 4, DEMUCS.nfft / 2, Math.ceil(DEMUCS.segment / DEMUCS.hop)])],
      ]);
      try {
        for (let i = 0; i < sessions.length; i++) {
          const piece = pieces[i]!;
          const feeds: Record<string, ort.Tensor> = {};
          for (const name of piece.inputs) {
            const t = map.get(name);
            if (!t) throw new SeparationError('model-load', `missing ${name}`);
            feeds[name] = t;
          }
          const out = await sessions[i]!.run(feeds);
          for (const name of piece.outputs) map.set(name, out[name]!);
        }
        const x = map.get(outputs.freq);
        const xt = map.get(outputs.time);
        if (!x || !xt) throw new SeparationError('model-load', 'outputs');
        return { x: (await x.getData(true)) as Float32Array, xt: (await xt.getData(true)) as Float32Array };
      } finally {
        for (const t of map.values()) t.dispose();
      }
    },
  };
}

function hasNaN(a: Float32Array): boolean {
  for (let i = 0; i < a.length; i += 97) if (a[i] !== a[i]) return true;
  return false;
}

async function separate({ engine, left, right }: RunRequest) {
  if (!scope.navigator.gpu) throw new SeparationError('no-webgpu', 'navigator.gpu');
  const startedAt = performance.now();
  const runner = await loadModel(engine);

  const total = left.length;
  const segment = DEMUCS.segment;
  const plan = planSegments(total);
  const weights = triangleWeights(segment);
  const vocals: [Float32Array, Float32Array] = [new Float32Array(total), new Float32Array(total)];
  const instrumental: [Float32Array, Float32Array] = [new Float32Array(total), new Float32Array(total)];
  const sum = new Float32Array(total);
  const times: number[] = [];
  post({ type: 'progress', phase: 'separate', done: 0, total: plan.length, etaSeconds: null });

  for (let i = 0; i < plan.length; i++) {
    const { start, length } = plan[i]!;
    const t0 = performance.now();
    // The model always takes a full segment: the last one is padded with silence.
    const segL = new Float32Array(segment);
    const segR = new Float32Array(segment);
    segL.set(left.subarray(start, start + length));
    segR.set(right.subarray(start, start + length));
    const mag = demucsSpec(segL, segR);
    const mix = new Float32Array(2 * segment);
    mix.set(segL, 0);
    mix.set(segR, segment);
    let out: { x: Float32Array; xt: Float32Array };
    try {
      out = await runner.run(mix, mag);
    } catch (error) {
      if (error instanceof SeparationError) throw error;
      throw new SeparationErrorWithCause('gpu', error);
    }
    if (i === 0 && (hasNaN(out.x) || hasNaN(out.xt))) throw new SeparationError('gpu', 'nan');
    const stems = twoStems(out.x, out.xt);
    accumulate(vocals[0], sum, stems.vocals[0], start, length, weights);
    accumulate(vocals[1], vocals[1], stems.vocals[1], start, length, weights);
    accumulate(instrumental[0], instrumental[0], stems.instrumental[0], start, length, weights);
    accumulate(instrumental[1], instrumental[1], stems.instrumental[1], start, length, weights);
    times.push(performance.now() - t0);
    post({
      type: 'progress',
      phase: 'separate',
      done: i + 1,
      total: plan.length,
      etaSeconds: estimateRemainingSeconds(times, plan.length - i - 1),
    });
  }
  for (const track of [...vocals, ...instrumental]) normalize(track, sum);
  post(
    { type: 'done', vocals, instrumental, seconds: (performance.now() - startedAt) / 1000 },
    [vocals[0].buffer, vocals[1].buffer, instrumental[0].buffer, instrumental[1].buffer],
  );
}

scope.onmessage = (event) => {
  if (event.data?.type !== 'run') return;
  separate(event.data).catch((error: unknown) => {
    const code = error instanceof SeparationError ? error.code : 'unknown';
    const message = error instanceof Error ? error.message : String(error);
    post({ type: 'error', code, message });
  });
};
