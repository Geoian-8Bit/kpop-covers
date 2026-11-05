import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEMO_USER_ID, IS_DEMO } from '@/lib/backend/mode';
import { isSessionValid, type LegacySession, type LegacyUser } from '@/lib/backend/session';
import { legacySession, revokeSession, startupRefresh } from '@/lib/supabase';

export type Session = LegacySession;
type User = LegacyUser;

/** Local demo only (`VITE_DEMO=true` in dev): a fixed signed-in user, no login screen. */
const DEMO_SESSION: Session = {
  access_token: 'demo',
  refresh_token: 'demo',
  token_type: 'bearer',
  expires_in: 3600,
  user: {
    id: DEMO_USER_ID,
    email: 'demo@coverscape.local',
    app_metadata: {},
    user_metadata: {},
    aud: 'demo',
    created_at: '',
  },
};

/**
 * REQ-11 · No login any more: the only user is the one a login-era session left in localStorage (read by
 * lib/backend/session.ts, its token refreshed as auth-js did), shown in the shell until they sign out or the
 * refresh is refused.
 */
interface AuthContextValue {
  session: Session | null;
  user: User | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * REQ-11 · Only a session whose token is still valid is shown: when an expired token cannot be refreshed (offline, a
 * server error, no refresh token), auth-js's getSession() returned null and the user block stayed hidden.
 */
function shownSession(): Session | null {
  const stored = legacySession.get();
  return stored && isSessionValid(stored) ? stored : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  // REQ-11 · The stored session is read synchronously; only while its token is refreshed at startup is there nobody
  // yet (startupRefresh), as when supabase-js's getSession() waited for that refresh.
  const [session, setSession] = useState<Session | null>(() =>
    IS_DEMO ? DEMO_SESSION : startupRefresh ? null : shownSession(),
  );

  useEffect(() => {
    if (IS_DEMO) return;
    let live = true;
    // Refreshed, kept (network error) or dropped (refused): show what is stored now.
    void startupRefresh?.then(() => {
      if (live) setSession(shownSession());
    });
    const unsubscribe = legacySession.subscribe((next) => {
      // Sign-out here or in another tab, or a refused refresh: drop the previous user's cached data
      // (supabase-js's SIGNED_OUT).
      if (!next) queryClient.clear();
      setSession(next && isSessionValid(next) ? next : null);
    });
    const onStorage = (event: StorageEvent) => {
      // `key === null` is a cleared localStorage.
      if (event.key === null || event.key === legacySession.key) legacySession.reload();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      live = false;
      unsubscribe();
      window.removeEventListener('storage', onStorage);
    };
  }, [queryClient]);

  const signOut = useCallback(async () => {
    // REQ-11 · Dropped here at once; the server-side revoke (supabase-js's POST /logout) follows in the background.
    const signedOut = legacySession.get();
    legacySession.clear();
    queryClient.clear();
    void revokeSession(signedOut);
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, user: session?.user ?? null, signOut }),
    [session, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
