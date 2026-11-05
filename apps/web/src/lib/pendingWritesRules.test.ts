import { describe, expect, it } from 'vitest';
import {
  backoffDelay,
  coalesce,
  isRetryableWriteError,
  overlayBallots,
  overlayRows,
  runnable,
  type PendingOp,
} from './pendingWritesRules';

const op = (over: Partial<PendingOp> & Pick<PendingOp, 'opId' | 'action' | 'id'>): PendingOp => ({
  kind: 'clip',
  invalidate: [['clips', 'v1']],
  tries: 0,
  ...over,
});

describe('coalesce', () => {
  it('appends a write for a new row', () => {
    const a = op({ opId: 'a', action: 'update', id: 'c1', data: { name: 'A' } });
    const r = coalesce([], a);
    expect(r.queue).toEqual([a]);
    expect(r.target).toBe('a');
  });

  it('create + update = create with the final values', () => {
    const c = op({ opId: 'c', action: 'create', id: 'c1', data: { id: 'c1', name: 'A', speed: 1 } });
    const r = coalesce([c], op({ opId: 'u', action: 'update', id: 'c1', data: { name: 'B' } }));
    expect(r.queue).toHaveLength(1);
    expect(r.queue[0]).toMatchObject({
      opId: 'c',
      action: 'create',
      data: { id: 'c1', name: 'B', speed: 1 },
    });
    expect(r.target).toBe('c');
  });

  it('update + update merges the patches, the later one winning', () => {
    const u1 = op({ opId: 'u1', action: 'update', id: 'c1', data: { name: 'A', speed: 1 } });
    const r = coalesce([u1], op({ opId: 'u2', action: 'update', id: 'c1', data: { name: 'B' } }));
    expect(r.queue).toEqual([{ ...u1, data: { name: 'B', speed: 1 } }]);
  });

  it('update + delete = delete in the same place', () => {
    const other = op({ opId: 'x', action: 'update', id: 'c2', data: { name: 'X' } });
    const u = op({ opId: 'u', action: 'update', id: 'c1', data: { name: 'A' } });
    const r = coalesce([u, other], op({ opId: 'd', action: 'delete', id: 'c1' }));
    expect(r.queue.map((q) => [q.opId, q.action])).toEqual([
      ['u', 'delete'],
      ['x', 'update'],
    ]);
    expect(r.queue[0]!.data).toBeUndefined();
  });

  it('create + delete = nothing to send', () => {
    const c = op({ opId: 'c', action: 'create', id: 'c1', data: { id: 'c1' } });
    const r = coalesce([c], op({ opId: 'd', action: 'delete', id: 'c1' }));
    expect(r.queue).toEqual([]);
    expect(r.target).toBeNull();
    expect(r.cancelled).toEqual(['c']);
  });

  it('a later ballot replaces the waiting one of the same person and poll', () => {
    const v1 = op({ opId: 'v1', kind: 'vote', action: 'set', id: 'p:m', data: { optionIds: ['a'] } });
    const r = coalesce(
      [v1],
      op({ opId: 'v2', kind: 'vote', action: 'set', id: 'p:m', data: { optionIds: ['b'] } }),
    );
    expect(r.queue).toEqual([{ ...v1, data: { optionIds: ['b'] } }]);
  });

  it('never folds into the write being sent right now', () => {
    const c = op({ opId: 'c', action: 'create', id: 'c1', data: { id: 'c1', name: 'A' } });
    const u = op({ opId: 'u', action: 'update', id: 'c1', data: { name: 'B' } });
    const r = coalesce([c], u, new Set(['c']));
    expect(r.queue).toEqual([c, u]);
    const d = coalesce([c], op({ opId: 'd', action: 'delete', id: 'c1' }), new Set(['c']));
    expect(d.queue.map((q) => q.opId)).toEqual(['c', 'd']);
  });

  it('#1 regression: an already tried create is not cancelled by a delete (it may be on the server)', () => {
    const c = op({ opId: 'c', action: 'create', id: 'c1', data: { id: 'c1' }, tries: 1 });
    const r = coalesce([c], op({ opId: 'd', action: 'delete', id: 'c1' }));
    expect(r.queue.map((q) => [q.opId, q.action])).toEqual([
      ['c', 'create'],
      ['d', 'delete'],
    ]);
    expect(r.cancelled).toEqual([]);
    expect(r.target).toBe('d');
  });

  it('#2 regression: an update after an already tried create is queued after it, not folded in', () => {
    const c = op({ opId: 'c', action: 'create', id: 'c1', data: { id: 'c1', name: 'A' }, tries: 1 });
    const u = op({ opId: 'u', action: 'update', id: 'c1', data: { name: 'B' } });
    const r = coalesce([c], u);
    expect(r.queue).toEqual([c, u]);
    const u0 = op({ opId: 'u0', action: 'update', id: 'c1', data: { name: 'A' }, tries: 2 });
    expect(coalesce([u0], u).queue).toEqual([u0, u]);
    const v = op({ opId: 'v', kind: 'vote', action: 'set', id: 'p:m', data: { optionIds: ['a'] }, tries: 1 });
    const v2 = op({ opId: 'v2', kind: 'vote', action: 'set', id: 'p:m', data: { optionIds: ['b'] } });
    expect(coalesce([v], v2).queue).toEqual([v, v2]);
  });

  it('keeps rows of different kinds apart', () => {
    const clip = op({ opId: 'a', action: 'update', id: 'same', data: { name: 'A' } });
    const note = op({ opId: 'b', kind: 'note', action: 'update', id: 'same', data: { body: 'B' } });
    expect(coalesce([clip], note).queue).toEqual([clip, note]);
  });

  it('unites the keys to refresh', () => {
    const u1 = op({ opId: 'u1', action: 'update', id: 'c1', data: {}, invalidate: [['a']] });
    const r = coalesce(
      [u1],
      op({ opId: 'u2', action: 'update', id: 'c1', data: {}, invalidate: [['a'], ['b']] }),
    );
    expect(r.queue[0]!.invalidate).toEqual([['a'], ['b']]);
  });
});

describe('isRetryableWriteError', () => {
  it.each([
    ['fetch TypeError', new TypeError('Failed to fetch')],
    ['postgrest network answer', { message: 'TypeError: Failed to fetch', code: '', status: 0 }],
    ['Safari load failed', { message: 'TypeError: Load failed', code: '' }],
    ['AbortError', Object.assign(new Error('aborted'), { name: 'AbortError' })],
    ['TimeoutError', Object.assign(new Error('x'), { name: 'TimeoutError' })],
    ['502 html body', { message: '<html>Bad gateway</html>', status: 502 }],
    ['503', { message: 'unavailable', status: 503 }],
    ['408', { message: 'x', status: 408 }],
    ['429', { message: 'slow down', status: 429 }],
    ['statement timeout', { message: 'canceling statement', code: '57014' }],
  ])('retries: %s', (_label, err) => {
    expect(isRetryableWriteError(err)).toBe(true);
  });

  it.each([
    ['RLS', { message: 'new row violates row-level security policy', code: '42501', status: 403 }],
    ['unique', { message: 'duplicate key value', code: '23505', status: 409 }],
    [
      'no row',
      { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116', status: 406 },
    ],
    ['raised', { message: 'poll_closed', code: 'P0001', status: 400 }],
    ['check', { message: 'violates check constraint', code: '23514' }],
    ['plain 400 without code', { message: 'bad', status: 400 }],
    ['a plain error', new Error('not found')],
    ['nothing', null],
  ])('fails as today: %s', (_label, err) => {
    expect(isRetryableWriteError(err)).toBe(false);
  });
});

describe('backoffDelay', () => {
  it('doubles from 5 s up to a 60 s cap', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map((n) => backoffDelay(n))).toEqual([
      5000, 5000, 10000, 20000, 40000, 60000, 60000,
    ]);
  });
});

describe('overlayRows', () => {
  type Row = { id: string; video_id: string; name: string };
  const rows: Row[] = [
    { id: 'a', video_id: 'v1', name: 'A' },
    { id: 'b', video_id: 'v1', name: 'B' },
  ];
  const opts = {
    belongs: (d: Record<string, unknown>) => d.video_id === 'v1',
    toRow: (d: Record<string, unknown>) => d as unknown as Row,
  };

  it('returns the same list when nothing waits', () => {
    expect(overlayRows(rows, [], opts)).toBe(rows);
  });

  it('adds waiting creates, applies patches and removes deletes', () => {
    const out = overlayRows(
      rows,
      [
        op({ opId: '1', action: 'create', id: 'c', data: { id: 'c', video_id: 'v1', name: 'C' } }),
        op({ opId: '2', action: 'create', id: 'z', data: { id: 'z', video_id: 'v2', name: 'other video' } }),
        op({ opId: '3', action: 'update', id: 'a', data: { name: 'A2' } }),
        op({ opId: '4', action: 'delete', id: 'b' }),
        op({ opId: '5', action: 'update', id: 'gone', data: { name: 'x' } }),
      ],
      opts,
    );
    expect(out).toEqual([
      { id: 'a', video_id: 'v1', name: 'A2' },
      { id: 'c', video_id: 'v1', name: 'C' },
    ]);
  });

  it('does not duplicate a created row the server already returns', () => {
    const out = overlayRows(
      rows,
      [op({ opId: '1', action: 'create', id: 'a', data: { id: 'a', video_id: 'v1', name: 'A!' } })],
      opts,
    );
    expect(out).toEqual([{ id: 'a', video_id: 'v1', name: 'A!' }, rows[1]]);
  });
});

describe('overlayBallots', () => {
  type Vote = { poll_id: string; member_id: string; option_id: string };
  const toVote = (b: { pollId: string; memberId: string }, option_id: string): Vote => ({
    poll_id: b.pollId,
    member_id: b.memberId,
    option_id,
  });

  it("replaces that person's rows in that poll only", () => {
    const votes: Vote[] = [
      { poll_id: 'p', member_id: 'm', option_id: 'old' },
      { poll_id: 'p', member_id: 'n', option_id: 'x' },
      { poll_id: 'q', member_id: 'm', option_id: 'y' },
    ];
    const ballot = op({
      opId: '1',
      kind: 'vote',
      action: 'set',
      id: 'p:m',
      data: { pollId: 'p', memberId: 'm', optionIds: ['a', 'b'] },
    });
    const out = overlayBallots(votes, [ballot], ['p', 'q'], toVote);
    expect(out).toEqual([
      { poll_id: 'p', member_id: 'n', option_id: 'x' },
      { poll_id: 'q', member_id: 'm', option_id: 'y' },
      { poll_id: 'p', member_id: 'm', option_id: 'a' },
      { poll_id: 'p', member_id: 'm', option_id: 'b' },
    ]);
    expect(overlayBallots(votes, [ballot], ['q'], toVote)).toBe(votes);
  });
});

describe('runnable (#6: rows side by side, each row in order)', () => {
  const q = [
    op({ opId: 'a1', action: 'update', id: 'a', data: {} }),
    op({ opId: 'b1', action: 'update', id: 'b', data: {} }),
    op({ opId: 'a2', action: 'update', id: 'a', data: {} }),
    op({ opId: 'c1', action: 'update', id: 'c', data: {} }),
    op({ opId: 'd1', action: 'update', id: 'd', data: {} }),
  ];
  const ids = (ops: PendingOp[]) => ops.map((o) => o.opId);

  it('starts the oldest write of every row, never two of one row', () => {
    expect(ids(runnable(q, new Set(), new Set(), 10))).toEqual(['a1', 'b1', 'c1', 'd1']);
  });

  it('a row with a write on its way waits; other rows still go', () => {
    expect(ids(runnable(q, new Set(['a1']), new Set(), 10))).toEqual(['b1', 'c1', 'd1']);
  });

  it('skips paused rows and respects the cap', () => {
    expect(ids(runnable(q, new Set(), new Set(['clip:b']), 2))).toEqual(['a1', 'c1']);
    expect(ids(runnable(q, new Set(['x', 'y']), new Set(), 3))).toEqual(['a1']);
  });
});
