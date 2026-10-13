import { createStore, del, delMany, get, keys, set } from 'idb-keyval';

// Uploaded files live in IndexedDB on the device (instant, offline playback, no size cap).
// Files ≤ 50 MB are additionally synced to Supabase Storage so the whole crew can open them.
const store = createStore('coverscape', 'videos');

/** Copies saved during this session: never purged, even by a library list fetched before their row existed. */
const savedThisSession = new Set<string>();
let persistAsked = false;

export function saveLocalVideo(videoId: string, blob: Blob): Promise<void> {
  savedThisSession.add(videoId);
  // Ask once: without it Safari wipes a site's storage after 7 days unused (unless installed).
  if (!persistAsked) {
    persistAsked = true;
    void navigator.storage?.persist?.().catch(() => false);
  }
  return set(videoId, blob, store);
}

/** Drops copies of videos that no longer exist in the library (deleted on any device). */
export async function purgeLocalVideos(existingIds: Iterable<string>): Promise<void> {
  try {
    const keep = new Set(existingIds);
    const stale = (await keys<string>(store)).filter((id) => !keep.has(id) && !savedThisSession.has(id));
    if (stale.length) await delMany(stale, store);
  } catch {
    /* storage unavailable (private mode…): nothing to purge */
  }
}

export async function loadLocalVideo(videoId: string): Promise<Blob | undefined> {
  try {
    return await get<Blob>(videoId, store);
  } catch {
    return undefined;
  }
}

export function deleteLocalVideo(videoId: string): Promise<void> {
  return del(videoId, store);
}

/** Longest side of an upload's poster, in px (≈ 10–20 KB as JPEG). */
const POSTER_MAX_SIDE = 400;

/** Reads duration and grabs a small poster frame from a local media file. */
export async function probeMediaFile(file: Blob): Promise<{ duration: number | null; poster: string | null }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('unreadable'));
      setTimeout(() => reject(new Error('timeout')), 8000);
    });
    const duration = Number.isFinite(video.duration) ? video.duration : null;

    let poster: string | null = null;
    if (video.videoWidth > 0 && duration) {
      video.currentTime = Math.min(duration * 0.25, 8);
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
        setTimeout(resolve, 3000);
      });
      // The poster rides inside the video row (fetched with every library load): keep it a small thumbnail.
      const scale = Math.min(1, POSTER_MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
      const width = Math.round(video.videoWidth * scale);
      const height = Math.round(video.videoHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')?.drawImage(video, 0, 0, width, height);
      poster = canvas.toDataURL('image/jpeg', 0.6);
    }
    return { duration, poster };
  } catch {
    return { duration: null, poster: null };
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  }
}
