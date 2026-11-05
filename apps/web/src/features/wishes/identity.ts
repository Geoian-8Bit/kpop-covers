import type { Member } from '@coverscape/shared';
import { useEffect, useState } from 'react';
import { currentMemberId, useIdentity, useWhoPrompt } from '@/data/members';
import { msUntilClose, type PollTiming } from './pollRules';

/**
 * «Me apunto» and voting are per person (F2): with nobody chosen on this device — or a name that was since removed
 * from the group — «¿Quién eres?» opens (always, not only the first time) and the action goes on once a name is
 * picked. Closing it without a name does nothing. `members`: the group as loaded, to spot a removed name.
 */
export function withMe(reason: string, members: Member[] | undefined, action: (memberId: string) => void): void {
  const current = members ? currentMemberId(members) : useIdentity.getState().memberId;
  if (current) {
    action(current);
    return;
  }
  useWhoPrompt.setState({
    open: true,
    reason,
    asked: true,
    then: () => {
      const chosen = useIdentity.getState().memberId;
      if (chosen) action(chosen);
    },
  });
}

/**
 * REQ-22 · «Now» for what only changes when a vote closes by time (open or closed, past results): it moves right
 * after the nearest closing (as PollView's timer does), not every 30 s, so the lists and their memoised cards don't
 * re-render for nothing.
 */
export function useClosingNow(polls: readonly PollTiming[] | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let next = Infinity;
    for (const poll of polls ?? []) {
      // Still shown open at `now`: due when its time comes (at once if that already passed).
      if ((msUntilClose(poll, now) ?? 0) > 0) next = Math.min(next, msUntilClose(poll) ?? 0);
    }
    if (next === Infinity || next > 2 ** 31 - 1) return;
    const id = setTimeout(() => setNow(Date.now()), next + 50);
    return () => clearTimeout(id);
  }, [polls, now]);
  return now;
}
