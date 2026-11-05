/**
 * REQ-23 · The small, always-needed part of «Compartir con el grupo»: whether this browser can make the copy and
 * how a cancel looks. Kept apart so the list and the data layer don't pull `shareTake.ts` (the copy itself) into
 * their chunk; it loads with the share dialog.
 */

export type SharePhase = 'reducing' | 'uploading' | 'saving';

/** This browser can make the reduced copy. */
export function canReduceTakes(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
  );
}

export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
