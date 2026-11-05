import type { QueryClient } from '@tanstack/react-query';
import { IS_DEMO } from './backend/mode';
import {
  backoffDelay,
  coalesce,
  isRetryableWriteError,
  rowOf,
  runnable,
  type PendingKind,
  type PendingOp,
} from './pendingWritesRules';

/**
 * Pending writes: clip, note and vote writes go out through this queue. Writes of one row go strictly in order;
 * different rows go side by side (a few at a time), so a fresh write goes out at once, as it always did, and its
 * mutation resolves with the server's row. When the network fails (no answer, cut off, timed out, 5xx), the write
 * stays queued — kept on this device across reloads — and the mutation resolves as if saved (`{ sent: false }`), so
 * the optimistic screen stays. It goes out later on its own: on `online`, when the app comes back to the front, at
 * start, and on a backoff timer. A real «no» from the server rejects the mutation exactly as before. No UI of its own.
 */

export type Outcome<R = unknown> = { sent: true; result: R } | { sent: false };

/** What the caller submits: the queue fills in opId and tries. */
export type NewPendingOp = Omit<PendingOp, 'opId' | 'tries'>;

interface Waiter {
  resolve: (outcome: Outcome) => void;
  reject: (err: unknown) => void;
}

export interface QueueDeps {
  load: () => Promise<PendingOp[]>;
  save: (ops: PendingOp[]) => Promise<void>;
  /** Sends one write; `signal` aborts the request (a try that took too long). */
  execute: (op: PendingOp, signal: AbortSignal) => Promise<unknown>;
  /** A write that finished in the background (sent, or turned down after its mutation had already resolved). */
  onBackgroundDone?: (op: PendingOp) => void;
  /** Runs `task` holding the cross-tab lock; resolves false (without running it) when another tab holds it. */
  lock?: (task: () => Promise<void>) => Promise<boolean>;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** One try longer than this is aborted and counts as a network failure. */
  attemptTimeoutMs?: number;
  /**
   * A write still unanswered after this long resolves as saved (it stays queued and its try goes on): a network that
   * swallows packets never holds a dialog open until the try times out.
   */
  answerWithinMs?: number;
  /** `ready` stops waiting for the kept writes after this long; they still merge in when they arrive. */
  loadTimeoutMs?: number;
  /** Rows sent side by side. */
  concurrency?: number;
  newId?: () => string;
}

export interface WriteQueue {
  submit: <R = unknown>(op: NewPendingOp) => Promise<Outcome<R>>;
  flush: () => Promise<void>;
  pending: () => readonly PendingOp[];
  ready: Promise<void>;
}

class AttemptTimeout extends Error {
  override name = 'TimeoutError';
}

export function createWriteQueue(deps: QueueDeps): WriteQueue {
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const lock = deps.lock ?? (async (task) => (await task(), true));
  const cap = deps.concurrency ?? 4;
  let ops: PendingOp[] = [];
  const waiters = new Map<string, Waiter[]>();
  const active = new Set<string>();
  /** Rows paused after a network failure, until the next retry moment. */
  const blocked = new Set<string>();
  let session: Promise<void> | null = null;
  let locked = false;
  let idle: (() => void) | null = null;
  let failures = 0;
  let timer: unknown = null;

  const settle = (opId: string, outcome: Outcome | { error: unknown }) => {
    const list = waiters.get(opId);
    waiters.delete(opId);
    for (const w of list ?? []) {
      if ('error' in outcome) w.reject(outcome.error);
      else w.resolve(outcome);
    }
    return Boolean(list?.length);
  };

  const merge = (kept: PendingOp[]) => {
    const known = new Set(ops.map((o) => o.opId));
    // Writes kept from an earlier visit go first (they are older than anything submitted now).
    ops = [...kept.filter((o) => !known.has(o.opId)), ...ops];
  };

  // Nothing is saved before the kept writes are read: a slow read must never be overwritten by an empty queue.
  const loaded = deps.load().then(
    (kept) => {
      merge(kept);
      return kept.length > 0;
    },
    () => false,
  );
  let saving: Promise<unknown> = loaded;
  const persist = () => {
    saving = saving.then(() => deps.save(ops.slice())).catch(() => undefined);
  };
  const ready = (
    deps.loadTimeoutMs
      ? Promise.race([loaded, new Promise((resolve) => setTimer(() => resolve(false), deps.loadTimeoutMs!))])
      : loaded
  ).then(() => undefined);
  void loaded.then((any) => {
    if (!any) return;
    persist();
    void flush();
  });

  const schedule = () => {
    if (timer != null) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      void flush();
    }, backoffDelay(failures));
  };

  function run(op: PendingOp) {
    active.add(op.opId);
    const row = rowOf(op);
    const controller = new AbortController();
    let timeout: unknown = null;
    const attempt = new Promise<unknown>((resolve, reject) => {
      const ms = deps.attemptTimeoutMs ?? 0;
      if (ms > 0) {
        timeout = setTimer(() => {
          controller.abort();
          reject(new AttemptTimeout('write attempt timed out'));
        }, ms);
      }
      deps.execute(op, controller.signal).then(resolve, reject);
    });
    attempt
      .then(
        (result) => {
          ops = ops.filter((o) => o.opId !== op.opId);
          failures = 0;
          if (!settle(op.opId, { sent: true, result })) deps.onBackgroundDone?.(op);
        },
        (err: unknown) => {
          if (isRetryableWriteError(err)) {
            ops = ops.map((o) => (o.opId === op.opId ? { ...o, tries: o.tries + 1 } : o));
            failures += 1;
            blocked.add(row);
            // This row waits for the next retry; its writes resolve as saved (the screen keeps its state).
            for (const o of ops) if (rowOf(o) === row) settle(o.opId, { sent: false });
            schedule();
            return;
          }
          ops = ops.filter((o) => o.opId !== op.opId);
          if (!settle(op.opId, { error: err })) deps.onBackgroundDone?.(op);
        },
      )
      .finally(() => {
        if (timeout != null) clearTimer(timeout);
        active.delete(op.opId);
        persist();
        startRunnable();
      });
  }

  function startRunnable() {
    if (!locked) return;
    for (const op of runnable(ops, active, blocked, cap)) run(op);
    if (active.size === 0) idle?.();
  }

  function pump(): Promise<void> {
    if (session) {
      startRunnable();
      return session;
    }
    session = (async () => {
      await ready;
      if (runnable(ops, active, blocked, cap).length === 0) return;
      const ran = await lock(
        () =>
          new Promise<void>((resolve) => {
            locked = true;
            idle = resolve;
            startRunnable();
          }),
      );
      if (!ran) {
        // Another tab is sending: this tab's waiting writes are kept and tried again later.
        for (const o of ops) settle(o.opId, { sent: false });
        failures = Math.max(failures, 1);
        schedule();
      }
    })().finally(() => {
      locked = false;
      idle = null;
      session = null;
    });
    return session;
  }

  /** A retry moment: every paused row may go again. */
  function flush(): Promise<void> {
    if (timer != null) {
      clearTimer(timer);
      timer = null;
    }
    blocked.clear();
    return pump();
  }

  function submit<R>(input: NewPendingOp): Promise<Outcome<R>> {
    const op: PendingOp = { ...input, opId: newId(), tries: 0 };
    return new Promise<Outcome<R>>((resolve, reject) => {
      const { queue, target, cancelled } = coalesce(ops, op, active);
      ops = queue;
      for (const id of cancelled) settle(id, { sent: false });
      const waiter: Waiter = { resolve: resolve as (o: Outcome) => void, reject };
      if (target == null) waiter.resolve({ sent: false });
      else {
        waiters.set(target, [...(waiters.get(target) ?? []), waiter]);
        if (deps.answerWithinMs) {
          setTimer(() => {
            if (waiters.get(target)?.includes(waiter)) {
              waiters.set(
                target,
                waiters.get(target)!.filter((w) => w !== waiter),
              );
              waiter.resolve({ sent: false });
            }
          }, deps.answerWithinMs);
        }
      }
      persist();
      // A new write is a good moment to try its row again (order within the row is kept).
      blocked.delete(rowOf(op));
      const running = session;
      void pump();
      // A session already ending may have passed it by: once it ends, go again if this write is still unanswered.
      if (running) void running.then(() => (target != null && waiters.has(target) ? pump() : undefined));
    });
  }

  return { submit, flush, pending: () => ops, ready };
}

// ——— Saved queue: one IndexedDB key per tab ———

const KEY_PREFIX = 'pending-writes.v2:';

export interface KeyValue {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void>;
  del: (key: string) => Promise<void>;
  keys: () => Promise<IDBValidKey[]>;
}

/**
 * Each tab saves its writes under its own key, so tabs never overwrite each other. At start a tab takes over the
 * keys of tabs that are gone (`isGone`) and deletes them once its own save holds their writes.
 */
export function createTabStore(kv: KeyValue, tabId: string, isGone: (tabId: string) => Promise<boolean>) {
  const own = `${KEY_PREFIX}${tabId}`;
  let adopted: string[] = [];
  return {
    load: async (): Promise<PendingOp[]> => {
      const out: PendingOp[] = [];
      for (const key of await kv.keys()) {
        if (typeof key !== 'string' || !key.startsWith(KEY_PREFIX) || key === own) continue;
        if (!(await isGone(key.slice(KEY_PREFIX.length)))) continue;
        const kept = await kv.get(key);
        if (Array.isArray(kept)) out.push(...(kept as PendingOp[]));
        adopted.push(key);
      }
      // A write kept from another visit may have reached the server (its answer lost): never fold into it.
      return out.map((o) => ({ ...o, tries: Math.max(1, o.tries) }));
    },
    save: async (ops: PendingOp[]) => {
      await (ops.length ? kv.set(own, ops) : kv.del(own));
      const gone = adopted;
      adopted = [];
      await Promise.all(gone.map((key) => kv.del(key)));
    },
  };
}

// ——— The app's queue ———

const LOCK_NAME = 'coverscape-pending-writes';
const TAB_LOCK = 'coverscape-pending-writes-tab:';
const READY_WAIT_MS = 1_500;
let client: QueryClient | null = null;
let queue: WriteQueue | null = null;

/** Duplicate key on a create that was already tried: the earlier try reached the server, its answer was lost. */
const alreadyThere = (err: unknown) =>
  err != null && typeof err === 'object' && (err as { code?: unknown }).code === '23505';

/** Demo build: the in-memory backend (no network, nothing to abort). */
async function executeDemo(op: PendingOp): Promise<unknown> {
  const data = op.data ?? {};
  if (op.kind === 'vote') {
    const { wishesBackend } = await import('./backend/wishes');
    const b = data as { pollId: string; memberId: string; optionIds: string[] };
    return wishesBackend.castVote(b.pollId, b.memberId, b.optionIds);
  }
  const { backend } = await import('./backend/core');
  if (op.kind === 'clip') {
    if (op.action === 'create') return backend.insertClip(data as Parameters<typeof backend.insertClip>[0]);
    if (op.action === 'update') return backend.updateClip(op.id, data);
    return backend.deleteClip(op.id);
  }
  if (op.action === 'create') return backend.insertNote(data as Parameters<typeof backend.insertNote>[0]);
  if (op.action === 'update') return backend.updateNote(op.id, data);
  return backend.deleteNote(op.id);
}

/**
 * The same requests as `core.supabase` / `wishes.supabase` (insert / update / delete by id, `cast_vote`), with the
 * try's abort signal on them so a try that took too long is really cancelled, never landing after a newer write.
 */
async function executeSupabase(op: PendingOp, signal: AbortSignal): Promise<unknown> {
  const [{ supabase }, { must }] = await Promise.all([import('./supabase'), import('./backend/shared')]);
  const data = op.data ?? {};
  if (op.kind === 'vote') {
    const b = data as { pollId: string; memberId: string; optionIds: string[] };
    const res = await supabase
      .rpc('cast_vote', { p_poll: b.pollId, p_member: b.memberId, p_options: b.optionIds })
      .abortSignal(signal);
    return Number(must(res)) || 0;
  }
  const table = op.kind === 'clip' ? 'clips' : 'notes';
  if (op.action === 'create') {
    // `data` is the row the mutation built for this table.
    const insert = supabase.from(table).insert(data as never);
    return must(await insert.select().abortSignal(signal).single());
  }
  if (op.action === 'update') {
    const update = supabase.from(table).update(data as never);
    return must(await update.eq('id', op.id).select().abortSignal(signal).single());
  }
  must(await supabase.from(table).delete().eq('id', op.id).abortSignal(signal));
  return undefined;
}

async function execute(op: PendingOp, signal: AbortSignal): Promise<unknown> {
  try {
    return await (IS_DEMO ? executeDemo(op) : executeSupabase(op, signal));
  } catch (err) {
    if (op.action === 'create' && op.tries > 0 && alreadyThere(err)) return undefined;
    throw err;
  }
}

const locks = () => (typeof navigator !== 'undefined' ? navigator.locks : undefined);

function lockAcrossTabs(task: () => Promise<void>): Promise<boolean> {
  const l = locks();
  if (!l?.request) return task().then(() => true);
  return l.request(LOCK_NAME, { ifAvailable: true }, (held) =>
    held ? task().then(() => true) : false,
  ) as Promise<boolean>;
}

/** A tab is gone when its life lock is free (without the Locks API: assume gone — every write is idempotent). */
function tabGone(tabId: string): Promise<boolean> {
  const l = locks();
  if (!l?.request) return Promise.resolve(true);
  return l.request(`${TAB_LOCK}${tabId}`, { ifAvailable: true }, (held) => held != null) as Promise<boolean>;
}

function invalidate(op: PendingOp) {
  for (const key of op.invalidate) void client?.invalidateQueries({ queryKey: [...key] });
}

function appQueue(): WriteQueue {
  if (queue) return queue;
  const tabId = crypto.randomUUID();
  // Held for the tab's whole life: other tabs see this one is alive and leave its saved writes alone.
  void locks()?.request(`${TAB_LOCK}${tabId}`, () => new Promise<never>(() => undefined));
  const idb = () => import('idb-keyval');
  const store = createTabStore(
    {
      get: (key) => idb().then((m) => m.get(key)),
      set: (key, value) => idb().then((m) => m.set(key, value)),
      del: (key) => idb().then((m) => m.del(key)),
      keys: () => idb().then((m) => m.keys()),
    },
    tabId,
    tabGone,
  );
  queue = createWriteQueue({
    ...store,
    execute,
    onBackgroundDone: invalidate,
    lock: lockAcrossTabs,
    attemptTimeoutMs: 20_000,
    answerWithinMs: 6_000,
    loadTimeoutMs: READY_WAIT_MS * 2,
  });
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => void queue?.flush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void queue?.flush();
    });
  }
  return queue;
}

/**
 * Hooks the app's query client in (for refreshing lists after background sends), starts the queue, and resolves
 * once the writes kept on this device are loaded — a list's queryFn awaits it next to its request, so its overlay
 * includes them.
 */
export function pendingReady(queryClient: QueryClient): Promise<void> {
  client = queryClient;
  const ready = appQueue().ready;
  // A stuck IndexedDB (seen on some WebKit builds) never holds a list back for long.
  return Promise.race([ready, new Promise<void>((resolve) => setTimeout(resolve, READY_WAIT_MS))]);
}

/** Sends a write through the queue (see the module note). */
export function submitWrite<R>(queryClient: QueryClient, op: NewPendingOp): Promise<Outcome<R>> {
  client = queryClient;
  return appQueue().submit<R>(op);
}

/** The writes of one kind still waiting (for laying over fetched lists). Empty until the queue has started. */
export function pendingOf(kind: PendingKind): readonly PendingOp[] {
  return queue ? queue.pending().filter((o) => o.kind === kind) : [];
}
