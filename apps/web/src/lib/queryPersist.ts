import type { Query, QueryClient } from '@tanstack/react-query';
import { classifyError } from './netRules';
import {
  entrySize,
  isPersistedKey,
  needsWrite,
  PERSIST_MAX_ENTRY_CHARS,
  planSave,
  shouldFill,
  SLOW_FILL_MS,
  usableEntry,
  type PersistedEntry,
  type StoredEntry,
} from './queryPersistRules';

/**
 * The last answers of the group's lists, kept on this device (IndexedDB), so a rehearsal room with no or poor
 * connection still shows them instead of the error screen or an endless spinner.
 *
 * Invisible by design: online nothing changes. A kept answer only stands in for a request that failed on the network,
 * waits for the network, or is still unanswered after a few seconds (and never over a startup snapshot that already
 * fills the screen, nor over a real refusal from the server). It enters the cache as already stale (updated at 0), so
 * the next chance to ask the server replaces it, and it is never written back as a fresh answer. Each answer is its
 * own IndexedDB value and only answers whose data changed are written. idb-keyval loads on demand (the entry chunk
 * stays small); blocked storage (private mode) just keeps nothing.
 */

const DB_NAME = 'oneshoot-queries';
const STORE_NAME = 'entries';
/** Writes wait for a quiet moment: a burst of answers (startup) is one write. */
const SAVE_DEBOUNCE_MS = 2000;
const SAVE_MAX_WAIT_MS = 10_000;

type AnyQuery = Query<unknown, Error, unknown, readonly unknown[]>;
type Idb = typeof import('idb-keyval');

let idb: Promise<{ lib: Idb; store: ReturnType<Idb['createStore']> } | null> | null = null;
function openIdb() {
  idb ??= import('idb-keyval')
    .then((lib) => {
      if (typeof indexedDB === 'undefined') return null;
      return { lib, store: lib.createStore(DB_NAME, STORE_NAME) };
    })
    .catch(() => null);
  return idb;
}

function buster(): string {
  return typeof __APP_VERSION__ === 'number' ? `build-${__APP_VERSION__}` : `date-${__APP_BUILD_DATE__}`;
}

export function persistQueryCache(queryClient: QueryClient): void {
  const cache = queryClient.getQueryCache();
  const version = buster();

  // The kept answers (by hash): read once, then kept in step with every save. A failed read keeps nothing.
  let kept = new Map<string, PersistedEntry>();
  const loaded: Promise<void> = openIdb()
    .then(async (db) => {
      if (!db) return;
      const now = Date.now();
      const stale: IDBValidKey[] = [];
      for (const [key, value] of await db.lib.entries(db.store)) {
        const entry = usableEntry(value, version, now);
        if (entry && entry.hash === key) kept.set(entry.hash, entry);
        else stale.push(key);
      }
      // Other builds' and expired answers go (best effort).
      if (stale.length) await db.lib.delMany(stale, db.store).catch(() => undefined);
    })
    .catch(() => undefined);

  // ───── Standing in for a request that can't get through ─────

  const slowTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const slow = new Set<string>();

  const fillIfNeeded = (query: AnyQuery) => {
    if (query.state.data !== undefined) return; // the common case, decided before anything else
    const check = () =>
      shouldFill(
        {
          hasData: query.state.data !== undefined,
          status: query.state.status,
          fetchStatus: query.state.fetchStatus,
          transientError: query.state.error != null && classifyError(query.state.error) === 'transient',
          showingPlaceholder: query.observers.some((o) => o.getCurrentResult().isPlaceholderData),
        },
        slow.has(query.queryHash),
      );
    if (!check()) return;
    void loaded.then(() => {
      const entry = kept.get(query.queryHash);
      if (!entry || !check() || cache.get(query.queryHash) !== query) return;
      // Stale from the start (updated at 0): any mount, focus or retry asks the server and replaces it.
      query.setState({ data: entry.data, dataUpdatedAt: 0, status: 'success', error: null });
    });
  };

  const stopSlow = (hash: string) => {
    clearTimeout(slowTimers.get(hash));
    slowTimers.delete(hash);
    slow.delete(hash);
  };

  // ───── Keeping fresh answers ─────

  const dirty = new Set<string>();
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let firstDirtyAt = 0;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    firstDirtyAt = 0;
    const hashes = [...dirty];
    dirty.clear();
    void loaded
      .then(async () => {
        const now = Date.now();
        const changed: PersistedEntry[] = [];
        for (const hash of hashes) {
          const query = cache.get(hash);
          if (!query) continue;
          const { data, dataUpdatedAt, status } = query.state;
          // Filled answers (updated at 0) are already kept as they were.
          if (status !== 'success' || data === undefined || dataUpdatedAt === 0) continue;
          const entry: PersistedEntry = { hash, queryKey: query.queryKey, data, updatedAt: dataUpdatedAt };
          // Size is measured only for data worth writing, never on a refetch that brought the same rows.
          if (needsWrite(kept.get(hash), entry, now) && entrySize(data) <= PERSIST_MAX_ENTRY_CHARS)
            changed.push(entry);
        }
        if (!changed.length) return;
        const { write, drop, next } = planSave(kept, changed, now);
        kept = next;
        const db = await openIdb();
        if (!db) return;
        if (write.length)
          await db.lib.setMany(
            write.map((e): [string, StoredEntry] => [e.hash, { ...e, buster: version }]),
            db.store,
          );
        if (drop.length) await db.lib.delMany(drop, db.store);
      })
      .catch(() => undefined); // blocked or full storage: nothing kept, nothing shown
  };
  const scheduleSave = (hash: string) => {
    dirty.add(hash);
    const now = Date.now();
    firstDirtyAt ||= now;
    clearTimeout(saveTimer);
    const wait = Math.max(0, Math.min(SAVE_DEBOUNCE_MS, firstDirtyAt + SAVE_MAX_WAIT_MS - now));
    saveTimer = setTimeout(save, wait);
  };
  // Leaving the app (or the phone locking it) writes what is pending at once.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && saveTimer !== undefined) save();
    });
  }

  cache.subscribe((event) => {
    const query = event.query as AnyQuery;
    if (!isPersistedKey(query.queryKey)) return;
    const hash = query.queryHash;
    if (event.type === 'removed') {
      stopSlow(hash);
      return;
    }
    if (event.type !== 'updated' && event.type !== 'added' && event.type !== 'observerResultsUpdated') return;
    if (event.type === 'updated') {
      const action = event.action.type;
      if (action === 'success') {
        stopSlow(hash);
        scheduleSave(hash);
        return;
      }
      if (action === 'fetch' && query.state.data === undefined && !slowTimers.has(hash)) {
        slowTimers.set(
          hash,
          setTimeout(() => {
            slowTimers.delete(hash);
            slow.add(hash);
            fillIfNeeded(query);
          }, SLOW_FILL_MS),
        );
      }
      if (action === 'error') stopSlow(hash);
    }
    fillIfNeeded(query);
  });
}
