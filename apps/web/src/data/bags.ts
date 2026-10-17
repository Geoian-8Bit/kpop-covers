import type { Bag, BagDraw, BagKind } from '@coverscape/shared';
import { useMutation, useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  backend,
  bagsBackend,
  type BagItemView,
  type BagPatch,
  type BagWithCount,
  type ClipWithVideo,
  type NewBag,
  type NewBagItem,
} from '@/lib/backend';
import { friendlyError } from '@/lib/supabase';
import { useCreateVideo, videoKeys } from './videos';

export type { BagItemView, BagWithCount, NewBag } from '@/lib/backend';

/**
 * F13 · Bolsas para sortear: shared by the group. The draw happens on the server (atomic); here only the cache
 * follows: after a draw or a «Quitar» / «Devolver» the bag's items and history are fetched again.
 */
export const bagKeys = {
  all: ['bags'] as const,
  items: (bagId: string | undefined) => ['bag-items', bagId] as const,
  draws: (bagId: string | undefined) => ['bag-draws', bagId] as const,
  allClips: ['all-clips'] as const,
};

/** Bag errors in the group's words (falls back to the app's general mapping). */
export function bagError(error: unknown): string {
  const message =
    typeof error === 'object' && error && 'message' in error
      ? String((error as { message: unknown }).message)
      : '';
  if (/bags_crew_name_key/.test(message)) return 'Ya hay una bolsa con ese nombre.';
  if (/bag_items_once_key|bag_items_youtube_once_key|bag_item_duplicate/.test(message))
    return 'Eso ya está en la bolsa.';
  if (/bag_items_youtube_fields|bag_items_youtube_id_check|bag_items_title_check/.test(message))
    return 'A esa canción le falta el título, o el enlace no es de un vídeo de YouTube.';
  if (/bag_item_invalid/.test(message)) return 'Eso ya no está en la biblioteca, o no va en esta bolsa.';
  if (/bag_not_found/.test(message)) return 'Esta bolsa ya no existe: otro móvil la ha borrado.';
  if (/track_not_found/.test(message)) return 'Esta pista ya no existe: otro móvil la ha borrado.';
  if (/track_item_invalid/.test(message)) return 'Uno de los clips ya no existe.';
  if (/bags_name_check|tracks_name_check/.test(message)) return 'El nombre no puede quedar vacío.';
  if (/tracks_pause_seconds_check/.test(message)) return 'La pausa va de 0 a 5 segundos.';
  if (/track_items_position_check/.test(message)) return 'Una pista admite hasta 1000 clips.';
  if (/bag_draw_direct/.test(message)) return 'El historial solo se escribe al sacar.';
  if (/(bags|bag_items|bag_draws|tracks|track_items)_cap_reached|row_cap/.test(message))
    return 'Se ha llegado al máximo. Borra algo antes.';
  return friendlyError(error);
}

export function useBags() {
  return useQuery({ queryKey: bagKeys.all, queryFn: () => bagsBackend.listBags() });
}

export function useBagItems(bagId: string | undefined) {
  return useQuery({
    queryKey: bagKeys.items(bagId),
    enabled: Boolean(bagId),
    queryFn: () => bagsBackend.listBagItems(bagId!),
  });
}

/** The items of several bags at once (the «Añadir a una bolsa» dialog marks where it already is). */
export function useBagsItems(bagIds: string[], enabled: boolean) {
  return useQueries({
    queries: bagIds.map((id) => ({
      queryKey: bagKeys.items(id),
      enabled,
      queryFn: () => bagsBackend.listBagItems(id),
    })),
  });
}

export function useBagDraws(bagId: string | undefined) {
  return useQuery({
    queryKey: bagKeys.draws(bagId),
    enabled: Boolean(bagId),
    queryFn: () => bagsBackend.listBagDraws(bagId!),
  });
}

/** Every clip of the group with its song (pickers and rounds). */
export function useAllClips(enabled = true) {
  return useQuery({
    queryKey: bagKeys.allClips,
    enabled,
    queryFn: (): Promise<ClipWithVideo[]> => bagsBackend.listAllClips(),
  });
}

function refreshBag(queryClient: QueryClient, bagId: string) {
  void queryClient.invalidateQueries({ queryKey: bagKeys.items(bagId) });
  void queryClient.invalidateQueries({ queryKey: bagKeys.draws(bagId) });
  void queryClient.invalidateQueries({ queryKey: bagKeys.all });
}

export function useCreateBag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (row: NewBag) => bagsBackend.insertBag(row),
    onSuccess: (bag) => {
      queryClient.setQueryData<BagWithCount[]>(bagKeys.all, (current) =>
        current ? [...current, { ...bag, items: 0 }] : current,
      );
      void queryClient.invalidateQueries({ queryKey: bagKeys.all });
    },
  });
}

export function useUpdateBag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: BagPatch }) => bagsBackend.updateBag(id, patch),
    onSuccess: (bag: Bag) => {
      queryClient.setQueryData<BagWithCount[]>(bagKeys.all, (current) =>
        current?.map((b) => (b.id === bag.id ? { ...b, ...bag } : b)),
      );
    },
  });
}

export function useDeleteBag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (bag: Pick<Bag, 'id'>) => {
      await bagsBackend.deleteBag(bag.id);
      return bag;
    },
    onSuccess: (bag) => {
      queryClient.setQueryData<BagWithCount[]>(bagKeys.all, (current) =>
        current?.filter((b) => b.id !== bag.id),
      );
      queryClient.removeQueries({ queryKey: bagKeys.items(bag.id) });
      queryClient.removeQueries({ queryKey: bagKeys.draws(bag.id) });
    },
  });
}

export function useAddBagItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (row: NewBagItem) => bagsBackend.insertBagItem(row),
    onSettled: (_data, _error, row) => refreshBag(queryClient, row.bag_id),
  });
}

export function useRemoveBagItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (item: Pick<BagItemView, 'id' | 'bag_id'>) => {
      await bagsBackend.deleteBagItem(item.id);
      return item;
    },
    onMutate: async (item) => {
      const key = bagKeys.items(item.bag_id);
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<BagItemView[]>(key, (current) => current?.filter((i) => i.id !== item.id));
    },
    onSettled: (_data, _error, item) => refreshBag(queryClient, item.bag_id),
  });
}

/** Takes an item out by hand, or puts it back. */
export function useSetItemOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ item, out }: { item: Pick<BagItemView, 'id' | 'bag_id'>; out: boolean }) =>
      bagsBackend.setBagItemOut(item.id, out),
    onMutate: async ({ item, out }) => {
      const key = bagKeys.items(item.bag_id);
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<BagItemView[]>(key, (current) =>
        current?.map((i) =>
          i.id === item.id ? { ...i, removed_at: out ? new Date().toISOString() : null } : i,
        ),
      );
    },
    onSettled: (_data, _error, { item }) => refreshBag(queryClient, item.bag_id),
  });
}

export function useRefillBag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bagId: string) => bagsBackend.refillBag(bagId),
    onSettled: (_data, _error, bagId) => refreshBag(queryClient, bagId),
  });
}

export interface DrawRequest {
  bagId: string;
  count: number;
  /** null: the bag's mode. */
  remove: boolean | null;
  memberId: string | null;
}

export function useDrawFromBag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: DrawRequest) => bagsBackend.drawFromBag(req.bagId, req.count, req.remove, req.memberId),
    onSettled: (_data, _error, req) => refreshBag(queryClient, req.bagId),
  });
}

/** «Quitar de la bolsa» / «Devolver» right after a draw. */
export function useSetDrawRemoved() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ draw, removed }: { draw: Pick<BagDraw, 'id' | 'item_id' | 'bag_id'>; removed: boolean }) =>
      bagsBackend.setDrawRemoved(draw, removed),
    onSettled: (_data, _error, { draw }) => refreshBag(queryClient, draw.bag_id),
  });
}

/** Display line for an item: its title and a smaller line under it. */
export function itemTitle(item: BagItemView): { title: string; sub: string } {
  if (item.video) return { title: item.video.title, sub: item.video.artist || 'Artista sin especificar' };
  if (item.wish) return { title: item.wish.title, sub: item.wish.artist || 'De la lista de deseos' };
  if (item.clip) return { title: item.clip.name, sub: item.clip.video?.title ?? '' };
  if (item.member) return { title: item.member.name, sub: 'Del grupo' };
  if (item.youtube_id)
    return {
      title: item.title ?? 'Canción de YouTube',
      sub: item.artist ? `${item.artist} · de YouTube` : 'De YouTube · no está en la biblioteca',
    };
  return { title: 'No disponible', sub: '' };
}

/** What an item points at, as an id (for «already in this bag»): a uuid, or the YouTube id of a YouTube song. */
export function itemRef(
  item: Pick<BagItemView, 'video_id' | 'clip_id' | 'member_id' | 'wish_id'> & { youtube_id?: string | null },
): string {
  return item.video_id ?? item.clip_id ?? item.member_id ?? item.wish_id ?? item.youtube_id ?? '';
}

/**
 * Point 28 · «Añadir a la biblioteca» for a YouTube song that came out of a bag: the library gets the video — or
 * the one already there is used (same YouTube id, never a copy) — and the bag item points at it. Same row, so the
 * history keeps it. Every other bag of the group holding that YouTube song is linked too (none keeps saying «no
 * está en la biblioteca»); a bag that already holds the library video just loses its YouTube copy.
 */
export function useAddBagSongToLibrary(crewId: string | undefined) {
  const queryClient = useQueryClient();
  const createVideo = useCreateVideo();
  return useMutation({
    mutationFn: async (
      item: Pick<BagItemView, 'id' | 'bag_id' | 'youtube_id' | 'title' | 'artist' | 'duration_seconds'>,
    ) => {
      if (!crewId) throw new Error('no group');
      const youtubeId = item.youtube_id;
      if (!youtubeId) throw new Error('bag_item_invalid');
      // The library as it is now (another phone may have added the song meanwhile).
      const inLibrary = async () =>
        (
          await queryClient.fetchQuery({
            queryKey: videoKeys.list(crewId),
            queryFn: () => backend.listVideos(crewId),
            staleTime: 0,
          })
        ).find((v) => v.youtube_id === youtubeId);
      let existing = await inLibrary();
      let videoId = existing?.id;
      if (!videoId) {
        try {
          videoId = (
            await createVideo.mutateAsync({
              crewId,
              title: item.title?.trim() || 'Canción de YouTube',
              artist: item.artist,
              youtubeId,
              duration: item.duration_seconds,
            })
          ).video.id;
        } catch (error) {
          // Two phones at once: the other one created it a moment ago. Use that one.
          if (!isUniqueViolation(error)) throw error;
          existing = await inLibrary();
          if (!existing) throw error;
          videoId = existing.id;
        }
      }
      await bagsBackend.linkYoutubeSongs(youtubeId, videoId);
      return { videoId, existed: Boolean(existing) };
    },
    onSettled: (_data, _error, item) => {
      refreshBag(queryClient, item.bag_id);
      // The other bags that held the same YouTube song.
      void queryClient.invalidateQueries({ queryKey: ['bag-items'] });
    },
  });
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || !error) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === '23505' || /videos_crew_youtube_key/.test(String(message ?? ''));
}

export function bagsOfKind(bags: BagWithCount[] | undefined, kind: BagKind): BagWithCount[] {
  return (bags ?? []).filter((b) => b.kind === kind);
}
