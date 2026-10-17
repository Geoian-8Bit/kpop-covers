import { useEffect, useRef, useState } from 'react';
import { overlayHost } from './overlayHost';

/**
 * A dialog portals into its own wrapper element, and the wrapper is what gets placed in the overlay host. The host is
 * chosen once, when the dialog opens (not on every render): portaling straight into `overlayHost()` made React mount
 * the dialog again (field focus lost, entry animation replayed) the first render after leaving fullscreen.
 * If the host changes while it is open (fullscreen entered or left, the CSS fullscreen layer unmounted), the wrapper
 * is moved in the DOM on purpose, once: React keeps the dialog's state because its portal container is the same.
 */

export type PlacementTrigger = 'open' | 'fullscreen' | 'mutation';

/**
 * Whether the wrapper has to move to `desired`. Pure, for the tests.
 * - `open`: always where overlays go now.
 * - `fullscreen`: native fullscreen entered or left, so the right host changed (the stage, or back to the page).
 * - `mutation`: something in the page changed; only a wrapper left out of the document (its host was removed,
 *   e.g. the CSS fullscreen layer closed) has to move. Everything else stays put, so typing never moves it.
 */
export function needsMove(
  trigger: PlacementTrigger,
  current: { parent: unknown; connected: boolean },
  desired: unknown,
): boolean {
  if (trigger === 'mutation') return !current.connected;
  return !current.connected || current.parent !== desired;
}

/** Moves `wrapper` into `host` keeping focus where it was (a DOM move blurs the focused element). */
function moveTo(wrapper: HTMLElement, host: Element, lastFocus: HTMLElement | null) {
  const active = document.activeElement;
  const focused = active instanceof HTMLElement && wrapper.contains(active) ? active : lastFocus;
  host.appendChild(wrapper);
  if (focused && wrapper.contains(focused) && document.activeElement !== focused) focused.focus({ preventScroll: true });
}

/**
 * The element a dialog portals into. Placed in `overlayHost()` when `open` turns true and kept there; moved only
 * when that host changes or disappears while the dialog is open.
 */
export function useOverlayContainer(open: boolean): HTMLElement {
  const [wrapper] = useState(() => {
    const node = document.createElement('div');
    // No box of its own: the host's layout (a flex fullscreen layer) never sees it.
    node.style.display = 'contents';
    node.dataset.overlay = '';
    return node;
  });

  // Placed while rendering the opening render (an idempotent DOM append), so the dialog mounts — and its entry
  // animation starts — already inside the right host. Later renders never look at the host again.
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) {
    const host = overlayHost();
    if (needsMove('open', { parent: wrapper.parentElement, connected: wrapper.isConnected }, host)) {
      host.appendChild(wrapper);
    }
  }
  wasOpen.current = open;

  useEffect(() => {
    if (!open) return;
    let lastFocus: HTMLElement | null = null;
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement) lastFocus = event.target;
    };
    const place = (trigger: PlacementTrigger) => {
      if (trigger === 'mutation' && wrapper.isConnected) return; // the common case, every DOM change: no lookup
      const host = overlayHost();
      if (needsMove(trigger, { parent: wrapper.parentElement, connected: wrapper.isConnected }, host)) {
        moveTo(wrapper, host, lastFocus);
      }
    };
    const onFullscreen = () => place('fullscreen');
    place('mutation'); // put back if it was taken out between renders (StrictMode's test unmount does it)
    wrapper.addEventListener('focusin', onFocusIn);
    document.addEventListener('fullscreenchange', onFullscreen);
    // The CSS fullscreen layer (`[data-fs]`) has no event of its own: notice when it takes the wrapper with it.
    const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => place('mutation'));
    observer?.observe(document.body, { childList: true, subtree: true });
    return () => {
      wrapper.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('fullscreenchange', onFullscreen);
      observer?.disconnect();
    };
  }, [open, wrapper]);

  // Gone with the dialog (kept while closed, so the exit animation plays where it opened).
  useEffect(() => () => wrapper.remove(), [wrapper]);

  return wrapper;
}
