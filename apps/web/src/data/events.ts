import type { CrewEvent } from '@coverscape/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { bagKeys } from '@/data/bags';
import { optionsRow, trackKeys } from '@/data/tracks';
import { appendPositions, chorusClips, uniqueName } from '@/features/events/eventRules';
import { DEFAULT_ROUND_OPTIONS } from '@/features/rpd/roundRules';
import {
  bagsBackend,
  eventsBackend,
  type EventPatch,
  type EventSongView,
  type EventWithCount,
  type NewEvent,
} from '@/lib/backend';
import { friendlyError, FriendlyError } from '@/lib/supabase';

export type { EventSongView, EventWithCount } from '@/lib/backend';

/** F16 · Events (name, date and time, place) and their repertoire. Shared by the group; deleting archives. */
export const eventKeys = {
  all: ['events'] as const,
  detail: (id: string | undefined) => ['event', id] as const,
  songs: (id: string | undefined) => ['event-songs', id] as const,
};

/** Event errors in the group's words (falls back to the app's general mapping). */
export function eventError(error: unknown): string {
  if (error instanceof FriendlyError) return error.message;
  const message =
    typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : '';
  if (/events_name_check/.test(message)) return 'El nombre no puede quedar vacío (hasta 80 letras).';
  if (/events_place_check/.test(message)) return 'El lugar admite hasta 120 letras.';
  if (/event_songs_once_key/.test(message)) return 'Esa canción ya está en el repertorio.';
  if (/event_song_invalid/.test(message)) return 'Esa canción ya no está en la biblioteca.';
  if (/event_not_found/.test(message)) return 'Este evento ya no existe: otro móvil lo ha borrado.';
  if (/event_songs_position_check/.test(message)) return 'Un repertorio admite hasta 1000 canciones.';
  if (/(events|event_songs)_cap_reached|row_cap/.test(message)) return 'Se ha llegado al máximo. Borra algo antes.';
  return friendlyError(error);
}

export function useEvents() {
  return useQuery({ queryKey: eventKeys.all, queryFn: () => eventsBackend.listEvents() });
}

export function useEvent(id: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: eventKeys.detail(id),
    enabled: Boolean(id),
    queryFn: () => eventsBackend.getEvent(id!),
    // The list already has it: show it at once.
    initialData: () => queryClient.getQueryData<EventWithCount[]>(eventKeys.all)?.find((e) => e.id === id),
  });
}

export function useEventSongs(id: string | undefined) {
  return useQuery({
    queryKey: eventKeys.songs(id),
    enabled: Boolean(id),
    queryFn: () => eventsBackend.listEventSongs(id!),
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (row: NewEvent) => eventsBackend.insertEvent(row),
    onSuccess: (event) => {
      queryClient.setQueryData<EventWithCount[]>(eventKeys.all, (current) =>
        current ? [...current, { ...event, songs: 0 }] : current,
      );
      queryClient.setQueryData(eventKeys.detail(event.id), event);
      void queryClient.invalidateQueries({ queryKey: eventKeys.all });
    },
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: EventPatch }) => eventsBackend.updateEvent(id, patch),
    onSuccess: (event: CrewEvent) => {
      queryClient.setQueryData(eventKeys.detail(event.id), event);
      queryClient.setQueryData<EventWithCount[]>(eventKeys.all, (current) =>
        current?.map((e) => (e.id === event.id ? { ...e, ...event } : e)),
      );
    },
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (event: Pick<CrewEvent, 'id'>) => {
      await eventsBackend.deleteEvent(event.id);
      return event;
    },
    onSuccess: (event) => {
      queryClient.setQueryData<EventWithCount[]>(eventKeys.all, (current) => current?.filter((e) => e.id !== event.id));
      queryClient.removeQueries({ queryKey: eventKeys.detail(event.id) });
      queryClient.removeQueries({ queryKey: eventKeys.songs(event.id) });
    },
  });
}

function settleSongs(queryClient: QueryClient, eventId: string) {
  void queryClient.invalidateQueries({ queryKey: eventKeys.songs(eventId) });
  void queryClient.invalidateQueries({ queryKey: eventKeys.all });
}

export function useAddEventSongs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, videoIds, current }: { eventId: string; videoIds: string[]; current: EventSongView[] }) =>
      eventsBackend.insertEventSongs(eventId, videoIds, appendPositions(current, videoIds.length)),
    onSettled: (_data, _error, { eventId }) => settleSongs(queryClient, eventId),
  });
}

export function useRemoveEventSong() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (song: Pick<EventSongView, 'id' | 'event_id'>) => {
      await eventsBackend.deleteEventSong(song.id);
      return song;
    },
    onMutate: async (song) => {
      const key = eventKeys.songs(song.event_id);
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<EventSongView[]>(key, (current) => current?.filter((s) => s.id !== song.id));
    },
    onSettled: (_data, _error, song) => settleSongs(queryClient, song.event_id),
  });
}

/** A new order: the cache shows it at once; only the positions that changed go to the server. */
export function useReorderEventSongs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['event-reorder'],
    mutationFn: ({ patches }: { eventId: string; ordered: EventSongView[]; patches: { id: string; position: number }[] }) =>
      eventsBackend.setEventSongPositions(patches),
    onMutate: async ({ eventId, ordered }) => {
      const key = eventKeys.songs(eventId);
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<EventSongView[]>(
        key,
        ordered.map((song, position) => ({ ...song, position })),
      );
    },
    onSettled: (_data, _error, { eventId }) => {
      // Only the last of a burst of moves refetches, so quick drags never jump back mid-way.
      if (queryClient.isMutating({ mutationKey: ['event-reorder'] }) <= 1) settleSongs(queryClient, eventId);
    },
  });
}

/** F16 → F13 · «Crear bolsa de candidatas»: a bag of songs with the repertoire (it «se quita» when drawn). */
export function useCreateCandidatesBag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ event, songs }: { event: Pick<CrewEvent, 'name'>; songs: EventSongView[] }) => {
      const videoIds = songs.filter((s) => s.video).map((s) => s.video_id);
      if (!videoIds.length) throw new FriendlyError('Añade canciones al repertorio antes de crear la bolsa.');
      const taken = (await bagsBackend.listBags()).map((b) => b.name);
      const bag = await bagsBackend.insertBag({
        name: uniqueName(`Candidatas · ${event.name}`, taken, 60),
        kind: 'songs',
        draw_mode: 'remove',
        no_repeat: false,
      });
      try {
        // One by one: each row is checked on its own (a song archived meanwhile only skips itself).
        for (const video_id of videoIds) await bagsBackend.insertBagItem({ bag_id: bag.id, video_id });
      } catch (err) {
        await bagsBackend.deleteBag(bag.id).catch(() => undefined);
        throw err;
      }
      return bag;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: bagKeys.all }),
  });
}

/** F16 → F14 · «Crear pista con los estribillos»: a Random Play Dance track with the repertoire's choruses. */
export function useCreateChorusTrack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ event, songs }: { event: Pick<CrewEvent, 'name'>; songs: EventSongView[] }) => {
      const all = await bagsBackend.listAllClips();
      const clips = chorusClips(
        songs.filter((s) => s.video).map((s) => s.video_id),
        all,
      );
      if (!clips.length) {
        throw new FriendlyError('Las canciones del repertorio aún no tienen clips. Marca los estribillos en el estudio.');
      }
      const taken = (await bagsBackend.listTracks()).map((t) => t.name);
      return bagsBackend.insertTrack(
        { name: uniqueName(`Estribillos · ${event.name}`, taken, 80), ...optionsRow(DEFAULT_ROUND_OPTIONS) },
        clips.map((c) => c.id),
      );
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: trackKeys.all }),
  });
}
