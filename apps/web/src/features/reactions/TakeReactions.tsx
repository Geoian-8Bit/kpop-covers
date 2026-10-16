import type { Member, ReactionEmoji, TakeReaction } from '@coverscape/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { askWho, currentMemberId, memberKeys, useMe, useMembers } from '@/data/members';
import { PENDING_PREFIX, reactionError, reactionKeys, useTakeReactions, useToggleReaction } from '@/data/reactions';
import { useDesignVariant } from '@/features/lab/designLab';
import { useToast } from '@/providers/ToastProvider';
import { ReactionBar } from './ReactionBar';
import { groupReactions, toggleReaction } from './reactionRules';

/**
 * F15 · Reactions on one shared take (the «Tomas» tab). Whoever this device is reacts as themselves; without a
 * name, «¿Quién eres?» is suggested once and, if it's skipped, the reaction goes in as «sin nombre».
 */
export function TakeReactions({ take }: { take: { id: string; video_id: string } }) {
  const reactions = useTakeReactions(take.video_id);
  const members = useMembers();
  const me = useMe();
  const toggle = useToggleReaction();
  const queryClient = useQueryClient();
  const toast = useToast();
  const variant = useDesignVariant('reactions');

  const groups = useMemo(() => groupReactions(reactions.data ?? [], take.id, me?.id ?? null), [reactions.data, take.id, me?.id]);
  const byId = useMemo(() => new Map((members.data ?? []).map((m) => [m.id, m])), [members.data]);
  const memberOf = useCallback((id: string): Member | null => byId.get(id) ?? null, [byId]);

  const run = useCallback(
    (emoji: ReactionEmoji) => {
      // Read now, not at render: the «¿Quién eres?» dialog may have just added this person.
      const memberId = currentMemberId(queryClient.getQueryData<Member[]>(memberKeys.all));
      const list = queryClient.getQueryData<TakeReaction[]>(reactionKeys.forVideo(take.video_id)) ?? [];
      const action = toggleReaction(list, take.id, memberId, emoji);
      // Its own earlier tap is still on the way: this one waits for it.
      if (action.action === 'remove' && action.id.startsWith(PENDING_PREFIX)) return;
      toggle.mutate({ videoId: take.video_id, toggle: action }, { onError: (err) => toast(reactionError(err), 'error') });
    },
    [queryClient, take.id, take.video_id, toggle, toast],
  );

  const onToggle = useCallback(
    (emoji: ReactionEmoji) => askWho('Para que el grupo vea quién ha reaccionado.', () => run(emoji)),
    [run],
  );

  if (reactions.isPending) return <div aria-hidden className="skeleton mt-1.5 h-11 rounded-[8px]" />;
  if (reactions.isError && !reactions.data) return null;
  return <ReactionBar variant={variant} groups={groups} onToggle={onToggle} memberOf={memberOf} />;
}
