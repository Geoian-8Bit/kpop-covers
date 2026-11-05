// REQ-28 · Small async helpers that several features used to copy (the cloud copy, sharing a take, the camera, the
// update check). Each feature keeps its own cancel message.

/** Resolves after `ms` (a plain timer). */
export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The error a cancelled job throws: a `DOMException` named «AbortError», with the feature's own message. */
export const abortError = (message: string) => new DOMException(message, 'AbortError');

/** Whether `error` is a cancellation (see `abortError`, and `AbortSignal`'s own). */
export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
