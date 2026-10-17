import { hasLinkedFile, type Video } from '@coverscape/shared';
import { useEffect, useState } from 'react';
import { isStaleCopy, markLocalCopy, signedVideoUrl } from '@/data/videos';
import { deleteLocalVideo, loadLocalVideo } from '@/lib/localVideos';

/**
 * What plays a clip's song in a round: its own file when there is one (F1: no ads, no waiting), from this device
 * or the group's cloud, else the YouTube player. The same choice as the studio's file stage (the studio's
 * `useFileSource` lives inside its page), kept minimal: no «send to cloud», no relinking.
 *
 * Resolved once per song for the whole round and shared, so the hidden preloader of the next clip and the stage
 * that plays it use the very same URL (the browser reuses what it already buffered). `releaseClipSources` frees
 * the device copies when the round screen closes.
 */
export type ClipSource =
  | { status: 'loading' }
  | { status: 'youtube'; youtubeId: string }
  | { status: 'file'; url: string; offset: number }
  | { status: 'missing' };

type Playable = Pick<
  Video,
  'id' | 'source' | 'youtube_id' | 'storage_path' | 'file_name' | 'file_size' | 'file_offset_seconds'
>;

const cache = new Map<string, Promise<ClipSource>>();
const objectUrls = new Set<string>();

function cacheKey(video: Playable): string {
  return [
    video.id,
    video.source,
    video.youtube_id,
    video.storage_path,
    video.file_name,
    video.file_size,
  ].join('|');
}

/** `lasting`: false when the file was wanted but couldn't be reached this time (a signed URL that failed…). */
async function resolveSource(video: Playable): Promise<{ source: ClipSource; lasting: boolean }> {
  const fallback: ClipSource = video.youtube_id
    ? { status: 'youtube', youtubeId: video.youtube_id }
    : { status: 'missing' };
  const wantsFile = video.source === 'upload' || hasLinkedFile(video);
  if (!wantsFile) return { source: fallback, lasting: true };
  const offset = video.source === 'youtube' ? Number(video.file_offset_seconds ?? 0) : 0;
  try {
    const blob = await loadLocalVideo(video.id);
    const stale = blob != null && isStaleCopy(video);
    if (stale) {
      await deleteLocalVideo(video.id).catch(() => undefined);
      markLocalCopy(video.id, null);
    }
    if (blob && !stale) {
      const url = URL.createObjectURL(blob);
      objectUrls.add(url);
      return { source: { status: 'file', url, offset }, lasting: true };
    }
    if (!video.storage_path) return { source: fallback, lasting: true };
    const url = await signedVideoUrl(video.storage_path);
    if (url) return { source: { status: 'file', url, offset }, lasting: true };
  } catch {
    /* fall back below */
  }
  return { source: fallback, lasting: false };
}

export function clipSourceFor(video: Playable): Promise<ClipSource> {
  const key = cacheKey(video);
  let pending = cache.get(key);
  if (!pending) {
    const attempt: Promise<ClipSource> = resolveSource(video).then(({ source, lasting }) => {
      // A failure that may pass is not kept: the next clip of this song (or «Otra vez») asks again.
      if (!lasting && cache.get(key) === attempt) cache.delete(key);
      return source;
    });
    pending = attempt;
    cache.set(key, pending);
  }
  return pending;
}

/** The round screen closed: forget the resolved sources and free the device copies' URLs. */
export function releaseClipSources(): void {
  cache.clear();
  for (const url of objectUrls) URL.revokeObjectURL(url);
  objectUrls.clear();
}

export function useClipSource(video: Playable | null | undefined): ClipSource {
  const [state, setState] = useState<{ key: string; source: ClipSource } | null>(null);
  const key = video ? cacheKey(video) : null;

  useEffect(() => {
    if (!video || !key) return;
    let cancelled = false;
    void clipSourceFor(video).then((source) => {
      if (!cancelled) setState({ key, source });
    });
    return () => {
      cancelled = true;
    };
    // `key` stands for the fields of `video` that matter.
  }, [key]);

  return state && state.key === key ? state.source : { status: 'loading' };
}
