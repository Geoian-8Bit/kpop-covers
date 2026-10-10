import { MAX_CLOUD_UPLOAD_BYTES, round3, youTubeThumbnail, type TablesUpdate, type Video } from '@coverscape/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteLocalVideo, saveLocalVideo } from '@/lib/localVideos';
import { supabase, VIDEO_BUCKET } from '@/lib/supabase';

export type VideoWithClipCount = Video & { clips: { count: number }[] };

export const videoKeys = {
  list: (crewId: string | undefined) => ['videos', crewId] as const,
  detail: (id: string | undefined) => ['video', id] as const,
};

export function useVideos(crewId: string | undefined) {
  return useQuery({
    queryKey: videoKeys.list(crewId),
    enabled: Boolean(crewId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('videos')
        .select('*, clips(count)')
        .eq('crew_id', crewId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as VideoWithClipCount[];
    },
  });
}

export function useVideo(id: string | undefined) {
  return useQuery({
    queryKey: videoKeys.detail(id),
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('videos').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data as Video | null;
    },
  });
}

function fileExtension(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
  return ext || 'mp4';
}

async function uploadToCrew(crewId: string, videoId: string, file: File): Promise<string | null> {
  if (file.size > MAX_CLOUD_UPLOAD_BYTES) return null;
  const path = `${crewId}/${videoId}.${fileExtension(file.name)}`;
  const { error } = await supabase.storage
    .from(VIDEO_BUCKET)
    .upload(path, file, { contentType: file.type || 'video/mp4', upsert: true });
  return error ? null : path;
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
        const storagePath = await uploadToCrew(input.crewId, id, input.file);
        const { data, error } = await supabase
          .from('videos')
          .insert({
            ...base,
            source: 'upload',
            file_name: input.file.name,
            file_size: input.file.size,
            storage_path: storagePath,
            thumbnail_url: input.poster ?? null,
          })
          .select()
          .single();
        if (error) {
          await deleteLocalVideo(id);
          if (storagePath) await supabase.storage.from(VIDEO_BUCKET).remove([storagePath]);
          throw error;
        }
        return { video: data as Video, synced: Boolean(storagePath) };
      }

      if (!input.youtubeId) throw new Error('Falta el enlace de YouTube.');
      const { data, error } = await supabase
        .from('videos')
        .insert({
          ...base,
          source: 'youtube',
          youtube_id: input.youtubeId,
          thumbnail_url: youTubeThumbnail(input.youtubeId),
        })
        .select()
        .single();
      if (error) throw error;
      return { video: data as Video, synced: true };
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
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<'videos'> }) => {
      const { data, error } = await supabase.from('videos').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return data as Video;
    },
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
      const { error } = await supabase.from('videos').delete().eq('id', video.id);
      if (error) throw error;
      if (video.storage_path) await supabase.storage.from(VIDEO_BUCKET).remove([video.storage_path]);
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

/** Attaches a local copy of an uploaded video on this device (and syncs it if the crew has none). */
export function useLinkLocalFile() {
  const update = useUpdateVideo();
  return useMutation({
    mutationFn: async ({ video, file }: { video: Video; file: File }) => {
      await saveLocalVideo(video.id, file);
      if (!video.storage_path) {
        const storagePath = await uploadToCrew(video.crew_id, video.id, file);
        if (storagePath) await update.mutateAsync({ id: video.id, patch: { storage_path: storagePath } });
      }
    },
  });
}

export async function signedVideoUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(VIDEO_BUCKET).createSignedUrl(path, 6 * 60 * 60);
  return error ? null : data.signedUrl;
}
