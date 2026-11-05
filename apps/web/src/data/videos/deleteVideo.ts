import type { Video } from '@coverscape/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { backend } from '@/lib/backend/core';
import { invalidateAfterArchive } from '../afterArchive';
import { videoPlayKey } from '../trackKeys';
import { videoKeys } from './queries';

// REQ-08 · Apart from `mutations.ts`: the library page deletes from the first screen, the rest (upload, link,
// replace) belongs to lazy screens, so the entry chunk carries only this.
const deleteLocalVideo = (id: string) => import('@/lib/localVideos').then((m) => m.deleteLocalVideo(id));

export function useDeleteVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (video: Pick<Video, 'id' | 'crew_id'>) => {
      // Server-side this archives the row; the group's cloud file is kept. Only this device's copy goes.
      await backend.deleteVideo(video);
      await deleteLocalVideo(video.id).catch(() => undefined);
      return video;
    },
    onSuccess: (video) => {
      queryClient.removeQueries({ queryKey: videoKeys.detail(video.id) });
      queryClient.removeQueries({ queryKey: videoPlayKey(video.id) });
      // The cache edit is exact: no need to download the whole library again.
      queryClient.setQueryData<{ id: string }[]>(videoKeys.list(video.crew_id), (current) =>
        current?.filter((v) => v.id !== video.id),
      );
      void queryClient.invalidateQueries({ queryKey: ['quick-clips', video.crew_id] });
      // Its clips leave Random Play Dance, bags, tracks and repertoires too.
      invalidateAfterArchive(queryClient);
    },
  });
}

/** Attaches a local copy of an uploaded video on this device (and syncs it if the group has none). */
