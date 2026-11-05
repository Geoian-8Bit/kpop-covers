import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyError,
  createTimeoutFetch,
  queryRetry,
  queryRetryDelay,
  timesOut,
  TRANSIENT_RETRIES,
} from './netRules';

describe('classifyError', () => {
  it('reads fetch failures, timeouts and 5xx as transient', () => {
    expect(classifyError(new TypeError('Failed to fetch'))).toBe('transient');
    expect(classifyError(new TypeError('Load failed'))).toBe('transient');
    expect(classifyError(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe('transient');
    expect(classifyError(Object.assign(new Error('x'), { name: 'TimeoutError' }))).toBe('transient');
    // postgrest-js turns a failed fetch into a plain object with the error's name in the message.
    expect(classifyError({ message: 'TypeError: Failed to fetch', code: '', details: '', hint: '' })).toBe(
      'transient',
    );
    expect(classifyError({ message: 'TimeoutError: La petición tardó demasiado', code: '' })).toBe(
      'transient',
    );
    expect(classifyError({ message: '<html>502 Bad Gateway</html>', code: '' })).toBe('transient');
    expect(classifyError({ status: 503, message: 'x' })).toBe('transient');
    expect(classifyError({ status: 429, message: 'x' })).toBe('transient');
    expect(classifyError({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe(
      'transient',
    );
    expect(classifyError({ code: '08006', message: 'connection failure' })).toBe('transient');
    expect(
      classifyError({ code: 'PGRST002', message: 'Could not query the database for the schema cache' }),
    ).toBe('transient');
  });

  it('reads PostgREST, RLS, constraint and 4xx errors as permanent', () => {
    expect(
      classifyError({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }),
    ).toBe('permanent');
    expect(classifyError({ code: '42501', message: 'new row violates row-level security policy' })).toBe(
      'permanent',
    );
    expect(classifyError({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(
      'permanent',
    );
    expect(classifyError({ code: 'P0001', message: 'videos_cap_reached' })).toBe('permanent');
    expect(classifyError({ status: 404, message: 'Not found' })).toBe('permanent');
    expect(classifyError({ status: 401, message: 'JWT expired' })).toBe('permanent');
  });

  it('leaves anything else unknown', () => {
    expect(classifyError(new Error('Algo raro'))).toBe('unknown');
    expect(classifyError(null)).toBe('unknown');
    expect(classifyError('boom')).toBe('unknown');
  });
});

describe('queryRetry', () => {
  it('retries transient errors up to the limit', () => {
    const error = new TypeError('Failed to fetch');
    for (let n = 0; n < TRANSIENT_RETRIES; n++) expect(queryRetry(n, error)).toBe(true);
    expect(queryRetry(TRANSIENT_RETRIES, error)).toBe(false);
  });

  it('never retries permanent errors', () => {
    expect(queryRetry(0, { code: '42501', message: 'rls' })).toBe(false);
    expect(queryRetry(0, { code: 'PGRST301', message: 'x' })).toBe(false);
  });

  it('retries unknown errors once, as before', () => {
    expect(queryRetry(0, new Error('x'))).toBe(true);
    expect(queryRetry(1, new Error('x'))).toBe(false);
  });
});

describe('queryRetryDelay', () => {
  it('doubles from 1 s and caps at 10 s', () => {
    const mid = () => 0.5;
    expect([0, 1, 2, 3, 4, 10].map((n) => queryRetryDelay(n, mid))).toEqual([
      1000, 2000, 4000, 8000, 10_000, 10_000,
    ]);
  });

  it('spreads each wait by ±25 % and never passes the cap', () => {
    expect(queryRetryDelay(0, () => 0)).toBe(750);
    expect(queryRetryDelay(0, () => 0.999999)).toBe(1250);
    expect(queryRetryDelay(3, () => 0.999999)).toBe(10_000);
  });
});

describe('timesOut', () => {
  it('times reads only, never storage transfers, realtime or writes', () => {
    expect(timesOut('https://x.supabase.co/rest/v1/videos?select=*')).toBe(true);
    expect(timesOut('https://x.supabase.co/rest/v1/videos', 'HEAD')).toBe(true);
    expect(timesOut('https://x.supabase.co/rest/v1/rpc/calendar_members', 'POST')).toBe(true);
    expect(timesOut('https://x.supabase.co/rest/v1/rpc/cast_vote', 'POST')).toBe(false);
    expect(timesOut('https://x.supabase.co/rest/v1/notes', 'POST')).toBe(false);
    expect(timesOut('https://x.supabase.co/rest/v1/notes?id=eq.1', 'PATCH')).toBe(false);
    expect(timesOut('https://x.supabase.co/storage/v1/object/videos/a.mp4')).toBe(false);
    expect(timesOut('https://x.supabase.co/storage/v1/object/sign/videos/a.mp4', 'POST')).toBe(false);
    expect(timesOut('wss://x.supabase.co/realtime/v1/websocket')).toBe(false);
  });
});

describe('createTimeoutFetch', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A fetch that never answers until its signal aborts. */
  const hanging = vi.fn<typeof fetch>(
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      }),
  );

  it('aborts a read with no answer after the deadline', async () => {
    vi.useFakeTimers();
    const timed = createTimeoutFetch(hanging, { timeoutMs: 15_000 });
    const result = timed('https://x/rest/v1/videos').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(hanging.mock.calls.at(-1)?.[1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const error = (await result) as { name: string };
    expect(error.name).toBe('TimeoutError');
    expect(classifyError(error)).toBe('transient');
  });

  it('passes the answer through, status and body intact', async () => {
    const base = vi.fn<typeof fetch>(
      async () => new Response('[{"id":1}]', { status: 206, statusText: 'Partial' }),
    );
    const response = await createTimeoutFetch(base)('https://x/rest/v1/videos');
    expect(response.status).toBe(206);
    expect(await response.json()).toEqual([{ id: 1 }]);
    const empty = await createTimeoutFetch(async () => new Response(null, { status: 204 }))(
      'https://x/rest/v1/v',
    );
    expect(empty.status).toBe(204);
  });

  it("follows the caller's own signal", async () => {
    vi.useFakeTimers();
    const own = new AbortController();
    const result = createTimeoutFetch(hanging)('https://x/rest/v1/videos', { signal: own.signal }).catch(
      (e: unknown) => e,
    );
    own.abort(Object.assign(new Error('mine'), { name: 'AbortError' }));
    expect(((await result) as Error).message).toBe('mine');
  });

  it('leaves writes and storage alone (same init, no deadline)', async () => {
    const base = vi.fn<typeof fetch>(async () => new Response('ok'));
    const timed = createTimeoutFetch(base);
    const init = { method: 'POST', body: 'x' };
    await timed('https://x/storage/v1/object/videos/a.mp4', init);
    await timed('https://x/rest/v1/notes', init);
    expect(base.mock.calls.every(([, i]) => i === init)).toBe(true);
  });

  /** A response whose body sends `chunks` parts, one every `everyMs` (fake timers), then stalls if `stall`. */
  const trickle = (chunks: number, everyMs: number, stall = false) =>
    vi.fn<typeof fetch>(async (_input, init) => {
      let sent = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
      const body = new ReadableStream<Uint8Array>({
        start: (controller) => {
          stream = controller;
        },
        pull(controller) {
          return new Promise<void>((resolve) => {
            if (sent === chunks) {
              if (!stall) controller.close();
              if (!stall) resolve();
              return;
            }
            timer = setTimeout(() => {
              sent++;
              controller.enqueue(new TextEncoder().encode('a'));
              resolve();
            }, everyMs);
          });
        },
        cancel: () => clearTimeout(timer),
      });
      // As a real fetch does: aborting its signal errors the body mid-way.
      init?.signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        stream?.error(init.signal!.reason);
      });
      return new Response(body);
    });

  it('lets a large answer on slow-but-working 4G finish (idle deadline, not total)', async () => {
    vi.useFakeTimers();
    // 10 parts, one every 5 s: 50 s in all, never 12 s without a byte.
    const result = createTimeoutFetch(trickle(10, 5000), { timeoutMs: 12_000 })(
      'https://x/rest/v1/video_posters',
    );
    await vi.advanceTimersByTimeAsync(55_000);
    expect(await (await result).text()).toBe('aaaaaaaaaa');
  });

  it('aborts when the body stalls mid-way', async () => {
    vi.useFakeTimers();
    const result = createTimeoutFetch(trickle(2, 1000, true), { timeoutMs: 12_000 })(
      'https://x/rest/v1/v',
    ).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(2000 + 12_000);
    expect(((await result) as { name: string }).name).toBe('TimeoutError');
  });
});
