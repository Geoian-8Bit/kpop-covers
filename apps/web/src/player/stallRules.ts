/**
 * What the file stage does when its video stops moving although the dancer asked it to play (a loop's jump back that
 * waits for data on a slow 4G, a phone that falls behind decoding, a network that dropped for a while, a signed URL
 * that expired). No DOM: the stage reads the element and applies the answer.
 *
 * The stage checks every `checkMs` whether the clock moved. Stuck for `firstMs` it tries again by itself: a plain
 * play() (the data is there, the pipeline hiccuped) or a re-seek to the same spot (a new request for the missing
 * bytes). From the second attempt on it signs the file again and reloads it on the same moment (a connection that
 * died, or a token the storage now refuses). It never gives up while the studio is open: the attempts only get
 * further apart, doubling from `everyMs` up to `maxGapMs`.
 */
export const STALL = {
  checkMs: 500,
  firstMs: 3000,
  everyMs: 4000,
  /** REQ-15 · Ceiling of the wait between two attempts: a rehearsal room's 4G comes back, and then we want it fast. */
  maxGapMs: 20000,
} as const;

/** HTMLMediaElement.HAVE_METADATA: the source is open (below it, a re-seek has nothing to work on). */
const HAVE_METADATA = 1;
/** HTMLMediaElement.HAVE_FUTURE_DATA: there is data beyond the current frame. */
const HAVE_FUTURE_DATA = 3;

/**
 * `reload`: the same URL again. `resign`: forget the remembered signature, sign anew (or take the device's whole copy
 * when there is one) and reload on the same moment.
 */
export type StallAction = 'none' | 'play' | 'reseek' | 'reload' | 'resign';

export interface StallInput {
  /** How long the clock has been still while it should move (ms). */
  stuckMs: number;
  /** Retries already made in this stall. */
  retries: number;
  /** The element's readyState now. */
  readyState: number;
}

/** REQ-15 · The wait before attempt `n` (n ≥ 1, counted after the first): doubling, capped. */
export function retryGapMs(n: number): number {
  if (n <= 0) return 0;
  // 2^(n-1) overflows nothing here: past the cap the answer is the cap.
  return Math.min(STALL.everyMs * 2 ** Math.min(n - 1, 16), STALL.maxGapMs);
}

/** REQ-15 · How long stuck before attempt number `retries` (0 = the first) is made. */
export function retryAtMs(retries: number): number {
  let at = STALL.firstMs;
  for (let n = 1; n <= retries; n++) at += retryGapMs(n);
  return at;
}

export function stallAction({ stuckMs, retries, readyState }: StallInput): StallAction {
  if (stuckMs < retryAtMs(retries)) return 'none';
  if (retries === 0) {
    if (readyState < HAVE_METADATA) return 'reload';
    return readyState >= HAVE_FUTURE_DATA ? 'play' : 'reseek';
  }
  return 'resign';
}

/** MediaError codes (HTMLMediaElement.error.code). */
const MEDIA_ERR_NETWORK = 2;
const MEDIA_ERR_DECODE = 3;

export interface ErrorInput {
  /** `el.error.code`. */
  code: number;
  /** The element plays a cloud URL (not a file on this device). */
  network: boolean;
  /** Recoveries already tried since the video last moved. */
  attempts: number;
  /** The song had opened (metadata loaded) before, on this source or the one it replaced. */
  hadMetadata: boolean;
  /** The URL's signature is past its expiry (see signatureExpired). */
  expired: boolean;
}

/**
 * REQ-15 · What an element `error` means. A cloud file's network error (the 4G dropped mid-song, a range request
 * refused) is recovered with a fresh signature. A refused source gets two fresh signatures before the error shows,
 * but only when there is reason to blame the token (the song had opened, or the signature expired): a file that never
 * opened on a valid signature fails at once, as it always did. A file that doesn't decode, or one on this device,
 * keeps today's answer.
 */
export function errorAction({
  code,
  network,
  attempts,
  hadMetadata,
  expired,
}: ErrorInput): 'recover' | 'fail' {
  if (!network || code === MEDIA_ERR_DECODE) return 'fail';
  if (code === MEDIA_ERR_NETWORK) return 'recover';
  if (!hadMetadata && !expired) return 'fail';
  return attempts < 2 ? 'recover' : 'fail';
}

/**
 * REQ-15 · Whether a signed URL's token has expired: Supabase signs with a JWT in `token` whose `exp` is in seconds.
 * Anything unreadable counts as not expired (the error then keeps its old answer).
 */
export function signatureExpired(url: string, nowMs: number): boolean {
  try {
    const part = new URL(url).searchParams.get('token')?.split('.')[1];
    if (!part) return false;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === 'number' && exp * 1000 <= nowMs;
  } catch {
    return false;
  }
}

/** REQ-15 · Fresh signatures that came back empty in a row, with the network up, before a network error shows. */
export const RESIGN_MISS_LIMIT = 5;

/**
 * REQ-15 · After a network error the new signature came back empty `misses` times in a row. Offline, that is the
 * network and the recovery keeps waiting for it; online, the storage keeps refusing and, past the limit, the error the
 * stage always showed is shown.
 */
export function resignMissAction({ online, misses }: { online: boolean; misses: number }): 'retry' | 'fail' {
  return online && misses >= RESIGN_MISS_LIMIT ? 'fail' : 'retry';
}

/** REQ-15 · A pause this close to a network error (either side) is the error's, not the dancer's. */
export const ERROR_PAUSE_MS = 1500;

/**
 * REQ-15 · Whether recovering from a network error resumes the song: the element paused itself around the error
 * while the song was playing, and the dancer hasn't paused since (a pause asked for during the wait stays). A pause
 * well after the error (headphones unplugged, a call) is the system's and is never undone.
 */
export function resumeAfterDrop(input: {
  playing: boolean;
  droppedAt: number;
  errorAt: number;
  userPausedAt: number;
}): boolean {
  const { playing, droppedAt, errorAt, userPausedAt } = input;
  return (
    !playing &&
    droppedAt > errorAt - ERROR_PAUSE_MS &&
    droppedAt <= errorAt + ERROR_PAUSE_MS &&
    droppedAt > userPausedAt
  );
}

/** REQ-15 · The wait before recovering from an error: a moment the first time, then the stall's back-off. */
export function errorRetryDelayMs(attempts: number): number {
  return attempts <= 0 ? 1000 : retryGapMs(attempts);
}

/** Whether the clock moved between two checks (a few ms of float noise is not playing). */
export function clockMoved(previous: number, now: number): boolean {
  return Math.abs(now - previous) > 0.01;
}
