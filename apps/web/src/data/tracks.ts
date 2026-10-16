import type { Track } from '@coverscape/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  bagsBackend,
  type TrackItemView,
  type TrackOptionsRow,
  type TrackPatch,
  type TrackWithCount,
} from '@/lib/backend';
import type { RoundOptions } from '@/features/rpd/roundRules';

export type { TrackItemView, TrackWithCount } from '@/lib/backend';

/** F14 · Pistas guardadas: Random Play Dance rounds kept by the group, in order. */
export const trackKeys = {
  all: ['tracks'] as const,
  detail: (id: string | undefined) => ['track', id] as const,
  items: (id: string | undefined) => ['track-items', id] as const,
};

export function optionsRow(options: RoundOptions): TrackOptionsRow {
  return {
    pause_seconds: options.pauseSeconds,
    countdown: options.countdown,
    use_clip_settings: options.useClipSettings,
    title_mode: options.titleMode,
  };
}

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
  return useQuery({
    queryKey: trackKeys.detail(id),
    enabled: Boolean(id),
    queryFn: () => bagsBackend.getTrack(id!),
  });
}

export function useTrackItems(id: string | undefined) {
  return useQuery({
    queryKey: trackKeys.items(id),
    enabled: Boolean(id),
    queryFn: () => bagsBackend.listTrackItems(id!),
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
    mutationFn: ({
      patches,
    }: {
      trackId: string;
      ordered: TrackItemView[];
      patches: { id: string; position: number }[];
    }) => bagsBackend.setTrackPositions(patches),
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
