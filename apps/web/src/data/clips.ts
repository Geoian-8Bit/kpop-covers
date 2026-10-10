import type { Clip, ClipColor, TablesUpdate, Video } from '@coverscape/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type ClipVideo = Pick<Video, 'id' | 'title' | 'artist' | 'source' | 'youtube_id' | 'thumbnail_url'>;
export type ClipWithVideo = Clip & { video: ClipVideo | null };

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
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clips')
        .select('*')
        .eq('video_id', videoId!)
        .order('start_seconds', { ascending: true });
      if (error) throw error;
      return data as Clip[];
    },
  });
}

/** Pinned clips first, then most recent – the library's "quick access" row. */
export function useQuickClips(crewId: string | undefined) {
  return useQuery({
    queryKey: clipKeys.quick(crewId),
    enabled: Boolean(crewId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clips')
        .select('*, video:videos(id, title, artist, source, youtube_id, thumbnail_url)')
        .eq('crew_id', crewId!)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(14);
      if (error) throw error;
      return data as unknown as ClipWithVideo[];
    },
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
    mutationFn: async (clip: NewClip) => {
      const { data, error } = await supabase.from('clips').insert(clip).select().single();
      if (error) throw error;
      return data as Clip;
    },
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
    mutationFn: async ({ clip, patch }: { clip: Clip; patch: TablesUpdate<'clips'> }) => {
      const { data, error } = await supabase.from('clips').update(patch).eq('id', clip.id).select().single();
      if (error) throw error;
      return data as Clip;
    },
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
      const { error } = await supabase.from('clips').delete().eq('id', clip.id);
      if (error) throw error;
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
