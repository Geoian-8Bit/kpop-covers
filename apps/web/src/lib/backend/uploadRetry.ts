import { retriedUploadLanded, uploadRetryDelay } from '../uploadRetryRules';
import { beginUpload } from '../mediaActivity';
import type { UploadResult } from './types';

/** Longest wait for the network (or for the page to be on screen again) before a try goes ahead anyway. */
const WAIT_FOR_NETWORK_MS = 60_000;

const abortError = () => new DOMException('Subida cancelada', 'AbortError');

/** Resolves after `ms`, or as soon as `ready()` holds once `ms` passed (checked on 'online' / 'visibilitychange'). */
function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const ready = () => navigator.onLine !== false && document.visibilityState !== 'hidden';
    let cap: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: DOMException) => {
      clearTimeout(timer);
      clearTimeout(cap);
      window.removeEventListener('online', check);
      document.removeEventListener('visibilitychange', check);
      signal?.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve();
    };
    let waited = false;
    const check = () => {
      if (waited && ready()) finish();
    };
    const onAbort = () => finish(abortError());
    const timer = setTimeout(() => {
      waited = true;
      // Offline or hidden: wait for the network / the screen, but not forever.
      cap = setTimeout(() => finish(), WAIT_FOR_NETWORK_MS);
      check();
    }, ms);
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', check);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Poor 4G · One upload, tried again silently after a failure that can fix itself (no answer, 5xx, 408, 429): after
 * 2 s, 5 s and 15 s, each also waiting for the network and the screen to be back. Before each new try `onRetry`
 * says so (whoever shows progress holds the bar and restarts its estimate); only the last failure is reported. A
 * real refusal is reported at once. `storedBytes` reads the size of the file already at the name: after an
 * unclear failure it is asked first (the lost answer may hide a finished upload: then nothing is sent again), and
 * a later try told «already there» counts as uploaded only when that file is exactly this one
 * (uploadRetryRules.retriedUploadLanded). Names are unique and never overwritten, so a retry never leaves two
 * files nor reports a stranger's file as ours. `signal` stops the retries (and their waits) at once. While it
 * runs, the background prefetch leaves the network alone (lib/mediaActivity.ts).
 */
export async function uploadWithRetry(
  run: () => Promise<UploadResult>,
  opts: {
    path: string;
    bytes: number;
    signal?: AbortSignal;
    onRetry?: () => void;
    storedBytes: () => Promise<number | null>;
  },
): Promise<UploadResult> {
  const done = beginUpload();
  try {
    let earlierTransient = false;
    const landed = async (result: UploadResult) => {
      const storedBytes = await opts.storedBytes().catch(() => null);
      return retriedUploadLanded({ earlierTransient, result, bytes: opts.bytes, storedBytes });
    };
    for (let retries = 0; ; retries++) {
      if (opts.signal?.aborted) throw abortError();
      const result = await run();
      if (result.ok) return result;
      if (
        earlierTransient &&
        (result.reason === 'exists' || result.reason === 'denied') &&
        (await landed(result))
      )
        return { ok: true, path: opts.path };
      const delay = uploadRetryDelay(retries, result);
      if (delay == null) return result;
      earlierTransient = true;
      opts.onRetry?.();
      await pause(delay, opts.signal);
      // The answer lost may have hidden a finished upload: ask before sending it all again.
      if (await landed({ ok: false, reason: 'exists' })) return { ok: true, path: opts.path };
      opts.onRetry?.();
    }
  } finally {
    done();
  }
}
