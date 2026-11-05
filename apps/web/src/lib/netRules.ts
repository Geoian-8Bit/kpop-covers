/**
 * Network robustness for reads on a weak phone over poor 4G (drops of 10–20 s while `navigator.onLine` stays true).
 * Pure rules, unit tested: which query errors are worth retrying, how long to wait between tries, and a `fetch`
 * wrapper that gives up on a request stuck with no answer so the retry can start over on a fresh socket.
 */

/**
 * Tries after the first failure for an error that can fix itself (network, timeout, 5xx). With the idle deadline
 * below, a read on a dead socket gives up after about 4 × 12 s + 7 s of waits ≈ 1 min (postgrest-js's own retry is
 * off, see supabase.ts, so tries don't stack).
 */
export const TRANSIENT_RETRIES = 3;
/** Tries for an error of unknown kind: what the app did before (`retry: 1`). */
const UNKNOWN_RETRIES = 1;
const RETRY_BASE_MS = 1000;
const RETRY_CAP_MS = 10_000;

/** A read that receives nothing (no headers, no body bytes) for this long is aborted (its retry gets a new socket). */
export const REQUEST_TIMEOUT_MS = 12_000;

export type ErrorKind = 'transient' | 'permanent' | 'unknown';

const NETWORK_MESSAGE =
  /failed to fetch|fetch failed|load failed|network ?error|networkerror|network request failed|err_network|err_internet|timed? ?out|timeout|aborted|abort|bad gateway|service unavailable|gateway time-?out|web server is returning an unknown error|origin is unreachable|upstream connect|connection (reset|refused|closed)|econn|socket hang up/i;
/** SQLSTATE classes that can fix themselves: connection (08), resources (53), operator / cancel (57), retry (40). */
const TRANSIENT_SQLSTATE = /^(08|40|53|57)/;

function field(error: unknown, name: string): unknown {
  return typeof error === 'object' && error !== null ? (error as Record<string, unknown>)[name] : undefined;
}

/**
 * What kind of failure `error` is. PostgREST errors carry `code` (`PGRST…` or a SQLSTATE) and say exactly what is
 * wrong (RLS, a constraint, a missing row): retrying won't change the answer. A fetch that never got an answer
 * surfaces as a TypeError («Failed to fetch»), an AbortError / TimeoutError, or (through postgrest-js) a plain
 * object whose message carries those names.
 */
export function classifyError(error: unknown): ErrorKind {
  if (error == null) return 'unknown';
  const name = field(error, 'name');
  if (name === 'AbortError' || name === 'TimeoutError') return 'transient';

  const status = field(error, 'status');
  if (typeof status === 'number' && status > 0) {
    if (status >= 500 || status === 408 || status === 429) return 'transient';
    if (status >= 400) return 'permanent';
  }

  const code = field(error, 'code');
  if (typeof code === 'string' && code !== '') {
    // PostgREST can't reach the database (001, 003) or hasn't loaded its schema yet (002): it passes.
    if (/^PGRST00[123]$/i.test(code)) return 'transient';
    if (/^PGRST/i.test(code)) return 'permanent';
    if (/^[0-9A-Z]{5}$/.test(code)) return TRANSIENT_SQLSTATE.test(code) ? 'transient' : 'permanent';
  }

  const message = field(error, 'message');
  if (typeof message === 'string' && NETWORK_MESSAGE.test(message)) return 'transient';
  if (name === 'TypeError' && message === undefined) return 'transient';
  return 'unknown';
}

/** React Query `retry`: `failureCount` is 0 after the first failure. */
export function queryRetry(failureCount: number, error: unknown): boolean {
  const kind = classifyError(error);
  if (kind === 'permanent') return false;
  return failureCount < (kind === 'transient' ? TRANSIENT_RETRIES : UNKNOWN_RETRIES);
}

/**
 * React Query `retryDelay`: about 1 s, 2 s, 4 s, 8 s (capped at 10 s), each ±25 % so phones that lost the network
 * together don't all come back in the same instant.
 */
export function queryRetryDelay(failureCount: number, random: () => number = Math.random): number {
  const base = Math.min(RETRY_BASE_MS * 2 ** Math.max(0, failureCount), RETRY_CAP_MS);
  return Math.min(Math.round(base * (0.75 + random() * 0.5)), RETRY_CAP_MS);
}

/** RPCs sent as POST that only read (anything else posted may be a write). */
const READ_RPCS = /\/rpc\/(calendar_members|formation_members|storage_usage|poll_votes_signature)(\?|$)/;

/**
 * Only reads are cut short: a write aborted after the server applied it would look failed (and be sent again).
 * Storage file transfers (uploads and downloads can take minutes) and realtime never are.
 */
export function timesOut(url: string, method = 'GET'): boolean {
  if (/\/storage\/v1\/object\/|\/realtime\/v1\//.test(url)) return false;
  const verb = method.toUpperCase();
  return verb === 'GET' || verb === 'HEAD' || (verb === 'POST' && READ_RPCS.test(url));
}

/** Statuses a `Response` can't be built with a body for. */
const NULL_BODY = new Set([101, 103, 204, 205, 304]);

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** The whole body, calling `onChunk` as each part arrives (one call when the body can't be streamed). */
async function readIdle(response: Response, onChunk: () => void): Promise<ArrayBuffer> {
  const reader = response.body?.getReader();
  if (!reader) return response.arrayBuffer();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk();
    parts.push(value);
    size += value.byteLength;
  }
  const body = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    body.set(part, at);
    at += part.byteLength;
  }
  return body.buffer;
}

function timeoutReason(): unknown {
  try {
    return new DOMException('La petición tardó demasiado', 'TimeoutError');
  } catch {
    return Object.assign(new Error('Request timed out'), { name: 'TimeoutError' });
  }
}

/**
 * A `fetch` that aborts a request once nothing has arrived for `timeoutMs`: no headers yet, or no body bytes since
 * the last ones (an idle deadline, so a large answer on slow-but-working 4G still loads, while a socket that dies
 * mid-body fails fast) and the query's retry can try again. The caller's own `signal` still aborts it (signals are
 * combined by hand: `AbortSignal.any` is missing on older Android WebViews). URLs `applies` rejects pass through.
 */
export function createTimeoutFetch(
  baseFetch: typeof fetch,
  {
    timeoutMs = REQUEST_TIMEOUT_MS,
    applies = timesOut,
  }: { timeoutMs?: number; applies?: (url: string, method: string) => boolean } = {},
): typeof fetch {
  return async (input, init) => {
    const request = typeof Request !== 'undefined' && input instanceof Request ? input : null;
    const method = init?.method ?? request?.method ?? 'GET';
    if (!applies(urlOf(input), method)) return baseFetch(input, init);
    const outer = init?.signal ?? request?.signal ?? null;
    if (outer?.aborted) return baseFetch(input, init);

    const controller = new AbortController();
    const onOuterAbort = () => controller.abort(outer?.reason);
    outer?.addEventListener('abort', onOuterAbort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(timeoutReason()), timeoutMs);
    };
    arm();
    const done = () => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onOuterAbort);
    };

    try {
      const response = await baseFetch(input, { ...init, signal: controller.signal });
      // The body is read under the same idle deadline, re-armed on every chunk: buffered here, then handed on.
      arm();
      const body = await readIdle(response, arm);
      done();
      return new Response(NULL_BODY.has(response.status) ? null : body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      done();
      throw error;
    }
  };
}
