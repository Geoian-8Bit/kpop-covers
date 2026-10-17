import type { Clip, ClipColor, TablesUpdate } from '@coverscape/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { backend, type ClipWithVideo } from '@/lib/backend';
import { parseQuickClips, readSnapshot, writeSnapshot } from '@/lib/snapshot';
import { invalidateAfterArchive, invalidateClipPickers } from './afterArchive';
import { videoKeys, type VideoWithClipCount } from './videos';

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

const clipsQuery = (videoId: string | undefined) => ({
  queryKey: clipKeys.forVideo(videoId),
  queryFn: () => backend.listClips(videoId!),
});

export function useClips(videoId: string | undefined) {
  return useQuery({ ...clipsQuery(videoId), enabled: Boolean(videoId) });
}

/** P3 · Warm a video's clips before the studio opens (no request when they're cached and fresh). */
export function prefetchClips(queryClient: QueryClient, videoId: string): void {
  void queryClient.prefetchQuery(clipsQuery(videoId));
}

const quickSnapshot = (crewId: string) => `quick-clips.${crewId}`;

/**
 * Pinned clips first, then most recent – the library's "quick access" row.
 * `snapshot`: P2 · while the first request runs, show the row kept from the last visit (`isPlaceholderData`).
 */
export function useQuickClips(crewId: string | undefined, { snapshot = false }: { snapshot?: boolean } = {}) {
  return useQuery({
    queryKey: clipKeys.quick(crewId),
    enabled: Boolean(crewId),
    placeholderData: snapshot && crewId ? () => readSnapshot(quickSnapshot(crewId), (v) => parseQuickClips(v, crewId)) : undefined,
    queryFn: async (): Promise<ClipWithVideo[]> => {
      const list = await backend.listQuickClips(crewId!);
      writeSnapshot(quickSnapshot(crewId!), list);
      return list;
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
    mutationFn: (clip: NewClip) => backend.insertClip(clip),
    onSuccess: (clip) => {
      queryClient.setQueryData<Clip[]>(clipKeys.forVideo(clip.video_id), (current = []) =>
        [...current, clip].sort((a, b) => a.start_seconds - b.start_seconds),
      );
      // One more clip on the library card: a cache edit, not a download of the whole library.
      queryClient.setQueryData<VideoWithClipCount[]>(videoKeys.list(clip.crew_id), (current) =>
        current?.map((v) => (v.id === clip.video_id ? { ...v, clips: [{ count: (v.clips[0]?.count ?? 0) + 1 }] } : v)),
      );
      // Not awaited: the dialog closes as soon as the clip is saved, the quick row refreshes behind it.
      void queryClient.invalidateQueries({ queryKey: clipKeys.quick(clip.crew_id) });
      // Random Play Dance and the bag pickers offer it right away.
      invalidateClipPickers(queryClient);
    },
  });
}

/** Refetch only after the last of a burst of taps settles, so the list never flickers back mid-burst. */
const CLIP_WRITE = ['clip-write'] as const;
/** A delete happened in the current burst: the library's clip counts need refreshing when it settles. */
let burstDeleted = false;

/**
 * Once the last write of a burst settles (success or not), the server is the truth again: refetch the
 * video's clips (undoes any optimistic edit that failed) and, after deletes, the library's clip counts.
 */
function settleBurst(queryClient: QueryClient, clip: Pick<Clip, 'video_id' | 'crew_id'>) {
  if (queryClient.isMutating({ mutationKey: CLIP_WRITE }) > 1) return;
  void queryClient.invalidateQueries({ queryKey: clipKeys.forVideo(clip.video_id) });
  void queryClient.invalidateQueries({ queryKey: clipKeys.quick(clip.crew_id) });
  invalidateClipPickers(queryClient);
  if (burstDeleted) {
    burstDeleted = false;
    void queryClient.invalidateQueries({ queryKey: videoKeys.list(clip.crew_id) });
    invalidateAfterArchive(queryClient);
  }
}

export function useUpdateClip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: CLIP_WRITE,
    mutationFn: ({ clip, patch }: { clip: Clip; patch: TablesUpdate<'clips'> }) => backend.updateClip(clip.id, patch),
    onMutate: async ({ clip, patch }) => {
      const key = clipKeys.forVideo(clip.video_id);
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<Clip[]>(key)?.find((c) => c.id === clip.id);
      queryClient.setQueryData<Clip[]>(key, (current = []) => {
        const next = current.map((c) => (c.id === clip.id ? ({ ...c, ...patch } as Clip) : c));
        // An edited start moves the clip in the list (and the timeline), which run in song order.
        return patch.start_seconds === undefined ? next : next.sort((a, b) => a.start_seconds - b.start_seconds);
      });
      return { before, key };
    },
    onError: (_error, _vars, context) => {
      // Undo only this clip: restoring a whole snapshot would also undo the other taps of the burst.
      const before = context?.before;
      if (context && before) {
        queryClient.setQueryData<Clip[]>(context.key, (current) =>
          current?.map((c) => (c.id === before.id ? before : c)).sort((a, b) => a.start_seconds - b.start_seconds),
        );
      }
    },
    onSettled: (_data, _error, { clip }) => settleBurst(queryClient, clip),
  });
}

export function useDeleteClip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: CLIP_WRITE,
    mutationFn: async (clip: Clip) => {
      await backend.deleteClip(clip.id);
      return clip;
    },
    onMutate: async (clip) => {
      burstDeleted = true;
      const key = clipKeys.forVideo(clip.video_id);
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<Clip[]>(key, (current = []) => current.filter((c) => c.id !== clip.id));
      return { key };
    },
    onError: (_error, clip, context) => {
      // Put back only this clip: a snapshot would resurrect the other clips deleted in the same burst.
      if (context) {
        queryClient.setQueryData<Clip[]>(context.key, (current = []) =>
          current.some((c) => c.id === clip.id)
            ? current
            : [...current, clip].sort((a, b) => a.start_seconds - b.start_seconds),
        );
      }
    },
    onSettled: (_data, _error, clip) => settleBurst(queryClient, clip),
  });
}
