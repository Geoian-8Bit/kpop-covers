import { type Video } from '@coverscape/shared';

/** Keeps the device copy; false when the browser can't store it (full, private mode…). */
export async function keepLocalCopy(videoId: string, file: File): Promise<boolean> {
  try {
    // REQ-08 · Loaded on demand: only an upload or a link needs the IndexedDB module.
    await (await import('@/lib/localVideos')).saveLocalVideo(videoId, file);
    return true;
  } catch (error) {
    console.error('[saveLocalVideo]', error);
    return false;
  }
}

/** Which group file a YouTube entry describes now (a device copy remembers the one it was made for). */
export function fileIdentity(video: Pick<Video, 'file_name' | 'file_size'>): string {
  return `${video.file_name ?? ''}|${video.file_size ?? ''}`;
}

const COPY_KEY = 'oneshoot.localcopy.v1';

function copies(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(COPY_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

/** This device's copy of a YouTube entry's file was made for the group file `identity`. */
export function markLocalCopy(videoId: string, identity: string | null): void {
  try {
    const all = copies();
    if (identity) all[videoId] = identity;
    else delete all[videoId];
    localStorage.setItem(COPY_KEY, JSON.stringify(all));
  } catch {
    /* this visit only */
  }
}

/**
 * True when this device's copy belongs to a file the group no longer uses (replaced or removed on another phone).
 * Copies made before this was tracked have no mark and are trusted.
 */
export function isStaleCopy(video: Pick<Video, 'id' | 'source' | 'file_name' | 'file_size'>): boolean {
  if (video.source !== 'youtube') return false;
  const mark = copies()[video.id];
  return mark != null && mark !== fileIdentity(video);
}
