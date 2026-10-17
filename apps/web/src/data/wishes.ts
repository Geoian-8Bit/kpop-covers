import type { Poll, PollVote, Wish, WishInterest } from '@coverscape/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  backend,
  bagsBackend,
  wishesBackend,
  type CloseResolve,
  type NewPoll,
  type NewWish,
  type PollPatch,
  type WishPatch,
} from '@/lib/backend';
import { friendlyError } from '@/lib/supabase';
import { bagKeys } from './bags';
import { useCreateVideo, videoKeys } from './videos';

/**
 * F12 · Lista de deseos and F11 · votaciones: shared by the group. The lists are small (a group's wishes and
 * votes), so they load whole and every view reads from the same cache. Voting goes through `cast_vote`.
 */
export const wishKeys = {
  wishes: ['wishes'] as const,
  interest: ['wish-interest'] as const,
  polls: ['polls'] as const,
  options: ['poll-options'] as const,
  votes: ['poll-votes'] as const,
  /** The live votes of some polls (a poll's page: just its own). */
  pollVotes: (pollIds: string[]) => ['poll-votes', ...[...pollIds].sort()] as const,
};

/** The bag the winner can go into (F11 → F13), created when it doesn't exist. */
export const NEXT_COREO_BAG = 'Próxima coreo';

/** Wish and vote errors in the group's words (falls back to the app's general mapping). */
export function wishError(error: unknown): string {
  const message =
    typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : '';
  if (/wishes_crew_youtube_key/.test(message)) return 'Esa canción ya está en la lista de deseos.';
  if (/wish_interest_once_key/.test(message)) return 'Ya te habías apuntado.';
  if (/wish_interest_invalid/.test(message))
    return 'No se pudo apuntar: esa canción ya no está en la lista o tu nombre ya no está en el grupo.';
  if (/wish_video_invalid/.test(message)) return 'Ese vídeo ya no está en la biblioteca.';
  if (/wishes_.*_check/.test(message)) return 'Revisa los datos: alguno no es válido.';
  if (/poll_closed/.test(message)) return 'La votación ya está cerrada.';
  if (/poll_not_found/.test(message)) return 'Esta votación ya no existe: otro móvil la ha borrado.';
  if (/poll_option_invalid|poll_options_once_key/.test(message)) return 'Alguna candidata ya no está en la lista.';
  if (/poll_winner_invalid/.test(message)) return 'La ganadora tiene que ser una de las candidatas.';
  if (/poll_has_votes/.test(message)) return 'Ya hay votos: no se puede cambiar el tipo.';
  if (/poll_options_cap_reached/.test(message)) return 'Una votación admite hasta 50 canciones.';
  if (/vote_member_invalid/.test(message)) return 'Ese nombre ya no está en el grupo. Elige quién eres otra vez.';
  if (/vote_options_invalid/.test(message)) return 'Ese voto no vale: revisa lo que has marcado.';
  if (/polls_title_check/.test(message)) return 'El título no puede quedar vacío.';
  if (/(wishes|wish_interest|polls|poll_options|poll_votes)_cap_reached|row_cap/.test(message))
    return 'Se ha llegado al máximo. Borra algo antes.';
  return friendlyError(error);
}

export function useWishes() {
  return useQuery({ queryKey: wishKeys.wishes, queryFn: () => wishesBackend.listWishes() });
}

export function useWishInterest() {
  return useQuery({ queryKey: wishKeys.interest, queryFn: () => wishesBackend.listInterest() });
}

export function usePolls() {
  return useQuery({ queryKey: wishKeys.polls, queryFn: () => wishesBackend.listPolls() });
}

export function usePollOptions() {
  return useQuery({ queryKey: wishKeys.options, queryFn: () => wishesBackend.listPollOptions() });
}

/**
 * The votes of these polls only. `live`: someone is looking at an open vote — pick up the others' ballots every
 * few seconds (just that poll's rows, never the whole table).
 */
export function usePollVotes(pollIds: string[], { live = false, enabled = true }: { live?: boolean; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: wishKeys.pollVotes(pollIds),
    enabled,
    queryFn: () => wishesBackend.listPollVotes(pollIds),
    refetchInterval: live ? 8_000 : false,
  });
}

function refreshPolls(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: wishKeys.polls });
  void queryClient.invalidateQueries({ queryKey: wishKeys.options });
  void queryClient.invalidateQueries({ queryKey: wishKeys.votes });
}

export function useProposeWish() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (row: NewWish) => wishesBackend.insertWish(row),
    onSuccess: (wish) => {
      queryClient.setQueryData<Wish[]>(wishKeys.wishes, (current) => (current ? [...current, wish] : current));
      void queryClient.invalidateQueries({ queryKey: wishKeys.wishes });
    },
  });
}

export function useUpdateWish() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: WishPatch }) => wishesBackend.updateWish(id, patch),
    onSuccess: (wish) => {
      queryClient.setQueryData<Wish[]>(wishKeys.wishes, (current) => current?.map((w) => (w.id === wish.id ? wish : w)));
    },
  });
}

export function useDeleteWish() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (wish: Pick<Wish, 'id'>) => {
      await wishesBackend.deleteWish(wish.id);
      return wish;
    },
    onSuccess: (wish) => {
      queryClient.setQueryData<Wish[]>(wishKeys.wishes, (current) => current?.filter((w) => w.id !== wish.id));
      void queryClient.invalidateQueries({ queryKey: wishKeys.interest });
      void queryClient.invalidateQueries({ queryKey: ['bag-items'] });
    },
  });
}

/** «Me apunto» on / off for one person (optimistic: the count and the order move at once). */
export function useToggleInterest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ wishId, memberId, row }: { wishId: string; memberId: string; row: WishInterest | null }) => {
      if (row) await wishesBackend.removeInterest(row.id);
      else await wishesBackend.addInterest(wishId, memberId);
    },
    onMutate: async ({ wishId, memberId, row }) => {
      await queryClient.cancelQueries({ queryKey: wishKeys.interest });
      const previous = queryClient.getQueryData<WishInterest[]>(wishKeys.interest);
      queryClient.setQueryData<WishInterest[]>(wishKeys.interest, (current = []) =>
        row
          ? current.filter((i) => i.id !== row.id)
          : [
              ...current,
              {
                id: `optimistic-${wishId}-${memberId}`,
                crew_id: '',
                wish_id: wishId,
                member_id: memberId,
                created_at: new Date().toISOString(),
                archived_at: null,
              },
            ],
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(wishKeys.interest, context.previous);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: wishKeys.interest }),
  });
}

export interface CreatePollInput {
  row: NewPoll;
  wishIds: string[];
  /** «Segunda vuelta»: the tied poll it comes from; closed (without a winner) once this one exists. */
  parent?: Pick<Poll, 'id' | 'closed_at'> | null;
}

export function useCreatePoll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ row, wishIds, parent }: CreatePollInput) => {
      const poll = await wishesBackend.insertPoll(row, wishIds);
      if (parent && !parent.closed_at) {
        await wishesBackend.closePoll(parent.id, 'none').catch(() => undefined);
      }
      return poll;
    },
    onSettled: () => refreshPolls(queryClient),
  });
}

export function useUpdatePoll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: PollPatch }) => wishesBackend.updatePoll(id, patch),
    onSuccess: (poll) => {
      queryClient.setQueryData<Poll[]>(wishKeys.polls, (current) => current?.map((p) => (p.id === poll.id ? poll : p)));
    },
    // Another phone may have closed it first: show what the group has now.
    onError: () => void queryClient.invalidateQueries({ queryKey: wishKeys.polls }),
  });
}

/**
 * Closes a vote on the server, counting the votes as they are at that moment (never this phone's cache):
 * 'auto' → closed with the clear winner (or none), or 'tie' with the tied ones; 'pick' → the tie draw's pick among
 * the server's tied; 'none' → closed without a winner (second round).
 */
export function useClosePoll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ pollId, resolve, winner = null }: { pollId: string; resolve: CloseResolve; winner?: string | null }) =>
      wishesBackend.closePoll(pollId, resolve, winner),
    onSettled: () => refreshPolls(queryClient),
  });
}

export function useDeletePoll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (poll: Pick<Poll, 'id'>) => {
      await wishesBackend.deletePoll(poll.id);
      return poll;
    },
    onSuccess: (poll) => {
      queryClient.setQueryData<Poll[]>(wishKeys.polls, (current) => current?.filter((p) => p.id !== poll.id));
      refreshPolls(queryClient);
    },
  });
}

/** Sends a person's whole ballot (replaces the previous one; empty = withdraw). Optimistic. */
export function useCastVote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ pollId, memberId, optionIds }: { pollId: string; memberId: string; optionIds: string[] }) =>
      wishesBackend.castVote(pollId, memberId, optionIds),
    onMutate: async ({ pollId, memberId, optionIds }) => {
      const key = wishKeys.pollVotes([pollId]);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PollVote[]>(key);
      const ranked = queryClient.getQueryData<Poll[]>(wishKeys.polls)?.find((p) => p.id === pollId)?.vote_type === 'ranking';
      queryClient.setQueryData<PollVote[]>(key, (current = []) => [
        ...current.filter((v) => !(v.poll_id === pollId && v.member_id === memberId)),
        ...optionIds.map((option_id, i) => ({
          id: `optimistic-${option_id}-${memberId}`,
          crew_id: '',
          poll_id: pollId,
          option_id,
          member_id: memberId,
          rank: ranked ? i + 1 : null,
          created_at: new Date().toISOString(),
          archived_at: null,
        })),
      ]);
      return { previous };
    },
    onError: (_error, { pollId }, context) => {
      if (context?.previous) queryClient.setQueryData(wishKeys.pollVotes([pollId]), context.previous);
      void queryClient.invalidateQueries({ queryKey: wishKeys.polls });
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: wishKeys.votes }),
  });
}

/**
 * «Añadir a la biblioteca»: the wish becomes a library video (as «Añadir vídeo» does, without pasting the link
 * again) — or points at the one already there — and leaves the list (added_video_id).
 */
export function useAddWishToLibrary(crewId: string | undefined) {
  const queryClient = useQueryClient();
  const createVideo = useCreateVideo();
  return useMutation({
    mutationFn: async (wish: Pick<Wish, 'id' | 'title' | 'artist' | 'youtube_id'>) => {
      if (!crewId) throw new Error('no group');
      // The library as it is now (another phone may have added or removed the song): a song already there is
      // linked, not copied.
      const list = await queryClient.fetchQuery({
        queryKey: videoKeys.list(crewId),
        queryFn: () => backend.listVideos(crewId),
        staleTime: 0,
      });
      const existing = list.find((v) => v.youtube_id === wish.youtube_id);
      const videoId =
        existing?.id ??
        (await createVideo.mutateAsync({ crewId, title: wish.title, artist: wish.artist, youtubeId: wish.youtube_id }))
          .video.id;
      const updated = await wishesBackend.updateWish(wish.id, { added_video_id: videoId });
      return { wish: updated, videoId, existed: Boolean(existing) };
    },
    onSuccess: ({ wish }) => {
      queryClient.setQueryData<Wish[]>(wishKeys.wishes, (current) => current?.map((w) => (w.id === wish.id ? wish : w)));
    },
  });
}

/** The winner into the bag «Próxima coreo» (created as a «se quita» bag of songs when it doesn't exist). */
export function useAddToNextCoreo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (wish: Pick<Wish, 'id' | 'added_video_id'>) => {
      const bags = await bagsBackend.listBags();
      const wanted = NEXT_COREO_BAG.toLowerCase();
      let bag = bags.find((b) => b.kind === 'songs' && b.name.trim().toLowerCase() === wanted);
      if (!bag) {
        if (bags.some((b) => b.name.trim().toLowerCase() === wanted)) {
          throw new Error(`Ya hay una bolsa «${NEXT_COREO_BAG}» que no es de canciones.`);
        }
        bag = { ...(await bagsBackend.insertBag({ name: NEXT_COREO_BAG, kind: 'songs', draw_mode: 'remove', no_repeat: false })), items: 0 };
      }
      const items = await bagsBackend.listBagItems(bag.id);
      // The same song by either reference: the wish itself, or the library video it became.
      const already = items.some(
        (i) => i.wish_id === wish.id || (wish.added_video_id != null && i.video_id === wish.added_video_id),
      );
      if (already) return { bag, already: true };
      await bagsBackend.insertBagItem(
        wish.added_video_id ? { bag_id: bag.id, video_id: wish.added_video_id } : { bag_id: bag.id, wish_id: wish.id },
      );
      return { bag, already: false };
    },
    onSettled: (result) => {
      void queryClient.invalidateQueries({ queryKey: bagKeys.all });
      if (result) void queryClient.invalidateQueries({ queryKey: bagKeys.items(result.bag.id) });
    },
  });
}
