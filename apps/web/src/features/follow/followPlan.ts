/**
 * 15 · The order of an analysis: what the user is about to watch comes first, the rest of the song after it, in
 * the background. Pure rules (no DOM, no model): analyze.ts runs the plan, the tests share it.
 *
 *  1. From the chosen moment forwards to the end of the stretch being practised (the A–B range or clip when the
 *     moment is in it; otherwise the next 25 s).
 *  2. Back to the start of that stretch (a whole analysis only).
 *     → the path is saved and followed here: the zoom already goes with the dancer in that stretch.
 *  3. On to the end of the song.
 *  4. Back to the beginning (a whole analysis only).
 */

export interface Span {
  start: number;
  end: number;
}

/**
 * A stretch of song to analyse. `forward`: from `from` to `to`, following the dancer frame by frame (the fast way:
 * a crop around them). `backward`: the dancer is known at `to` and followed back to `from` (the video can only be
 * played forwards, so it is looked at whole, in chunks taken from the end).
 */
export interface Segment {
  dir: 'forward' | 'backward';
  from: number;
  to: number;
  /** Part of what is about to be watched: when every priority segment is done, the path is ready to follow. */
  priority: boolean;
}

/** Frames looked at per second of song: a zoom that follows needs few, the path glides between them. */
export const ANALYSIS_FPS = 4;
/** On a device where each frame is slow (no graphics chip), fewer still. */
export const SLOW_ANALYSIS_FPS = 3;
/** Without a range: the next 25 s from the chosen moment and the 5 s before it come first. */
export const PRIORITY_AHEAD = 25;
export const PRIORITY_BEHIND = 5;
/** Backward stretches are looked at in chunks of this many seconds, from the end. */
export const BACKWARD_CHUNK = 12;
/**
 * Relative cost of a second of song: forwards mostly a small crop with the single-person model; backwards the
 * whole picture with the multi-person model, about twice as slow.
 */
export const COST_FORWARD = 1;
export const COST_BACKWARD = 1.8;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** The segments of an analysis, in the order they run. */
export function planAnalysis(opts: {
  at: number;
  length: number;
  /** The A–B range or clip in use (null: none). */
  focus?: Span | null;
  /** true: the whole song; false: a correction, from `at` to the end. */
  both: boolean;
}): Segment[] {
  const length = Math.max(0, opts.length);
  const at = clamp(opts.at, 0, length);
  const focus = opts.focus;
  let start: number;
  let end: number;
  if (focus && focus.end > focus.start && at >= focus.start - 2 && at <= focus.end + 2) {
    start = Math.min(focus.start, at);
    end = Math.max(focus.end, at);
  } else {
    start = at - PRIORITY_BEHIND;
    end = at + PRIORITY_AHEAD;
  }
  start = opts.both ? clamp(start, 0, at) : at;
  end = clamp(end, at, length);
  const out: Segment[] = [];
  const min = 0.05;
  if (end - at > min) out.push({ dir: 'forward', from: at, to: end, priority: true });
  if (at - start > min) out.push({ dir: 'backward', from: start, to: at, priority: true });
  if (length - end > min) out.push({ dir: 'forward', from: end, to: length, priority: false });
  if (opts.both && start > min) out.push({ dir: 'backward', from: 0, to: start, priority: false });
  return out;
}

export function segmentCost(s: Segment): number {
  return Math.max(0, s.to - s.from) * (s.dir === 'forward' ? COST_FORWARD : COST_BACKWARD);
}

/** How far the whole analysis is (0…1) with `fraction` of segment `index` done. */
export function planProgress(segments: readonly Segment[], index: number, fraction: number): number {
  const total = segments.reduce((sum, s) => sum + segmentCost(s), 0);
  if (!(total > 0)) return index >= segments.length ? 1 : 0;
  let done = 0;
  for (let i = 0; i < Math.min(index, segments.length); i++) done += segmentCost(segments[i]!);
  const current = segments[index];
  if (current) done += segmentCost(current) * clamp(fraction, 0, 1);
  return clamp(done / total, 0, 1);
}

/** The chunks of a backward segment, latest first: each one is played forwards, then followed back. */
export function backwardChunks(from: number, to: number, size = BACKWARD_CHUNK): Span[] {
  const out: Span[] = [];
  if (!(to > from) || !(size > 0)) return out;
  let end = to;
  while (end - from > 0.05) {
    const start = Math.max(from, end - size);
    out.push({ start, end });
    end = start;
  }
  return out;
}

/** The span the plan's priority segments cover (where the path is usable once they are done). */
export function prioritySpan(segments: readonly Segment[], at: number): Span {
  let start = at;
  let end = at;
  for (const s of segments) {
    if (!s.priority) continue;
    start = Math.min(start, s.from);
    end = Math.max(end, s.to);
  }
  return { start, end };
}

/**
 * Fewer frames when this device is slow: past ~150 ms a frame, 4 a second would take longer than the song itself
 * on a CPU without a graphics chip. Never back up once lowered (no back and forth).
 */
export function adaptFps(current: number, frameMs: number): number {
  return current > SLOW_ANALYSIS_FPS && frameMs > 150 ? SLOW_ANALYSIS_FPS : current;
}

// ───────────── How hard the analysis works ─────────────

/** What is about to be watched: the model may work ~77 % of the time (the user is waiting for it). */
export const PRIORITY_DUTY = 1 / 1.3;
/** The rest of the song, in the background, while the studio plays (the zoom, the A–B jump and taps need room). */
export const BACKGROUND_DUTY_PLAYING = 0.35;
/**
 * 15 · The background on WASM while the studio plays: each frame is one long task on the main thread (45–80 ms),
 * which the zoom and taps feel, so fewer of them (until the analysis moves to a worker).
 */
export const BACKGROUND_DUTY_PLAYING_WASM = 0.2;
/** The same with the studio paused. */
export const BACKGROUND_DUTY_PAUSED = 0.6;
/** Fastest the muted copy plays (Chrome allows 16×; more than this and frames are skipped anyway). */
export const MAX_RATE = 8;
/** Slowest it plays in the background (so that every frame to look at still comes, with room between them). */
export const MIN_BACKGROUND_RATE = 0.25;

/** 15 · The share of the time the model may take: the stretch being waited for, or the rest in the background. */
export function analysisDuty(priority: boolean, studioPlaying: boolean, onWasm = false): number {
  if (priority) return PRIORITY_DUTY;
  if (!studioPlaying) return BACKGROUND_DUTY_PAUSED;
  return onWasm ? BACKGROUND_DUTY_PLAYING_WASM : BACKGROUND_DUTY_PLAYING;
}

/**
 * The muted copy's speed: a frame every 1/fps s of video, each costing `costSeconds` here, keeps the model busy
 * `duty` of the time. The stretch being waited for never goes below real time (as before); the background may.
 */
export function playbackRate(fps: number, costSeconds: number, duty: number, priority: boolean): number {
  const raw = duty / (Math.max(0.1, fps) * Math.max(0.001, costSeconds));
  return clamp(raw, priority ? 1 : MIN_BACKGROUND_RATE, MAX_RATE);
}

/** Frame by frame (seeking): the pause after a frame that cost `costSeconds`, in ms, to keep to `duty`. */
export function idleAfterMs(costSeconds: number, duty: number): number {
  if (!(duty > 0) || duty >= 1 || !(costSeconds > 0)) return 0;
  return Math.min(2000, costSeconds * (1 / duty - 1) * 1000);
}

// ───────────── Time left ─────────────

/**
 * The time left from how fast the progress moved over the last `windowMs` (the speed changes between parts of
 * the plan and while the model warms up, so the start doesn't count for long). Null until it can tell.
 */
export function createEta(windowMs = 8000) {
  const points: { at: number; f: number }[] = [];
  return {
    push(at: number, fraction: number) {
      points.push({ at, f: fraction });
      while (points.length > 2 && at - points[1]!.at > windowMs) points.shift();
    },
    /** Seconds left, or null (not enough to tell yet). */
    remaining(): number | null {
      if (points.length < 2) return null;
      const a = points[0]!;
      const b = points[points.length - 1]!;
      const span = b.at - a.at;
      const moved = b.f - a.f;
      if (span < 1500 || !(moved > 0.002)) return null;
      return Math.max(0, ((1 - b.f) * span) / moved / 1000);
    },
    reset() {
      points.length = 0;
    },
  };
}

/**
 * «quedan unos 40 s»: rounded so that it doesn't flicker (5 s steps, then minutes). Empty when unknown.
 */
export function remainingPhrase(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '';
  if (seconds < 10) return 'quedan menos de 10 s';
  if (seconds < 55) return `quedan unos ${Math.max(10, Math.round(seconds / 5) * 5)} s`;
  if (seconds < 90) return 'queda cerca de 1 min';
  return `quedan unos ${Math.round(seconds / 60)} min`;
}

/** The value kept in the screen's state: the phrase only changes in steps, so the screen repaints in steps too. */
export function remainingStep(seconds: number | null | undefined): number | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  if (seconds < 10) return 5;
  if (seconds < 55) return Math.max(10, Math.round(seconds / 5) * 5);
  if (seconds < 90) return 60;
  return Math.round(seconds / 60) * 60;
}

/** The size of the step a shown value belongs to (5 s, then the «cerca de 1 min» step, then minutes). */
function stepUnit(shown: number): number {
  if (shown <= 55) return 5;
  if (shown <= 60) return 30;
  return 60;
}

/**
 * 15 · The step to show next, with hysteresis: down only once the estimate is more than half a step under the one
 * shown, up only when it is more than two steps over (an estimate on a boundary, or the switch between the crop
 * and the whole picture, no longer makes it dance). Null when unknown.
 */
export function steadyRemaining(shown: number | null, seconds: number | null | undefined): number | null {
  const next = remainingStep(seconds);
  if (next == null || shown == null || seconds == null) return next;
  if (next === shown) return shown;
  const unit = stepUnit(shown);
  if (next < shown) return shown - seconds > unit / 2 ? next : shown;
  return seconds - shown > unit * 2 ? next : shown;
}
