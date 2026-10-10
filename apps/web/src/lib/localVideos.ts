import { createStore, del, get, set } from 'idb-keyval';

// Uploaded files live in IndexedDB on the device (instant, offline playback, no size cap).
// Files ≤ 50 MB are additionally synced to Supabase Storage so the whole crew can open them.
const store = createStore('coverscape', 'videos');

export function saveLocalVideo(videoId: string, blob: Blob): Promise<void> {
  return set(videoId, blob, store);
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
      const width = 480;
      const height = Math.round((video.videoHeight / video.videoWidth) * width);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')?.drawImage(video, 0, 0, width, height);
      poster = canvas.toDataURL('image/jpeg', 0.72);
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
