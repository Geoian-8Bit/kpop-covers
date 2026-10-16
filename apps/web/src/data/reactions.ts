import type { TakeReaction } from '@coverscape/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { applyToggle, type ToggleAction } from '@/features/reactions/reactionRules';
import { eventsBackend } from '@/lib/backend';
import { friendlyError } from '@/lib/supabase';

/**
 * F15 · Quick reactions on shared takes (🔥 👏 💯 😂). One query per song (every take of the «Tomas» tab reads
 * it); a tap shows at once and the server's answer follows.
 */
export const reactionKeys = {
  forVideo: (videoId: string | undefined) => ['take-reactions', videoId] as const,
};

/** Rows written by this phone and not confirmed yet carry this prefix (a tap on them waits). */
export const PENDING_PREFIX = 'pending-';

export function reactionError(error: unknown): string {
  const message =
    typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : '';
  if (/reaction_take_invalid/.test(message)) return 'Esta toma ya no está compartida con el grupo.';
  if (/take_reactions_cap_reached|row_cap/.test(message)) return 'Se ha llegado al máximo de reacciones.';
  return friendlyError(error);
}

export function useTakeReactions(videoId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: reactionKeys.forVideo(videoId),
    enabled: Boolean(videoId) && enabled,
    queryFn: () => eventsBackend.listReactions(videoId!),
    // Reactions come from other phones: fresher than the rest of the app.
    staleTime: 30_000,
  });
}

const MUTATION_KEY = ['reaction-toggle'];

/** Applies a tap decided with `toggleReaction` (add this device's reaction, or take it away). */
export function useToggleReaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: MUTATION_KEY,
    mutationFn: async ({ toggle }: { videoId: string; toggle: ToggleAction }) => {
      if (toggle.action === 'remove') {
        await eventsBackend.removeReaction(toggle.id);
        return null;
      }
      try {
        return await eventsBackend.addReaction(toggle.row);
      } catch (err) {
        // Already there (another phone without a name got first): not an error, the refetch shows it.
        if (/take_reactions_once_key/.test(String((err as { message?: unknown })?.message ?? ''))) return null;
        throw err;
      }
    },
    onMutate: async ({ videoId, toggle }) => {
      const key = reactionKeys.forVideo(videoId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TakeReaction[]>(key) ?? [];
      const pending: TakeReaction | null =
        toggle.action === 'add'
          ? {
              id: `${PENDING_PREFIX}${crypto.randomUUID()}`,
              crew_id: '',
              ...toggle.row,
              created_at: new Date().toISOString(),
              archived_at: null,
            }
          : null;
      queryClient.setQueryData<TakeReaction[]>(
        key,
        pending ? applyToggle(previous, toggle, pending) : previous.filter((r) => toggle.action !== 'remove' || r.id !== toggle.id),
      );
      return { previous, pendingId: pending?.id ?? null };
    },
    onSuccess: (row, { videoId }, context) => {
      // The server's row takes the pending one's place (so a second tap can take it away at once).
      if (!row || !context?.pendingId) return;
      queryClient.setQueryData<TakeReaction[]>(reactionKeys.forVideo(videoId), (current) =>
        current?.map((r) => (r.id === context.pendingId ? row : r)),
      );
    },
    onError: (_err, { videoId }, context) => {
      if (context) queryClient.setQueryData(reactionKeys.forVideo(videoId), context.previous);
    },
    onSettled: (_data, _error, { videoId }) => {
      if (queryClient.isMutating({ mutationKey: MUTATION_KEY }) <= 1) {
        void queryClient.invalidateQueries({ queryKey: reactionKeys.forVideo(videoId) });
      }
    },
  });
}
