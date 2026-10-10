import { MAX_CLOUD_UPLOAD_BYTES, round3, youTubeThumbnail, type TablesUpdate, type Video } from '@coverscape/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { backend, type VideoWithClipCount } from '@/lib/backend';
import { deleteLocalVideo, saveLocalVideo } from '@/lib/localVideos';

export type { VideoWithClipCount };

export const videoKeys = {
  list: (crewId: string | undefined) => ['videos', crewId] as const,
  detail: (id: string | undefined) => ['video', id] as const,
};

export function useVideos(crewId: string | undefined) {
  return useQuery({
    queryKey: videoKeys.list(crewId),
    enabled: Boolean(crewId),
    queryFn: () => backend.listVideos(crewId!),
  });
}

export function useVideo(id: string | undefined) {
  return useQuery({
    queryKey: videoKeys.detail(id),
    enabled: Boolean(id),
    queryFn: () => backend.getVideo(id!),
  });
}

function fileExtension(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
  return ext || 'mp4';
}

function uploadToGroup(crewId: string, videoId: string, file: File): Promise<string | null> {
  if (file.size > MAX_CLOUD_UPLOAD_BYTES) return Promise.resolve(null);
  return backend.uploadFile(`${crewId}/${videoId}.${fileExtension(file.name)}`, file);
}

export interface CreateVideoInput {
  crewId: string;
  title: string;
  artist?: string | null;
  youtubeId?: string;
  file?: File;
  duration?: number | null;
  poster?: string | null;
}

export interface CreateVideoResult {
  video: Video;
  /** For uploads: whether the file reached cloud storage (false → device only). */
  synced: boolean;
}

export function useCreateVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateVideoInput): Promise<CreateVideoResult> => {
      const id = crypto.randomUUID();
      const base = {
        id,
        crew_id: input.crewId,
        title: input.title.trim(),
        artist: input.artist?.trim() || null,
        duration_seconds: input.duration ? round3(input.duration) : null,
      };

      if (input.file) {
        await saveLocalVideo(id, input.file);
        const storagePath = await uploadToGroup(input.crewId, id, input.file);
        try {
          const video = await backend.insertVideo({
            ...base,
            source: 'upload',
            file_name: input.file.name,
            file_size: input.file.size,
            storage_path: storagePath,
            thumbnail_url: input.poster ?? null,
          });
          return { video, synced: Boolean(storagePath) };
        } catch (error) {
          await deleteLocalVideo(id);
          if (storagePath) await backend.removeFile(storagePath);
          throw error;
        }
      }

      if (!input.youtubeId) throw new Error('Falta el enlace de YouTube.');
      const video = await backend.insertVideo({
        ...base,
        source: 'youtube',
        youtube_id: input.youtubeId,
        thumbnail_url: youTubeThumbnail(input.youtubeId),
      });
      return { video, synced: true };
    },
    onSuccess: ({ video }) => {
      queryClient.setQueryData(videoKeys.detail(video.id), video);
      return queryClient.invalidateQueries({ queryKey: videoKeys.list(video.crew_id) });
    },
  });
}

export function useUpdateVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TablesUpdate<'videos'> }) => backend.updateVideo(id, patch),
    onSuccess: (video) => {
      queryClient.setQueryData(videoKeys.detail(video.id), video);
      return queryClient.invalidateQueries({ queryKey: videoKeys.list(video.crew_id) });
    },
  });
}

export function useDeleteVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (video: Video) => {
      await backend.deleteVideo(video);
      if (video.storage_path) await backend.removeFile(video.storage_path);
      await deleteLocalVideo(video.id).catch(() => undefined);
      return video;
    },
    onSuccess: (video) => {
      queryClient.removeQueries({ queryKey: videoKeys.detail(video.id) });
      void queryClient.invalidateQueries({ queryKey: ['quick-clips', video.crew_id] });
      return queryClient.invalidateQueries({ queryKey: videoKeys.list(video.crew_id) });
    },
  });
}

/** Attaches a local copy of an uploaded video on this device (and syncs it if the group has none). */
export function useLinkLocalFile() {
  const update = useUpdateVideo();
  return useMutation({
    mutationFn: async ({ video, file }: { video: Video; file: File }) => {
      await saveLocalVideo(video.id, file);
      if (!video.storage_path) {
        const storagePath = await uploadToGroup(video.crew_id, video.id, file);
        if (storagePath) await update.mutateAsync({ id: video.id, patch: { storage_path: storagePath } });
      }
    },
  });
}

export function signedVideoUrl(path: string): Promise<string | null> {
  return backend.signedUrl(path);
}
