// REQ-11 · The session left behind by the login era. supabase-js kept it in localStorage under `sb-<ref>-auth-token`;
// the app no longer ships auth-js (it was most of the client), so this reads that same key by hand. Nothing here
// signs in. A valid JWT is sent while it lasts; when it is about to expire it is refreshed the way auth-js did it
// (createSessionRefresher), and without a usable JWT requests fall back to the publishable key (`anon`), which RLS
// lets do the same inside the group, except reading `profiles` (see createSessionRefresher).

/** The fields of a stored user the shell reads (avatar block: email; profile: id). */
export interface LegacyUser {
  id: string;
  email?: string;
  [field: string]: unknown;
}

/** A supabase-js v2 session as it sits in localStorage (only what the app reads). */
export interface LegacySession {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  /** Seconds since the epoch. */
  expires_at?: number;
  user: LegacyUser;
}

/** Same name supabase-js derives: `sb-` + the first label of the project's host + `-auth-token`. */
export function legacyStorageKey(supabaseUrl: string | undefined): string | null {
  if (!supabaseUrl) return null;
  try {
    return `sb-${new URL(supabaseUrl.trim()).hostname.split('.')[0]}-auth-token`;
  } catch {
    return null;
  }
}

/** `exp` from a JWT's payload, or null when the token can't be read. */
function jwtExpiry(token: string): number | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(
      part
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(part.length / 4) * 4, '='),
    );
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === 'number' ? exp : null;
  } catch {
    return null;
  }
}

/** A stored value as a session, or null when it isn't one (a corrupt key is ignored, never an error). */
export function parseLegacySession(raw: string | null): LegacySession | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<LegacySession> | null;
    if (!value || typeof value !== 'object') return null;
    if (typeof value.access_token !== 'string' || !value.access_token) return null;
    const user = value.user;
    if (!user || typeof user !== 'object' || typeof user.id !== 'string') return null;
    return value as LegacySession;
  } catch {
    return null;
  }
}

/**
 * REQ-11 · A JWT that expires within this many seconds is not sent (it could expire on the way, and the request would
 * be refused instead of falling back to the publishable key) and is refreshed first. 90 s is auth-js's own
 * EXPIRY_MARGIN_MS, so a legacy session is refreshed exactly when supabase-js refreshed it.
 */
export const EXPIRY_MARGIN_S = 90;

/**
 * Whether the session's JWT still works for more than `marginS` seconds: `expires_at` (or the token's own `exp`) is
 * far enough in the future.
 */
export function isSessionValid(session: LegacySession, now: number = Date.now(), marginS = 0): boolean {
  const expiresAt =
    typeof session.expires_at === 'number' ? session.expires_at : jwtExpiry(session.access_token);
  return expiresAt !== null && expiresAt * 1000 - now > marginS * 1000;
}

/**
 * The keys auth-js 2.117.3 removed with the session (`_removeSession`): the session itself, every PKCE verifier
 * (`removeAllPKCEVerifiers`: the slots listed in `-flows-code-verifier`, that index and the fixed `-code-verifier`)
 * and `-user`.
 */
function sessionKeys(key: string, store: Storage): string[] {
  let flows: unknown = null;
  try {
    flows = JSON.parse(store.getItem(`${key}-flows-code-verifier`) ?? 'null');
  } catch {
    /* no readable index: no slots to remove */
  }
  const slots = Array.isArray(flows)
    ? flows
        .filter((id): id is string => typeof id === 'string')
        .map((id) => `${key}-flow-${id}-code-verifier`)
    : [];
  return [key, ...slots, `${key}-flows-code-verifier`, `${key}-code-verifier`, `${key}-user`];
}

/**
 * Reads, remembers and forgets the session under one key. The value is read once and then on every change from
 * another tab (`storage` event), so a request costs no localStorage parse.
 */
export function createSessionStore(key: string | null, storage: () => Storage | null = defaultStorage) {
  let cached: LegacySession | null | undefined;
  const listeners = new Set<(session: LegacySession | null) => void>();

  const read = (): LegacySession | null => {
    if (cached !== undefined) return cached;
    try {
      cached = parseLegacySession(key ? (storage()?.getItem(key) ?? null) : null);
    } catch {
      cached = null; // no localStorage (private browsing, blocked site data)
    }
    return cached;
  };

  return {
    key,
    /** The stored session, expired or not (the shell shows its user either way). */
    get: read,
    /** The JWT to send, only while it is valid for more than EXPIRY_MARGIN_S; null means «use the publishable key». */
    accessToken(now: number = Date.now()): string | null {
      const session = read();
      return session && isSessionValid(session, now, EXPIRY_MARGIN_S) ? session.access_token : null;
    },
    /** A refreshed session: written as auth-js wrote it (the whole object as JSON) and told to the listeners. */
    save(session: LegacySession) {
      try {
        const store = key ? storage() : null;
        if (key && store) store.setItem(key, JSON.stringify(session));
      } catch {
        /* full or blocked storage: the new session still serves this page */
      }
      cached = session;
      for (const listener of listeners) listener(session);
    },
    /** Sign-out: drop the keys auth-js removed with the session (sessionKeys) and tell the listeners. */
    clear() {
      try {
        const store = key ? storage() : null;
        if (key && store) for (const name of sessionKeys(key, store)) store.removeItem(name);
      } catch {
        /* nothing stored, nothing to remove */
      }
      cached = null;
      for (const listener of listeners) listener(null);
    },
    /** Another tab wrote or removed the key: read it again on next use and tell the listeners. */
    reload() {
      const before = cached;
      cached = undefined;
      const session = read();
      // An unrelated write (or a clear with nothing stored) changes nothing: no sign-out, no cache wipe.
      if (before !== undefined && before?.access_token === session?.access_token) return;
      for (const listener of listeners) listener(session);
    },
    subscribe(listener: (session: LegacySession | null) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export type SessionStore = ReturnType<typeof createSessionStore>;

/** Statuses auth-js treats as a network failure (`NETWORK_ERROR_CODES`): never a reason to drop the session. */
const NETWORK_ERROR_STATUSES = new Set([
  500, 501, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527, 528, 529, 530,
]);
/** After a failed refresh, the same refresh token is not tried again for this long (auth-js's cooldown). */
const REFRESH_FAILURE_COOLDOWN_MS = 60_000;

/**
 * The refresh response as auth-js stored it (`_sessionResponse`): every field the server sent, plus `expires_at`
 * from `expires_in` when the server left it out. Null when it isn't a session (auth-js: «session missing»).
 */
export function refreshedSession(body: unknown, now: number = Date.now()): LegacySession | null {
  if (!body || typeof body !== 'object') return null;
  const data = body as Partial<LegacySession>;
  if (!data.access_token || !data.refresh_token || !data.expires_in) return null;
  const session = { ...data } as LegacySession;
  if (!data.expires_at) session.expires_at = Math.round(now / 1000) + data.expires_in;
  return parseLegacySession(JSON.stringify(session));
}

export interface RefresherOptions {
  /** `<project>/auth/v1`, as auth-js built it. */
  authUrl: string;
  apiKey: string;
  /** auth-js's lock name, `lock:` + the storage key; no cross-tab lock without it. */
  lockName?: string | null;
  /** The Web Locks API (defaults to `navigator.locks`); null or missing means no cross-tab lock. */
  locks?: Pick<LockManager, 'request'> | null;
  fetch?: typeof fetch;
  now?: () => number;
}

/** Longest wait for another tab's lock before refreshing without it (auth-js's `lockAcquireTimeout`). */
const LOCK_ACQUIRE_TIMEOUT_MS = 5_000;

type RefreshResult =
  | { kind: 'ok'; session: LegacySession }
  | { kind: 'refused' }
  /** Network error, 5xx or an unreadable body: auth-js's retryable fetch error. */
  | { kind: 'network' };

/**
 * REQ-11 · Why this exists: the RLS policy `profiles_select` is `to authenticated` only
 * (supabase/migrations/20261010000000_init.sql), so the publishable key can't read the user's profile. Access tokens
 * last about an hour and supabase-js refreshed them when the app opened; without that, the profile comes back empty
 * and the user block in the shell shows the email instead of the name. This is the smallest equivalent of auth-js's
 * refresh (`_recoverAndRefresh` / `__loadSession` → `_callRefreshToken`), without auth-js:
 * - A session that expires within EXPIRY_MARGIN_S and has a refresh token is refreshed before its token is used:
 *   `POST <auth>/token?grant_type=refresh_token` with `{ refresh_token }`. One request in flight per tab, shared by
 *   every caller, which waits for it (as `getSession()` did).
 * - Refreshed: saved under the same key in the same shape (refreshedSession) and used.
 * - Refused (a 4xx: invalid_grant, revoked…): the session is dropped (sign-out → no user block), unless the access
 *   token itself is still valid (auth-js kept it until it really expired).
 * - Network error or 5xx: nothing is dropped, requests use the publishable key, and the same refresh token waits
 *   REFRESH_FAILURE_COOLDOWN_MS before another try (auth-js also retried a few times within 30 s first; here the
 *   next request after the cooldown tries again).
 * - Other tabs: the refresh runs inside the Web Lock `lock:sb-<ref>-auth-token` (the name auth-js gives its lock,
 *   `lock:${storageKey}`) where the browser has `navigator.locks`, so two tabs never send the same refresh token at
 *   once (rotation would revoke the session). Inside the lock the session is read again: one another tab already
 *   refreshed is used as is. Without locks (or after LOCK_ACQUIRE_TIMEOUT_MS) it runs unlocked, and a result that
 *   would overwrite another tab's newer session (or its sign-out) is discarded (auth-js's commit guard).
 */
export function createSessionRefresher(store: SessionStore, options: RefresherOptions) {
  const now = options.now ?? Date.now;
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const locks =
    options.locks === undefined
      ? typeof navigator === 'undefined'
        ? null
        : (navigator.locks ?? null)
      : options.locks;
  let inFlight: Promise<void> | null = null;
  let failed: { refreshToken: string; until: number } | null = null;

  const needsRefresh = (
    session: LegacySession | null,
  ): session is LegacySession & { refresh_token: string } =>
    !!session?.refresh_token &&
    !isSessionValid(session, now(), EXPIRY_MARGIN_S) &&
    !(failed && failed.refreshToken === session.refresh_token && now() < failed.until);

  const coolDown = (refreshToken: string) => {
    failed = { refreshToken, until: now() + REFRESH_FAILURE_COOLDOWN_MS };
  };

  const headers = (token: string) => ({
    apikey: options.apiKey,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json;charset=UTF-8',
  });

  /** Runs `fn` holding the cross-tab lock when there is one, else (or if it can't be had in time) without it. */
  async function locked<T>(fn: () => Promise<T>): Promise<T> {
    if (!locks || !options.lockName) return fn();
    let started = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOCK_ACQUIRE_TIMEOUT_MS);
    try {
      return await locks.request(options.lockName, { mode: 'exclusive', signal: controller.signal }, () => {
        started = true;
        clearTimeout(timer);
        return fn();
      });
    } catch (error) {
      if (started) throw error;
      return fn(); // no lock in time (or none allowed here): as without locks
    } finally {
      clearTimeout(timer);
    }
  }

  /** One refresh request, read as auth-js read it. Touches no storage. */
  async function requestRefresh(refreshToken: string): Promise<RefreshResult> {
    let response: Response;
    try {
      response = await doFetch(`${options.authUrl}/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: headers(options.apiKey),
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch {
      return { kind: 'network' };
    }
    if (!response.ok) return { kind: NETWORK_ERROR_STATUSES.has(response.status) ? 'network' : 'refused' };
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { kind: 'network' };
    }
    const session = refreshedSession(body, now());
    return session ? { kind: 'ok', session } : { kind: 'refused' };
  }

  /** The refresh was refused: drop the session unless another tab replaced it or its JWT still works. */
  const refused = (refreshToken: string) => {
    store.reload();
    const current = store.get();
    if (!current || current.refresh_token !== refreshToken) return;
    if (isSessionValid(current, now())) coolDown(refreshToken);
    else store.clear();
  };

  async function run(): Promise<void> {
    store.reload(); // another tab may have refreshed (or signed out) already
    const start = store.get();
    if (!needsRefresh(start)) return;
    const refreshToken = start.refresh_token;
    const result = await requestRefresh(refreshToken);
    if (result.kind === 'network') return coolDown(refreshToken);
    if (result.kind === 'refused') return refused(refreshToken);
    store.reload();
    const after = store.get();
    if (!after || after.refresh_token !== refreshToken) return; // commit guard: another tab got there first
    failed = null;
    store.save(result.session);
  }

  return {
    /** Whether a refresh request is in flight. */
    pending: () => inFlight !== null,
    /** Resolves once the stored session is fresh enough to use (or can't be refreshed now). Never rejects. */
    ensureFresh(): Promise<void> {
      if (inFlight) return inFlight;
      if (!needsRefresh(store.get())) return Promise.resolve();
      inFlight = locked(run)
        .catch(() => undefined)
        .finally(() => {
          inFlight = null;
        });
      return inFlight;
    },
    /**
     * REQ-11 · What supabase-js's `signOut()` (scope `global`) sent before dropping the session: `POST
     * <auth>/logout?scope=global` with the session's JWT, which revokes its refresh tokens on the server. As auth-js
     * did, a JWT about to expire is refreshed first (`__loadSession`; the result is not stored: the session is gone)
     * and a session that can't be refreshed sends nothing. Best effort: auth-js dropped the local session whatever
     * the answer (401/403/404 ignored, any other error or a network failure too), so the caller drops it first and
     * this never rejects.
     */
    async revoke(session: LegacySession | null): Promise<void> {
      if (!session) return;
      try {
        let token = isSessionValid(session, now(), EXPIRY_MARGIN_S) ? session.access_token : null;
        if (!token && session.refresh_token) {
          const refreshToken = session.refresh_token;
          const result = await locked(() => requestRefresh(refreshToken));
          token = result.kind === 'ok' ? result.session.access_token : null;
        }
        if (!token) return;
        await doFetch(`${options.authUrl}/logout?scope=global`, { method: 'POST', headers: headers(token) });
      } catch {
        /* best effort: the session is already gone on this device */
      }
    },
  };
}
