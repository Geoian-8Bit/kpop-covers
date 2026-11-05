import type { Clip, ClipColor, TablesUpdate } from '@coverscape/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { backend, type ClipWithVideo } from '@/lib/backend/core';
import { pendingOf, pendingReady, submitWrite } from '@/lib/pendingWrites';
import { overlayRows } from '@/lib/pendingWritesRules';
import { parseQuickClips, readSnapshot, writeSnapshot } from '@/lib/snapshot';
import { invalidateAfterArchive, invalidateClipPickers } from './afterArchive';
import { videoKeys, type VideoWithClipCount } from './videos';

export type { ClipWithVideo } from '@/lib/backend/core';

const clipKeys = {
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

const bySeconds = (a: Clip, b: Clip) => a.start_seconds - b.start_seconds;

/** A clip made on this device and still waiting to reach the server, with the database's defaults. */
function localClip(row: Record<string, unknown>): Clip {
  return {
    created_at: new Date().toISOString(),
    archived_at: null,
    created_by: null,
    follow_path_id: null,
    zoom_scale: 1,
    zoom_x: 0.5,
    zoom_y: 0.5,
    ...row,
  } as Clip;
}

/** The fetched clips with this device's waiting writes laid over them (a refetch never undoes them). */
function withPendingClips(list: Clip[], videoId: string): Clip[] {
  const out = overlayRows(list, pendingOf('clip'), {
    belongs: (data) => data.video_id === videoId,
    toRow: localClip,
  });
  return out === list ? list : [...out].sort(bySeconds);
}

/** What to refresh once a clip write reaches the server in the background. */
const clipLists = (clip: Pick<Clip, 'video_id' | 'crew_id'>, countChanges: boolean) => [
  clipKeys.forVideo(clip.video_id),
  clipKeys.quick(clip.crew_id),
  ['all-clips'],
  ...(countChanges ? [videoKeys.list(clip.crew_id)] : []),
];

const clipsQuery = (videoId: string | undefined) => ({
  queryKey: clipKeys.forVideo(videoId),
  queryFn: async ({ client }: { client: QueryClient }) => {
    const [list] = await Promise.all([backend.listClips(videoId!), pendingReady(client)]);
    return withPendingClips(list, videoId!);
  },
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
    placeholderData:
      snapshot && crewId
        ? () => readSnapshot(quickSnapshot(crewId), (v) => parseQuickClips(v, crewId))
        : undefined,
    queryFn: () => fetchQuickClips(crewId!),
  });
}

async function fetchQuickClips(crewId: string): Promise<ClipWithVideo[]> {
  const list = await backend.listQuickClips(crewId);
  writeSnapshot(quickSnapshot(crewId), list);
  return list;
}

/**
 * REQ-10 · Startup on the library with the group kept on this device: the quick access row is asked for before React
 * mounts (same key and function as `useQuickClips`, which joins the request and shows its snapshot meanwhile).
 */
export function prefetchQuickClips(queryClient: QueryClient, crewId: string | undefined): void {
  if (!crewId) return;
  void queryClient
    .prefetchQuery({ queryKey: clipKeys.quick(crewId), queryFn: () => fetchQuickClips(crewId) })
    .catch(() => undefined);
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
    // Offline too: the write goes to the pending queue instead of waiting, paused, for the network.
    networkMode: 'always',
    // The id is made here, so a write retried after a lost answer finds its row instead of making a second one.
    mutationFn: async (clip: NewClip) => {
      const row = { ...clip, id: crypto.randomUUID() };
      const outcome = await submitWrite<Clip | undefined>(queryClient, {
        kind: 'clip',
        action: 'create',
        id: row.id,
        data: row,
        invalidate: clipLists(row, true),
      });
      return (outcome.sent && outcome.result) || localClip(row);
    },
    onSuccess: (clip) => {
      queryClient.setQueryData<Clip[]>(clipKeys.forVideo(clip.video_id), (current = []) =>
        // A refetch while it was on its way may already show it (laid over from the queue).
        [...current.filter((c) => c.id !== clip.id), clip].sort(bySeconds),
      );
      // One more clip on the library card: a cache edit, not a download of the whole library.
      queryClient.setQueryData<VideoWithClipCount[]>(videoKeys.list(clip.crew_id), (current) =>
        current?.map((v) =>
          v.id === clip.video_id ? { ...v, clips: [{ count: (v.clips[0]?.count ?? 0) + 1 }] } : v,
        ),
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
    // Offline too: the write goes to the pending queue instead of waiting, paused, for the network.
    networkMode: 'always',
    mutationKey: CLIP_WRITE,
    mutationFn: async ({ clip, patch }: { clip: Clip; patch: TablesUpdate<'clips'> }) => {
      const outcome = await submitWrite<Clip>(queryClient, {
        kind: 'clip',
        action: 'update',
        id: clip.id,
        data: patch,
        invalidate: clipLists(clip, false),
      });
      return outcome.sent ? outcome.result : ({ ...clip, ...patch } as Clip);
    },
    onMutate: async ({ clip, patch }) => {
      const key = clipKeys.forVideo(clip.video_id);
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<Clip[]>(key)?.find((c) => c.id === clip.id);
      queryClient.setQueryData<Clip[]>(key, (current = []) => {
        const next = current.map((c) => (c.id === clip.id ? ({ ...c, ...patch } as Clip) : c));
        // An edited start moves the clip in the list (and the timeline), which run in song order.
        return patch.start_seconds === undefined
          ? next
          : next.sort((a, b) => a.start_seconds - b.start_seconds);
      });
      return { before, key };
    },
    onError: (_error, _vars, context) => {
      // Undo only this clip: restoring a whole snapshot would also undo the other taps of the burst.
      const before = context?.before;
      if (context && before) {
        queryClient.setQueryData<Clip[]>(context.key, (current) =>
          current
            ?.map((c) => (c.id === before.id ? before : c))
            .sort((a, b) => a.start_seconds - b.start_seconds),
        );
      }
    },
    onSettled: (_data, _error, { clip }) => settleBurst(queryClient, clip),
  });
}

export function useDeleteClip() {
  const queryClient = useQueryClient();
  return useMutation({
    // Offline too: the write goes to the pending queue instead of waiting, paused, for the network.
    networkMode: 'always',
    mutationKey: CLIP_WRITE,
    mutationFn: async (clip: Clip) => {
      await submitWrite(queryClient, {
        kind: 'clip',
        action: 'delete',
        id: clip.id,
        invalidate: clipLists(clip, true),
      });
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
