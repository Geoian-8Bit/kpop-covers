/**
 * Stale chunks after a deploy: the page asks for a lazy chunk the new deploy no longer has. The way out is the
 * new version: the waiting service worker if there is one (main.tsx registers how to apply it), else a reload.
 */

const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

/** A lazy chunk (or its preloaded dependencies) could not be loaded. */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return CHUNK_ERROR.test(message);
}

/** Applies a waiting service worker update; false when none is waiting. Set from main.tsx. */
let applyWaitingUpdate: () => boolean = () => false;

export function setWaitingUpdateApplier(apply: () => boolean): void {
  applyWaitingUpdate = apply;
}

/** Loads the newest version: the waiting update (which reloads once it takes over) or a plain reload. */
export function reloadForFreshChunks(): void {
  if (!applyWaitingUpdate()) window.location.reload();
}

const GUARD_KEY = 'oneshoot.chunk-reload.v1';
/** A second stale chunk this soon after an automatic reload means reloading doesn't help: stop there. */
const GUARD_MS = 5 * 60_000;

/**
 * Automatic recovery, at most once every few minutes per tab (sessionStorage), so a chunk that is really gone
 * can't loop the page. False when it didn't act (the error then reaches the error boundary and its button).
 */
export function recoverFromStaleChunks(): boolean {
  try {
    const last = Number(sessionStorage.getItem(GUARD_KEY));
    if (last && Date.now() - last < GUARD_MS) return false;
    sessionStorage.setItem(GUARD_KEY, String(Date.now()));
  } catch {
    return false; // no storage, no guard: leave it to the «Recargar» button
  }
  reloadForFreshChunks();
  return true;
}
