import { useCallback, useSyncExternalStore } from 'react';

/** Whether a media query matches now, re-rendering when it flips. `false` where there is no `matchMedia`. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', listener);
      return () => list.removeEventListener('change', listener);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(query).matches),
    () => false,
  );
}
