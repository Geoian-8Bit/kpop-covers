import { useSyncExternalStore } from 'react';

/** Tailwind's `lg` (64rem): from there the side rail is the navigation and the quick menu isn't mounted at all. */
const DESKTOP = '(min-width: 64rem)';

function subscribeDesktop(listener: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const query = window.matchMedia(DESKTOP);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

/** REQ-09 · Shared by the shell (which bar to mount) and the quick menu. Same breakpoint as Tailwind's `lg`. */
export function useDesktop(): boolean {
  return useSyncExternalStore(
    subscribeDesktop,
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(DESKTOP).matches),
    () => false,
  );
}
