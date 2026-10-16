import type { Member } from '@coverscape/shared';
import { useEffect, useState } from 'react';
import { currentMemberId, useIdentity, useWhoPrompt } from '@/data/members';

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

/** Re-renders every `ms` (closing times, «cierra en 5 min»). */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
