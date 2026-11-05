import { hasLinkedFile } from '@coverscape/shared';
import { useEffect, useState } from 'react';
import { forgetVideoUrl, isStaleCopy, markLocalCopy, signedVideoUrl } from '@/data/videos';
import type { PlayableVideo } from '@/lib/backend/bags';
import { deleteLocalVideo, loadLocalVideo } from '@/lib/localVideos';
import { lruGet, lruSet } from '@/lib/lru';

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

type Playable = PlayableVideo;

// REQ-29 · Capped far above a round's songs (the whole cache is dropped when the round closes anyway).
const CACHE_MAX = 200;
const cache = new Map<string, Promise<ClipSource>>();
const objectUrls = new Set<string>();
/** REQ-15 · The cloud path behind each signed URL handed out this round (the signature is remembered for hours). */
const signedPaths = new Map<string, string>();

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
  // REQ-15 · The signature starts together with the device lookup (it is dropped if a copy is there).
  const signing = video.storage_path ? signedVideoUrl(video.storage_path).catch(() => null) : null;
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
    if (!signing) return { source: fallback, lasting: true };
    const url = await signing;
    if (url) {
      signedPaths.set(url, video.storage_path!);
      return { source: { status: 'file', url, offset }, lasting: true };
    }
  } catch {
    /* fall back below */
  }
  return { source: fallback, lasting: false };
}

function clipSourceFor(video: Playable): Promise<ClipSource> {
  const key = cacheKey(video);
  let pending = lruGet(cache, key);
  if (!pending) {
    const attempt: Promise<ClipSource> = resolveSource(video).then(({ source, lasting }) => {
      // A failure that may pass is not kept: the next clip of this song (or «Otra vez») asks again.
      if (!lasting && cache.get(key) === attempt) cache.delete(key);
      return source;
    });
    pending = attempt;
    lruSet(cache, key, pending, CACHE_MAX);
  }
  return pending;
}

/**
 * REQ-15 · The song's file failed to play from `url`: if it was a remembered signature, forget it, so the next
 * round signs again (each round signed afresh before). This round keeps its source, as it did.
 */
export function forgetFailedClipSource(url: string): void {
  const path = signedPaths.get(url);
  if (path) forgetVideoUrl(path);
}

/** The round screen closed: forget the resolved sources and free the device copies' URLs. */
export function releaseClipSources(): void {
  cache.clear();
  signedPaths.clear();
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
