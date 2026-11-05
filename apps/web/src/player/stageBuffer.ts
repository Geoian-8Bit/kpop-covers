import type { StageBuffer } from '@/lib/cloudCacheRules';

/**
 * REQ-15 · The <video> of the file stage on screen, read (never driven) by the background download of the cloud
 * file so it only takes bandwidth the picture doesn't need (cloudCacheRules.downloadMayRun). A plain reference to a
 * DOM element, not UI state: the player's state stays in store.ts.
 */
let current: HTMLVideoElement | null = null;

/** The stage registers its element while mounted; the returned function lets go of it. */
export function watchStageBuffer(el: HTMLVideoElement): () => void {
  current = el;
  return () => {
    if (current === el) current = null;
  };
}

/** HTMLMediaElement.NETWORK_LOADING. */
const NETWORK_LOADING = 2;

/** What the stage's element is doing now, or null with no file stage on screen. */
export function stageBuffer(): StageBuffer | null {
  const el = current;
  if (!el || !el.isConnected) return null;
  const at = el.currentTime;
  const duration = Number.isFinite(el.duration) ? el.duration : Number.POSITIVE_INFINITY;
  let aheadS = 0;
  const ranges = el.buffered;
  for (let i = 0; i < ranges.length; i++) {
    if (ranges.start(i) <= at + 0.25 && ranges.end(i) > at) {
      aheadS = ranges.end(i) - at;
      break;
    }
  }
  return { paused: el.paused, loading: el.networkState === NETWORK_LOADING, aheadS, toEndS: duration - at };
}
