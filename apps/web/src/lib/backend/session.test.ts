import { describe, expect, it, vi } from 'vitest';
import { memoryStorage, storedSession } from '../testing/storage';
import {
  EXPIRY_MARGIN_S,
  createSessionRefresher,
  createSessionStore,
  isSessionValid,
  legacyStorageKey,
  parseLegacySession,
  refreshedSession,
} from './session';

// REQ-11 · The login era's session, read by hand from supabase-js's localStorage key.

const NOW = Date.UTC(2026, 10, 1, 12);
const user = { id: 'u1', email: 'ana@example.com' };
const session = (expiresAt: number | undefined, token = 'jwt-ana') => storedSession(expiresAt, { token });

/** A JWT whose payload says `exp`. */
const jwt = (exp: number) => `h.${btoa(JSON.stringify({ exp })).replace(/=+$/, '')}.s`;

describe('legacyStorageKey', () => {
  it('derives the key supabase-js used from the project URL', () => {
    expect(legacyStorageKey('https://pevbjaowyctqqldvzovz.supabase.co')).toBe(
      'sb-pevbjaowyctqqldvzovz-auth-token',
    );
    expect(legacyStorageKey('http://127.0.0.1:54329')).toBe('sb-127-auth-token');
  });
  it('is null without a usable URL', () => {
    expect(legacyStorageKey(undefined)).toBeNull();
    expect(legacyStorageKey('not a url')).toBeNull();
  });
});

describe('parseLegacySession', () => {
  it('reads a stored session', () => {
    expect(parseLegacySession(session(NOW / 1000 + 60))?.user).toEqual(user);
  });
  it('ignores a corrupt or foreign value without throwing', () => {
    for (const raw of [
      null,
      '',
      '{',
      'null',
      '42',
      '"x"',
      '{}',
      '{"access_token":"t"}',
      '{"access_token":"t","user":{}}',
    ])
      expect(parseLegacySession(raw)).toBeNull();
  });
});

describe('isSessionValid', () => {
  it('goes by expires_at', () => {
    expect(isSessionValid(parseLegacySession(session(NOW / 1000 + 60))!, NOW)).toBe(true);
    expect(isSessionValid(parseLegacySession(session(NOW / 1000 - 1))!, NOW)).toBe(false);
  });
  it("falls back to the JWT's exp, and an unreadable token counts as expired", () => {
    expect(isSessionValid(parseLegacySession(session(undefined, jwt(NOW / 1000 + 60)))!, NOW)).toBe(true);
    expect(isSessionValid(parseLegacySession(session(undefined, jwt(NOW / 1000 - 60)))!, NOW)).toBe(false);
    expect(isSessionValid(parseLegacySession(session(undefined, 'opaque'))!, NOW)).toBe(false);
  });
});

describe('createSessionStore', () => {
  const KEY = 'sb-x-auth-token';

  it('gives the JWT only while the session is valid, the user either way', () => {
    const valid = createSessionStore(KEY, () => memoryStorage({ [KEY]: session(NOW / 1000 + 120) }));
    expect(valid.accessToken(NOW)).toBe('jwt-ana');
    const expired = createSessionStore(KEY, () => memoryStorage({ [KEY]: session(NOW / 1000 - 60) }));
    expect(expired.accessToken(NOW)).toBeNull();
    expect(expired.get()?.user.email).toBe('ana@example.com');
  });

  it('has no session with a corrupt key, no key or no localStorage', () => {
    expect(createSessionStore(KEY, () => memoryStorage({ [KEY]: '{oops' })).get()).toBeNull();
    expect(createSessionStore(KEY, () => memoryStorage()).accessToken(NOW)).toBeNull();
    expect(createSessionStore(KEY, () => null).get()).toBeNull();
    const throwing = () => {
      throw new DOMException('denied', 'SecurityError');
    };
    expect(createSessionStore(KEY, throwing).get()).toBeNull();
    expect(() => createSessionStore(KEY, throwing).clear()).not.toThrow();
    expect(createSessionStore(null, () => memoryStorage()).get()).toBeNull();
  });

  it('reads localStorage once, then again only on reload', () => {
    const storage = memoryStorage({ [KEY]: session(NOW / 1000 + 60) });
    const getItem = vi.spyOn(storage, 'getItem');
    const store = createSessionStore(KEY, () => storage);
    store.accessToken(NOW);
    store.accessToken(NOW);
    store.get();
    expect(getItem).toHaveBeenCalledTimes(1);
    storage.removeItem(KEY);
    const seen = vi.fn();
    store.subscribe(seen);
    store.reload();
    expect(seen).toHaveBeenCalledWith(null);
    expect(store.get()).toBeNull();
  });

  it('signs out: removes the keys auth-js 2.117.3 removed (_removeSession) and tells the listeners', () => {
    const storage = memoryStorage({
      [KEY]: session(NOW / 1000 + 60),
      [`${KEY}-code-verifier`]: 'v',
      [`${KEY}-flows-code-verifier`]: JSON.stringify(['f1', 'f2']),
      [`${KEY}-flow-f1-code-verifier`]: 'v1',
      [`${KEY}-flow-f2-code-verifier`]: 'v2',
      [`${KEY}-user`]: '{}',
      other: 'kept',
    });
    const store = createSessionStore(KEY, () => storage);
    const seen = vi.fn();
    const unsubscribe = store.subscribe(seen);
    store.clear();
    expect(seen).toHaveBeenCalledWith(null);
    expect(store.get()).toBeNull();
    expect(store.accessToken(NOW)).toBeNull();
    expect([
      storage.getItem(KEY),
      storage.getItem(`${KEY}-code-verifier`),
      storage.getItem(`${KEY}-user`),
    ]).toEqual([null, null, null]);
    expect(storage.length).toBe(1);
    expect(storage.getItem('other')).toBe('kept');
    unsubscribe();
    store.clear();
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe('createSessionStore reload', () => {
  it('stays quiet when another tab changed nothing about the session', () => {
    const KEY = 'sb-x-auth-token';
    const empty = createSessionStore(KEY, () => memoryStorage());
    const seen = vi.fn();
    empty.get();
    empty.subscribe(seen);
    empty.reload();
    expect(seen).not.toHaveBeenCalled();
  });
});

describe('EXPIRY_MARGIN_S', () => {
  const KEY = 'sb-x-auth-token';
  it(`does not send a JWT that expires within ${EXPIRY_MARGIN_S} s`, () => {
    const at = (s: number) =>
      createSessionStore(KEY, () => memoryStorage({ [KEY]: session(NOW / 1000 + s) })).accessToken(NOW);
    expect(at(EXPIRY_MARGIN_S + 1)).toBe('jwt-ana');
    expect(at(EXPIRY_MARGIN_S)).toBeNull();
    expect(at(5)).toBeNull();
  });
});

describe('refreshedSession', () => {
  it('keeps every field the server sent and adds expires_at from expires_in, like auth-js', () => {
    const body = {
      access_token: 'new',
      refresh_token: 'r2',
      token_type: 'bearer',
      expires_in: 3600,
      user: { id: 'u1', email: 'ana@example.com' },
      extra: 1,
    };
    expect(refreshedSession(body, NOW)).toEqual({ ...body, expires_at: NOW / 1000 + 3600 });
    expect(refreshedSession({ ...body, expires_at: 5 }, NOW)?.expires_at).toBe(5);
    expect(refreshedSession({ ...body, refresh_token: undefined }, NOW)).toBeNull();
    expect(refreshedSession('nope', NOW)).toBeNull();
  });
});

describe('createSessionRefresher', () => {
  const KEY = 'sb-x-auth-token';
  const AUTH = 'http://127.0.0.1:54329/auth/v1';
  const fresh = {
    access_token: 'jwt-new',
    refresh_token: 'r2',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: NOW / 1000 + 3600,
    user: { id: 'u1', email: 'ana@example.com' },
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  function setup(expiresIn: number, reply: () => Promise<Response>, refreshToken: string | null = 'r') {
    const storage = memoryStorage({
      [KEY]: storedSession(NOW / 1000 + expiresIn, { refreshToken }),
      [`${KEY}-user`]: '{}',
    });
    const store = createSessionStore(KEY, () => storage);
    const fetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => reply());
    let now = NOW;
    const refresher = createSessionRefresher(store, {
      authUrl: AUTH,
      apiKey: 'demo',
      fetch: fetch as unknown as typeof globalThis.fetch,
      now: () => now,
    });
    return { storage, store, fetch, refresher, later: (ms: number) => (now += ms) };
  }

  it('refreshes an expired session, saves it in the same key and shape, and uses it', async () => {
    const { storage, store, fetch, refresher } = setup(-600, async () => json(fresh));
    const seen = vi.fn();
    store.subscribe(seen);
    await refresher.ensureFresh();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(`${AUTH}/token?grant_type=refresh_token`);
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('apikey')).toBe('demo');
    expect(JSON.parse(String(init?.body))).toEqual({ refresh_token: 'r' });
    expect(JSON.parse(storage.getItem(KEY)!)).toEqual(fresh);
    expect(store.accessToken(NOW)).toBe('jwt-new');
    expect(seen).toHaveBeenCalledWith(fresh);
  });

  it(`refreshes within ${EXPIRY_MARGIN_S} s of expiry, not before`, async () => {
    const early = setup(EXPIRY_MARGIN_S + 30, async () => json(fresh));
    await early.refresher.ensureFresh();
    expect(early.fetch).not.toHaveBeenCalled();
    expect(early.store.accessToken(NOW)).toBe('jwt-ana');
    const close = setup(EXPIRY_MARGIN_S - 10, async () => json(fresh));
    await close.refresher.ensureFresh();
    expect(close.fetch).toHaveBeenCalledTimes(1);
    expect(close.store.accessToken(NOW)).toBe('jwt-new');
  });

  it('sends a single request for every caller while one is in flight', async () => {
    let answer!: (r: Response) => void;
    const { fetch, refresher, store } = setup(-600, () => new Promise<Response>((r) => (answer = r)));
    const waits = [refresher.ensureFresh(), refresher.ensureFresh(), refresher.ensureFresh()];
    await Promise.resolve();
    answer(json(fresh));
    await Promise.all(waits);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.accessToken(NOW)).toBe('jwt-new');
    await refresher.ensureFresh();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('drops the session when the refresh token is refused (invalid_grant)', async () => {
    for (const status of [400, 401]) {
      const { storage, store, refresher } = setup(-600, async () =>
        json({ error: 'invalid_grant', error_description: 'Invalid Refresh Token' }, status),
      );
      const seen = vi.fn();
      store.subscribe(seen);
      await refresher.ensureFresh();
      expect(seen).toHaveBeenCalledWith(null);
      expect(store.get()).toBeNull();
      expect([storage.getItem(KEY), storage.getItem(`${KEY}-user`)]).toEqual([null, null]);
    }
  });

  it('keeps a session whose JWT still works when a proactive refresh is refused', async () => {
    const { store, fetch, refresher } = setup(30, async () => json({ error: 'invalid_grant' }, 400));
    await refresher.ensureFresh();
    expect(store.get()?.access_token).toBe('jwt-ana');
    await refresher.ensureFresh();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps everything on a network error or a 5xx, and tries again after the cooldown', async () => {
    let reply: () => Promise<Response> = () => Promise.reject(new TypeError('Failed to fetch'));
    const { storage, store, fetch, refresher, later } = setup(-600, () => reply());
    const before = storage.getItem(KEY);
    await refresher.ensureFresh();
    expect(storage.getItem(KEY)).toBe(before);
    expect(store.accessToken(NOW)).toBeNull(); // the publishable key, as before
    await refresher.ensureFresh();
    expect(fetch).toHaveBeenCalledTimes(1);
    reply = async () => json({ message: 'down' }, 503);
    later(60_001);
    await refresher.ensureFresh();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(storage.getItem(KEY)).toBe(before);
    reply = async () => json(fresh);
    later(60_001);
    await refresher.ensureFresh();
    expect(store.get()?.access_token).toBe('jwt-new');
  });

  it('does nothing without a refresh token', async () => {
    const { fetch, refresher, store } = setup(-600, async () => json(fresh), null);
    await refresher.ensureFresh();
    expect(fetch).not.toHaveBeenCalled();
    expect(store.get()?.user.email).toBe('ana@example.com');
  });

  it('uses a session another tab refreshed, and never overwrites one it wrote meanwhile', async () => {
    const already = setup(-600, async () => json(fresh));
    already.store.get();
    already.storage.setItem(KEY, JSON.stringify(fresh));
    await already.refresher.ensureFresh();
    expect(already.fetch).not.toHaveBeenCalled();
    expect(already.store.accessToken(NOW)).toBe('jwt-new');

    const other = { ...fresh, access_token: 'jwt-other', refresh_token: 'r3' };
    const tab: { storage?: Storage } = {};
    const race = setup(-600, async () => {
      tab.storage!.setItem(KEY, JSON.stringify(other));
      return json(fresh);
    });
    tab.storage = race.storage;
    await race.refresher.ensureFresh();
    expect(JSON.parse(race.storage.getItem(KEY)!)).toEqual(other);
    expect(race.store.accessToken(NOW)).toBe('jwt-other');
  });
});

/** A Web Locks stand-in shared by «tabs»: exclusive requests run one after another, in order. */
function fakeLocks() {
  const names: string[] = [];
  let tail: Promise<unknown> = Promise.resolve();
  const locks = {
    names,
    request: (<T>(name: string, _options: LockOptions, fn: () => Promise<T>): Promise<T> => {
      names.push(name);
      const run = tail.then(() => fn());
      tail = run.catch(() => undefined);
      return run;
    }) as unknown as LockManager['request'],
  };
  return locks;
}

describe('createSessionRefresher across tabs (navigator.locks)', () => {
  const KEY = 'sb-x-auth-token';
  const AUTH = 'http://127.0.0.1:54329/auth/v1';
  const fresh = (token: string, refreshToken: string) => ({
    access_token: token,
    refresh_token: refreshToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: NOW / 1000 + 3600,
    user: { id: 'u1', email: 'ana@example.com' },
  });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it(`refreshes once under the lock auth-js used (lock:${KEY}); the other tab reads the result`, async () => {
    const storage = memoryStorage({ [KEY]: storedSession(NOW / 1000 - 600) });
    const locks = fakeLocks();
    let n = 0;
    const fetch = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      n++;
      return json(fresh(`jwt-${n}`, `r-${n}`));
    });
    const tab = () => {
      const store = createSessionStore(KEY, () => storage);
      const refresher = createSessionRefresher(store, {
        authUrl: AUTH,
        apiKey: 'demo',
        lockName: `lock:${KEY}`,
        locks,
        fetch: fetch as unknown as typeof globalThis.fetch,
        now: () => NOW,
      });
      return { store, refresher };
    };
    const a = tab();
    const b = tab();
    a.store.get();
    b.store.get(); // both tabs hold the expired session in memory
    await Promise.all([a.refresher.ensureFresh(), b.refresher.ensureFresh()]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(locks.names).toEqual([`lock:${KEY}`, `lock:${KEY}`]);
    expect(a.store.accessToken(NOW)).toBe('jwt-1');
    expect(b.store.accessToken(NOW)).toBe('jwt-1');
  });

  it('refreshes without the lock when it is unavailable', async () => {
    const storage = memoryStorage({ [KEY]: storedSession(NOW / 1000 - 600) });
    const store = createSessionStore(KEY, () => storage);
    const fetch = vi.fn(async () => json(fresh('jwt-new', 'r2')));
    const refresher = createSessionRefresher(store, {
      authUrl: AUTH,
      apiKey: 'demo',
      lockName: `lock:${KEY}`,
      locks: { request: (() => Promise.reject(new DOMException('no', 'SecurityError'))) as never },
      fetch: fetch as unknown as typeof globalThis.fetch,
      now: () => NOW,
    });
    await refresher.ensureFresh();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.accessToken(NOW)).toBe('jwt-new');
  });
});

describe('createSessionRefresher revoke (supabase-js signOut, scope global)', () => {
  const KEY = 'sb-x-auth-token';
  const AUTH = 'http://127.0.0.1:54329/auth/v1';
  type Call = { url: string; auth: string | null; method?: string };

  function setup(reply: (url: string) => Promise<Response>) {
    const storage = memoryStorage();
    const store = createSessionStore(KEY, () => storage);
    const calls: Call[] = [];
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        auth: new Headers(init?.headers).get('authorization'),
        method: init?.method,
      });
      return reply(String(input));
    });
    const refresher = createSessionRefresher(store, {
      authUrl: AUTH,
      apiKey: 'demo',
      fetch: fetch as unknown as typeof globalThis.fetch,
      now: () => NOW,
    });
    return { storage, calls, refresher };
  }
  const session = (expiresIn: number) => parseLegacySession(storedSession(NOW / 1000 + expiresIn))!;

  it('sends POST /logout?scope=global with the JWT', async () => {
    const { calls, refresher } = setup(async () => new Response(null, { status: 204 }));
    await refresher.revoke(session(3600));
    expect(calls).toEqual([{ url: `${AUTH}/logout?scope=global`, auth: 'Bearer jwt-ana', method: 'POST' }]);
  });

  it('refreshes an expiring JWT first (without storing it), and sends nothing when that is refused', async () => {
    const ok = setup(async (url) =>
      url.includes('/token')
        ? new Response(
            JSON.stringify({
              access_token: 'jwt-new',
              refresh_token: 'r2',
              expires_in: 3600,
              user: { id: 'u1' },
            }),
          )
        : new Response(null, { status: 204 }),
    );
    await ok.refresher.revoke(session(30));
    expect(ok.calls.map((c) => [c.url, c.auth])).toEqual([
      [`${AUTH}/token?grant_type=refresh_token`, 'Bearer demo'],
      [`${AUTH}/logout?scope=global`, 'Bearer jwt-new'],
    ]);
    expect(ok.storage.length).toBe(0);

    const refused = setup(async () => new Response('{"error":"invalid_grant"}', { status: 400 }));
    await refused.refresher.revoke(session(-600));
    expect(refused.calls.map((c) => c.url)).toEqual([`${AUTH}/token?grant_type=refresh_token`]);
  });

  it('never rejects: 401, network errors and no session are all fine', async () => {
    await expect(
      setup(async () => new Response('{}', { status: 401 })).refresher.revoke(session(3600)),
    ).resolves.toBeUndefined();
    await expect(
      setup(() => Promise.reject(new TypeError('Failed to fetch'))).refresher.revoke(session(3600)),
    ).resolves.toBeUndefined();
    const none = setup(async () => new Response(null, { status: 204 }));
    await none.refresher.revoke(null);
    expect(none.calls).toHaveLength(0);
  });
});
