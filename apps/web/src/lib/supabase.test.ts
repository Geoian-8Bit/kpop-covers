import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadFailure } from './backend/upload';
import { memoryStorage, storedSession } from './testing/storage';

// REQ-11 · The light client: postgrest-js for tables and RPCs, storage-js loaded on demand, the login era's JWT only
// while it is valid. fetch is stubbed: nothing here reaches a network (never the real project).

const URL_ = 'http://127.0.0.1:54329';
const KEY = 'sb-127-auth-token';
const NOW_S = Math.floor(Date.now() / 1000);

type Call = { url: string; method: string; headers: Headers };
let calls: Call[];
let reply: () => Response | Promise<Response>;
let refreshReply: () => Response | Promise<Response>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A fresh module with this localStorage (or none). */
async function load(stored?: Record<string, string> | null) {
  vi.resetModules();
  if (stored === null) vi.stubGlobal('localStorage', undefined);
  else vi.stubGlobal('localStorage', memoryStorage(stored));
  return import('./supabase');
}

const session = (expiresAt: number) =>
  JSON.stringify({
    access_token: 'jwt-ana',
    expires_at: expiresAt,
    user: { id: 'u1', email: 'ana@example.com' },
  });

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', URL_);
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'demo');
  calls = [];
  reply = () => json([]);
  refreshReply = () => json({ error: 'invalid_grant' }, 400);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method ?? 'GET', headers: new Headers(init?.headers) });
      if (String(input).includes('/auth/v1/token')) return refreshReply();
      return reply();
    }),
  );
});

afterEach(() => {
  vi.doUnmock('@supabase/storage-js');
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('data requests', () => {
  it('send the publishable key as apikey and bearer without a session', async () => {
    const { supabase } = await load();
    await supabase.from('crews').select('*').order('created_at').limit(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${URL_}/rest/v1/crews?select=*&order=created_at.asc&limit=1`);
    expect(calls[0]!.headers.get('apikey')).toBe('demo');
    expect(calls[0]!.headers.get('authorization')).toBe('Bearer demo');
  });

  it("send the old session's JWT while it is valid", async () => {
    const { supabase } = await load({ [KEY]: session(NOW_S + 3600) });
    await supabase.from('profiles').select('*').eq('id', 'u1').maybeSingle();
    expect(calls[0]!.headers.get('apikey')).toBe('demo');
    expect(calls[0]!.headers.get('authorization')).toBe('Bearer jwt-ana');
  });

  it('fall back to the publishable key once the session has expired (no refresh request)', async () => {
    const { supabase, legacySession } = await load({ [KEY]: session(NOW_S - 60) });
    await supabase.rpc('storage_usage');
    expect(calls.map((c) => c.url)).toEqual([`${URL_}/rest/v1/rpc/storage_usage`]);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.headers.get('authorization')).toBe('Bearer demo');
    expect(legacySession.get()?.user.email).toBe('ana@example.com');
  });

  it('ignore a corrupt key and work without localStorage', async () => {
    const corrupt = await load({ [KEY]: '{not json' });
    await corrupt.supabase.from('members').select('*');
    expect(calls[0]!.headers.get('authorization')).toBe('Bearer demo');
    const none = await load(null);
    expect(none.legacySession.get()).toBeNull();
    await none.supabase.from('members').select('*');
    expect(calls[1]!.headers.get('authorization')).toBe('Bearer demo');
  });

  it('go back to the publishable key after signOut', async () => {
    const storage = { [KEY]: session(NOW_S + 3600) };
    const { supabase, legacySession } = await load(storage);
    await supabase.from('wishes').select('*');
    legacySession.clear();
    await supabase.from('wishes').select('*');
    expect(calls.map((c) => c.headers.get('authorization'))).toEqual(['Bearer jwt-ana', 'Bearer demo']);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('keep PostgREST errors in the shape friendlyError reads', async () => {
    const { supabase, friendlyError } = await load();
    reply = () =>
      json(
        { code: '23505', message: 'duplicate key value violates unique constraint "members_crew_name_key"' },
        409,
      );
    const { error } = await supabase
      .from('members')
      .insert({ name: 'Ana' } as never)
      .select()
      .single();
    expect(friendlyError(error)).toBe('Ya hay alguien con ese nombre en el grupo.');
    reply = () =>
      json({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, 406);
    const gone = await supabase.from('videos').select('*').eq('id', 'x').single();
    expect(friendlyError(gone.error)).toBe('Esto ya no existe: otro móvil lo ha borrado.');
    reply = () => Promise.reject(new TypeError('Failed to fetch'));
    const offline = await supabase.rpc('storage_usage');
    expect(friendlyError(offline.error)).toBe('Sin conexión. Revisa tu red.');
  });
});

describe('storage', () => {
  it('loads storage-js on first use and signs with the same headers', async () => {
    const { withStorage } = await load({ [KEY]: session(NOW_S + 3600) });
    reply = () => json({ signedURL: '/object/sign/videos/c/a.mp4?token=t' });
    const { data, error } = await withStorage((s) => s.from('videos').createSignedUrl('c/a.mp4', 60));
    expect(error).toBeNull();
    expect(data?.signedUrl).toBe(`${URL_}/storage/v1/object/sign/videos/c/a.mp4?token=t`);
    expect(calls[0]!.url).toBe(`${URL_}/storage/v1/object/sign/videos/c/a.mp4`);
    expect(calls[0]!.headers.get('apikey')).toBe('demo');
    expect(calls[0]!.headers.get('authorization')).toBe('Bearer jwt-ana');
  });

  it('keeps Storage errors readable by friendlyError and uploadFailure', async () => {
    const { withStorage, friendlyError } = await load();
    reply = () =>
      json(
        {
          statusCode: '413',
          error: 'Payload too large',
          message: 'The object exceeded the maximum allowed size',
        },
        413,
      );
    const big = await withStorage((s) => s.from('videos').upload('c/a.mp4', new Blob(['x'])));
    expect(friendlyError(big.error)).toBe('Archivo demasiado grande para la nube.');
    expect(uploadFailure(big.error)).toBe('too-big');
  });

  it('answers «Sin conexión» when storage-js itself cannot be fetched, and loads it on the next try', async () => {
    vi.doMock('@supabase/storage-js', () => {
      throw new TypeError('error loading dynamically imported module');
    });
    const { withStorage, friendlyError } = await load();
    const failed = await withStorage((s) => s.from('videos').createSignedUrl('a.mp4', 60));
    expect(failed.data).toBeNull();
    expect(friendlyError(failed.error)).toBe('Sin conexión. Revisa tu red.');
    expect(uploadFailure(failed.error)).toBe('network');
    expect(calls).toHaveLength(0);

    vi.doUnmock('@supabase/storage-js');
    reply = () => json({ signedURL: '/object/sign/videos/a.mp4?token=t' });
    const again = await withStorage((s) => s.from('videos').createSignedUrl('a.mp4', 60));
    expect(again.error).toBeNull();
  });
});

describe('token refresh at startup (REQ-11 · profiles_select is `to authenticated`)', () => {
  const fresh = {
    access_token: 'jwt-new',
    refresh_token: 'r2',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: NOW_S + 3600,
    user: { id: 'u1', email: 'ana@example.com' },
  };

  it('refreshes an expired session once, and the first requests wait for it and send the new JWT', async () => {
    let answer!: (r: Response) => void;
    refreshReply = () => new Promise<Response>((r) => (answer = r));
    const { supabase, legacySession, startupRefresh } = await load({ [KEY]: storedSession(NOW_S - 600) });
    expect(startupRefresh).not.toBeNull(); // the shell waits for it before showing the user
    const first = supabase.from('profiles').select('*').eq('id', 'u1').maybeSingle();
    const second = supabase.from('members').select('*');
    await new Promise((r) => setTimeout(r, 0));
    expect(calls.map((c) => c.url)).toEqual([`${URL_}/auth/v1/token?grant_type=refresh_token`]);
    expect(calls[0]!.headers.get('apikey')).toBe('demo');
    answer(json(fresh));
    await Promise.all([first, second]);
    expect(calls).toHaveLength(3);
    expect(calls.slice(1).map((c) => c.headers.get('authorization'))).toEqual([
      'Bearer jwt-new',
      'Bearer jwt-new',
    ]);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(fresh);
    expect(legacySession.get()?.access_token).toBe('jwt-new');
  });

  it('signs out when the refresh token is refused', async () => {
    const { supabase, legacySession } = await load({ [KEY]: storedSession(NOW_S - 600) });
    await supabase.from('members').select('*');
    expect(calls.map((c) => c.headers.get('authorization'))).toEqual(['Bearer demo', 'Bearer demo']);
    expect(legacySession.get()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('keeps the session and uses the publishable key when the refresh hits a network error', async () => {
    refreshReply = () => Promise.reject(new TypeError('Failed to fetch'));
    const stored = storedSession(NOW_S - 600);
    const { supabase, legacySession, bearerToken } = await load({ [KEY]: stored });
    await supabase.from('members').select('*');
    expect(calls.at(-1)!.headers.get('authorization')).toBe('Bearer demo');
    expect(localStorage.getItem(KEY)).toBe(stored);
    expect(legacySession.get()?.user.email).toBe('ana@example.com');
    expect(await bearerToken()).toBe('demo');
    expect(calls.filter((c) => c.url.includes('/auth/v1/token'))).toHaveLength(1);
  });

  it('leaves a session valid for more than the margin alone', async () => {
    const { supabase, startupRefresh } = await load({ [KEY]: storedSession(NOW_S + 120) });
    expect(startupRefresh).toBeNull();
    await supabase.from('members').select('*');
    expect(calls.map((c) => c.url)).toEqual([`${URL_}/rest/v1/members?select=*`]);
    expect(calls[0]!.headers.get('authorization')).toBe('Bearer jwt-ana');
  });

  it('never refreshes in the local demo', async () => {
    vi.stubEnv('VITE_DEMO', 'true');
    const { bearerToken } = await load({ [KEY]: storedSession(NOW_S - 600) });
    expect(await bearerToken()).toBe('demo');
    expect(calls).toHaveLength(0);
  });
});

describe('createPreloadErrorGuard', () => {
  const fire = (target: EventTarget, payload: unknown) => {
    const event = Object.assign(new Event('vite:preloadError', { cancelable: true }), { payload });
    target.dispatchEvent(event);
  };

  it('keeps its own failed load from the app listener and lets every other failure through', async () => {
    const { createPreloadErrorGuard } = await load();
    const target = new EventTarget();
    const guard = createPreloadErrorGuard(target);
    const reached = vi.fn();
    const own = new TypeError('Failed to fetch dynamically imported module');
    const other = new TypeError('another chunk');
    const quiet = guard.quiet(async () => {
      fire(target, own); // what Vite's preload helper does before rethrowing
      throw own;
    });
    target.addEventListener('vite:preloadError', (e) =>
      reached((e as Event & { payload?: unknown }).payload),
    );
    fire(target, other);
    expect(reached).not.toHaveBeenCalled();
    await expect(quiet).rejects.toBe(own);
    expect(reached.mock.calls).toEqual([[other]]);
    fire(target, own);
    expect(reached).toHaveBeenCalledTimes(2); // nothing pending: nothing held back
  });

  it('replays what it held when its load succeeds', async () => {
    const { createPreloadErrorGuard } = await load();
    const target = new EventTarget();
    const guard = createPreloadErrorGuard(target);
    const reached = vi.fn();
    target.addEventListener('vite:preloadError', reached);
    let done!: (v: number) => void;
    const quiet = guard.quiet(() => new Promise<number>((r) => (done = r)));
    fire(target, 'x');
    expect(reached).not.toHaveBeenCalled();
    done(1);
    await expect(quiet).resolves.toBe(1);
    expect(reached).toHaveBeenCalledTimes(1);
  });
});

describe('cross-tab lock and sign-out (REQ-11)', () => {
  it("refreshes inside navigator.locks under auth-js's name, lock:sb-<ref>-auth-token", async () => {
    const names: string[] = [];
    vi.stubGlobal('navigator', {
      locks: {
        request: (name: string, _options: unknown, fn: () => Promise<unknown>) => {
          names.push(name);
          return fn();
        },
      },
    });
    refreshReply = () =>
      json({ access_token: 'jwt-new', refresh_token: 'r2', expires_in: 3600, user: { id: 'u1' } });
    const { bearerToken } = await load({ [KEY]: storedSession(NOW_S - 600) });
    expect(await bearerToken()).toBe('jwt-new');
    expect(names).toEqual([`lock:${KEY}`]);
  });

  it('revokes a signed-out session with POST /auth/v1/logout?scope=global', async () => {
    const { revokeSession, legacySession } = await load({ [KEY]: storedSession(NOW_S + 3600) });
    await revokeSession(legacySession.get());
    expect(calls.map((c) => [c.url, c.method, c.headers.get('authorization')])).toEqual([
      [`${URL_}/auth/v1/logout?scope=global`, 'POST', 'Bearer jwt-ana'],
    ]);
  });
});
