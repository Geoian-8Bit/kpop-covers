/**
 * F10 · 15 · The analysis: where the chosen dancer is in each moment of the file. Runs on this device over a
 * muted copy of the <video> (played faster than real time, or frame by frame where that can't be done); only the
 * resulting keyframes (text) are saved for the group. No UI state here: progress goes to callbacks.
 *
 * What makes it fast (15), each measured against the logic in the tests and estimated in the report:
 *  - What is about to be watched comes first (followPlan): the path is usable after a few seconds, the rest of
 *    the song goes on in the background, leaving the studio room (a capped share of the time).
 *  - 4 frames a second (3 on a slow device): the path glides between them.
 *  - The frame is shrunk to 256 px before MultiPose (its own input size) instead of handing it the full 1080p.
 *  - Once the dancer is known, only a 192 px crop around them goes through SinglePose (followTrack); MultiPose
 *    only finds them again, checks every 1.5 s and takes over in crossings.
 *  - The muted copy plays at up to 8×: the speed adapts to what this device's model can keep up with.
 *  - WebGPU where it can be trusted, WASM on a computer without a graphics chip, WebGL otherwise; the models load
 *    while the video opens and run once on a blank frame before timing starts.
 *
 * And what keeps it out of the way: it waits while the recorder is recording a take or the voice is being
 * separated (`host`), and a backend that breaks half way is replaced cleanly (warmed up, the stretch started again
 * from the last frame done, never two frames at once).
 */
import {
  closeAnalysisVideo,
  dropBackend,
  isWasmBroken,
  loadMoveNet,
  loadSinglePose,
  markBackendBroken,
  markWasmProbed,
  MOVENET_MULTIPOSE,
  onMobile,
  openAnalysisVideo,
  readBench,
  recordBench,
  resetTracker,
  seekVideo,
  wasWasmProbed,
  type BackendChoice,
  type LoadedMoveNet,
  type MoveNetPose,
  type TfBackend,
} from '@/features/pose/models';
import { probeOutcome, shouldProbeWasm } from '@/features/pose/backendRules';
import {
  keyframe,
  normalizeKeyframes,
  pickCandidate,
  sampleTimes,
  smoothKeyframes,
  createFollower,
  type Box,
  type Candidate,
  type FollowKeyframe,
  type FollowPick,
  type Sample,
} from './followPath';
import {
  adaptFps,
  analysisDuty,
  ANALYSIS_FPS,
  backwardChunks,
  idleAfterMs,
  planAnalysis,
  planProgress,
  playbackRate,
  type Span,
} from './followPlan';
import {
  createOnlineTracker,
  cropDraw,
  cropMasks,
  keypointBox,
  pointsBox,
  type Crop,
  type Detectors,
  type MaskBox,
  type Size,
} from './followTrack';

export type FollowErrorCode = 'nobody' | 'video';

export class FollowError extends Error {
  constructor(
    readonly code: FollowErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'FollowError';
  }
}

/** Saved with the path: both MoveNet models took part (≤ 60 characters, the database's limit). */
export const MOVENET_FOLLOW = 'movenet-lightning-singlepose+multipose';

export interface AnalyzeProgress {
  phase: 'model' | 'video' | 'frames';
  done: number;
  total: number;
}

/** 15 · Why the analysis is waiting: a take being recorded, or the AI voice separation running. */
export type HoldReason = 'recording' | 'voice';

/** 15 · The studio around the analysis (features/follow/analysisHold.ts). */
export interface AnalysisHost {
  /** Non-null: wait (the muted copy paused, no frames asked for). */
  held(): HoldReason | null;
  /**
   * Resolves when nothing holds the analysis any more (or the signal aborts); `onReason` when it goes on waiting
   * for something else.
   */
  untilFree(signal: AbortSignal, onReason?: (reason: HoldReason) => void): Promise<void>;
  /** The studio is playing: the background part takes less of the time. */
  playing(): boolean;
}

export interface AnalyzeRequest {
  /** The file playing on screen (its URL: a blob on this device or the group's cloud copy). */
  src: string;
  /** Seconds the file is ahead of the song (F1): the path is kept on the song's own timeline. */
  offset: number;
  /** The song second where the dancer was chosen. */
  at: number;
  pick: FollowPick;
  /** 'both': the whole song (back to 0 and on to the end); 'forward': a correction, from `at` to the end. */
  direction: 'both' | 'forward';
  /** 15 · The A–B range or clip in use: analysed first when the chosen moment is in it. */
  focus?: Span | null;
  signal: AbortSignal;
  onProgress: (progress: AnalyzeProgress) => void;
  /**
   * 15 · Called once, when the stretch about to be watched is done (the rest of the song goes on): the path so far
   * and the span it covers. Awaited, so the path can be saved and followed; it must not throw (the analysis goes
   * on whatever happens to the save).
   */
  onReady?: (part: { keyframes: FollowKeyframe[]; span: Span; model: string }) => Promise<void> | void;
  /** 15 · When to wait and how much room to leave (none: never waits, the background at the paused share). */
  host?: AnalysisHost;
  /** 15 · The analysis started waiting (the reason) or goes on again (null). */
  onHold?: (reason: HoldReason | null) => void;
}

export interface AnalyzeResult {
  keyframes: FollowKeyframe[];
  /** The song seconds the keyframes cover (for a correction stopped half way, the rest keeps the old path). */
  span: Span;
  /** false: stopped (cancelled or failed) after the first stretch was ready; the keyframes are what was done. */
  complete: boolean;
  model: string;
  backend: string;
  frames: number;
  /** How many of them really saw the dancer (the gaps are glided over). */
  seen: number;
  /** Share of the frames that only needed the crop (SinglePose). */
  cropShare: number;
  ms: number;
  loadMs: number;
}

/** MultiPose gets the frame already at its own input size (its longer side). */
const MULTI_SIDE = 256;
/** SinglePose Lightning's input. */
const SINGLE_SIDE = 192;
/** The copy of a frame kept for SinglePose's calibration crop (its longer side, px). */
const SHOT_SIDE = 1280;

const throwIfAborted = (signal: AbortSignal) => {
  if (signal.aborted) throw new DOMException('Cancelado', 'AbortError');
};
const isAbort = (err: unknown) => err instanceof DOMException && err.name === 'AbortError';

/** 15 · The stretch is started again from the last frame done (the backend changed under it). */
class Restart extends Error {
  constructor() {
    super('restart');
    this.name = 'Restart';
  }
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });

/**
 * Waits for `work` unless `signal` aborts first: then rejects at once with AbortError (a model download can't be
 * stopped, but it carries on in the background and stays cached for next time).
 */
export function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException('Cancelado', 'AbortError'));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException('Cancelado', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (err: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(err);
      },
    );
  });
}

/** People in a MoveNet result as boxes of the picture (MoveNet's boxes are already 0…1). */
export function candidatesOf(poses: readonly MoveNetPose[], size: Size): Candidate[] {
  const out: Candidate[] = [];
  for (const p of poses) {
    if ((p.score ?? 1) < 0.2) continue;
    const kp = pointsBox(p.keypoints, size);
    let box: Box | null = null;
    if (p.box && p.box.width > 0 && p.box.height > 0) {
      const normalised = p.box.xMax <= 1.5 && p.box.yMax <= 1.5;
      const sx = normalised ? 1 : 1 / (size.width || 1);
      const sy = normalised ? 1 : 1 / (size.height || 1);
      box = { x: p.box.xMin * sx, y: p.box.yMin * sy, w: p.box.width * sx, h: p.box.height * sy };
    } else {
      box = kp;
    }
    if (!box) continue;
    const x = Math.max(0, box.x);
    const y = Math.max(0, box.y);
    const w = Math.min(1, box.x + box.w) - x;
    const h = Math.min(1, box.y + box.h) - y;
    if (w > 0.005 && h > 0.005) out.push({ box: { x, y, w, h }, id: p.id ?? null, score: p.score, kp });
  }
  return out;
}

/** The frame at MultiPose's own input size (longer side 256 px). */
export function multiSize(frame: Size): Size {
  return fitSize(frame, MULTI_SIDE, 32);
}

/** `frame` scaled so its longer side is `side` (never under `min` px a side). */
function fitSize(frame: Size, side: number, min: number): Size {
  const k = side / Math.max(1, frame.width, frame.height);
  return {
    width: Math.max(min, Math.round(frame.width * k)),
    height: Math.max(min, Math.round(frame.height * k)),
  };
}

/**
 * 15 · The tracker's clock: the song's own time within a stretch (a check 1.5 s after the last one is 1.5 s later
 * for it, not 250 ms), always growing across stretches (each starts a new session, a second after the last stamp).
 */
export function createStampClock() {
  let last = 0;
  let base = 0;
  return {
    session(startT: number) {
      base = last + 1000 - startT * 1000;
    },
    stamp(t: number): number {
      last = Math.max(last + 1, base + t * 1000);
      return last;
    },
  };
}

function canvas(size: Size) {
  const c = document.createElement('canvas');
  c.width = size.width;
  c.height = size.height;
  const g = c.getContext('2d', { alpha: false });
  if (!g) throw new FollowError('video', 'Este navegador no puede leer los fotogramas del vídeo.');
  return { c, g };
}

/** The people in the frame on screen right now (to tap one), without touching playback. */
export async function peopleInFrame(
  video: HTMLVideoElement,
): Promise<{ candidates: Candidate[]; backend: string }> {
  let model = await loadMoveNet('auto');
  const size = multiSize({ width: video.videoWidth, height: video.videoHeight });
  const { c, g } = canvas(size);
  g.drawImage(video, 0, 0, size.width, size.height);
  const look = async (m: LoadedMoveNet) => {
    resetTracker(m.detector);
    try {
      return await m.detector.estimatePoses(c, { maxPoses: 6, flipHorizontal: false }, performance.now());
    } finally {
      resetTracker(m.detector);
    }
  };
  let poses: MoveNetPose[];
  try {
    poses = await look(model);
  } catch (err) {
    // 15 · A run that breaks on WebGPU or WASM: WebGL from now on (here and for the analysis), on the same copy.
    if (model.backend === 'webgl') throw err;
    const broken = model.backend as TfBackend;
    markBackendBroken(broken);
    model = await loadMoveNet('webgl');
    void dropBackend(broken);
    poses = await look(model);
  }
  // Ready by the time the name is typed: the analysis follows with it.
  void loadSinglePose(model.backend as TfBackend).catch(() => undefined);
  return { candidates: candidatesOf(poses, size), backend: model.backend };
}

interface Models {
  multi: LoadedMoveNet;
  /** Null when it could not be loaded: then MultiPose alone (slower, same result). */
  single: LoadedMoveNet | null;
  backend: string;
}

async function loadModels(choice: BackendChoice): Promise<Models> {
  const multi = await loadMoveNet(choice);
  let single: LoadedMoveNet | null = null;
  try {
    single = await loadSinglePose(multi.backend as TfBackend);
  } catch {
    single = null;
  }
  // SinglePose may have switched TensorFlow.js (it fell back): both on the same one, MultiPose's.
  if (single && single.backend !== multi.backend) single = null;
  return { multi, single, backend: multi.backend };
}

/** How the analysis paces itself (shared by every stretch). */
interface Pacer {
  /** Seconds a frame costs here, smoothed. */
  cost: number;
  /** True: stop asking for frames now (the caller pauses and waits in `free`). */
  held(): boolean;
  /** Waits, with the copy paused, while something holds the analysis. */
  free(video: HTMLVideoElement): Promise<void>;
  /** Share of the time the model may work in this stretch. */
  duty(priority: boolean): number;
}

interface Range {
  video: HTMLVideoElement;
  from: number;
  to: number;
  offset: number;
  signal: AbortSignal;
  fps: () => number;
  /** What is about to be watched (no cap below real time, the larger share of the time). */
  priority: boolean;
  /**
   * Looks at the frame on the video now (song second `t`). Called right as the frame arrives: whatever copies
   * it needs are taken before its first await.
   */
  onFrame: (t: number) => Promise<void>;
  /** The frame at `from` was already seen (the stretch carries on from it). */
  skipFrom: boolean;
  onFraction: (f: number) => void;
}

type PlayEnd = 'done' | 'held' | 'stalled';

/**
 * One go at a stretch playing the muted copy faster than real time and looking at a frame every 1/fps s (decoding
 * in order is far cheaper than seeking each frame), from the last frame done. The speed keeps the model to its
 * share of the time here. Ends early with 'held' (something needs the device: the copy is paused) or 'stalled'
 * (the browser can't play it: no frame callbacks, playback refused or stopped; the caller goes frame by frame).
 */
async function playRange(r: Range, last: { t: number }, pace: Pacer): Promise<PlayEnd> {
  const { video } = r;
  if (typeof video.requestVideoFrameCallback !== 'function') return 'stalled';
  const resumed = Number.isFinite(last.t);
  await seekVideo(video, (resumed ? last.t : r.from) + r.offset);
  throwIfAborted(r.signal);
  const span = Math.max(0.001, r.to - r.from);
  let next = resumed ? last.t + 1 / r.fps() : r.from;
  const setRate = () => {
    try {
      video.playbackRate = playbackRate(r.fps(), pace.cost, pace.duty(r.priority), r.priority);
    } catch {
      /* out of this browser's range */
    }
  };
  setRate();
  return new Promise<PlayEnd>((resolve, reject) => {
    let done = false;
    /** A frame is being looked at: nothing ends the stretch under it (it ends right after). */
    let busy = false;
    let deferred: (() => void) | null = null;
    let lastFrame = performance.now();
    const finish = (end: PlayEnd, err?: unknown) => {
      if (done) return;
      if (busy) {
        deferred ??= () => finish(end, err);
        return;
      }
      done = true;
      clearInterval(watchdog);
      video.pause();
      try {
        video.playbackRate = 1;
      } catch {
        /* out of range */
      }
      r.signal.removeEventListener('abort', abort);
      video.removeEventListener('ended', ended);
      if (err) reject(err);
      else resolve(end);
    };
    const abort = () => finish('stalled', new DOMException('Cancelado', 'AbortError'));
    const ended = () => finish('done');
    r.signal.addEventListener('abort', abort);
    // Some browsers pause a video that isn't on screen: with no frames for a while, go frame by frame instead.
    // Never while a frame is being looked at (a backend warming up can take seconds): no two frames at once.
    const watchdog = setInterval(() => {
      if (!busy && performance.now() - lastFrame > 4000) finish('stalled');
    }, 1000);
    const onFrame = async (_now: number, meta: VideoFrameCallbackMetadata) => {
      if (done) return;
      lastFrame = performance.now();
      if (pace.held()) {
        finish('held');
        return;
      }
      const t = meta.mediaTime - r.offset;
      if (t >= next - 0.01 && t > last.t + 0.4 / r.fps()) {
        const t0 = performance.now();
        busy = true;
        try {
          await r.onFrame(t);
        } catch (err) {
          busy = false;
          deferred = null;
          finish('stalled', err);
          return;
        }
        busy = false;
        last.t = t;
        pace.cost = pace.cost * 0.7 + ((performance.now() - t0) / 1000) * 0.3;
        next = t + 1 / r.fps();
        r.onFraction(Math.min(1, (t - r.from) / span));
        lastFrame = performance.now();
        if (deferred) {
          const run = deferred;
          deferred = null;
          run();
          return;
        }
        if (done) return;
        setRate();
      }
      if (t >= r.to - 0.05) {
        finish('done');
        return;
      }
      video.requestVideoFrameCallback(onFrame);
    };
    video.addEventListener('ended', ended);
    video.requestVideoFrameCallback(onFrame);
    video.play().catch(() => finish('stalled'));
  });
}

/** One go at a stretch frame by frame (seeking each), from the last frame done; 'held' when something needs the device. */
async function seekRange(r: Range, last: { t: number }, pace: Pacer): Promise<'done' | 'held'> {
  const resumed = Number.isFinite(last.t);
  const start = resumed ? Math.max(r.from, last.t) : r.from;
  const times = [...(resumed ? [] : [r.from]), ...sampleTimes(start, r.to, r.fps())];
  for (const t of times) {
    throwIfAborted(r.signal);
    if (t <= last.t + 0.4 / r.fps()) continue;
    if (pace.held()) return 'held';
    await seekVideo(r.video, t + r.offset);
    throwIfAborted(r.signal);
    const t0 = performance.now();
    await r.onFrame(t);
    last.t = t;
    pace.cost = pace.cost * 0.7 + ((performance.now() - t0) / 1000) * 0.3;
    r.onFraction(Math.min(1, (t - r.from) / Math.max(0.001, r.to - r.from)));
    if (!r.priority) {
      const idle = idleAfterMs(pace.cost, pace.duty(false));
      if (idle > 0) await sleep(idle, r.signal);
    }
  }
  return 'done';
}

/**
 * A stretch: playing where it can, frame by frame from wherever playing stopped; waiting while something holds the
 * analysis, and starting again from the last frame done after a wait or a change of backend.
 */
async function runRange(r: Range, pace: Pacer): Promise<void> {
  const last = { t: r.skipFrom ? r.from : -Infinity };
  let seeking = false;
  for (;;) {
    throwIfAborted(r.signal);
    await pace.free(r.video);
    try {
      if (!seeking) {
        const end = await playRange(r, last, pace);
        if (end === 'done') {
          r.onFraction(1);
          return;
        }
        if (end === 'stalled') seeking = true;
        continue;
      }
      if ((await seekRange(r, last, pace)) === 'done') return;
    } catch (err) {
      if (err instanceof Restart) continue;
      throw err;
    }
  }
}

/**
 * Follows the chosen dancer through the file. Throws AbortError when cancelled before the first stretch was ready
 * and FollowError when nobody is there; after that, a stop returns what was done (`complete: false`).
 */
export async function analyzeFollow(req: AnalyzeRequest): Promise<AnalyzeResult> {
  const t0 = performance.now();
  const { signal, host } = req;
  req.onProgress({ phase: 'model', done: 0, total: 1 });
  let videoOpen = false;
  const loading = loadModels('auto').then((m) => {
    if (!videoOpen && !signal.aborted) req.onProgress({ phase: 'video', done: 0, total: 1 });
    return m;
  });
  const opening = openAnalysisVideo(req.src, signal).then(
    (v) => {
      videoOpen = true;
      return v;
    },
    (err: unknown) => {
      if (isAbort(err)) throw err;
      throw new FollowError('video', 'No se pudo abrir el archivo para analizarlo.');
    },
  );
  // The models load while the video opens (each waits for nothing but itself).
  let models: Models;
  let video: HTMLVideoElement;
  try {
    [models, video] = await Promise.all([untilAborted(loading, signal), opening]);
  } catch (err) {
    void opening.then(closeAnalysisVideo, () => undefined);
    throw err;
  }
  const loadMs = models.multi.loadMs + (models.single?.loadMs ?? 0);

  const frame: Size = { width: video.videoWidth, height: video.videoHeight };
  const mSize = multiSize(frame);
  const multiCanvas = canvas(mSize);
  const singleCanvas = canvas({ width: SINGLE_SIDE, height: SINGLE_SIDE });
  const shotSize = fitSize(frame, Math.min(SHOT_SIDE, Math.max(frame.width, frame.height)), 32);
  let shotCanvas: ReturnType<typeof canvas> | null = null;
  /** The copy in shotCanvas is of the frame MultiPose is looking at. */
  let shotValid = false;
  const songLength = Math.max(0, (Number.isFinite(video.duration) ? video.duration : 0) - req.offset);
  let fps = ANALYSIS_FPS;
  // The tracker's ids restart with each stretch: numbered apart so that one stretch's «3» is not another's.
  let session = 0;
  const clock = createStampClock();
  /** The song second of the frame copied last (the tracker's clock). */
  let frameT = req.at;

  const pace: Pacer = {
    cost: 0.04,
    held: () => host?.held() != null,
    async free(v) {
      const reason = host?.held();
      if (!host || !reason) return;
      v.pause();
      req.onHold?.(reason);
      try {
        await host.untilFree(signal, (r) => req.onHold?.(r));
      } finally {
        if (!signal.aborted) req.onHold?.(null);
      }
      throwIfAborted(signal);
    },
    duty: (priority) => analysisDuty(priority, host?.playing() ?? false, models.backend === 'wasm'),
  };

  /**
   * 15 · The copies of the frame on the video now, taken as it arrives (before anything awaits): the whole picture
   * at MultiPose's size, so that a crop that loses the dancer hands MultiPose this same frame and not a later one;
   * and, when MultiPose looks first, a larger copy for SinglePose's calibration crop on the same picture.
   */
  const capture = (t: number, forCalibration: boolean) => {
    frameT = t;
    multiCanvas.g.drawImage(video, 0, 0, mSize.width, mSize.height);
    shotValid = false;
    if (forCalibration && models.single) {
      shotCanvas ??= canvas(shotSize);
      shotCanvas.g.drawImage(video, 0, 0, shotSize.width, shotSize.height);
      shotValid = true;
    }
  };

  const multiDetect = async (): Promise<Candidate[]> => {
    const poses = await models.multi.detector.estimatePoses(
      multiCanvas.c,
      { maxPoses: 6, flipHorizontal: false },
      clock.stamp(frameT),
    );
    return candidatesOf(poses, mSize).map((c) => ({ ...c, id: c.id != null ? session * 1000 + c.id : null }));
  };
  const singleDetect = async (
    crop: Crop,
    masks: readonly MaskBox[] | undefined,
    dancer: Box | undefined,
    source: 'video' | 'shot',
  ): Promise<Box | null> => {
    const single = models.single;
    if (!single) return null;
    if (source === 'shot' && (!shotValid || !shotCanvas)) return null;
    const d = cropDraw(crop, frame, SINGLE_SIDE);
    if (!d) return null;
    const g = singleCanvas.g;
    g.fillStyle = 'black';
    g.fillRect(0, 0, SINGLE_SIDE, SINGLE_SIDE);
    if (source === 'video') {
      g.drawImage(video, d.sx, d.sy, d.sw, d.sh, d.dx, d.dy, d.dw, d.dh);
    } else {
      const k = shotSize.width / (frame.width || 1);
      g.drawImage(shotCanvas!.c, d.sx * k, d.sy * k, d.sw * k, d.sh * k, d.dx, d.dy, d.dw, d.dh);
    }
    // 15 · The others in the crop painted out: SinglePose can't take the neighbour or mix their arms with ours.
    if (masks?.length && dancer) {
      for (const m of cropMasks(crop, masks, dancer, frame, SINGLE_SIDE)) g.fillRect(m.x, m.y, m.w, m.h);
    }
    resetTracker(single.detector);
    const poses = await single.detector.estimatePoses(singleCanvas.c, { flipHorizontal: false });
    const p = poses[0];
    if (!p || (p.score ?? 0) < 0.3) return null;
    return keypointBox(p.keypoints, crop, SINGLE_SIDE, frame);
  };

  const newSession = (startT: number) => {
    session++;
    clock.session(startT);
    resetTracker(models.multi.detector);
  };

  /** First runs of a set of models (shader compilation, WASM set-up), on what the canvases hold now. */
  const warmUp = async (m: Models) => {
    await m.multi.detector.estimatePoses(multiCanvas.c, { maxPoses: 6, flipHorizontal: false }, 0);
    resetTracker(m.multi.detector);
    if (m.single) await m.single.detector.estimatePoses(singleCanvas.c, { flipHorizontal: false });
  };

  /**
   * 15 · A model run broke on WebGPU (or WASM): the copy paused, WebGL loaded and warmed up, the broken backend's
   * detectors freed. Once, however many frames were waiting on it.
   */
  let switching: Promise<void> | null = null;
  const fallBackToWebGl = () =>
    (switching ??= (async () => {
      video.pause();
      const broken = models.backend as TfBackend;
      markBackendBroken(broken);
      const next = await untilAborted(loadModels('webgl'), signal);
      await warmUp(next);
      models = next;
      newSession(frameT);
      void dropBackend(broken);
    })().finally(() => {
      switching = null;
    }));

  /**
   * A model run that breaks on WebGPU or WASM: WebGL from then on. `'video'`: the run reads the video itself, which
   * moved on while WebGL warmed up — the frame is not run again on the spot, the stretch starts again from the last
   * frame done. `'copy'`: it reads a copy of the frame (MultiPose, the calibration crop), so it is run again on that
   * same copy and the frame is not lost (the muted copy, paused for the switch, plays on). `'once'`: outside a
   * stretch, run again.
   */
  const guarded = async <T>(fn: () => Promise<T>, reads: 'video' | 'copy' | 'once' = 'video'): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      if (models.backend === 'webgl' || signal.aborted || err instanceof Restart) throw err;
      const playing = !video.paused;
      await fallBackToWebGl();
      if (reads === 'video') throw new Restart();
      const out = await fn();
      if (reads === 'copy' && playing && !signal.aborted) void video.play().catch(() => undefined);
      return out;
    }
  };

  /**
   * 15 · A computer whose first frames on WebGL are slow (its WebGL is really the processor): WASM is timed on the
   * same frames and kept only if clearly faster. Once a session, and never where both are measured already (the
   * kept measurement decides «auto»: it is the very number the verdict is taken on).
   */
  let probePending = false;
  const probeWasm = async () => {
    probePending = false;
    video.pause();
    const time = async (m: Models) => {
      await warmUp(m);
      let multiMs = 0;
      let all = 0;
      for (let i = 0; i < 3; i++) {
        const a = performance.now();
        await m.multi.detector.estimatePoses(multiCanvas.c, { maxPoses: 6, flipHorizontal: false }, 0);
        const b = performance.now();
        if (m.single) await m.single.detector.estimatePoses(singleCanvas.c, { flipHorizontal: false });
        multiMs += b - a;
        all += performance.now() - a;
      }
      resetTracker(m.multi.detector);
      return { multi: multiMs / 3, all: all / 3 };
    };
    try {
      const wasm = await untilAborted(loadModels('wasm'), signal);
      if (wasm.backend !== 'wasm') return; // not available here: it fell back to WebGL already
      const w = await time(wasm);
      const gl = await untilAborted(loadModels('webgl'), signal);
      const g = await time(gl);
      const outcome = probeOutcome(w.multi, g.multi);
      recordBench('wasm', outcome.bench.wasm);
      recordBench('webgl', outcome.bench.webgl);
      markWasmProbed();
      if (import.meta.env.DEV) console.info('[seguir] WASM frente a WebGL', { wasm: w, webgl: g });
      if (outcome.wasm) {
        models = await untilAborted(loadModels('wasm'), signal);
      } else {
        models = gl;
        void dropBackend('wasm');
      }
    } catch (err) {
      if (isAbort(err) || signal.aborted) throw err;
      markWasmProbed();
      markBackendBroken('wasm');
      models = await untilAborted(loadModels('webgl'), signal);
      void dropBackend('wasm');
    } finally {
      if (!signal.aborted) newSession(frameT);
    }
  };

  let ready = false;
  const span: Span = { start: req.at, end: req.at };
  const forwardKfs: FollowKeyframe[] = [];
  /** Latest first, as they are found. */
  const backwardKfs: FollowKeyframe[] = [];
  let backwardFrames = 0;
  // Replaced by the chosen dancer's box on the first frame, before anything is built from it.
  let start: Box = 'box' in req.pick ? req.pick.box : { x: 0, y: 0, w: 0.1, h: 0.3 };
  let forward: ReturnType<typeof createOnlineTracker> | null = null;
  const at = Math.max(0, Math.min(req.at, songLength));

  const build = () =>
    smoothKeyframes(
      normalizeKeyframes([...[...backwardKfs].reverse(), keyframe(at, start), ...forwardKfs]),
      2,
    );
  const result = (complete: boolean): AnalyzeResult => {
    const stats = forward?.stats ?? { frames: 0, seen: 0, single: 0, multi: 0, cropOnly: 0 };
    const frames = stats.frames + backwardFrames + 1;
    return {
      keyframes: build(),
      span: { ...span },
      complete,
      model: stats.single > 0 ? MOVENET_FOLLOW : MOVENET_MULTIPOSE,
      backend: models.backend,
      frames,
      seen: stats.seen + backwardKfs.length + 1,
      cropShare: frames > 0 ? stats.cropOnly / frames : 0,
      ms: performance.now() - t0,
      loadMs,
    };
  };

  try {
    // 0 · Warm up: the first run of a model on a frame size compiles its shaders (a second or two the first
    // time); done now on blank frames, it doesn't land on the first frames of the song. Not while a take is being
    // recorded (nor the first frame after it).
    await pace.free(video);
    await guarded(() => warmUp(models), 'once');
    throwIfAborted(signal);

    // 1 · Who was chosen, on that exact frame.
    await pace.free(video);
    newSession(at);
    await seekVideo(video, at + req.offset);
    throwIfAborted(signal);
    capture(at, false);
    let first = await guarded(multiDetect, 'once');
    if (!first.length && models.backend !== 'webgl') {
      // Nobody at all on WebGPU (or WASM): make sure it isn't that backend getting it wrong on this device, on
      // the same frame. (TensorFlow.js is now on WebGL: this analysis stays there either way.)
      const was = models.backend;
      models = await untilAborted(loadModels('webgl'), signal);
      newSession(at);
      first = await multiDetect();
      if (first.length) {
        markBackendBroken(was);
        void dropBackend(was as TfBackend);
      }
    }
    const index = pickCandidate(first, req.pick);
    if (index == null && !('box' in req.pick)) {
      throw new FollowError(
        'nobody',
        'No se ve a nadie ahí. Toca encima del bailarín o dibuja un recuadro a su alrededor.',
      );
    }
    start = index != null ? first[index]!.box : (req.pick as { box: Box }).box;
    const startId = index != null ? (first[index]!.id ?? null) : null;

    // 2 · The plan: what is about to be watched first, then the rest of the song.
    const plan = planAnalysis({ at, length: songLength, focus: req.focus, both: req.direction === 'both' });
    forward = createOnlineTracker({ start, startId, startT: at, frame });
    const backward = createFollower(start, startId, at);
    let backT = at;
    let timed = 0;
    let timedMs = 0;
    const detectors: Detectors = {
      multi: () => guarded(multiDetect, 'copy'),
      single: (crop, masks, dancer) => guarded(() => singleDetect(crop, masks, dancer, 'video')),
      calibrate: (crop, masks, dancer) => guarded(() => singleDetect(crop, masks, dancer, 'shot'), 'copy'),
    };
    const report = (i: number, f: number) =>
      req.onProgress({ phase: 'frames', done: Math.round(planProgress(plan, i, f) * 1000), total: 1000 });
    /** Fewer frames a second when this device turns out slow (measured on the first dozen frames). */
    const timeFrame = async (work: () => Promise<void>) => {
      const s = performance.now();
      await work();
      if (timed < 12) {
        timed++;
        timedMs += performance.now() - s;
        if (timed === 12) {
          const avg = timedMs / timed;
          fps = adaptFps(fps, avg);
          probePending = shouldProbeWasm({
            backend: models.backend,
            mobile: onMobile(),
            frameMs: avg,
            wasmBroken: isWasmBroken(),
            probed: wasWasmProbed(),
            bench: readBench(),
          });
        }
      }
    };
    /** Before a frame: the WASM probe when due (then the stretch starts again from the last frame done). */
    const beforeFrame = async () => {
      if (!probePending) return;
      await probeWasm();
      throw new Restart();
    };
    report(0, 0);

    for (let i = 0; i < plan.length; i++) {
      const seg = plan[i]!;
      if (seg.dir === 'forward') {
        newSession(seg.from);
        await runRange(
          {
            video,
            from: seg.from,
            to: seg.to,
            offset: req.offset,
            signal,
            fps: () => fps,
            priority: seg.priority,
            skipFrom: true,
            onFraction: (f) => report(i, f),
            onFrame: (t) => {
              if (probePending) return beforeFrame();
              capture(t, forward!.next() === 'multi');
              return timeFrame(async () => {
                const r = await forward!.step(t, detectors);
                if (r.keyframe) forwardKfs.push(r.keyframe);
                span.end = Math.max(span.end, t);
              });
            },
          },
          pace,
        );
        span.end = Math.max(span.end, seg.to);
      } else {
        const chunks = backwardChunks(seg.from, seg.to);
        for (let c = 0; c < chunks.length; c++) {
          const chunk = chunks[c]!;
          const samples: Sample[] = [];
          newSession(chunk.start);
          await runRange(
            {
              video,
              from: chunk.start,
              to: chunk.end,
              offset: req.offset,
              signal,
              fps: () => fps,
              priority: seg.priority,
              skipFrom: false,
              onFraction: (f) => report(i, (c + f) / chunks.length),
              onFrame: (t) => {
                if (probePending) return beforeFrame();
                capture(t, false);
                return timeFrame(async () => {
                  samples.push({ t, candidates: await guarded(multiDetect, 'copy') });
                });
              },
            },
            pace,
          );
          // Then followed back, latest first, from where the later stretch left the dancer.
          samples.sort((a, b) => b.t - a.t);
          for (const s of samples) {
            if (s.t >= backT - 0.001) continue;
            backT = s.t;
            backwardFrames++;
            const k = backward.step(s.t, s.candidates).keyframe;
            if (k) backwardKfs.push(k);
          }
          span.start = Math.min(span.start, chunk.start);
        }
      }
      if (!ready && plan.slice(i + 1).every((s) => !s.priority)) {
        ready = true;
        const part = result(false);
        try {
          await req.onReady?.({ keyframes: part.keyframes, span: part.span, model: part.model });
        } catch {
          /* the save says so itself; the analysis goes on */
        }
      }
    }
    return result(true);
  } catch (err) {
    // Once the first stretch is ready, a stop (or a failure) keeps what was done.
    if (ready) return result(false);
    if (signal.aborted) throw new DOMException('Cancelado', 'AbortError');
    throw err;
  } finally {
    resetTracker(models.multi.detector);
    closeAnalysisVideo(video);
  }
}
