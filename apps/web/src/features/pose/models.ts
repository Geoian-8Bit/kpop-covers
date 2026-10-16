/**
 * Pose models, loaded only when used (dynamic imports: none of this is in the app's first download). Nothing about
 * the screen lives here: the follow analysis (F10) and the lab (5.5 · prueba rápida) keep their own state.
 *
 *  - MoveNet MultiPose Lightning (TensorFlow.js, Apache 2.0): up to 6 people with a tracker that keeps who is who.
 *    Weights from tfhub.dev (served through kaggle.com → storage.googleapis.com).
 *  - MediaPipe Pose Landmarker lite (Apache 2.0): 33 points of one person. WASM from cdn.jsdelivr.net, model from
 *    storage.googleapis.com.
 *
 * The video never leaves the device: frames go from the <video> element straight into the model.
 */
import type { Pose, PoseDetector } from '@tensorflow-models/pose-detection';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';

/** Keep in step with package.json and the CSP path in vercel.json (the WASM comes from the CDN for this exact version). */
export const MEDIAPIPE_VERSION = '0.10.35';
const MEDIAPIPE_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MEDIAPIPE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export const MOVENET_MULTIPOSE = 'movenet-multipose-lightning';
export const MEDIAPIPE_LITE = 'mediapipe-pose-landmarker-lite';

export type TfBackend = 'webgl' | 'webgpu';

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

/** Switches TensorFlow.js to `backend` (WebGPU falls back to WebGL where it isn't available). */
async function useBackend(tf: Tf, backend: TfBackend): Promise<string> {
  if (tf.getBackend() !== backend) {
    const ok = await tf.setBackend(backend).catch(() => false);
    if (!ok && backend === 'webgpu') {
      await tf.setBackend('webgl');
    } else if (!ok) {
      throw new Error(`backend ${backend} unavailable`);
    }
  }
  await tf.ready();
  return tf.getBackend();
}

export interface LoadedMoveNet {
  detector: PoseDetector;
  /** The TensorFlow.js backend it runs on: «webgl», «webgpu»… */
  backend: string;
  /** Download and set-up time of this load (0 when it was already loaded). */
  loadMs: number;
  model: string;
}

const moveNets = new Map<string, Promise<{ detector: PoseDetector; backend: string; loadMs: number }>>();

/** MoveNet MultiPose Lightning with its bounding-box tracker; one per backend, loaded once per session. */
export async function loadMoveNet(backend: TfBackend = 'webgl'): Promise<LoadedMoveNet> {
  const t0 = performance.now();
  let tf: Tf;
  try {
    tf = await loadTf();
  } catch (err) {
    throw friendlyLoadError('el modelo de seguimiento', err);
  }
  let pending = moveNets.get(backend);
  const fresh = !pending;
  if (!pending) {
    pending = (async () => {
      const used = await useBackend(tf, backend);
      const pd = await import('@tensorflow-models/pose-detection');
      const detector = await pd.createDetector(pd.SupportedModels.MoveNet, {
        modelType: pd.movenet.modelType.MULTIPOSE_LIGHTNING,
        enableTracking: true,
        trackerType: pd.TrackerType.BoundingBox,
      });
      return { detector, backend: used, loadMs: performance.now() - t0 };
    })();
    moveNets.set(backend, pending);
  }
  try {
    const loaded = await pending;
    // Another screen may have switched TensorFlow.js meanwhile: back to this detector's backend.
    await useBackend(tf, loaded.backend as TfBackend);
    return { ...loaded, loadMs: fresh ? loaded.loadMs : 0, model: MOVENET_MULTIPOSE };
  } catch (err) {
    moveNets.delete(backend);
    throw friendlyLoadError('el modelo de seguimiento (MoveNet)', err);
  }
}

/**
 * Forgets who was who (a new analysis, or going back in time). MoveNet's own `reset()` fails with MultiPose in
 * pose-detection 2.1.3 (it resets the single-pose filters, which don't exist), so the tracker is cleared directly.
 */
export function resetTracker(detector: PoseDetector): void {
  const inner = detector as unknown as {
    tracker?: { reset?: () => void };
    keypointFilterMap?: { clear?: () => void };
  };
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
