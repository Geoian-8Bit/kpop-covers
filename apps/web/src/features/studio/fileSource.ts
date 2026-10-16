import type { Video } from '@coverscape/shared';
import { useEffect, useState } from 'react';
import { isStaleCopy, markLocalCopy, signedVideoUrl } from '@/data/videos';
import { deleteLocalVideo, loadLocalVideo } from '@/lib/localVideos';

/** `local`: the device copy the picture plays from, when there is one (it can be sent to the cloud). */
export type FileSource = { status: 'loading' } | { status: 'missing' } | { status: 'ready'; url: string; local?: Blob };

/**
 * The file a video plays from: this device's copy (uploaded or linked, F1) or a signed URL of the group's cloud
 * copy. Shared by the studio stage and the review (F5), which plays it with the file's offset.
 */
export function useFileSource(video: Video, reloadKey: number, enabled: boolean): FileSource {
  const [state, setState] = useState<FileSource>({ status: 'loading' });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let objectUrl: string | null = null;
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
        objectUrl = URL.createObjectURL(blob);
        setState({ status: 'ready', url: objectUrl, local: blob });
        return;
      }
      if (video.storage_path) {
        const url = await signedVideoUrl(video.storage_path);
        if (cancelled) return;
        if (url) {
          setState({ status: 'ready', url });
          return;
        }
      }
      setState({ status: 'missing' });
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [video.id, video.source, video.storage_path, video.file_name, video.file_size, reloadKey, enabled]);

  return state;
}
