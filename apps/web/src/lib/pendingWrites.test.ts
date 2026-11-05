import { describe, expect, it, vi } from 'vitest';
import {
  createTabStore,
  createWriteQueue,
  type KeyValue,
  type NewPendingOp,
  type QueueDeps,
} from './pendingWrites';
import type { PendingOp } from './pendingWritesRules';

const offline = () => new TypeError('Failed to fetch');
const rejected = () => ({
  message: 'new row violates row-level security policy',
  code: '42501',
  status: 403,
});

const write = (over: Partial<NewPendingOp> & Pick<NewPendingOp, 'id'>): NewPendingOp => ({
  kind: 'clip',
  action: 'update',
  data: { name: over.id },
  invalidate: [['clips', 'v1']],
  ...over,
});

/** Lets every pending promise callback run. */
const settleAll = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function setup(over: Partial<QueueDeps> = {}) {
  const sent: PendingOp[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  const saves: PendingOp[][] = [];
  let n = 0;
  const behaviour: { fail: null | (() => unknown) } = { fail: null };
  const deps: QueueDeps = {
    load: async () => [],
    save: async (ops) => void saves.push(ops),
    execute: async (op) => {
      if (behaviour.fail) throw behaviour.fail();
      sent.push(op);
      return { ok: op.id };
    },
    setTimer: (fn, ms) => timers.push({ fn, ms }),
    clearTimer: () => undefined,
    newId: () => `op${++n}`,
    ...over,
  };
  const queue = createWriteQueue(deps);
  return { queue, sent, timers, behaviour, saves };
}

describe('createWriteQueue', () => {
  it('sends a write straight away and resolves with the server answer', async () => {
    const { queue, sent } = setup();
    await expect(queue.submit(write({ id: 'a' }))).resolves.toEqual({ sent: true, result: { ok: 'a' } });
    expect(sent.map((o) => o.id)).toEqual(['a']);
    expect(queue.pending()).toEqual([]);
  });

  it('keeps writes on a network failure, resolves them as saved and retries them later', async () => {
    const onBackgroundDone = vi.fn();
    const { queue, sent, timers, behaviour, saves } = setup({ onBackgroundDone });
    behaviour.fail = offline;
    await expect(queue.submit(write({ id: 'a' }))).resolves.toEqual({ sent: false });
    await expect(queue.submit(write({ id: 'b' }))).resolves.toEqual({ sent: false });
    await settleAll();
    expect(queue.pending().map((o) => o.id)).toEqual(['a', 'b']);
    expect(saves.at(-1)!.map((o) => o.id)).toEqual(['a', 'b']);
    expect(timers.length).toBeGreaterThan(0);

    behaviour.fail = null;
    timers.at(-1)!.fn();
    await settleAll();
    expect(sent.map((o) => o.id)).toEqual(['a', 'b']);
    expect(queue.pending()).toEqual([]);
    expect(onBackgroundDone).toHaveBeenCalledTimes(2);
  });

  it('backs off longer after each failure in a row', async () => {
    const { queue, timers, behaviour } = setup();
    behaviour.fail = offline;
    await queue.submit(write({ id: 'a' }));
    await settleAll();
    await queue.flush();
    await settleAll();
    expect(timers.map((t) => t.ms)).toEqual([5000, 10000]);
  });

  it('rejects a write the server turns down, exactly as before', async () => {
    const { queue, sent } = setup({
      execute: async (op) => {
        if (op.id === 'bad') throw rejected();
        sent.push(op);
        return null;
      },
    });
    const bad = queue.submit(write({ id: 'bad' }));
    const good = queue.submit(write({ id: 'good' }));
    await expect(bad).rejects.toMatchObject({ code: '42501' });
    await expect(good).resolves.toEqual({ sent: true, result: null });
    expect(queue.pending()).toEqual([]);
  });

  it('a write turned down in the background is dropped and its lists refreshed', async () => {
    const onBackgroundDone = vi.fn();
    const { queue, behaviour } = setup({ onBackgroundDone });
    behaviour.fail = offline;
    await expect(queue.submit(write({ id: 'a' }))).resolves.toEqual({ sent: false });
    await settleAll();
    behaviour.fail = rejected;
    await queue.flush();
    await settleAll();
    expect(queue.pending()).toEqual([]);
    expect(onBackgroundDone).toHaveBeenCalledTimes(1);
  });

  it('folds untried writes for the same row (last write wins) and sends one', async () => {
    const gate = deferred();
    const { queue, sent } = setup({
      execute: async (op) => {
        await gate.promise;
        sent.push(op);
        return null;
      },
    });
    // Submitted in the same tick: nothing has started yet (the queue first waits for its kept writes), so they fold.
    const all = [
      queue.submit(write({ id: 'a', action: 'create', data: { id: 'a', name: '1' } })),
      queue.submit(write({ id: 'a', data: { name: '2' } })),
      queue.submit(write({ id: 'b', data: { name: 'x' } })),
      queue.submit(write({ id: 'b', action: 'delete', data: undefined })),
    ];
    gate.resolve();
    await Promise.all(all);
    expect(sent.map((o) => [o.id, o.action, o.data])).toEqual([
      ['a', 'create', { id: 'a', name: '2' }],
      ['b', 'delete', undefined],
    ]);
  });

  it('#2 regression: an update after a create kept from an earlier visit is sent after it, not lost', async () => {
    const kept: PendingOp = {
      ...write({ id: 'a', action: 'create', data: { id: 'a', name: '1' } }),
      opId: 'k',
      tries: 1,
    };
    const { queue, sent } = setup({ load: async () => [kept] });
    await queue.ready;
    await queue.submit(write({ id: 'a', data: { name: '2' } }));
    await settleAll();
    expect(sent.map((o) => [o.action, o.data])).toEqual([
      ['create', { id: 'a', name: '1' }],
      ['update', { name: '2' }],
    ]);
  });

  it('#1 regression: deleting a create that was already tried still sends the delete', async () => {
    const { queue, sent, behaviour } = setup();
    behaviour.fail = offline;
    await queue.submit(write({ id: 'a', action: 'create', data: { id: 'a' } }));
    await settleAll();
    await queue.submit(write({ id: 'a', action: 'delete', data: undefined }));
    await settleAll();
    behaviour.fail = null;
    await queue.flush();
    await settleAll();
    expect(sent.map((o) => o.action)).toEqual(['create', 'delete']);
  });

  it('#3 regression: a try that takes too long is aborted, and nothing new is folded into it', async () => {
    const timers: (() => void)[] = [];
    const signals: AbortSignal[] = [];
    const calls: PendingOp[] = [];
    const { queue } = setup({
      execute: (op, signal) => {
        calls.push(op);
        signals.push(signal);
        return calls.length === 1 ? new Promise(() => undefined) : Promise.resolve(null);
      },
      attemptTimeoutMs: 1000,
      setTimer: (fn) => timers.push(fn),
    });
    const a = queue.submit(write({ id: 'a', data: { name: 'old' } }));
    await settleAll();
    timers[0]!();
    await expect(a).resolves.toEqual({ sent: false });
    expect(signals[0]!.aborted).toBe(true);
    expect(queue.pending()[0]!.tries).toBe(1);
    await queue.submit(write({ id: 'a', data: { name: 'new' } }));
    await settleAll();
    // The aborted one is tried again first, then the newer write: the newer value is the last to land.
    expect(calls.map((o) => o.data)).toEqual([{ name: 'old' }, { name: 'old' }, { name: 'new' }]);
  });

  it('a write unanswered for a while resolves as saved, and its try goes on in the background', async () => {
    const answer = deferred<unknown>();
    const onBackgroundDone = vi.fn();
    const { queue, timers } = setup({
      execute: () => answer.promise,
      answerWithinMs: 6000,
      onBackgroundDone,
    });
    const a = queue.submit(write({ id: 'a' }));
    await settleAll();
    timers.find((t) => t.ms === 6000)!.fn();
    await expect(a).resolves.toEqual({ sent: false });
    expect(queue.pending().map((o) => o.id)).toEqual(['a']);
    answer.resolve({ ok: 'a' });
    await settleAll();
    expect(queue.pending()).toEqual([]);
    expect(onBackgroundDone).toHaveBeenCalledTimes(1);
  });

  it('a quick answer still resolves with the server row', async () => {
    const { queue, timers } = setup({ answerWithinMs: 6000 });
    await expect(queue.submit(write({ id: 'a' }))).resolves.toEqual({ sent: true, result: { ok: 'a' } });
    timers.find((t) => t.ms === 6000)!.fn();
    await settleAll();
    expect(queue.pending()).toEqual([]);
  });

  it('#4 regression: a slow read of the kept writes is merged in when it arrives, never overwritten', async () => {
    const read = deferred<PendingOp[]>();
    const loadTimers: (() => void)[] = [];
    const behaviourFail = { on: true };
    const saves: PendingOp[][] = [];
    const queue = createWriteQueue({
      load: () => read.promise,
      save: async (ops) => void saves.push(ops),
      execute: async () => {
        if (behaviourFail.on) throw offline();
        return null;
      },
      setTimer: (fn) => loadTimers.push(fn),
      clearTimer: () => undefined,
      loadTimeoutMs: 3000,
      newId: () => 'new',
    });
    loadTimers[0]!(); // the read is late: `ready` stops waiting
    await queue.ready;
    await expect(queue.submit(write({ id: 'b' }))).resolves.toEqual({ sent: false });
    await settleAll();
    expect(saves).toEqual([]); // nothing saved before the real read
    const kept: PendingOp = { ...write({ id: 'old' }), opId: 'k', tries: 1 };
    read.resolve([kept]);
    await settleAll();
    expect(queue.pending().map((o) => o.opId)).toEqual(['k', 'new']);
    expect(saves.at(-1)!.map((o) => o.opId)).toEqual(['k', 'new']);
  });

  it('#6 regression: a hung write does not hold back a fresh write for another row', async () => {
    const order: string[] = [];
    const { queue } = setup({
      execute: async (op) => {
        order.push(op.id);
        if (op.id === 'slow') await new Promise(() => undefined);
        return op.id;
      },
    });
    void queue.submit(write({ id: 'slow' }));
    await settleAll();
    await expect(queue.submit(write({ id: 'fresh' }))).resolves.toEqual({ sent: true, result: 'fresh' });
    expect(order).toEqual(['slow', 'fresh']);
  });

  it('#6: writes of one row go strictly one after the other', async () => {
    const order: string[] = [];
    const gate = deferred();
    const started = deferred();
    const { queue } = setup({
      execute: async (op) => {
        order.push(`start ${String(op.data?.name)}`);
        started.resolve();
        if (order.length === 1) await gate.promise;
        order.push(`end ${String(op.data?.name)}`);
        return null;
      },
    });
    const a = queue.submit(write({ id: 'r', data: { name: '1' } }));
    await started.promise;
    const b = queue.submit(write({ id: 'r', data: { name: '2' } }));
    await settleAll();
    expect(order).toEqual(['start 1']);
    gate.resolve();
    await Promise.all([a, b]);
    expect(order).toEqual(['start 1', 'end 1', 'start 2', 'end 2']);
  });

  it('#6: at most `concurrency` rows on their way at once', async () => {
    let running = 0;
    let most = 0;
    const { queue } = setup({
      concurrency: 2,
      execute: async () => {
        running += 1;
        most = Math.max(most, running);
        await settleAll();
        running -= 1;
        return null;
      },
    });
    await Promise.all(['a', 'b', 'c', 'd', 'e'].map((id) => queue.submit(write({ id }))));
    expect(most).toBe(2);
  });

  it('another tab holding the lock: writes are kept and tried later', async () => {
    const { queue, sent, timers } = setup({ lock: async () => false });
    await expect(queue.submit(write({ id: 'a' }))).resolves.toEqual({ sent: false });
    expect(sent).toEqual([]);
    expect(queue.pending()).toHaveLength(1);
    expect(timers).toHaveLength(1);
  });
});

describe('createTabStore (#5: tabs never overwrite each other)', () => {
  function memoryKv(initial: Record<string, unknown> = {}): KeyValue & { data: Map<string, unknown> } {
    const data = new Map(Object.entries(initial));
    return {
      data,
      get: async (k) => data.get(k),
      set: async (k, v) => void data.set(k, v),
      del: async (k) => void data.delete(k),
      keys: async () => [...data.keys()],
    };
  }
  const kept = (id: string, tries = 0): PendingOp => ({ ...write({ id }), opId: id, tries });

  it('saves under its own key and leaves live tabs alone', async () => {
    const kv = memoryKv({ 'pending-writes.v2:alive': [kept('x')], other: 1 });
    const store = createTabStore(kv, 'me', async (tab) => tab !== 'alive');
    expect(await store.load()).toEqual([]);
    await store.save([kept('mine')]);
    expect(kv.data.get('pending-writes.v2:me')).toEqual([kept('mine')]);
    expect(kv.data.get('pending-writes.v2:alive')).toEqual([kept('x')]);
    await store.save([]);
    expect(kv.data.has('pending-writes.v2:me')).toBe(false);
  });

  it('takes over the writes of a closed tab (as already tried) and deletes its key after saving', async () => {
    const kv = memoryKv({ 'pending-writes.v2:gone': [kept('y')] });
    const store = createTabStore(kv, 'me', async () => true);
    expect(await store.load()).toEqual([kept('y', 1)]);
    expect(kv.data.has('pending-writes.v2:gone')).toBe(true);
    await store.save([kept('y', 1)]);
    expect(kv.data.has('pending-writes.v2:gone')).toBe(false);
    expect(kv.data.get('pending-writes.v2:me')).toEqual([kept('y', 1)]);
  });
});
