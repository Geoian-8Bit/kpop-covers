/**
 * Heavy work running on this device right now (the AI voice separation), so that other heavy work (the follow
 * analysis, F10 · 15) waits for it instead of running at the same time. Tiny on purpose: whoever runs the heavy
 * work marks it with `beginHeavyWork` (and releases it when done, however it ends); whoever would compete reads it.
 */
export type HeavyWorkKind = 'voice';

const running = new Map<HeavyWorkKind, number>();
const listeners = new Set<() => void>();

const notify = () => {
  for (const fn of [...listeners]) fn();
};

/** Marks the work as running; the function returned ends it (calling it twice does nothing). */
export function beginHeavyWork(kind: HeavyWorkKind): () => void {
  running.set(kind, (running.get(kind) ?? 0) + 1);
  notify();
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    const n = (running.get(kind) ?? 1) - 1;
    if (n > 0) running.set(kind, n);
    else running.delete(kind);
    notify();
  };
}

export function heavyWorkRunning(kind: HeavyWorkKind): boolean {
  return (running.get(kind) ?? 0) > 0;
}

export function onHeavyWorkChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
