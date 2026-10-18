import { useEffect, useRef } from 'react';
import { backLayers } from './backLayers';

/**
 * Whether one of our own `history.back()` calls is still on its way. A layer's entry left on top with nothing of
 * ours in flight is a stale one (e.g. left behind by a reload while a layer was open), not one about to go.
 */
export function ownBackPending(): boolean {
  return backLayers().ownBackPending();
}

/** `history.back()` counted as ours: a layer open when its popstate lands keeps its entry instead of closing. */
export function ownHistoryBack(): void {
  backLayers().ownHistoryBack();
}

/**
 * While `open`, the phone's back button / swipe-back closes this layer instead of leaving the page.
 * A history entry (carrying the router's own state, so it sees no navigation) is pushed on open and
 * popped again when the layer closes some other way. With layers on top of each other, «Atrás» closes only the top
 * one (rules and tests in `backLayers.ts`).
 *
 * `busy` layers swallow the back press: the entry is pushed again and nothing closes.
 */
export function useBackToClose(open: boolean, onClose: () => void, busy = false): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    if (!open) return;
    return backLayers().open({ onClose: () => onCloseRef.current(), busy: () => busyRef.current });
  }, [open]);
}
