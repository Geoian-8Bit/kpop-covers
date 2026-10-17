import type { Video } from '@coverscape/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { registerStems, type StemSources } from '@/features/voice/stems';
import { pickStems } from '@/features/voice/voiceRules';
import { stemsBackend, type VideoStems } from '@/lib/backend';

/** 18 · The separations (AI) of a song's file, shared by the group. */
export const stemKeys = {
  forVideo: (videoId: string | undefined) => ['video-stems', videoId] as const,
  sources: (stemsId: string | undefined) => ['video-stems-urls', stemsId] as const,
};

export function useVideoStems(videoId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: stemKeys.forVideo(videoId),
    enabled: Boolean(videoId) && enabled,
    queryFn: () => stemsBackend.listStems(videoId!),
    staleTime: 60_000,
  });
}

/** The separation that goes with the video's current file (newest complete one of the same file), or null. */
export function useCurrentStems(video: Pick<Video, 'id' | 'file_name' | 'file_size'>, enabled = true): VideoStems | null {
  const rows = useVideoStems(video.id, enabled);
  return rows.data ? pickStems(video, rows.data) : null;
}

/** Signed URLs (6 h) of a separation's two tracks. */
export function useStemSources(stems: VideoStems | null): StemSources | null {
  const urls = useQuery({
    queryKey: stemKeys.sources(stems?.id),
    enabled: Boolean(stems?.vocals_path && stems?.instrumental_path),
    // Renewed well before the signature expires.
    staleTime: 4 * 60 * 60 * 1000,
    queryFn: async (): Promise<StemSources | null> => {
      const [instrumental, vocals] = await Promise.all([
        stemsBackend.signedStemUrl(stems!.instrumental_path!),
        stemsBackend.signedStemUrl(stems!.vocals_path!),
      ]);
      return instrumental && vocals ? { instrumental, vocals, delay: Number(stems!.delay_seconds) || 0 } : null;
    },
  });
  return urls.data ?? null;
}

/**
 * The studio's stage: while the file at `mediaUrl` plays, «Sin voz» and «Voz» use its separated tracks if the
 * group has them (the voice graph picks them up by the element's src). Nothing for YouTube: its terms forbid
 * separating or modifying its audio, and its sound can't be reached anyway.
 */
export function useStageStems(video: Video, mediaUrl: string | null): void {
  const stems = useCurrentStems(video, mediaUrl != null);
  const sources = useStemSources(stems);
  useEffect(() => {
    if (!mediaUrl || !sources) return;
    return registerStems(mediaUrl, sources);
  }, [mediaUrl, sources]);
}

/**
 * «Quitar las pistas separadas»: archives (deleting = archiving) every complete separation of the video's current
 * file, so «Sin voz» and «Voz» go back to the approximate split on every phone and the song can be separated again.
 * The tracks stay in the bucket (only the admin purges) but stop being readable.
 */
export function useRemoveStems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (video: Pick<Video, 'id' | 'file_name' | 'file_size'>) => {
      const rows = await stemsBackend.listStems(video.id);
      const ofThisFile = rows.filter(
        (r) =>
          r.vocals_path &&
          r.instrumental_path &&
          r.source_file_name === video.file_name &&
          Number(r.source_file_size) === Number(video.file_size),
      );
      // One request per row: the database refuses bulk deletes from the app.
      for (const row of ofThisFile) await stemsBackend.deleteStems(row.id);
      return ofThisFile.map((r) => r.id);
    },
    onSuccess: (ids, video) => {
      queryClient.setQueryData<VideoStems[]>(stemKeys.forVideo(video.id), (current) => current?.filter((s) => !ids.includes(s.id)));
      void queryClient.invalidateQueries({ queryKey: stemKeys.forVideo(video.id) });
    },
  });
}

/** After a new separation: everyone on this device sees it at once. */
export function useRefreshStems() {
  const queryClient = useQueryClient();
  return (videoId: string, row?: VideoStems) => {
    if (row) {
      queryClient.setQueryData<VideoStems[]>(stemKeys.forVideo(videoId), (current = []) => [
        row,
        ...current.filter((s) => s.id !== row.id),
      ]);
    }
    void queryClient.invalidateQueries({ queryKey: stemKeys.forVideo(videoId) });
  };
}
