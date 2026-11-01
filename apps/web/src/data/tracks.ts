import type { Track } from '@coverscape/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  bagsBackend,
  type TrackItemView,
  type TrackPatch,
  type TrackWithCount,
} from '@/lib/backend/bags';
import type { PlayableVideo } from '@/lib/backend/bags';
import type { RoundOptions } from '@/features/rpd/roundRules';
import { writePositions } from './positionsRetry';
import { optionsRow, trackKeys, videoPlayKey } from './trackKeys';

export { optionsRow, trackKeys, videoPlayKey };

export type { TrackItemView, TrackWithCount } from '@/lib/backend/bags';

/** Only the columns of the options that changed. */
export function optionsPatch(patch: Partial<RoundOptions>): TrackPatch {
  const row: TrackPatch = {};
  if (patch.pauseSeconds != null) row.pause_seconds = patch.pauseSeconds;
  if (patch.countdown != null) row.countdown = patch.countdown;
  if (patch.useClipSettings != null) row.use_clip_settings = patch.useClipSettings;
  if (patch.titleMode != null) row.title_mode = patch.titleMode;
  return row;
}

export function useTracks() {
  return useQuery({ queryKey: trackKeys.all, queryFn: () => bagsBackend.listTracks() });
}

export function useTrack(id: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: trackKeys.detail(id),
    enabled: Boolean(id),
    queryFn: () => bagsBackend.getTrack(id!),
    // REQ-18 · The list already has it: show it at once, as useEvent does.
    initialData: () => queryClient.getQueryData<TrackWithCount[]>(trackKeys.all)?.find((t) => t.id === id),
    // The list's age, so a stale list doesn't make the detail count as fresh (it was fetched on mount before).
    initialDataUpdatedAt: () => queryClient.getQueryState(trackKeys.all)?.dataUpdatedAt,
  });
}



/**
 * The round being warmed, so the first song's query waits for it instead of asking for its own row and signature.
 * `settled` once it ended: from then on every run of a song's query reads the server's row.
 */
type RoundWarm = { asked: ReadonlySet<string>; done: Promise<void>; settled: boolean };
let roundWarm: RoundWarm | null = null;

/**
 * REQ-19 · When a round starts: ONE request for all its songs' playable columns (seeding `['video-play', id]`) and
 * ONE batch signature for their files (seeding the memory of REQ-15), instead of a row and a signature per song
 * as the round goes. A failure only leaves each song to ask for itself, as before.
 */
export function prefetchRound(queryClient: QueryClient, videoIds: readonly string[]): Promise<void> {
  const ids = [...new Set(videoIds)]
    .filter((id) => queryClient.getQueryData(videoPlayKey(id)) == null)
    .sort();
  if (!ids.length) return Promise.resolve();
  // REQ-19 · An id the request did not seed (archived or gone) stays uncached; without this memory every re-run of
  // the caller's effect would ask again and leave the round unsettled, making songs wait for a warm-up already tried.
  if (roundWarm && ids.every((id) => roundWarm!.asked.has(id))) return roundWarm.done;
  const warm: RoundWarm = { asked: new Set(ids), done: Promise.resolve(), settled: false };
  warm.done = (async () => {
    try {
      const videos = await bagsBackend.listPlayableVideos(ids);
      for (const video of videos) queryClient.setQueryData<PlayableVideo>(videoPlayKey(video.id), video);
      const paths = videos.flatMap((v) => (v.storage_path ? [v.storage_path] : []));
      if (paths.length) await bagsBackend.signVideoFiles(paths);
    } catch {
      /* each song asks for its own row and signature */
    } finally {
      warm.settled = true;
    }
  })();
  roundWarm = warm;
  return warm.done;
}

/** The playable columns of one song, from the server (null once it's archived or gone). */
async function fetchPlayable(id: string): Promise<PlayableVideo | null> {
  return (await bagsBackend.listPlayableVideos([id]))[0] ?? null;
}

/**
 * A song of a round: the row `prefetchRound` brought (used once, by the run that waited for it); every other run
 * reads the server's row, so a file linked or uploaded meanwhile, or an archive, reaches the round as it did with
 * the full row before (the writes that touch `['video', id]` invalidate `['video-play', id]` too).
 */
export function roundVideoQuery(queryClient: QueryClient, id: string | undefined) {
  return {
    queryKey: videoPlayKey(id),
    queryFn: async (): Promise<PlayableVideo | null> => {
      const warming = roundWarm;
      if (warming && !warming.settled) {
        await warming.done;
        const seeded = queryClient.getQueryData<PlayableVideo>(videoPlayKey(id));
        if (seeded) return seeded;
      }
      return fetchPlayable(id!);
    },
  };
}

export function useRoundVideo(id: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery({ ...roundVideoQuery(queryClient, id), enabled: Boolean(id) });
}

export function useTrackItems(id: string | undefined) {
  return useQuery({
    queryKey: trackKeys.items(id),
    enabled: Boolean(id),
    queryFn: () => bagsBackend.listTrackItems(id!),
  });
}

/** REQ-18 · A press on a track's row: its clips start loading (the track itself comes from the list). */
export function prefetchTrack(queryClient: QueryClient, id: string): void {
  void queryClient.prefetchQuery({
    queryKey: trackKeys.items(id),
    queryFn: () => bagsBackend.listTrackItems(id),
  });
}

export function useCreateTrack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, options, clipIds }: { name: string; options: RoundOptions; clipIds: string[] }) =>
      bagsBackend.insertTrack({ name, ...optionsRow(options) }, clipIds),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: trackKeys.all }),
  });
}

export function useUpdateTrack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TrackPatch }) => bagsBackend.updateTrack(id, patch),
    onSuccess: (track: Track) => {
      queryClient.setQueryData(trackKeys.detail(track.id), track);
      void queryClient.invalidateQueries({ queryKey: trackKeys.all });
    },
  });
}

export function useDeleteTrack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (track: Pick<Track, 'id'>) => {
      await bagsBackend.deleteTrack(track.id);
      return track;
    },
    onSuccess: (track) => {
      queryClient.setQueryData<TrackWithCount[]>(trackKeys.all, (current) =>
        current?.filter((t) => t.id !== track.id),
      );
      queryClient.removeQueries({ queryKey: trackKeys.detail(track.id) });
      queryClient.removeQueries({ queryKey: trackKeys.items(track.id) });
    },
  });
}

function settleTrack(queryClient: ReturnType<typeof useQueryClient>, trackId: string) {
  void queryClient.invalidateQueries({ queryKey: trackKeys.items(trackId) });
  void queryClient.invalidateQueries({ queryKey: trackKeys.all });
}

export function useAddTrackItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ trackId, clipIds, from }: { trackId: string; clipIds: string[]; from: number }) =>
      bagsBackend.insertTrackItems(trackId, clipIds, from),
    onSettled: (_data, _error, { trackId }) => settleTrack(queryClient, trackId),
  });
}

export function useRemoveTrackItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (item: Pick<TrackItemView, 'id' | 'track_id'>) => {
      await bagsBackend.deleteTrackItem(item.id);
      return item;
    },
    onMutate: async (item) => {
      const key = trackKeys.items(item.track_id);
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<TrackItemView[]>(key, (current) => current?.filter((i) => i.id !== item.id));
    },
    onSettled: (_data, _error, item) => settleTrack(queryClient, item.track_id),
  });
}

/**
 * Writes a new order: the list as it should be (the cache shows it at once), and only the positions that changed
 * go to the server.
 */
export function useReorderTrack() {
  const queryClient = useQueryClient();
  return useMutation({
    // REQ-20 · One RPC with the whole list in its new order (it was one request per clip that moved); a clip
    // archived meanwhile on another phone is left out and the rest is ordered, as before (`writePositions`).
    mutationFn: ({
      trackId,
      ordered,
    }: {
      trackId: string;
      ordered: TrackItemView[];
    }) =>
      writePositions(
        ordered.map((item) => item.id),
        (ids) => bagsBackend.setTrackPositions(trackId, ids),
        async () => (await bagsBackend.listTrackItems(trackId)).map((item) => item.id),
        'track_positions_invalid',
      ),
    onMutate: async ({ trackId, ordered }) => {
      const key = trackKeys.items(trackId);
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<TrackItemView[]>(
        key,
        ordered.map((item, position) => ({ ...item, position })),
      );
    },
    onSettled: (_data, _error, { trackId }) => {
      // Only the last of a burst of moves refetches, so a quick series of drags never jumps back mid-way.
      if (queryClient.isMutating({ mutationKey: ['track-reorder'] }) <= 1) settleTrack(queryClient, trackId);
    },
    mutationKey: ['track-reorder'],
  });
}
