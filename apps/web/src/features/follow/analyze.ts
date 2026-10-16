/**
 * F10 · The analysis: where the chosen dancer is in each moment of the file, with MoveNet MultiPose. Runs on this
 * device over a muted copy of the <video> (played faster than real time, or frame by frame where that can't be
 * done); only the resulting keyframes (text) are saved for the group. No UI state here: progress goes to a callback.
 */
import type { MoveNetPose } from '@/features/pose/models';
import {
  closeAnalysisVideo,
  loadMoveNet,
  openAnalysisVideo,
  resetTracker,
  seekVideo,
} from '@/features/pose/models';
import {
  followAround,
  pickCandidate,
  sampleTimes,
  smoothKeyframes,
  type Box,
  type Candidate,
  type FollowKeyframe,
  type FollowPick,
  type Sample,
} from './followPath';

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
  signal: AbortSignal;
  onProgress: (progress: { phase: 'model' | 'video' | 'frames'; done: number; total: number }) => void;
  /** Frames per second to look at (5–10); by default from the length: short songs closer. */
  fps?: number;
}

export interface AnalyzeResult {
  keyframes: FollowKeyframe[];
  model: string;
  backend: string;
  frames: number;
  /** How many of them really saw the dancer (the gaps are glided over). */
  seen: number;
  ms: number;
  loadMs: number;
}

/** 5–10 frames a second: about 1000 frames for a whole song (enough to glide between). */
export function analysisFps(seconds: number): number {
  if (!(seconds > 0)) return 8;
  return Math.max(5, Math.min(10, Math.round(1000 / seconds)));
}

const throwIfAborted = (signal: AbortSignal) => {
  if (signal.aborted) throw new DOMException('Cancelado', 'AbortError');
};

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
export function candidatesOf(
  poses: readonly MoveNetPose[],
  size: { width: number; height: number },
): Candidate[] {
  const out: Candidate[] = [];
  for (const p of poses) {
    if ((p.score ?? 1) < 0.2) continue;
    let box: Box | null = null;
    if (p.box && p.box.width > 0 && p.box.height > 0) {
      const normalised = p.box.xMax <= 1.5 && p.box.yMax <= 1.5;
      const sx = normalised ? 1 : 1 / (size.width || 1);
      const sy = normalised ? 1 : 1 / (size.height || 1);
      box = { x: p.box.xMin * sx, y: p.box.yMin * sy, w: p.box.width * sx, h: p.box.height * sy };
    } else {
      const pts = p.keypoints.filter((k) => (k.score ?? 0) > 0.3);
      if (pts.length >= 4 && size.width > 0 && size.height > 0) {
        const xs = pts.map((k) => k.x / size.width);
        const ys = pts.map((k) => k.y / size.height);
        const x0 = Math.min(...xs);
        const y0 = Math.min(...ys);
        box = { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
      }
    }
    if (!box) continue;
    const x = Math.max(0, box.x);
    const y = Math.max(0, box.y);
    const w = Math.min(1, box.x + box.w) - x;
    const h = Math.min(1, box.y + box.h) - y;
    if (w > 0.005 && h > 0.005) out.push({ box: { x, y, w, h }, id: p.id ?? null, score: p.score });
  }
  return out;
}

/** The people in the frame on screen right now (to tap one), without touching playback. */
export async function peopleInFrame(
  video: HTMLVideoElement,
): Promise<{ candidates: Candidate[]; backend: string }> {
  const model = await loadMoveNet('webgl');
  resetTracker(model.detector);
  const poses = await model.detector.estimatePoses(
    video,
    { maxPoses: 6, flipHorizontal: false },
    performance.now(),
  );
  resetTracker(model.detector);
  return {
    candidates: candidatesOf(poses, { width: video.videoWidth, height: video.videoHeight }),
    backend: model.backend,
  };
}

interface Pass {
  video: HTMLVideoElement;
  /** Song seconds to cover. */
  from: number;
  to: number;
  fps: number;
  offset: number;
  signal: AbortSignal;
  detect: () => Promise<Candidate[]>;
  onProgress: (fraction: number) => void;
}

/**
 * One pass playing the muted copy faster than real time and looking at a frame every 1/fps s (decoding in order
 * is far cheaper than seeking each frame). The speed adapts to how long the model takes on this device (1×–4×).
 * Null when the browser can't do it (no frame callbacks, playback refused or stalled): then frame by frame.
 */
async function passPlaying(p: Pass): Promise<Sample[] | null> {
  const { video } = p;
  if (typeof video.requestVideoFrameCallback !== 'function') return null;
  await seekVideo(video, p.from + p.offset);
  throwIfAborted(p.signal);
  const samples: Sample[] = [];
  const span = Math.max(0.001, p.to - p.from);
  let next = p.from;
  let inference = 0.04;
  video.playbackRate = 2;
  return new Promise<Sample[] | null>((resolve, reject) => {
    let done = false;
    let lastFrame = performance.now();
    const finish = (value: Sample[] | null, err?: unknown) => {
      if (done) return;
      done = true;
      clearInterval(watchdog);
      video.pause();
      video.playbackRate = 1;
      p.signal.removeEventListener('abort', abort);
      if (err) reject(err);
      else resolve(value);
    };
    const abort = () => finish(null, new DOMException('Cancelado', 'AbortError'));
    p.signal.addEventListener('abort', abort);
    // Some browsers pause a video that isn't on screen: with no frames for a while, go frame by frame instead.
    const watchdog = setInterval(() => {
      if (performance.now() - lastFrame > 4000) finish(null);
    }, 1000);
    const onFrame = async (_now: number, meta: VideoFrameCallbackMetadata) => {
      if (done) return;
      lastFrame = performance.now();
      const t = meta.mediaTime - p.offset;
      if (t >= next - 0.01) {
        const t0 = performance.now();
        let candidates: Candidate[];
        try {
          candidates = await p.detect();
        } catch (err) {
          finish(null, err);
          return;
        }
        if (done) return;
        inference = inference * 0.7 + ((performance.now() - t0) / 1000) * 0.3;
        samples.push({ t: Math.round(t * 1000) / 1000, candidates });
        next = t + 1 / p.fps;
        // A frame every 1/fps s of video must leave the model some room on this device.
        video.playbackRate = Math.max(1, Math.min(4, 1 / p.fps / (inference * 1.3)));
        p.onProgress(Math.min(1, (t - p.from) / span));
        lastFrame = performance.now();
      }
      if (t >= p.to - 0.05 || video.ended) {
        finish(samples);
        return;
      }
      video.requestVideoFrameCallback(onFrame);
    };
    video.addEventListener('ended', () => finish(samples), { once: true });
    video.requestVideoFrameCallback(onFrame);
    video.play().catch(() => finish(null));
  });
}

/** The same pass seeking each frame: slower, but works everywhere. */
async function passSeeking(p: Pass): Promise<Sample[]> {
  const times = [p.from, ...sampleTimes(p.from, p.to, p.fps)];
  const samples: Sample[] = [];
  for (let i = 0; i < times.length; i++) {
    throwIfAborted(p.signal);
    const t = times[i]!;
    await seekVideo(p.video, t + p.offset);
    throwIfAborted(p.signal);
    samples.push({ t, candidates: await p.detect() });
    p.onProgress((i + 1) / times.length);
  }
  return samples;
}

/** Follows the chosen dancer through the file. Throws AbortError when cancelled, FollowError when nobody is there. */
export async function analyzeFollow(req: AnalyzeRequest): Promise<AnalyzeResult> {
  const t0 = performance.now();
  req.onProgress({ phase: 'model', done: 0, total: 1 });
  const model = await untilAborted(loadMoveNet('webgl'), req.signal);
  req.onProgress({ phase: 'video', done: 0, total: 1 });
  let video: HTMLVideoElement;
  try {
    video = await openAnalysisVideo(req.src, req.signal);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new FollowError('video', 'No se pudo abrir el archivo para analizarlo.');
  }
  const { detector } = model;
  const size = { width: video.videoWidth, height: video.videoHeight };
  const songLength = Math.max(0, (Number.isFinite(video.duration) ? video.duration : 0) - req.offset);
  const fps = req.fps ?? analysisFps(songLength);
  let stamp = 0;
  // Our own clock for the tracker (it only needs to grow).
  const detect = async (): Promise<Candidate[]> => {
    stamp += 1000 / fps;
    const poses = await detector.estimatePoses(video, { maxPoses: 6, flipHorizontal: false }, stamp);
    return candidatesOf(poses, size);
  };
  try {
    const at = Math.max(0, Math.min(req.at, songLength));
    // 1 · Who was chosen, on that exact frame.
    resetTracker(detector);
    await seekVideo(video, at + req.offset);
    throwIfAborted(req.signal);
    const first = await detect();
    const index = pickCandidate(first, req.pick);
    if (index == null && !('box' in req.pick)) {
      throw new FollowError(
        'nobody',
        'No se ve a nadie ahí. Toca encima del bailarín o dibuja un recuadro a su alrededor.',
      );
    }
    const start = index != null ? first[index]!.box : (req.pick as { box: Box }).box;

    // 2 · One pass over the video (the whole song, or from the correction on), then the path both ways from `at`.
    resetTracker(detector);
    const pass: Pass = {
      video,
      from: req.direction === 'both' ? 0 : at,
      to: songLength,
      fps,
      offset: req.offset,
      signal: req.signal,
      detect,
      onProgress: (f) => req.onProgress({ phase: 'frames', done: Math.round(f * 1000), total: 1000 }),
    };
    req.onProgress({ phase: 'frames', done: 0, total: 1000 });
    let samples = await passPlaying(pass);
    if (!samples) {
      resetTracker(detector);
      samples = await passSeeking(pass);
    }
    const path = followAround(samples, at, start, req.direction === 'both');
    return {
      keyframes: smoothKeyframes(path.keyframes, 2),
      model: model.model,
      backend: model.backend,
      frames: path.frames,
      seen: path.seen,
      ms: performance.now() - t0,
      loadMs: model.loadMs,
    };
  } finally {
    resetTracker(detector);
    closeAnalysisVideo(video);
  }
}
