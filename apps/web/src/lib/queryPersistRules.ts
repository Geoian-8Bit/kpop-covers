/**
 * Pure rules of the kept query cache (queryPersist.ts): which queries are kept on this device, which kept answers
 * are still usable, and when one stands in for a request that can't get through. Unit tested.
 */

/** Kept answers older than this are dropped. */
export const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60_000;
/** One answer above this (JSON characters) isn't kept: IndexedDB writes on a weak phone stay small. */
export const PERSIST_MAX_ENTRY_CHARS = 250_000;
/** At most this many answers are kept (the most recent win). */
export const PERSIST_MAX_ENTRIES = 150;
/** A first request still without an answer after this long shows the kept one meanwhile. */
export const SLOW_FILL_MS = 3000;

/**
 * Plain rows from the group's tables. Left out on purpose: `video-posters` (inline poster data URLs, kept by their
 * own store), `video-play` / `video-stems-urls` (signed URLs that expire), `takes` and `take-*` (this phone's own
 * recordings next to the shared ones), `bag-holding` / `bag-draws` (who holds what right now), `calendar-changes`
 * (a moving window), `poll-votes` (live, refetched every few seconds on an open poll), `profile` (the signed-in
 * person), `note-sketches` (drawings, large) and write keys.
 */
const PERSISTED_ROOTS = new Set([
  'group',
  'videos',
  'video',
  'clips',
  'all-clips',
  'quick-clips',
  'notes',
  'members',
  'bags',
  'bag-items',
  'events',
  'event',
  'event-songs',
  'wishes',
  'wish-interest',
  'polls',
  'poll-options',
  'tracks',
  'track',
  'track-items',
  'formation-plans',
  'formation-plan',
  'formation-members',
  'calendar-members',
  'rehearsal-rules',
  'rehearsal-exceptions',
  'absences',
]);

export function isPersistedKey(queryKey: readonly unknown[]): boolean {
  const root = queryKey[0];
  return typeof root === 'string' && PERSISTED_ROOTS.has(root);
}

/** A kept answer whose data didn't change is rewritten only this often (to keep its age current). */
export const PERSIST_REFRESH_MS = 24 * 60 * 60_000;

export interface PersistedEntry {
  hash: string;
  queryKey: readonly unknown[];
  data: unknown;
  /** When the server gave this answer (ms). */
  updatedAt: number;
}

/** One IndexedDB value: an entry tagged with the build that wrote it. */
export interface StoredEntry extends PersistedEntry {
  buster: string;
}

/** JSON size of `data`, or Infinity when it can't be written as JSON (blobs, cycles…). */
export function entrySize(data: unknown): number {
  try {
    const json = JSON.stringify(data);
    return json === undefined ? Infinity : json.length;
  } catch {
    return Infinity;
  }
}

/** A stored value still usable (same build, not too old, a known key), else null (to be deleted). */
export function usableEntry(stored: unknown, buster: string, now: number): PersistedEntry | null {
  if (typeof stored !== 'object' || stored === null) return null;
  const e = stored as Partial<StoredEntry>;
  if (
    e.buster !== buster ||
    typeof e.hash !== 'string' ||
    !Array.isArray(e.queryKey) ||
    !isPersistedKey(e.queryKey) ||
    e.data === undefined ||
    typeof e.updatedAt !== 'number' ||
    now - e.updatedAt > PERSIST_MAX_AGE_MS
  )
    return null;
  return { hash: e.hash, queryKey: e.queryKey, data: e.data, updatedAt: e.updatedAt };
}

/**
 * Whether a fresh answer is worth a write: its data changed (a refetch that brought the same rows keeps the same
 * reference, thanks to structural sharing), or the kept copy is getting old.
 */
export function needsWrite(prev: PersistedEntry | undefined, next: PersistedEntry, now: number): boolean {
  if (!prev) return true;
  if (prev.data !== next.data) return next.updatedAt >= prev.updatedAt;
  return now - prev.updatedAt >= PERSIST_REFRESH_MS && next.updatedAt > prev.updatedAt;
}

/**
 * An incremental save: `changed` entries written over `kept`, then too old ones and the ones past the
 * `PERSIST_MAX_ENTRIES` most recent dropped. Only `write` and `drop` reach IndexedDB; `next` is the new kept set.
 */
export function planSave(
  kept: ReadonlyMap<string, PersistedEntry>,
  changed: readonly PersistedEntry[],
  now: number,
): { write: PersistedEntry[]; drop: string[]; next: Map<string, PersistedEntry> } {
  const all = new Map(kept);
  for (const e of changed) all.set(e.hash, e);
  const ranked = [...all.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  const next = new Map<string, PersistedEntry>();
  const drop: string[] = [];
  for (const e of ranked) {
    if (next.size < PERSIST_MAX_ENTRIES && now - e.updatedAt <= PERSIST_MAX_AGE_MS) next.set(e.hash, e);
    else if (kept.has(e.hash)) drop.push(e.hash);
  }
  return { write: changed.filter((e) => next.get(e.hash) === e), drop, next };
}

export interface FillState {
  /** The query already has data (fetched, initial or filled before). */
  hasData: boolean;
  status: 'pending' | 'success' | 'error';
  fetchStatus: 'fetching' | 'paused' | 'idle';
  /** The query's error is one that can fix itself (network, timeout, 5xx), see netRules.ts. */
  transientError: boolean;
  /** Some screen shows a placeholder (the startup snapshot) for it. */
  showingPlaceholder: boolean;
}

/**
 * When the kept answer stands in for the request: never over real data; at once when the request failed for good
 * on the network (the error screen would show instead) — never for a real «no» from the server (RLS, a missing row,
 * 4xx), which keeps showing as today; while it waits for the network (paused) or is slow, only when no snapshot
 * already fills the screen.
 */
export function shouldFill(state: FillState, slow: boolean): boolean {
  if (state.hasData) return false;
  if (state.status === 'error') return state.transientError;
  if (state.status !== 'pending' || state.showingPlaceholder) return false;
  return state.fetchStatus === 'paused' || (state.fetchStatus === 'fetching' && slow);
}
