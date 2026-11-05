import type { Video } from '@coverscape/shared';
import { useEffect, useState } from 'react';
import { forgetVideoUrl, isStaleCopy, markLocalCopy, signedVideoUrl } from '@/data/videos';
import { cloudCacheLimits, downloadCloudFile, loadCachedCloudFile, saveDataOn } from '@/lib/cloudCache';
import { downloadMayRun, shouldCacheCloudFile } from '@/lib/cloudCacheRules';
import { deleteLocalVideo, loadLocalVideo } from '@/lib/localVideos';
import { stageBuffer } from '@/player/stageBuffer';

/**
 * `local`: the device copy the picture plays from, when there is one (it can be sent to the cloud).
 * `cachedUrl`: the cloud file downloaded whole while it streamed (`cacheRemote`). REQ-15 · The stage never swaps a
 * playing video to it: it is the way back when the cloud file has to be reloaded anyway, and the next visit opens it.
 * `resign`: a fresh signed URL of the cloud file (the remembered one forgotten), for the stage's recovery.
 */
export type FileSource =
  | { status: 'loading' }
  | { status: 'missing' }
  | {
      status: 'ready';
      url: string;
      local?: Blob;
      cachedUrl?: string;
      resign?: () => Promise<string | null>;
    };

/**
 * The file a video plays from: this device's copy (uploaded or linked, F1), a copy of the group's cloud file kept on
 * this device (cloudCache.ts) or a signed URL of the cloud file. Shared by the studio stage and the review (F5),
 * which plays it with the file's offset. `cacheRemote`: download a streaming cloud file in the background (REQ-15 ·
 * only while the stage's video can spare the bandwidth, and straight to disk).
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
      const path = video.storage_path;
      // REQ-15 · A retry (the file didn't load) must not reuse the remembered URL.
      if (path && reloadKey > 0) forgetVideoUrl(path);
      // REQ-15 · Sign in parallel with the device lookups (the signature is remembered, and dropped when a copy on
      // this device wins), so a cloud-only file doesn't wait for IndexedDB first.
      const signing = path ? signedVideoUrl(path).catch(() => null) : Promise.resolve(null);
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
      if (path) {
        const cached = await loadCachedCloudFile(path);
        if (cancelled) return;
        if (cached) {
          setState({ status: 'ready', url: urlFor(cached) });
          return;
        }
        const url = await signing;
        if (cancelled) return;
        if (url) {
          // REQ-15 · A token that expired mid-rehearsal, or a stall that outlived the connection: sign again.
          const resign = () => {
            forgetVideoUrl(path);
            return signedVideoUrl(path);
          };
          setState({ status: 'ready', url, resign });
          if (
            cacheRemote &&
            shouldCacheCloudFile({
              url,
              bytes: video.file_size ?? null,
              saveData: saveDataOn(),
              limits: cloudCacheLimits(),
            })
          ) {
            const whole = await downloadCloudFile(path, url, { mayRun: () => downloadMayRun(stageBuffer()) });
            if (cancelled || !whole) return;
            setState({ status: 'ready', url, cachedUrl: urlFor(whole), resign });
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
  }, [
    video.id,
    video.source,
    video.storage_path,
    video.file_name,
    video.file_size,
    reloadKey,
    enabled,
    cacheRemote,
  ]);

  return state;
}
