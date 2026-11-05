import type { UploadFailure, UploadResult } from './backend/types';

/**
 * Pure rules of the silent upload retry (lib/backend/uploadRetry.ts) over poor 4G: which failed uploads are tried
 * again, after how long, and when a «the file is already there» answer on a later try means an earlier try did get
 * the file through. No DOM.
 */

/** Waits before the 2nd, 3rd and 4th try. */
export const UPLOAD_RETRY_DELAYS_MS = [2000, 5000, 15_000] as const;

/**
 * Failures that can fix themselves (classifyError's «transient»): no answer at all, a 5xx, a 408 or a 429. A real
 * refusal (too big, wrong type, no room, the database's rules, a name taken) answers the same on every try.
 */
export function isTransientUploadFailure(reason: UploadFailure): boolean {
  return reason === 'network' || reason === 'unavailable';
}

/**
 * Milliseconds to wait before trying again after `result`, or null to give up and report it. `retriesDone`: tries
 * after the first one so far (0 after the first failure).
 */
export function uploadRetryDelay(retriesDone: number, result: UploadResult): number | null {
  if (result.ok || !isTransientUploadFailure(result.reason)) return null;
  return UPLOAD_RETRY_DELAYS_MS[retriesDone] ?? null;
}

/**
 * Whether a later try's refusal is the earlier try's success: the earlier one failed with no clear answer (it may
 * have reached the server; its answer got lost), the name is refused now because it holds a file (`exists`, or a
 * `denied` from a rule checked first, like one file per take), and that file has exactly this upload's size. Names
 * are unique per upload (the video's id, or a fresh suffix) and never overwritten, so it can only be this file.
 */
export function retriedUploadLanded(input: {
  earlierTransient: boolean;
  result: UploadResult;
  bytes: number;
  storedBytes: number | null;
}): boolean {
  const { result } = input;
  if (!input.earlierTransient || result.ok) return false;
  if (result.reason !== 'exists' && result.reason !== 'denied') return false;
  return input.storedBytes != null && input.storedBytes === input.bytes;
}
