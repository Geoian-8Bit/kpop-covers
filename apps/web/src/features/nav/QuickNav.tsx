import { useEffect, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router';
import NavHanafuda from './NavHanafuda';
import { quickNavHidden } from './navRules';

function useFullscreenActive(): boolean {
  const [on, setOn] = useState(() => typeof document !== 'undefined' && Boolean(document.fullscreenElement));
  useEffect(() => {
    const sync = () => setOn(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  return on;
}

/** Tailwind's `lg` (64rem): from there the side rail is the navigation and the quick menu isn't mounted at all. */
const DESKTOP = '(min-width: 64rem)';

function subscribeDesktop(listener: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const query = window.matchMedia(DESKTOP);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

function useDesktop(): boolean {
  return useSyncExternalStore(
    subscribeDesktop,
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(DESKTOP).matches),
    () => false,
  );
}

/** Whether the quick menu shows on this page (phones; the shell also leaves room for it at the bottom). */
export function useQuickNavShown(): boolean {
  const { pathname } = useLocation();
  const fullscreen = useFullscreenActive();
  return !quickNavHidden(pathname, fullscreen);
}

/**
 * P1 · The phone's quick menu, bottom right: «Hanafuda», chosen by the product owner. It ships in the entry chunk
 * (motion is there already), so the button is on screen with the first paint and works offline.
 */
export function QuickNav({ shown }: { shown: boolean }) {
  const desktop = useDesktop();
  if (!shown || desktop) return null;
  return <NavHanafuda />;
}
