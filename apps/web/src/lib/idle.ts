/**
 * Runs `run` when the phone is idle: `requestIdleCallback` (forced after `timeout` ms) or, where it does not exist
 * (Safari), a plain timer of `fallbackMs`. Returns a cancel. Shared by the deferred service worker registration
 * (main.tsx) and the idle prefetches (prefetch.ts).
 */
export function whenIdle(
  run: () => void,
  { timeout = 4000, fallbackMs = 1500 }: { timeout?: number; fallbackMs?: number } = {},
): () => void {
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(run, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(run, fallbackMs);
  return () => clearTimeout(id);
}
