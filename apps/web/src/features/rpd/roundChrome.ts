import { useEffect, useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { usePlayer } from '@/player/store';

/**
 * 54 · The round's full-screen bar, sideways: like the studio's (features/studio/fullscreenChrome.ts, copied here so
 * the two never depend on each other) it sits on the bottom edge, hides 3 s after the last touch while the clip
 * plays and comes back on a tap, a mouse move, a key or a pause. Its own small store: showing or hiding the bar
 * repaints only the bar, never the stage with the player inside. UI state only (the player's stays in its store).
 */
const HIDE_AFTER_MS = 3000;

export const useRoundChrome = create<{ shown: boolean }>(() => ({ shown: true }));

let hideTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (usePlayer.getState().playing) useRoundChrome.setState({ shown: false });
  }, HIDE_AFTER_MS);
}

export const roundChrome = {
  /** Show the bar now; it hides again after a while if the clip plays. */
  wake() {
    if (!useRoundChrome.getState().shown) useRoundChrome.setState({ shown: true });
    scheduleHide();
  },
  hide() {
    clearTimeout(hideTimer);
    if (useRoundChrome.getState().shown) useRoundChrome.setState({ shown: false });
  },
  isShown(): boolean {
    return useRoundChrome.getState().shown;
  },
};

/** Runs the bar while full screen is on (subscriptions, not React state: the caller never re-renders for it). */
export function useRoundChromeDriver(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    roundChrome.wake();
    const onMouse = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') roundChrome.wake();
    };
    const onKey = () => roundChrome.wake();
    window.addEventListener('pointermove', onMouse);
    window.addEventListener('keydown', onKey);
    const off = usePlayer.subscribe((s, prev) => {
      if (s.playing === prev.playing) return;
      if (!s.playing) {
        clearTimeout(hideTimer);
        useRoundChrome.setState({ shown: true });
      } else scheduleHide();
    });
    return () => {
      clearTimeout(hideTimer);
      window.removeEventListener('pointermove', onMouse);
      window.removeEventListener('keydown', onKey);
      off();
      useRoundChrome.setState({ shown: true });
    };
  }, [active]);
}

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
