import { useEffect, useRef } from 'react';

let nextId = 1;
/** Our own history.back() calls still in flight: their popstate must not close a layer opened meanwhile. */
let ownPops = 0;
let swallowed = false;
let listening = false;
function listenOnce() {
  if (listening) return;
  listening = true;
  // Registered before any layer's listener, so it decides first whether this pop is ours.
  window.addEventListener('popstate', () => {
    swallowed = ownPops > 0;
    if (swallowed) ownPops--;
  });
}

/**
 * While `open`, the phone's back button / swipe-back closes this layer instead of leaving the page.
 * A history entry (carrying the router's own state, so it sees no navigation) is pushed on open and
 * popped again when the layer closes some other way.
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
    listenOnce();
    const id = nextId++;
    const mark = () => window.history.pushState({ ...(window.history.state ?? {}), backToClose: id }, '');
    mark();
    let popped = false;

    const onPop = () => {
      if (swallowed) {
        // That was a previous layer cleaning up its entry: put ours back on top.
        mark();
        return;
      }
      if (busyRef.current) {
        mark();
        return;
      }
      popped = true;
      onCloseRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // Closed by a button: drop our entry, unless something already navigated on top of it.
      if (!popped && (window.history.state as { backToClose?: number } | null)?.backToClose === id) {
        ownPops++;
        window.history.back();
      }
    };
  }, [open]);
}
