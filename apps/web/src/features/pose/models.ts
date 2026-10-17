/**
 * Pose models, loaded only when used (dynamic imports: none of this is in the app's first download). Nothing about
 * the screen lives here: the follow analysis (F10) and the lab (5.5 · prueba rápida) keep their own state.
 *
 *  - MoveNet MultiPose Lightning (TensorFlow.js, Apache 2.0): up to 6 people with a tracker that keeps who is who.
 *    MoveNet SinglePose Lightning: one person, for following on a crop (15). Weights of both from tfhub.dev
 *    (served through kaggle.com → storage.googleapis.com). Backends: WebGPU, WebGL, or (15) WASM with SIMD on a
 *    computer without a graphics chip — its binaries from this app's own domain (wasmBackend.ts).
 *  - MediaPipe Pose Landmarker lite (Apache 2.0): 33 points of one person. WASM from cdn.jsdelivr.net, model from
 *    storage.googleapis.com.
 *
 * The video never leaves the device: frames go from the <video> element straight into the model.
 */
import type { Pose, PoseDetector } from '@tensorflow-models/pose-detection';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import {
  BENCH_KEY,
  chooseBackend,
  isMobileDevice,
  isSoftwareRenderer,
  parseBench,
  withBench,
  type BackendBench,
  type TfBackend,
} from './backendRules';

/** Keep in step with package.json and the CSP path in vercel.json (the WASM comes from the CDN for this exact version). */
export const MEDIAPIPE_VERSION = '0.10.35';
const MEDIAPIPE_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MEDIAPIPE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export const MOVENET_MULTIPOSE = 'movenet-multipose-lightning';
/** 15 · The analysis follows with the single-pose model on a crop; MultiPose finds and checks the dancer. */
export const MOVENET_SINGLEPOSE = 'movenet-singlepose-lightning';
export const MEDIAPIPE_LITE = 'mediapipe-pose-landmarker-lite';

export type { TfBackend } from './backendRules';
export { chooseBackend } from './backendRules';
/** 'auto': WebGPU, WASM or WebGL, whichever can be trusted here (see backendRules.chooseBackend). */
export type BackendChoice = TfBackend | 'auto';

/** A model that could not be loaded: the message says what to do (in Spanish, for the screen). */
export class ModelLoadError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ModelLoadError';
  }
}

function friendlyLoadError(what: string, err: unknown): ModelLoadError {
  const raw = err instanceof Error ? err.message : String(err);
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (offline || /fetch|network|load failed|Failed to load|404|403|script/i.test(raw)) {
    return new ModelLoadError(
      `No se pudo descargar ${what}. Comprueba la conexión: el modelo se descarga la primera vez que se usa.`,
      err,
    );
  }
  if (/webgl|webgpu|backend|gpu/i.test(raw)) {
    return new ModelLoadError(
      `Este navegador no puede ejecutar ${what} (sin aceleración gráfica disponible).`,
      err,
    );
  }
  return new ModelLoadError(`No se pudo preparar ${what}: ${raw}`, err);
}

// ───────────── TensorFlow.js ─────────────

type Tf = typeof import('@tensorflow/tfjs-core');
let tfPromise: Promise<Tf> | null = null;

async function loadTf(): Promise<Tf> {
  tfPromise ??= (async () => {
    const tf = await import('@tensorflow/tfjs-core');
    await import('@tensorflow/tfjs-backend-webgl');
    // pose-detection already brings the WebGPU backend; importing it here only makes the order explicit.
    await import('@tensorflow/tfjs-backend-webgpu');
    return tf;
  })().catch((err: unknown) => {
    tfPromise = null;
    throw err;
  });
  return tfPromise;
}

/** Set when WebGPU failed here (unavailable, or a model run broke on it): not chosen again this session. */
let webgpuBroken = false;
export function markWebGpuBroken(): void {
  webgpuBroken = true;
}
/** The same for WASM (an operation the models need missing there, or the binary not loading). */
let wasmBroken = false;
export function markBackendBroken(backend: string): void {
  if (backend === 'webgpu') webgpuBroken = true;
  if (backend === 'wasm') wasmBroken = true;
}
export function isWasmBroken(): boolean {
  return wasmBroken;
}
function isBroken(backend: string): boolean {
  return (backend === 'webgpu' && webgpuBroken) || (backend === 'wasm' && wasmBroken);
}

/** 15 · The follow analysis already timed WASM against WebGL this session (once is enough: kept in the bench). */
let wasmProbed = false;
export function markWasmProbed(): void {
  wasmProbed = true;
}
export function wasWasmProbed(): boolean {
  return wasmProbed;
}

/** The pose test's measurements on this device (Ajustes), per backend: they tip «auto» (backendRules). */
export function readBench(): BackendBench {
  try {
    return parseBench(localStorage.getItem(BENCH_KEY));
  } catch {
    return {};
  }
}
export function recordBench(backend: string, ms: number): void {
  try {
    localStorage.setItem(BENCH_KEY, JSON.stringify(withBench(readBench(), backend, ms)));
  } catch {
    /* private mode: not kept */
  }
  autoBackend = null;
}

let mobileCache: boolean | null = null;
/** A phone or a tablet: never WASM there, and WebGPU only when the pose test measured it faster. */
export function onMobile(): boolean {
  if (mobileCache != null) return mobileCache;
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  mobileCache = isMobileDevice({
    uaMobile: nav.userAgentData?.mobile ?? null,
    ua: nav.userAgent,
    touchPoints: nav.maxTouchPoints ?? 0,
  });
  return mobileCache;
}

let rendererCache: string | null | undefined;
/** WebGL's renderer («ANGLE (Intel…)», «SwiftShader»…), or null where the browser hides it. Asked once. */
export function webglRenderer(): string | null {
  if (rendererCache !== undefined) return rendererCache;
  rendererCache = null;
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null;
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name: unknown = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      rendererCache = typeof name === 'string' ? name : null;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    rendererCache = null;
  }
  return rendererCache;
}

let autoBackend: Promise<TfBackend> | null = null;
async function resolveAuto(): Promise<TfBackend> {
  autoBackend ??= (async () => {
    const nav = navigator as Navigator & {
      gpu?: { requestAdapter(): Promise<unknown> };
      userAgentData?: unknown;
    };
    let adapter: 'real' | 'fallback' | 'none' = 'none';
    if (nav.gpu) {
      try {
        const a = (await nav.gpu.requestAdapter()) as {
          isFallbackAdapter?: boolean;
          info?: { isFallbackAdapter?: boolean };
        } | null;
        adapter = !a ? 'none' : a.isFallbackAdapter || a.info?.isFallbackAdapter ? 'fallback' : 'real';
      } catch {
        adapter = 'none';
      }
    }
    const mobile = onMobile();
    return chooseBackend({
      hasWebGpu: Boolean(nav.gpu),
      chromium: nav.userAgentData != null,
      adapter,
      broken: webgpuBroken,
      mobile,
      softwareGl: !mobile && isSoftwareRenderer(webglRenderer()),
      wasmBroken,
      bench: readBench(),
    });
  })();
  const chosen = await autoBackend;
  if ((chosen === 'webgpu' && webgpuBroken) || (chosen === 'wasm' && wasmBroken)) return 'webgl';
  return chosen;
}

/** Switches TensorFlow.js to `backend` (WebGPU and WASM fall back to WebGL where they aren't available). */
async function useBackend(tf: Tf, backend: TfBackend): Promise<TfBackend> {
  if (tf.getBackend() !== backend) {
    let ok: boolean;
    if (backend === 'wasm') {
      ok = await import('./wasmBackend')
        .then((m) => m.ensureWasmBackend())
        .then(() => tf.setBackend('wasm'))
        .catch(() => false);
    } else {
      ok = await tf.setBackend(backend).catch(() => false);
    }
    if (!ok && backend !== 'webgl') {
      markBackendBroken(backend);
      await tf.setBackend('webgl');
    } else if (!ok) {
      throw new Error(`backend ${backend} unavailable`);
    }
  }
  await tf.ready();
  return tf.getBackend() as TfBackend;
}

export interface LoadedMoveNet {
  detector: PoseDetector;
  /** The TensorFlow.js backend it runs on: «webgl», «webgpu», «wasm». */
  backend: string;
  /** Download and set-up time of this load (0 when it was already loaded). */
  loadMs: number;
  model: string;
}

type PoseKind = 'multi' | 'single';

/**
 * Detectors by kind and by the backend they really run on (H12: asking for WebGPU where it falls back to WebGL
 * reuses the WebGL one instead of creating a second). Loads are serialised: switching the backend and creating a
 * detector never interleave with another load.
 */
const detectors = new Map<string, Promise<{ detector: PoseDetector; backend: TfBackend; loadMs: number }>>();
let queue: Promise<unknown> = Promise.resolve();

async function createPoseDetector(kind: PoseKind): Promise<PoseDetector> {
  const pd = await import('@tensorflow-models/pose-detection');
  return kind === 'multi'
    ? pd.createDetector(pd.SupportedModels.MoveNet, {
        modelType: pd.movenet.modelType.MULTIPOSE_LIGHTNING,
        enableTracking: true,
        trackerType: pd.TrackerType.BoundingBox,
        // Our frames come at uneven times (a crop most of the time): no keypoint smoothing between them.
        enableSmoothing: false,
      })
    : pd.createDetector(pd.SupportedModels.MoveNet, {
        modelType: pd.movenet.modelType.SINGLEPOSE_LIGHTNING,
        // Each call gets a different crop: nothing to smooth or to carry over.
        enableSmoothing: false,
      });
}

async function loadDetector(kind: PoseKind, choice: BackendChoice): Promise<LoadedMoveNet> {
  cancelRelease();
  const t0 = performance.now();
  let tf: Tf;
  try {
    tf = await loadTf();
  } catch (err) {
    throw friendlyLoadError('el modelo de seguimiento', err);
  }
  const run = queue.then(async () => {
    const wanted = choice === 'auto' ? await resolveAuto() : choice;
    const actual = await useBackend(tf, wanted);
    const key = `${kind}:${actual}`;
    let pending = detectors.get(key);
    const fresh = !pending;
    if (!pending) {
      pending = createPoseDetector(kind).then((detector) => ({
        detector,
        backend: actual,
        loadMs: performance.now() - t0,
      }));
      detectors.set(key, pending);
      pending.catch(() => detectors.delete(key));
    }
    const loaded = await pending;
    // Another screen may have switched TensorFlow.js meanwhile: back to this detector's backend.
    await useBackend(tf, loaded.backend);
    return {
      ...loaded,
      loadMs: fresh ? loaded.loadMs : 0,
      model: kind === 'multi' ? MOVENET_MULTIPOSE : MOVENET_SINGLEPOSE,
    };
  });
  queue = run.catch(() => undefined);
  try {
    return await run;
  } catch (err) {
    throw friendlyLoadError('el modelo de seguimiento (MoveNet)', err);
  }
}

/** MoveNet MultiPose Lightning with its bounding-box tracker; one per backend, loaded once per session. */
export function loadMoveNet(backend: BackendChoice = 'webgl'): Promise<LoadedMoveNet> {
  return loadDetector('multi', backend);
}

/** 15 · MoveNet SinglePose Lightning: one person, on a small crop around them; much faster than MultiPose. */
export function loadSinglePose(backend: BackendChoice = 'auto'): Promise<LoadedMoveNet> {
  return loadDetector('single', backend);
}

/**
 * H12 · Frees the models' memory on the graphics chip (leaving the studio). Delayed, so that a screen coming
 * straight back (or React mounting twice in development) keeps them; any new load cancels it.
 */
let releaseTimer: ReturnType<typeof setTimeout> | undefined;
export function scheduleRelease(ms = 4000): void {
  clearTimeout(releaseTimer);
  releaseTimer = setTimeout(() => void releasePoseModels(), ms);
}
export function cancelRelease(): void {
  clearTimeout(releaseTimer);
  releaseTimer = undefined;
}

export async function releasePoseModels(): Promise<void> {
  cancelRelease();
  const all = [...detectors.values()];
  detectors.clear();
  await queue;
  for (const pending of all) {
    try {
      (await pending).detector.dispose();
    } catch {
      /* failed to load, or already gone */
    }
  }
}

/**
 * 15 · Frees the detectors of one backend (WebGPU after it broke mid-analysis, WASM after losing the probe): their
 * memory on the graphics chip (or in the WASM heap) goes now, not when leaving the studio. A backend marked broken
 * is not used again this session: TensorFlow.js lets go of it too (its pool of buffers and textures, the tensors
 * left over by the run that failed, the WASM heap).
 */
export async function dropBackend(backend: TfBackend): Promise<void> {
  const gone: Promise<{ detector: PoseDetector }>[] = [];
  for (const [key, pending] of detectors) {
    if (key.endsWith(`:${backend}`)) {
      detectors.delete(key);
      gone.push(pending);
    }
  }
  // In the load queue: never while another load is switching TensorFlow.js or creating a detector.
  const run = queue.then(async () => {
    for (const pending of gone) {
      try {
        (await pending).detector.dispose();
      } catch {
        /* failed to load, or already gone */
      }
    }
    if (!isBroken(backend) || backend === 'webgl' || !tfPromise) return;
    try {
      const tf = await tfPromise;
      // (findBackend would set it up again where it isn't: removeBackend throws instead when it is not there.)
      if (tf.getBackend() !== backend) tf.removeBackend(backend);
    } catch {
      /* never registered, or already gone */
    }
  });
  queue = run.catch(() => undefined);
  await run.catch(() => undefined);
}

/**
 * Forgets who was who (a new analysis, or going back in time). MoveNet's own `reset()` fails with MultiPose in
 * pose-detection 2.1.3 (it resets the single-pose filters, which don't exist), so the tracker is cleared directly;
 * a single-pose detector has no tracker and its own reset works (it forgets the crop it would carry over).
 */
export function resetTracker(detector: PoseDetector): void {
  const inner = detector as unknown as {
    tracker?: { reset?: () => void };
    keypointFilterMap?: { clear?: () => void };
    multiPoseModel?: boolean;
    reset?: () => void;
  };
  if (inner.multiPoseModel === false) {
    try {
      inner.reset?.();
    } catch {
      /* nothing to forget */
    }
    return;
  }
  inner.tracker?.reset?.();
  inner.keypointFilterMap?.clear?.();
}

/** Points of the MoveNet skeleton to join (COCO, 17 points). */
export async function moveNetPairs(): Promise<[number, number][]> {
  const pd = await import('@tensorflow-models/pose-detection');
  return pd.util.getAdjacentPairs(pd.SupportedModels.MoveNet) as [number, number][];
}

export type { Pose as MoveNetPose };

// ───────────── MediaPipe ─────────────

export interface LoadedLandmarker {
  landmarker: PoseLandmarker;
  /** «GPU» (WebGL inside its WASM) or «CPU» (WASM). */
  delegate: 'GPU' | 'CPU';
  loadMs: number;
  model: string;
  connections: { start: number; end: number }[];
}

let landmarker: Promise<Omit<LoadedLandmarker, 'loadMs'> & { loadMs: number }> | null = null;

/** MediaPipe Pose Landmarker (lite) for video, on the GPU when it can, on the CPU otherwise. */
export async function loadLandmarker(): Promise<LoadedLandmarker> {
  const t0 = performance.now();
  const fresh = !landmarker;
  landmarker ??= (async () => {
    const vision = await import('@mediapipe/tasks-vision');
    const fileset = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
    const create = (delegate: 'GPU' | 'CPU') =>
      vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MEDIAPIPE_MODEL, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
    let delegate: 'GPU' | 'CPU' = 'GPU';
    let instance: PoseLandmarker;
    try {
      instance = await create('GPU');
    } catch {
      delegate = 'CPU';
      instance = await create('CPU');
    }
    return {
      landmarker: instance,
      delegate,
      loadMs: performance.now() - t0,
      model: MEDIAPIPE_LITE,
      connections: vision.PoseLandmarker.POSE_CONNECTIONS.map((c) => ({ start: c.start, end: c.end })),
    };
  })();
  try {
    const loaded = await landmarker;
    return { ...loaded, loadMs: fresh ? loaded.loadMs : 0 };
  } catch (err) {
    landmarker = null;
    throw friendlyLoadError('el modelo de postura (MediaPipe)', err);
  }
}

// ───────────── Video frames ─────────────

/**
 * A <video> of its own for analysing (the one on screen keeps playing undisturbed): muted, never heard, kept off
 * screen (some browsers only decode frames of elements in the page).
 */
export async function openAnalysisVideo(src: string, signal?: AbortSignal): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  video.muted = true;
  video.defaultMuted = true;
  video.volume = 0;
  video.playsInline = true;
  video.preload = 'auto';
  if (!src.startsWith('blob:') && !src.startsWith('data:')) video.crossOrigin = 'anonymous';
  video.setAttribute('aria-hidden', 'true');
  video.style.cssText =
    'position:fixed;left:-10px;top:-10px;width:2px;height:2px;opacity:0;pointer-events:none';
  document.body.appendChild(video);
  video.src = src;
  try {
    await new Promise<void>((resolve, reject) => {
      const done = () => {
        cleanup();
        resolve();
      };
      const fail = () => {
        cleanup();
        reject(new Error('No se pudo abrir el vídeo para analizarlo.'));
      };
      const abort = () => {
        cleanup();
        reject(new DOMException('Cancelado', 'AbortError'));
      };
      const cleanup = () => {
        video.removeEventListener('loadeddata', done);
        video.removeEventListener('error', fail);
        signal?.removeEventListener('abort', abort);
      };
      if (video.readyState >= 2) return resolve();
      video.addEventListener('loadeddata', done);
      video.addEventListener('error', fail);
      signal?.addEventListener('abort', abort);
    });
    await learnDuration(video);
  } catch (err) {
    closeAnalysisVideo(video);
    throw err;
  }
  return video;
}

/**
 * WebMs recorded in the browser (takes) don't say how long they are until played through: a jump far past the end
 * makes the browser find it, then back to the start.
 */
export async function learnDuration(video: HTMLVideoElement): Promise<void> {
  if (Number.isFinite(video.duration) && video.duration > 0) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, 5000);
    function done() {
      clearTimeout(timer);
      video.removeEventListener('durationchange', check);
      video.removeEventListener('seeked', check);
      resolve();
    }
    function check() {
      if (Number.isFinite(video.duration) && video.duration > 0) done();
    }
    video.addEventListener('durationchange', check);
    video.addEventListener('seeked', check);
    video.currentTime = 1e7;
  });
  await seekVideo(video, 0).catch(() => undefined);
}

export function closeAnalysisVideo(video: HTMLVideoElement): void {
  video.pause();
  video.removeAttribute('src');
  video.load();
  video.remove();
}

/** Lands on `time` (seconds of the file) and waits for that frame. */
export function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  const target = Math.max(0, Math.min(time, Number.isFinite(video.duration) ? video.duration - 0.01 : time));
  if (Math.abs(video.currentTime - target) < 0.0005 && video.readyState >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      video.removeEventListener('seeked', done);
      reject(new Error('El vídeo tardó demasiado en buscar ese momento.'));
    }, 10_000);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    video.addEventListener('seeked', done, { once: true });
    video.currentTime = target;
  });
}
