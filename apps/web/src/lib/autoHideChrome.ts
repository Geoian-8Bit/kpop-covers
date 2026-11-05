import { create, type StoreApi, type UseBoundStore } from 'zustand';

// REQ-28 · The auto-hiding full-screen bar, once: the studio's controls and the round's bar used to be two copies of
// the same timer and listeners. Each keeps its own small store (showing or hiding the bar repaints only the bar) and
// adds its own extras on top (the studio's menus, seek badge and drag on the progress line).

export interface AutoHideChrome<S extends { shown: boolean }> {
  /** The bar's own store: `shown` plus whatever the caller added. */
  store: UseBoundStore<StoreApi<S>>;
  /** Show the bar now; it hides again after a while if the media plays. */
  wake(): void;
  hide(): void;
  /** Stop a pending hide (the bar stays as it is). */
  cancelHide(): void;
  /** The media paused (the bar comes back and stays) or started (the countdown starts). */
  onPlayingChange(playing: boolean): void;
  /** Wakes the bar on any mouse move or key; returns the cleanup. */
  listen(): () => void;
}

export function createAutoHideChrome<S extends { shown: boolean }>(
  initial: S,
  { isPlaying, hideAfterMs = 3000 }: { isPlaying: () => boolean; hideAfterMs?: number },
): AutoHideChrome<S> {
  const store = create<S>(() => initial);
  const setShown = (shown: boolean) => store.setState((s) => ({ ...s, shown }));
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  const cancelHide = () => clearTimeout(hideTimer);
  const scheduleHide = () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (isPlaying()) setShown(false);
    }, hideAfterMs);
  };
  const wake = () => {
    if (!store.getState().shown) setShown(true);
    scheduleHide();
  };

  return {
    store,
    wake,
    hide() {
      cancelHide();
      if (store.getState().shown) setShown(false);
    },
    cancelHide,
    onPlayingChange(playing) {
      if (!playing) {
        cancelHide();
        setShown(true);
      } else scheduleHide();
    },
    listen() {
      const onMouse = (e: PointerEvent) => {
        if (e.pointerType === 'mouse') wake();
      };
      const onKey = () => wake();
      window.addEventListener('pointermove', onMouse);
      window.addEventListener('keydown', onKey);
      return () => {
        window.removeEventListener('pointermove', onMouse);
        window.removeEventListener('keydown', onKey);
      };
    },
  };
}
