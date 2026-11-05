import { useSyncExternalStore } from 'react';

// REQ-28 · Shared by the studio's and the round's full screen.

const LANDSCAPE = '(orientation: landscape)';

function subscribeLandscape(onChange: () => void) {
  const query = window.matchMedia(LANDSCAPE);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** Whether the screen is sideways (the same media query as Tailwind's `landscape:`). */
export function useLandscape(): boolean {
  return useSyncExternalStore(
    subscribeLandscape,
    () => window.matchMedia(LANDSCAPE).matches,
    () => false,
  );
}

/** Hand the rotation back, or the phone can stay stuck sideways after full screen. */
export function unlockOrientation(): void {
  try {
    screen.orientation?.unlock?.();
  } catch {
    /* not locked / not supported */
  }
}
