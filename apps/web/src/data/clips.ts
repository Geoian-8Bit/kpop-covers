import type { Clip, ClipColor, TablesUpdate } from '@coverscape/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { backend, type ClipWithVideo } from '@/lib/backend';

export type { ClipVideo, ClipWithVideo } from '@/lib/backend';

export const clipKeys = {
  forVideo: (videoId: string | undefined) => ['clips', videoId] as const,
  quick: (crewId: string | undefined) => ['quick-clips', crewId] as const,
};

/**
 * Traditional Japanese dye colours per clip (DB keys kept stable).
 * Static class strings so Tailwind can see them.
 */
export const CLIP_SWATCH: Record<ClipColor, { dot: string; soft: string; label: string }> = {
  wine: { dot: 'bg-enji-500', soft: 'bg-enji-500/20', label: 'Enji · granate' },
  plum: { dot: 'bg-murasaki', soft: 'bg-murasaki/20', label: 'Murasaki · púrpura' },
  orchid: { dot: 'bg-fuji', soft: 'bg-fuji/20', label: 'Fuji · glicinia' },
  rose: { dot: 'bg-sakura', soft: 'bg-sakura/20', label: 'Sakura · cerezo' },
  gold: { dot: 'bg-kin-400', soft: 'bg-kin-400/20', label: 'Kincha · oro' },
  teal: { dot: 'bg-rokusho', soft: 'bg-rokusho/20', label: 'Rokushō · verdín' },
};

export function useClips(videoId: string | undefined) {
  return useQuery({
    queryKey: clipKeys.forVideo(videoId),
    enabled: Boolean(videoId),
    queryFn: () => backend.listClips(videoId!),
  });
}

/** Pinned clips first, then most recent – the library's "quick access" row. */
export function useQuickClips(crewId: string | undefined) {
  return useQuery({
    queryKey: clipKeys.quick(crewId),
    enabled: Boolean(crewId),
    queryFn: (): Promise<ClipWithVideo[]> => backend.listQuickClips(crewId!),
  });
}

export interface NewClip {
  video_id: string;
  crew_id: string;
  name: string;
  start_seconds: number;
  end_seconds: number;
  speed: number;
  mirrored: boolean;
  color: ClipColor;
  is_pinned: boolean;
}

export function useCreateClip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (clip: NewClip) => backend.insertClip(clip),
    onSuccess: (clip) => {
      queryClient.setQueryData<Clip[]>(clipKeys.forVideo(clip.video_id), (current = []) =>
        [...current, clip].sort((a, b) => a.start_seconds - b.start_seconds),
      );
      void queryClient.invalidateQueries({ queryKey: ['videos', clip.crew_id] });
      return queryClient.invalidateQueries({ queryKey: clipKeys.quick(clip.crew_id) });
    },
  });
}

export function useUpdateClip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ clip, patch }: { clip: Clip; patch: TablesUpdate<'clips'> }) => backend.updateClip(clip.id, patch),
    onMutate: async ({ clip, patch }) => {
      const key = clipKeys.forVideo(clip.video_id);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Clip[]>(key);
      queryClient.setQueryData<Clip[]>(key, (current = []) =>
        current.map((c) => (c.id === clip.id ? ({ ...c, ...patch } as Clip) : c)),
      );
      return { previous, key };
    },
    onError: (_error, _vars, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous);
    },
    onSettled: (_data, _error, { clip }) => {
      void queryClient.invalidateQueries({ queryKey: clipKeys.forVideo(clip.video_id) });
      return queryClient.invalidateQueries({ queryKey: clipKeys.quick(clip.crew_id) });
    },
  });
}

export function useDeleteClip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (clip: Clip) => {
      await backend.deleteClip(clip.id);
      return clip;
    },
    onMutate: async (clip) => {
      const key = clipKeys.forVideo(clip.video_id);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Clip[]>(key);
      queryClient.setQueryData<Clip[]>(key, (current = []) => current.filter((c) => c.id !== clip.id));
      return { previous, key };
    },
    onError: (_error, _clip, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous);
    },
    onSettled: (_data, _error, clip) => {
      void queryClient.invalidateQueries({ queryKey: ['videos', clip.crew_id] });
      return queryClient.invalidateQueries({ queryKey: clipKeys.quick(clip.crew_id) });
    },
  });
}
