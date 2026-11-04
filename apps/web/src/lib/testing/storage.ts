// Test helpers shared by the unit tests (never imported by the app).

/** A localStorage stand-in backed by a Map. */
export function memoryStorage(entries: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(entries));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  };
}

/** REQ-11 · A login-era session as supabase-js stored it, as JSON. */
export function storedSession(
  expiresAt: number | undefined,
  { token = 'jwt-ana', refreshToken = 'r' }: { token?: string; refreshToken?: string | null } = {},
): string {
  return JSON.stringify({
    access_token: token,
    ...(refreshToken === null ? {} : { refresh_token: refreshToken }),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    user: { id: 'u1', email: 'ana@example.com' },
  });
}
