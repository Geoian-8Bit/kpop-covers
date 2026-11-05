import { useEffect } from 'react';
import { createAutoHideChrome } from '@/lib/autoHideChrome';
import { usePlayer } from '@/player/store';

/** How long a double-tap seek badge («+10 s») stays. */
const FLASH_MS = 700;

interface FsChromeState {
  /** The fullscreen controls are up. */
  shown: boolean;
  /** A speed or pause menu is open: the controls stay up underneath it. */
  menu: boolean;
  /** The last double-tap seek, for its badge. */
  flash: { side: 'left' | 'right'; seconds: number; key: number } | null;
}

/**
 * 5 · Fullscreen controls state, outside the studio's page tree: showing or hiding the controls repaints only the
 * controls layer (a fine selector), never the stage with the players inside it. UI state only: the player's own
 * state stays in player/store.ts. REQ-28 · The hide timer and its listeners come from lib/autoHideChrome.ts (shared
 * with the round's bar); controls hide 3 s after the last touch while the song plays (YouTube-style).
 */
const chrome = createAutoHideChrome<FsChromeState>(
  { shown: true, menu: false, flash: null },
  { isPlaying: () => usePlayer.getState().playing },
);
export const useFsChrome = chrome.store;

let flashTimer: ReturnType<typeof setTimeout> | undefined;

export const fsChrome = {
  /** Show the controls now; they hide again after a while if the song plays. */
  wake: chrome.wake,
  hide: chrome.hide,
  /** Whether the controls are on screen (a menu or a drag on the progress line keeps them up). */
  isVisible(): boolean {
    const { shown, menu } = useFsChrome.getState();
    return shown || menu || usePlayer.getState().scrubbing;
  },
  setMenu(menu: boolean) {
    if (useFsChrome.getState().menu !== menu) useFsChrome.setState({ menu });
  },
  /** ±5 s badge; taps that keep coming on the same side add up (−5, −10, −15…). */
  flashSeek(side: 'left' | 'right') {
    const prev = useFsChrome.getState().flash;
    useFsChrome.setState({
      flash: { side, seconds: prev && prev.side === side ? prev.seconds + 5 : 5, key: performance.now() },
    });
    clearTimeout(flashTimer);
    // Plain timer, not an animation callback, so the badge can never get stranded on screen.
    flashTimer = setTimeout(() => useFsChrome.setState({ flash: null }), FLASH_MS);
  },
};

/**
 * Drives the controls while fullscreen is on: shown on entering and on any mouse move or key, hidden 3 s after the
 * last touch while playing; pausing brings them back; closing a menu or ending a drag starts the countdown again.
 * Subscriptions, not React state: the component using it never re-renders for the controls.
 */
export function useFsChromeDriver(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    useFsChrome.setState({ shown: true, menu: false, flash: null });
    fsChrome.wake();
    const unlisten = chrome.listen();
    const offPlayer = usePlayer.subscribe((s, prev) => {
      if (s.playing !== prev.playing) chrome.onPlayingChange(s.playing);
      if (prev.scrubbing && !s.scrubbing) fsChrome.wake();
    });
    const offChrome = useFsChrome.subscribe((s, prev) => {
      if (prev.menu && !s.menu) fsChrome.wake();
    });
    return () => {
      chrome.cancelHide();
      clearTimeout(flashTimer);
      unlisten();
      offPlayer();
      offChrome();
      useFsChrome.setState({ shown: true, menu: false, flash: null });
    };
  }, [active]);
}
