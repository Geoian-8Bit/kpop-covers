import { useEffect } from 'react';
import { createAutoHideChrome } from '@/lib/autoHideChrome';
import { usePlayer } from '@/player/store';

export { useLandscape } from '@/lib/orientation';

/**
 * 54 · The round's full-screen bar, sideways: like the studio's (both built on lib/autoHideChrome.ts) it sits on the
 * bottom edge, hides 3 s after the last touch while the clip plays and comes back on a tap, a mouse move, a key or a
 * pause. Its own small store: showing or hiding the bar repaints only the bar, never the stage with the player
 * inside. UI state only (the player's stays in its store).
 */
const chrome = createAutoHideChrome({ shown: true }, { isPlaying: () => usePlayer.getState().playing });

export const useRoundChrome = chrome.store;

export const roundChrome = {
  /** Show the bar now; it hides again after a while if the clip plays. */
  wake: chrome.wake,
  hide: chrome.hide,
  isShown(): boolean {
    return useRoundChrome.getState().shown;
  },
};

/** Runs the bar while full screen is on (subscriptions, not React state: the caller never re-renders for it). */
export function useRoundChromeDriver(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    roundChrome.wake();
    const unlisten = chrome.listen();
    const off = usePlayer.subscribe((s, prev) => {
      if (s.playing === prev.playing) return;
      chrome.onPlayingChange(s.playing);
    });
    return () => {
      chrome.cancelHide();
      unlisten();
      off();
      useRoundChrome.setState({ shown: true });
    };
  }, [active]);
}
