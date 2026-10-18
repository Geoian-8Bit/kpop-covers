/**
 * Heavy work running on this device right now — the AI voice separation ('voice') and the copy for the group's
 * cloud ('copy') — so that other heavy work waits for it instead of running at the same time (the separation and the
 * copy wait for each other), the recorder doesn't learn a lighter mode from a load
 * that isn't its own (P19), and an update doesn't reload the app halfway through. Tiny on purpose (it is in the
 * app's entry): whoever runs the heavy work marks it with `beginHeavyWork` (and releases it when done, however it
 * ends); whoever would compete reads it.
 *
 * A job can be marked idle while it waits (paused for the recorder, uploading): it still counts as running (an
 * update would still cut it short) but not as load on the device (`heavyWorkBusy`).
 */
export type HeavyWorkKind = 'voice' | 'copy';

export interface HeavyWork {
  /** Ends the work (calling it twice does nothing). */
  (): void;
  /** Paused or only waiting (no load on the device) — or busy again. */
  idle(on: boolean): void;
}

interface Entry {
  kind: HeavyWorkKind;
  idle: boolean;
}

const entries = new Set<Entry>();
const listeners = new Set<() => void>();
/** When some work last stopped loading the device (ended, or went idle); -Infinity: never. */
let lastBusyAt = -Infinity;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const notify = () => {
  for (const fn of [...listeners]) fn();
};

/** Marks the work as running (and busy); the function returned ends it. */
export function beginHeavyWork(kind: HeavyWorkKind): HeavyWork {
  const entry: Entry = { kind, idle: false };
  entries.add(entry);
  notify();
  const end = (() => {
    if (!entries.has(entry)) return;
    if (!entry.idle) lastBusyAt = now();
    entries.delete(entry);
    notify();
  }) as HeavyWork;
  end.idle = (on: boolean) => {
    if (!entries.has(entry) || entry.idle === on) return;
    if (on) lastBusyAt = now();
    entry.idle = on;
    notify();
  };
  return end;
}

/** Some work of this kind is running (busy or idle). */
export function heavyWorkRunning(kind: HeavyWorkKind): boolean {
  for (const e of entries) if (e.kind === kind) return true;
  return false;
}

/** Some work (of this kind, or any) is loading the device now. */
export function heavyWorkBusy(kind?: HeavyWorkKind): boolean {
  for (const e of entries) if (!e.idle && (kind == null || e.kind === kind)) return true;
  return false;
}

/** Some work loaded the device at any moment since `since` (a `performance.now()` time), or does now. */
export function heavyWorkBusySince(since: number): boolean {
  return heavyWorkBusy() || lastBusyAt >= since;
}

/** What an update would cut short now: the copy for the group first (it takes longest), then the separation. */
export function reloadBusy(): HeavyWorkKind | null {
  if (heavyWorkRunning('copy')) return 'copy';
  if (heavyWorkRunning('voice')) return 'voice';
  return null;
}

export function onHeavyWorkChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Resolves once `stillWaiting` is false (checked now and on every change) or the signal aborts. */
export function untilHeavyWork(stillWaiting: () => boolean, signal?: AbortSignal): Promise<void> {
  if (!stillWaiting() || signal?.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const check = () => {
      if (stillWaiting() && !signal?.aborted) return;
      off();
      signal?.removeEventListener('abort', check);
      resolve();
    };
    const off = onHeavyWorkChange(check);
    signal?.addEventListener('abort', check);
  });
}
