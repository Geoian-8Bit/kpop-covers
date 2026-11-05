/**
 * Poor 4G · What is using the network for the dancer right now, read (never driven) by the quiet background
 * prefetch (data/videos/prefetchFiles.ts) so a guess never takes bandwidth from a playing video or an upload.
 * Module-level counters and probes, not UI state: the players' state stays in player/store.ts.
 */

/** Players that can't be seen in the DOM (the YouTube iframe): each says whether it plays or loads now. */
const probes = new Set<() => boolean>();
let uploads = 0;

/** A player registers while it exists; the returned function lets go of it. */
export function registerMediaProbe(probe: () => boolean): () => void {
  probes.add(probe);
  return () => {
    probes.delete(probe);
  };
}

/** HTMLMediaElement.NETWORK_LOADING. */
const NETWORK_LOADING = 2;

/**
 * Whether any player streams from the network now: a registered probe (YouTube playing or buffering), or any
 * <video>/<audio> on the page with a network source (not a copy on this device, not the camera) that plays or is
 * still fetching. Covers every player (studio, review, takes, rounds) without each one having to register.
 */
export function mediaBusy(): boolean {
  for (const probe of probes) {
    try {
      if (probe()) return true;
    } catch {
      /* a player going away */
    }
  }
  if (typeof document === 'undefined') return false;
  for (const el of document.querySelectorAll<HTMLMediaElement>('video, audio')) {
    if (!/^https?:/.test(el.currentSrc)) continue;
    if (!el.paused || el.networkState === NETWORK_LOADING) return true;
  }
  return false;
}

/** An upload starts; the returned function marks it done (once). */
export function beginUpload(): () => void {
  uploads++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    uploads--;
  };
}

/** Uploads running now. */
export function uploadsRunning(): number {
  return uploads;
}
