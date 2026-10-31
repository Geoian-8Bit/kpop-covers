import type { Video } from '@coverscape/shared';
import { useEffect, useState } from 'react';
import { isStaleCopy, markLocalCopy, signedVideoUrl } from '@/data/videos';
import { downloadCloudFile, loadCachedCloudFile, saveDataOn } from '@/lib/cloudCache';
import { shouldCacheCloudFile } from '@/lib/cloudCacheRules';
import { deleteLocalVideo, loadLocalVideo } from '@/lib/localVideos';

/**
 * `local`: the device copy the picture plays from, when there is one (it can be sent to the cloud).
 * `cachedUrl`: the cloud file downloaded whole while it streamed (`cacheRemote`); the stage moves to it at a quiet
 * moment, so loops stop asking the network.
 */
export type FileSource =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; url: string; local?: Blob; cachedUrl?: string };

/**
 * The file a video plays from: this device's copy (uploaded or linked, F1), a copy of the group's cloud file kept on
 * this device (cloudCache.ts) or a signed URL of the cloud file. Shared by the studio stage and the review (F5),
 * which plays it with the file's offset. `cacheRemote`: download a streaming cloud file in the background.
 */
export function useFileSource(
  video: Video,
  reloadKey: number,
  enabled: boolean,
  opts: { cacheRemote?: boolean } = {},
): FileSource {
  const [state, setState] = useState<FileSource>({ status: 'loading' });
  const cacheRemote = Boolean(opts.cacheRemote);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const objectUrls: string[] = [];
    const urlFor = (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      objectUrls.push(url);
      return url;
    };
    setState({ status: 'loading' });

    void (async () => {
      const blob = await loadLocalVideo(video.id);
      if (cancelled) return;
      // F1: a copy left from a file that was since replaced (another size) is not this video's file any more.
      const stale = blob != null && isStaleCopy(video);
      if (stale) {
        await deleteLocalVideo(video.id).catch(() => undefined);
        markLocalCopy(video.id, null);
      }
      if (blob && !stale) {
        setState({ status: 'ready', url: urlFor(blob), local: blob });
        return;
      }
      const path = video.storage_path;
      if (path) {
        const cached = await loadCachedCloudFile(path);
        if (cancelled) return;
        if (cached) {
          setState({ status: 'ready', url: urlFor(cached) });
          return;
        }
        const url = await signedVideoUrl(path);
        if (cancelled) return;
        if (url) {
          setState({ status: 'ready', url });
          if (cacheRemote && shouldCacheCloudFile({ url, bytes: video.file_size ?? null, saveData: saveDataOn() })) {
            const whole = await downloadCloudFile(path, url);
            if (cancelled || !whole) return;
            setState({ status: 'ready', url, cachedUrl: urlFor(whole) });
          }
          return;
        }
      }
      setState({ status: 'missing' });
    })();

    return () => {
      cancelled = true;
      for (const url of objectUrls) URL.revokeObjectURL(url);
    };
  }, [video.id, video.source, video.storage_path, video.file_name, video.file_size, reloadKey, enabled, cacheRemote]);

  return state;
}
