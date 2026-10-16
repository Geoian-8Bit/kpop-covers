import type { FollowPath } from '@coverscape/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { parseKeyframes } from '@/features/follow/followPath';
import { followBackend, type FollowPathPatch, type NewFollowPath } from '@/lib/backend';

/** F10 · The «recorridos» of a song (who can be followed), shared by the group. */
export const followKeys = { forVideo: (videoId: string | undefined) => ['follow-paths', videoId] as const };

/** Keyframes come back checked (sorted, inside the picture): a bad row can't break the zoom. */
const clean = (path: FollowPath): FollowPath => ({ ...path, keyframes: parseKeyframes(path.keyframes) });

export function useFollowPaths(videoId: string | undefined) {
  return useQuery({
    queryKey: followKeys.forVideo(videoId),
    enabled: Boolean(videoId),
    queryFn: async () => (await followBackend.listFollowPaths(videoId!)).map(clean),
  });
}

function useStore() {
  const queryClient = useQueryClient();
  return (path: FollowPath, remove = false) =>
    queryClient.setQueryData<FollowPath[]>(followKeys.forVideo(path.video_id), (current = []) =>
      remove
        ? current.filter((p) => p.id !== path.id)
        : [...current.filter((p) => p.id !== path.id), clean(path)],
    );
}

export function useCreateFollowPath() {
  const store = useStore();
  return useMutation({
    mutationFn: (row: NewFollowPath) => followBackend.insertFollowPath(row),
    onSuccess: (path) => store(path),
  });
}

export function useUpdateFollowPath() {
  const store = useStore();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: FollowPathPatch }) =>
      followBackend.updateFollowPath(id, patch),
    onSuccess: (path) => store(path),
  });
}

export function useDeleteFollowPath() {
  const store = useStore();
  return useMutation({
    mutationFn: async (path: FollowPath) => {
      await followBackend.deleteFollowPath(path.id);
      return path;
    },
    onSuccess: (path) => store(path, true),
  });
}
