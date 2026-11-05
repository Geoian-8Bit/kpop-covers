// REQ-15 · Signed URLs remembered in module memory. A fresh signature carries a new token, so the URL changes and the
// HTTP cache can't reuse a video it already downloaded (up to 50 MB). Reusing the URL while it still has a good margin
// keeps the same cache key. Memory only, never disk: a signed URL opens a private file and expires anyway.

/** How long every signature lasts, single or batch (6 h). */
export const SIGN_SECONDS = 6 * 60 * 60;

/** Paths per batch signature (`createSignedUrls`), so a long list never builds an over-long request. */
export const SIGN_BATCH = 100;

/** REQ-15 · Reuse a URL only while it has more than this left: 1 h, so a video opened late in a rehearsal never streams on a token that expires under it. */
const MIN_LEFT_MS = 60 * 60 * 1000;

type Entry = { url: string; expiresAt: number };

const memo = new Map<string, Entry>();
const pending = new Map<string, Promise<string>>();

/**
 * The URL for `key` (`${bucket}/${path}`): the remembered one while it has > 1 h left, otherwise `sign()`'s.
 * Two calls at once share one promise (one signature); a failed signature is not remembered.
 */
export function memoSigned(
  key: string,
  sign: () => Promise<{ url: string; expiresAt: number }>,
  now: () => number = Date.now,
): Promise<string> {
  const hit = memo.get(key);
  if (hit && hit.expiresAt - now() > MIN_LEFT_MS) return Promise.resolve(hit.url);
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const run = (async () => {
    try {
      const signed = await sign();
      memo.set(key, signed);
      return signed.url;
    } catch (error) {
      memo.delete(key);
      throw error;
    } finally {
      pending.delete(key);
    }
  })();
  pending.set(key, run);
  return run;
}

/** Drop the remembered URL for `key` (e.g. its download failed), so the next call signs again. */
export function forgetSigned(key: string): void {
  memo.delete(key);
}

/**
 * True while `key` has a remembered URL that would be reused (> 1 h left), or a signature on its way: a batch
 * signature leaves those alone and signs only the rest.
 */
export function peekSigned(key: string, now: () => number = Date.now): boolean {
  const hit = memo.get(key);
  return (hit != null && hit.expiresAt - now() > MIN_LEFT_MS) || pending.has(key);
}

/** Remember a URL that came from a batch signature (`createSignedUrls`). */
export function seedSigned(key: string, url: string, expiresAt: number): void {
  memo.set(key, { url, expiresAt });
}
