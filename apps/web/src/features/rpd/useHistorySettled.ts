import { useEffect, useState } from 'react';
import { ownBackPending, ownHistoryBack } from '@/lib/useBackToClose';
import { historySettleStep, isLayerEntry } from './roundRules';

/** How long to wait for a closing layer's `history.back()` before going ahead anyway. */
export const WAIT_MS = 400;

/**
 * True once `active` has been on and the history is quiet: no layer's entry is left on top (a layer that just
 * closed has had its `back()` land, and stale entries are stepped back over: left by an earlier race, or by a
 * reload while a layer was open). With no `back()` of ours on the way it's ready at once (or right after stepping
 * over a stale entry), with no wait. Whatever pushes its own history entry next (the round's «Atrás» guard, a
 * dialog over it, leaving the round) waits for it.
 */
export function useHistorySettled(active: boolean): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!active) {
      setReady(false);
      return;
    }
    let done = false;
    let popped = false;
    let backs = 0;
    let timer = 0;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      setReady(true);
    };
    const step = () => {
      window.clearTimeout(timer);
      const next = historySettleStep(isLayerEntry(window.history.state), popped, ownBackPending(), backs);
      if (next === 'ready') return finish();
      if (next === 'back') {
        backs++;
        popped = false;
        // Counted as ours: its popstate must not close a layer opened meanwhile.
        ownHistoryBack();
      }
      timer = window.setTimeout(finish, WAIT_MS);
    };
    const onPop = () => {
      if (done) return;
      popped = true;
      step();
    };
    window.addEventListener('popstate', onPop);
    step();
    return () => {
      done = true;
      window.clearTimeout(timer);
      window.removeEventListener('popstate', onPop);
    };
  }, [active]);
  return active && ready;
}
