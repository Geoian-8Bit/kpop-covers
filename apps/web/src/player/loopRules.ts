/**
 * 8 · Loops without a gap must start again at once. A seek is never instant: the player needs some time (measured,
 * see `nextLatency`) before the picture at the start shows. So the jump is sent that much *before* the end, scaled
 * by the speed (at 2× the song covers twice as much while the seek lands), and never waits for the media's end
 * event or for the player to confirm the jump.
 */

/** How the engine's seeks behave, for anticipating the loop's jump. */
export interface LoopTiming {
  /** Typical wall-clock time from asking for a seek to the picture being there, in ms. */
  latencyMs: number;
  /** Longest lead this engine may take, in ms of wall-clock time (a bad sample must not cut a clip short). */
  maxLatencyMs: number;
  /**
   * Seconds the whole-song loop keeps away from the very end (YouTube shows its end screen on the last frames);
   * 0 for files.
   */
  endMargin: number;
}

/** One animation frame, in ms: the loop is checked once per frame, so it can be up to this late. */
export const FRAME_MS = 1000 / 60;
/** The smallest lead, as before: float noise at the end of a range never makes it skip a wrap. */
export const MIN_LEAD = 0.02;

/**
 * Seconds of song time to jump early: the seek's latency (capped) plus half a frame of polling, at this speed, and
 * never more than a quarter of the looped span (short clips still play almost whole).
 */
export function loopLead(timing: LoopTiming, rate: number, span: number): number {
  const wallMs = Math.min(Math.max(0, timing.latencyMs), timing.maxLatencyMs) + FRAME_MS / 2;
  const lead = (wallMs / 1000) * Math.max(0.1, rate);
  const cap = Math.max(MIN_LEAD, span / 4);
  return Math.max(MIN_LEAD, Math.min(lead, cap));
}

/** Where the jump back is due for a range ending at `end`. */
export function wrapPoint(end: number, lead: number): number {
  return end - Math.max(MIN_LEAD, lead);
}

/** Whole-song loop: the jump point, keeping the engine's end margin (YouTube's end screen) as a minimum. */
export function songWrapPoint(duration: number, lead: number, timing: LoopTiming | null): number {
  return duration - Math.max(MIN_LEAD, lead, timing?.endMargin ?? 0);
}

/**
 * Wall-clock ms until the jump is due (0: now), or null when it's further away than a frame: then the next frame
 * checks again. Lets the loop fire between frames instead of up to a frame late.
 */
export function msUntilWrap(time: number, at: number, rate: number): number | null {
  const ms = ((at - time) / Math.max(0.1, rate)) * 1000;
  if (ms <= 0) return 0;
  return ms < FRAME_MS * 1.5 ? ms : null;
}

/** Ignore samples beyond this (a seek that had to download, a tab in the background): they say nothing. */
const MAX_SAMPLE_MS = 2000;
/** Weight of a new sample: follows a change within a few loops without jumping on one odd seek. */
const SMOOTHING = 0.35;

/** Running estimate of the seek latency, from the previous estimate and a new measured seek (ms). */
export function nextLatency(previous: number | null, sampleMs: number): number | null {
  if (!Number.isFinite(sampleMs) || sampleMs < 0 || sampleMs > MAX_SAMPLE_MS) return previous;
  if (previous == null) return sampleMs;
  return previous + (sampleMs - previous) * SMOOTHING;
}

/**
 * The lead for a loop with `gap` seconds of pause between repetitions: none with a pause (the song stops and counts
 * in anyway, so jumping early would only cut the clip's last moment), the measured one without.
 */
export function wrapLead(timing: LoopTiming | null, rate: number, span: number, gap: number): number {
  if (gap > 0 || !timing) return 0;
  return loopLead(timing, rate, span);
}

/** Longest lead a YouTube seek may take: one odd sample (a download, a busy phone) must not cut clips short. */
export const YOUTUBE_MAX_SEEK_MS = 200;

/**
 * Longest lead a file's seek may take. A loop's jump back lands within what is already decoded or buffered, rarely
 * more than 3–4 frames: a longer sample is a stall, and must not make the loop cut its end for several turns.
 */
export const FILE_MAX_SEEK_MS = 120;

/**
 * Whether a file seek's time is measured: only the loop's own jumps (`loop`), exact, sent while playing. A ±5 s, a
 * tap on the timeline or a clip far away may have to stream from the cloud (300–1500 ms) and say nothing about
 * jumping back within the loop.
 */
export function measuresFileSeek(opts: { preview?: boolean; loop?: boolean } | undefined, paused: boolean): boolean {
  return Boolean(opts?.loop) && !opts?.preview && !paused;
}

export interface YouTubeLanding {
  /** Wall-clock ms from sending the seek to noticing the first report at the new spot. */
  elapsedMs: number;
  /** The position that report gives (s), and where the seek was sent to (s). */
  raw: number;
  target: number;
  /** Playback speed: the song covered `raw − target` at this rate since it really landed. */
  rate: number;
  /** How long the player was seen in BUFFERING on the way (ms; 0 if never). */
  bufferingMs: number;
}

/**
 * Longest BUFFERING a sample may go through. The iframe often flicks to BUFFERING for a frame or two on any seek,
 * even within the buffer; longer than this it was downloading (up to seconds), which says nothing about the loop.
 */
export const YOUTUBE_BUFFERING_MS = 150;

/**
 * One YouTube seek's latency, worked out from what the report itself says: the song has already played
 * `raw − target` seconds at the new spot when the page notices, so the landing came that long (at this speed) before
 * it. Doesn't depend on how often the iframe reports, nor on the speed. Null: the sample says nothing (it buffered).
 */
export function youtubeSeekSample({ elapsedMs, raw, target, rate, bufferingMs }: YouTubeLanding): number | null {
  if (bufferingMs > YOUTUBE_BUFFERING_MS || !Number.isFinite(elapsedMs)) return null;
  const played = (Math.max(0, raw - target) / Math.max(0.1, rate)) * 1000;
  return Math.max(0, elapsedMs - played);
}

/**
 * Whether the iframe's clock shows a seek from `from` to `target` has landed: a fresh report near the target and
 * nearer to it than where the song was (a short clip's old position can be within a second of its start).
 */
export function seekLanded(raw: number, from: number, target: number): boolean {
  const now = Math.abs(raw - target);
  return now < 1 && (now < Math.abs(from - target) - 0.05 || Math.abs(from - target) < 0.1);
}
