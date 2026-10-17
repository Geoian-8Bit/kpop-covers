import { useEffect } from 'react';
import { create } from 'zustand';
import { usePlayer } from '@/player/store';

/** Controls hide this long after the last touch while the song plays (YouTube-style). */
const HIDE_AFTER_MS = 3000;
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
 * state stays in player/store.ts.
 */
export const useFsChrome = create<FsChromeState>(() => ({ shown: true, menu: false, flash: null }));

let hideTimer: ReturnType<typeof setTimeout> | undefined;
let flashTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (usePlayer.getState().playing) useFsChrome.setState({ shown: false });
  }, HIDE_AFTER_MS);
}

export const fsChrome = {
  /** Show the controls now; they hide again after a while if the song plays. */
  wake() {
    if (!useFsChrome.getState().shown) useFsChrome.setState({ shown: true });
    scheduleHide();
  },
  hide() {
    clearTimeout(hideTimer);
    if (useFsChrome.getState().shown) useFsChrome.setState({ shown: false });
  },
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
    const onMouse = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') fsChrome.wake();
    };
    const onKey = () => fsChrome.wake();
    window.addEventListener('pointermove', onMouse);
    window.addEventListener('keydown', onKey);
    const offPlayer = usePlayer.subscribe((s, prev) => {
      if (s.playing !== prev.playing) {
        if (!s.playing) {
          clearTimeout(hideTimer);
          useFsChrome.setState({ shown: true });
        } else scheduleHide();
      }
      if (prev.scrubbing && !s.scrubbing) fsChrome.wake();
    });
    const offChrome = useFsChrome.subscribe((s, prev) => {
      if (prev.menu && !s.menu) fsChrome.wake();
    });
    return () => {
      clearTimeout(hideTimer);
      clearTimeout(flashTimer);
      window.removeEventListener('pointermove', onMouse);
      window.removeEventListener('keydown', onKey);
      offPlayer();
      offChrome();
      useFsChrome.setState({ shown: true, menu: false, flash: null });
    };
  }, [active]);
}
