/**
 * REQ-27 · The pace rules (P19), out of recording.ts: does this phone keep up with the camera mode while it records?
 * With them, the size classes they reason in. Pure, no browser APIs; recording.ts re-exports all of it.
 */

/** Resolution classes by the picture's long side. */
export type ResolutionClass = '720p' | '1080p' | '1440p' | '4k';

export function resolutionClass(width: number, height: number): ResolutionClass {
  const long = Math.max(width, height);
  if (long <= 1280) return '720p';
  if (long <= 1920) return '1080p';
  if (long <= 2560) return '1440p';
  return '4k';
}

/** Resolution choice in the recorder's settings (A1). */
export type ResolutionChoice = 'auto' | '4k' | '1440p' | '1080p' | '720p';

/** Landscape size of each class (used to cap a camera request; recording.ts asks the camera with it too). */
export const LONG_SIDE: Record<Exclude<ResolutionChoice, 'auto'>, [number, number]> = {
  '4k': [3840, 2160],
  '1440p': [2560, 1440],
  '1080p': [1920, 1080],
  '720p': [1280, 720],
};

/** Size classes from smallest to largest. */
export const CLASS_RANK: Record<ResolutionClass, number> = { '720p': 0, '1080p': 1, '1440p': 2, '4k': 3 };

// ───────────── Pace (P19): does this phone keep up with the camera mode while it records? ─────────────

/** What a short measurement saw: the rate asked for, the camera's own rate and the frames that really reached the screen / take. */
export interface PaceSample {
  /** Rate the settings ask for (30 or 60). */
  wantFps: number;
  /** Rate the camera says it gives in this mode. */
  cameraFps: number;
  /** Frames per second that really got through while recording (presented on screen, or drawn into the take). */
  measuredFps: number;
  /** How long it was measured. */
  seconds: number;
  /** Size class of the picture. */
  resolution: ResolutionClass;
  /** Median camera → screen delay while it was measured (ms), when the browser tells it. */
  lagMs?: number | null;
  /** The same delay with nothing recording (the camera's own), to compare with. */
  restLagMs?: number | null;
}

/**
 * 'ok' · 'fps30' (60 doesn't flow on this phone: record at 30) · 'smaller' (already at 30 but above 1080p: go down
 * to 1080p) · 'warn' (nothing lighter to offer: say so). 'unknown' when the sample is too short to judge.
 * Below 85 % of the camera's rate the picture visibly stutters and lags.
 */
export type PaceVerdict = 'ok' | 'fps30' | 'smaller' | 'warn' | 'unknown';

/** Shortest measurement that says anything (the first frames of a recorder are always uneven). */
export const PACE_MIN_SECONDS = 1.5;
/** Share of the camera's rate that still looks fluid. */
export const PACE_OK_RATIO = 0.85;

/**
 * Preview delay (P19 review): a preview can show every frame and still trail the dancer by half a second. The
 * camera's own delay at rest is not the phone being slow (a lighter mode wouldn't change it), so what counts is how
 * much it grows while encoding; with nothing to compare with, only a delay nobody could miss.
 */
export const PACE_LAG_GROWTH_MS = 80;
export const PACE_LAG_MAX_MS = 150;
export const PACE_LAG_ALONE_MS = 250;

export function lagging(lagMs: number | null | undefined, restLagMs: number | null | undefined): boolean {
  if (lagMs == null || !Number.isFinite(lagMs)) return false;
  if (restLagMs == null || !Number.isFinite(restLagMs)) return lagMs > PACE_LAG_ALONE_MS;
  const growth = lagMs - restLagMs;
  return growth > PACE_LAG_GROWTH_MS || (lagMs > PACE_LAG_MAX_MS && growth > PACE_LAG_GROWTH_MS / 2);
}

export function paceVerdict(sample: PaceSample): PaceVerdict {
  const target = Math.min(sample.cameraFps || sample.wantFps, sample.wantFps);
  if (!(sample.seconds >= PACE_MIN_SECONDS) || !(target > 0) || !(sample.measuredFps >= 0)) return 'unknown';
  if (sample.measuredFps >= target * PACE_OK_RATIO && !lagging(sample.lagMs, sample.restLagMs)) return 'ok';
  return stepDown(target, sample.resolution);
}

/** The lighter mode for a mode of `fps` that didn't flow: 30 fps, else 1080p, else nothing lighter. */
function stepDown(fps: number, resolution: ResolutionClass): 'fps30' | 'smaller' | 'warn' {
  if (fps >= 45) return 'fps30';
  if (CLASS_RANK[resolution] > CLASS_RANK['1080p']) return 'smaller';
  return 'warn';
}

/** Lighter modes this phone needs, learnt from its own measurements: 30 fps per size class, and a size ceiling. */
export interface PaceCap {
  /** Size classes where 60 fps didn't flow. */
  fps30: ResolutionClass[];
  /** Largest size class that flowed (null: no ceiling). */
  maxResolution: ResolutionClass | null;
}

export const NO_PACE_CAP: PaceCap = { fps30: [], maxResolution: null };

/** The cap after a verdict on a mode of `resolution` (unchanged for 'ok', 'warn' and 'unknown'). */
export function capAfter(cap: PaceCap, verdict: PaceVerdict, resolution: ResolutionClass): PaceCap {
  if (verdict === 'fps30') {
    return cap.fps30.includes(resolution) ? cap : { ...cap, fps30: [...cap.fps30, resolution] };
  }
  if (verdict === 'smaller') {
    const ceiling: ResolutionClass = '1080p';
    if (cap.maxResolution && CLASS_RANK[cap.maxResolution] <= CLASS_RANK[ceiling]) return cap;
    return { ...cap, maxResolution: ceiling };
  }
  return cap;
}

/** A camera request made lighter by what this phone has shown it can't sustain. */
export function capRequest(
  want: { width: number; height: number; fps: 30 | 60 },
  cap: PaceCap,
): { width: number; height: number; fps: 30 | 60; capped: boolean } {
  let { width, height, fps } = want;
  let capped = false;
  if (cap.maxResolution && CLASS_RANK[resolutionClass(width, height)] > CLASS_RANK[cap.maxResolution]) {
    const [w, h] = LONG_SIDE[cap.maxResolution === '4k' ? '4k' : cap.maxResolution];
    width = w;
    height = h;
    capped = true;
  }
  if (fps === 60 && cap.fps30.includes(resolutionClass(width, height))) {
    fps = 30;
    capped = true;
  }
  return { width, height, fps, capped };
}

/** Frames per second of a measurement (0 when nothing was measured). */
export function framesPerSecond(frames: number, seconds: number): number {
  return seconds > 0 && frames > 0 ? frames / seconds : 0;
}

/** The cap without its size ceiling (the dancer asked for a bigger size again: the next measurement judges afresh). */
export function capWithoutSize(cap: PaceCap): PaceCap {
  return cap.maxResolution == null ? cap : { ...cap, maxResolution: null };
}

/** The cap without its 30-fps steps (the dancer asked for 60 again). */
export function capWithoutFps(cap: PaceCap): PaceCap {
  return cap.fps30.length ? { ...cap, fps30: [] } : cap;
}

/** True when `cap` makes this request smaller (not just slower). */
export function sizeCapped(want: { width: number; height: number; fps: 30 | 60 }, cap: PaceCap): boolean {
  const capped = capRequest(want, cap);
  return capped.width !== want.width || capped.height !== want.height;
}

/** True when `a` is a bigger size class than `b`. */
export function largerClass(a: ResolutionClass, b: ResolutionClass): boolean {
  return CLASS_RANK[a] > CLASS_RANK[b];
}

/**
 * Camera → screen delay of one frame (ms) from requestVideoFrameCallback's metadata: when the camera captured it
 * and when it is expected on screen (Chrome gives `captureTime` for local cameras). Null when unknown or implausible
 * (another clock, a frame from before a pause).
 */
export function frameLagMs(meta: { captureTime?: number; expectedDisplayTime?: number }): number | null {
  const { captureTime, expectedDisplayTime } = meta;
  if (typeof captureTime !== 'number' || typeof expectedDisplayTime !== 'number') return null;
  if (!(captureTime > 0) || !Number.isFinite(expectedDisplayTime)) return null;
  const lag = expectedDisplayTime - captureTime;
  return lag >= 0 && lag <= 2000 ? lag : null;
}

/**
 * Every value seen since the last `clear` (a fixed histogram of `max / step` buckets: nothing allocated per frame,
 * whatever the take's length), and their median when asked. Values are kept to `step` (floored) and clamped to
 * [0, max].
 */
export function createMedianLog(max: number, step: number) {
  const buckets = new Uint32Array(Math.max(1, Math.floor(max / step) + 1));
  let size = 0;
  /** The value of the k-th smallest sample (0-based). */
  const nth = (k: number): number => {
    let seen = 0;
    for (let i = 0; i < buckets.length; i++) {
      seen += buckets[i]!;
      if (seen > k) return i * step;
    }
    return (buckets.length - 1) * step;
  };
  return {
    add(value: number) {
      if (!Number.isFinite(value)) return;
      const i = Math.min(buckets.length - 1, Math.max(0, Math.floor(value / step + 1e-9)));
      buckets[i]!++;
      size++;
    },
    clear() {
      if (!size) return;
      buckets.fill(0);
      size = 0;
    },
    size: () => size,
    median(): number | null {
      if (!size) return null;
      return size % 2 ? nth(size >> 1) : (nth((size >> 1) - 1) + nth(size >> 1)) / 2;
    },
  };
}
export type MedianLog = ReturnType<typeof createMedianLog>;

/** Camera → screen delays (0–2 s, to the millisecond) of a whole take, or of a rehearsal's stretch. */
export function createLagLog(): MedianLog {
  return createMedianLog(2000, 1);
}
export type LagLog = MedianLog;

/** Time between two camera frames (ms, to 0.1 ms), from their `captureTime`: the camera's real rate meanwhile. */
export function createFrameIntervalLog(): MedianLog {
  return createMedianLog(500, 0.1);
}

/**
 * The camera's real rate from the median time between its frames (null with too few to say): a dark room makes
 * most cameras slow down from 60 to 30 (or 24) on their own, whatever the phone.
 */
export const CAMERA_RATE_MIN_SAMPLES = 30;
export function cameraRateFps(intervals: Pick<MedianLog, 'size' | 'median'>): number | null {
  if (intervals.size() < CAMERA_RATE_MIN_SAMPLES) return null;
  const ms = intervals.median();
  return ms != null && ms > 1 ? 1000 / ms : null;
}

/**
 * The time between two frames the page saw, per camera frame (`presentedFrames` may jump), or null when it says
 * nothing (no capture time, a pause, another clock).
 */
export function frameIntervalMs(
  prev: { presentedFrames: number; captureTime?: number } | null,
  cur: { presentedFrames: number; captureTime?: number },
): number | null {
  if (!prev || typeof prev.captureTime !== 'number' || typeof cur.captureTime !== 'number') return null;
  if (!(prev.captureTime > 0) || !(cur.captureTime > 0)) return null;
  const frames = cur.presentedFrames - prev.presentedFrames;
  if (!(frames >= 1)) return null;
  const ms = (cur.captureTime - prev.captureTime) / frames;
  return ms > 1 && ms < 500 ? ms : null;
}

/**
 * A take teaches the pace only when it is long enough and counted from its second 2 (the start always stutters a
 * little: the song starting, the file being opened), and a step down needs a real loss of frames, not one stall.
 */
export const PACE_TAKE_MIN_SECONDS = 10;
export const PACE_TAKE_SKIP_SECONDS = 2;
export const PACE_TAKE_MIN_LOST = 30;

/** Verdict of a finished take; `frames` and `seconds` are counted after its first `PACE_TAKE_SKIP_SECONDS`. */
export function takeVerdict(t: {
  wantFps: number;
  /** What the camera gave meanwhile (canvas takes: frames delivered; direct takes: see `directTakeVerdict`). */
  cameraFps: number;
  frames: number;
  seconds: number;
  resolution: ResolutionClass;
  lagMs?: number | null;
  restLagMs?: number | null;
}): PaceVerdict {
  if (!(t.seconds >= PACE_TAKE_MIN_SECONDS - PACE_TAKE_SKIP_SECONDS)) return 'unknown';
  const sample: PaceSample = {
    wantFps: t.wantFps,
    cameraFps: t.cameraFps,
    measuredFps: framesPerSecond(t.frames, t.seconds),
    seconds: t.seconds,
    resolution: t.resolution,
    lagMs: t.lagMs,
    restLagMs: t.restLagMs,
  };
  const verdict = paceVerdict(sample);
  if (verdict === 'ok' || verdict === 'unknown') return verdict;
  const target = Math.min(t.cameraFps || t.wantFps, t.wantFps);
  const lost = target * t.seconds - t.frames;
  // A lagging preview is the phone not keeping up whatever the frames; otherwise a handful of lost frames isn't.
  if (lost < PACE_TAKE_MIN_LOST && !lagging(t.lagMs, t.restLagMs)) return 'ok';
  return verdict;
}

/**
 * Direct takes · the camera's mean rate in the take falls clearly below its mean rate in the countdown just before
 * (same session and light, camera open, nothing encoding): with a delay that grows too, it is the load slowing the
 * camera down (a busy or hot phone), not the light.
 */
export const PACE_DIRECT_RATE_DROP = 0.75;
/** A delay this much above rest backs a rate drop (alone it is not lagging: see `lagging`). */
export const PACE_LAG_SOME_GROWTH_MS = 30;

/**
 * The camera's mean rate in a countdown (frames the camera presented / seconds), or null when too short to say.
 * Measured with the same frame watch as the take, so both count frames the same way.
 */
export function restRateFps(frames: number, seconds: number): number | null {
  if (!(seconds >= PACE_MIN_SECONDS) || !(frames >= CAMERA_RATE_MIN_SAMPLES)) return null;
  return frames / seconds;
}

/**
 * Verdict of a finished direct take (the recorder gets every camera frame, whether the page painted it or not),
 * judged by the preview's delay. Never by callbacks the page missed (a 60 Hz or battery-capped screen, or the
 * YouTube player on the same thread, makes the page miss frames the file still gets), nor by the median time between
 * frames (a camera at 60 half the time and at 30 the other half has a median of 60 but a mean of 45), nor by the
 * rate at rest of an earlier rehearsal (a darker room slows the camera down by itself). Missed callbacks and rates
 * are for the log only. The one rate signal: the take's mean rate against the countdown's (`restFps`), and only
 * with a delay that grows too. Nothing presented (no frame callbacks) says nothing.
 */
export function directTakeVerdict(t: {
  wantFps: number;
  /** The mode's rate (the camera never gives more). */
  modeFps: number;
  /** Frames the camera presented to the page (counted after the skips; the page may have missed some callbacks). */
  presented: number;
  seconds: number;
  /** The camera's mean rate in this take's countdown (null without one, or too short). */
  restFps?: number | null;
  resolution: ResolutionClass;
  lagMs?: number | null;
  restLagMs?: number | null;
}): PaceVerdict {
  if (!(t.seconds >= PACE_TAKE_MIN_SECONDS - PACE_TAKE_SKIP_SECONDS)) return 'unknown';
  if (!(t.presented > 0)) return 'unknown';
  const target = t.modeFps > 0 ? Math.min(t.modeFps, t.wantFps) : t.wantFps;
  if (!(target > 0)) return 'unknown';
  const takeFps = t.presented / t.seconds;
  const slowed = t.restFps != null && t.restFps > 0 && takeFps < t.restFps * PACE_DIRECT_RATE_DROP;
  const lagGrew =
    t.lagMs != null && t.restLagMs != null && Number.isFinite(t.lagMs) && t.lagMs - t.restLagMs > PACE_LAG_SOME_GROWTH_MS;
  if (!lagging(t.lagMs, t.restLagMs) && !(slowed && lagGrew)) return 'ok';
  return stepDown(target, t.resolution);
}

/** A step down seen once, waiting for a second measurement to agree. */
export interface PacePending {
  verdict: 'fps30' | 'smaller';
  resolution: ResolutionClass;
}

/**
 * A step down is learnt only when two measurements in a row (the rehearsal of two openings, or takes) say the same
 * for the same size: one bad measurement (the phone busy with something else) must not cost 30 days of quality.
 * An 'ok' for that size clears what was waiting; 'warn' and 'unknown' leave it.
 */
export function confirmPace(
  pending: PacePending | null,
  verdict: PaceVerdict,
  resolution: ResolutionClass,
): { learn: boolean; pending: PacePending | null } {
  if (verdict === 'fps30' || verdict === 'smaller') {
    if (pending && pending.verdict === verdict && pending.resolution === resolution) return { learn: true, pending: null };
    return { learn: false, pending: { verdict, resolution } };
  }
  if (verdict === 'ok' && pending?.resolution === resolution) return { learn: false, pending: null };
  return { learn: false, pending };
}