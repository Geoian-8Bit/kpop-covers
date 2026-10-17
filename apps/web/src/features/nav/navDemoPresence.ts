import { useSyncExternalStore } from 'react';

/**
 * P1 · Whether a lab demo of the quick menu is on screen (Ajustes › Laboratorio). While one is, the real floating
 * button fades out: it sits at the same corner and would cover the demo's own button (and two identical buttons
 * don't say which one is the demo). Tiny on purpose: it lives in the entry chunk with `QuickNav`.
 */

const onScreen = new Set<object>();
const listeners = new Set<() => void>();

/** A demo stage (identified by any stable object) is, or is no longer, on screen. */
export function noteNavDemoOnScreen(stage: object, visible: boolean): void {
  const had = onScreen.has(stage);
  if (visible === had) return;
  if (visible) onScreen.add(stage);
  else onScreen.delete(stage);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = () => onScreen.size > 0;

export function useNavDemoOnScreen(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
