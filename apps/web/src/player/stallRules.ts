/**
 * What the file stage does when its video stops moving although the dancer asked it to play (a loop's jump back that
 * waits for data on a slow 4G, a phone that falls behind decoding). No DOM: the stage reads the element and applies
 * the answer.
 *
 * The stage checks every `checkMs` whether the clock moved. Stuck for `firstMs` it tries again by itself, then every
 * `everyMs`: first a plain play() (the data is there, the pipeline hiccuped) or a re-seek to the same spot (a new
 * request for the missing bytes), then a re-seek, then reloading the source (a connection that died). After
 * `maxRetries` it keeps waiting with the spinner: the network may be gone and hammering it helps nobody.
 */
export const STALL = {
  checkMs: 500,
  firstMs: 3000,
  everyMs: 4000,
  maxRetries: 5,
} as const;

/** HTMLMediaElement.HAVE_METADATA: the source is open (below it, a re-seek has nothing to work on). */
const HAVE_METADATA = 1;
/** HTMLMediaElement.HAVE_FUTURE_DATA: there is data beyond the current frame. */
const HAVE_FUTURE_DATA = 3;

export type StallAction = 'none' | 'play' | 'reseek' | 'reload';

export interface StallInput {
  /** How long the clock has been still while it should move (ms). */
  stuckMs: number;
  /** Retries already made in this stall. */
  retries: number;
  /** The element's readyState now. */
  readyState: number;
}

export function stallAction({ stuckMs, retries, readyState }: StallInput): StallAction {
  if (retries >= STALL.maxRetries) return 'none';
  if (stuckMs < STALL.firstMs + retries * STALL.everyMs) return 'none';
  if (readyState < HAVE_METADATA) return 'reload';
  if (retries === 0) return readyState >= HAVE_FUTURE_DATA ? 'play' : 'reseek';
  if (retries === 1) return 'reseek';
  return 'reload';
}

/** Whether the clock moved between two checks (a few ms of float noise is not playing). */
export function clockMoved(previous: number, now: number): boolean {
  return Math.abs(now - previous) > 0.01;
}

export interface SwapInput {
  /** A local copy of the playing cloud file is ready and not tried yet. */
  pending: boolean;
  /** The element's song track is being recorded through captureStream (a new source would end it). */
  captured: boolean;
  /** Why the stage asks now. */
  moment: 'paused' | 'stalled' | 'seek' | 'playing';
}

/**
 * When the stage moves from the cloud file to its downloaded copy (same file, so same moment): while paused, while
 * stuck waiting for data (exactly when the copy helps), or on a jump (a loop's restart, a tap) which pauses for a
 * moment anyway. Never in the middle of smooth playback, and never under a recording that taps the element.
 */
export function shouldSwapSource({ pending, captured, moment }: SwapInput): boolean {
  if (!pending || captured) return false;
  return moment !== 'playing';
}
