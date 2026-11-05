import { createStore, del, get } from 'idb-keyval';
import {
  cacheEvictions,
  cacheLimits,
  orphanCopies,
  type CacheEntry,
  type CacheLimits,
} from './cloudCacheRules';
import { prefetchEvictions } from './cloudPrefetchRules';

/**
 * The device's copies of group files that came from the cloud (not this device's own files: those live in
 * localVideos.ts and count as «on this device»). A cloud file streams by ranges: on a slow 4G every loop jump back
 * outside what the browser kept asks the network again. Once the whole file is here the next visit plays it from the
 * phone. Keyed by storage path (a replaced file gets a new path), a few of them, least recently used dropped first.
 *
 * REQ-15 · New copies are streamed straight to disk (Cache Storage, the response's ReadableStream), never gathered in
 * memory: a 50 MB `res.blob()` per video opened was enough to crash a 6 GB phone's tab. Copies kept before in
 * IndexedDB are still read (and dropped) as they were.
 */

// Its own database: idb-keyval opens one object store per database. Copies from before REQ-15 live here.
let store: ReturnType<typeof createStore> | null = null;
const files = () => (store ??= createStore('coverscape-cache', 'files'));
const INDEX_KEY = 'oneshoot.cloudcache.v1';
/** REQ-15 · Cache Storage bucket of the streamed copies. */
const CACHE_NAME = 'oneshoot-cloud-files-v1';

type Index = Record<string, { bytes: number; usedAt: number }>;

function readIndex(): Index {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) ?? '{}') as Index;
  } catch {
    return {};
  }
}

function writeIndex(index: Index): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    /* this visit only */
  }
}

/** Cache Storage, where the browser has it (secure contexts). */
function cacheStorage(): CacheStorage | null {
  return typeof caches === 'undefined' ? null : caches;
}

/** The Cache Storage key of a path: a same-origin URL nothing ever fetches. */
function cacheKey(path: string): string {
  return new URL(`/__oneshoot-cloud-file/${encodeURIComponent(path)}`, location.origin).href;
}

/**
 * REQ-15 · This device's copy limits, by its memory class (`navigator.deviceMemory`, Chromium only: Safari and
 * Firefox don't say, and get the low-memory limits).
 */
export function cloudCacheLimits(): CacheLimits {
  return cacheLimits((navigator as Navigator & { deviceMemory?: number }).deviceMemory);
}

/** The streamed copy of `path`, as a disk-backed Blob. */
async function readStreamed(path: string): Promise<Blob | undefined> {
  const cache = cacheStorage();
  if (!cache) return undefined;
  const res = await (await cache.open(CACHE_NAME)).match(cacheKey(path));
  if (!res) return undefined;
  const blob = await res.blob();
  return blob.size ? blob : undefined;
}

/** The device copy of the cloud file at `path`, if one was downloaded before. */
export async function loadCachedCloudFile(path: string): Promise<Blob | undefined> {
  try {
    const blob = (await get<Blob>(path, files()).catch(() => undefined)) ?? (await readStreamed(path));
    const index = readIndex();
    if (blob) {
      index[path] = { bytes: blob.size, usedAt: Date.now() };
      writeIndex(index);
    } else if (index[path]) {
      delete index[path];
      writeIndex(index);
    }
    return blob ?? undefined;
  } catch {
    return undefined;
  }
}

async function forgetCopy(key: string): Promise<void> {
  await del(key, files()).catch(() => undefined);
  const cache = cacheStorage();
  if (cache) await (await cache.open(CACHE_NAME)).delete(cacheKey(key)).catch(() => undefined);
}

/** Files open on screen now (a stage or the review), by path, with how many hold each. */
const openFiles = new Map<string, number>();

/** A screen holds `path` open while mounted (a prefetch never pushes its copy out). Returns a release. */
export function holdCloudFileOpen(path: string): () => void {
  openFiles.set(path, (openFiles.get(path) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const n = (openFiles.get(path) ?? 1) - 1;
    if (n > 0) openFiles.set(path, n);
    else openFiles.delete(path);
  };
}

/** The paths open on screen now. */
export function openCloudFiles(): ReadonlySet<string> {
  return new Set(openFiles.keys());
}

/** The copies kept now (path, bytes, last use), for the background prefetch's room check. */
export function cachedCloudFiles(): CacheEntry[] {
  return Object.entries(readIndex()).map(([key, v]) => ({ key, bytes: v.bytes, usedAt: v.usedAt }));
}

/**
 * Notes a finished copy and drops the oldest ones that no longer fit. A `prefetched` copy (nobody opened it yet)
 * counts as the oldest of all (`usedAt` 0: the first to go when a played file needs room) and never makes room by
 * dropping another copy: when it doesn't fit any more (a file opened meanwhile took the room), it is the one dropped.
 */
async function remember(
  path: string,
  bytes: number,
  limits: CacheLimits,
  prefetched = false,
): Promise<boolean> {
  const index = readIndex();
  index[path] = { bytes, usedAt: prefetched ? 0 : Date.now() };
  const entries: CacheEntry[] = Object.entries(index).map(([key, v]) => ({
    key,
    bytes: v.bytes,
    usedAt: v.usedAt,
  }));
  const drop = prefetched
    ? prefetchEvictions(entries, { key: path, bytes }, openCloudFiles(), limits)
    : cacheEvictions(entries, path, limits);
  if (!drop) {
    await forgetCopy(path);
    return false;
  }
  for (const key of drop) delete index[key];
  writeIndex(index);
  await Promise.all(drop.map(forgetCopy));
  await pruneOrphans(index);
  return true;
}

/** The path a Cache Storage key stands for (null: not one of ours). */
function pathOfKey(url: string): string | null {
  const prefix = cacheKey('');
  return url.startsWith(prefix) ? decodeURIComponent(url.slice(prefix.length)) : null;
}

/**
 * REQ-15 · Copies on disk the index no longer knows (a tab closed between the copy and its index line, an index lost
 * with localStorage) would hold space forever: drop them. Downloads still running are left alone.
 */
async function pruneOrphans(index: Index): Promise<void> {
  const storage = cacheStorage();
  if (!storage) return;
  try {
    const cache = await storage.open(CACHE_NAME);
    const paths = (await cache.keys()).map((req) => pathOfKey(req.url));
    const known = [...Object.keys(index), ...inFlight.keys()];
    for (const path of orphanCopies(paths, known)) await cache.delete(cacheKey(path)).catch(() => undefined);
  } catch {
    /* the next copy tries again */
  }
}

/**
 * One download per file at a time (a stage that remounts joins the one running). `gate`: the running download's
 * rule and kind, which a stage joining a background prefetch takes over (its own rule; kept as a played file).
 */
const inFlight = new Map<
  string,
  { job: Promise<Blob | null>; gate: { mayRun: () => boolean; prefetched: boolean } }
>();

/** Downloads running now (the background prefetch waits while another one runs). */
export function cloudDownloadsRunning(): number {
  return inFlight.size;
}

export interface DownloadOptions {
  /**
   * REQ-15 · Whether the network may be used now (cloudCacheRules.downloadMayRun). Asked before every chunk: while it
   * says no, nothing is read, the connection holds still and the playing video keeps the bandwidth.
   */
  mayRun?: () => boolean;
  /** A guess of what may be played next (cloudPrefetchRules.ts), not a file being played. */
  prefetched?: boolean;
  /** A lower ceiling than this device's for this copy (a cautious prefetch): the download stops past it. */
  maxBytes?: number;
}

const GATE_POLL_MS = 1000;
/** REQ-15 · A download held still longer than this lets its connection go and asks for the rest when it may run. */
const IDLE_ABORT_MS = 20_000;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Downloads the whole cloud file in the background and keeps it on disk. Not cancelled when the screen closes: the
 * next visit plays it from here. Null when the network or the server refused, the file is over this device's
 * ceiling, or the browser has no Cache Storage. REQ-15 · Low priority, streamed to disk, only while `mayRun` allows.
 */
export function downloadCloudFile(
  path: string,
  url: string,
  opts: DownloadOptions = {},
): Promise<Blob | null> {
  const running = inFlight.get(path);
  if (running) {
    if (!opts.prefetched && running.gate.prefetched) {
      running.gate.mayRun = opts.mayRun ?? (() => true);
      running.gate.prefetched = false;
    }
    return running.job;
  }
  const gate = { mayRun: opts.mayRun ?? (() => true), prefetched: Boolean(opts.prefetched) };
  const mayRun = () => gate.mayRun();
  const job = (async () => {
    try {
      const storage = cacheStorage();
      if (!storage) return null;
      const deviceLimits = cloudCacheLimits();
      const limits = {
        ...deviceLimits,
        maxFileBytes: Math.min(deviceLimits.maxFileBytes, opts.maxBytes ?? Number.POSITIVE_INFINITY),
      };
      // The stage that asked mounts its <video> right after: give it a moment to show up before the first look.
      await wait(GATE_POLL_MS);
      while (!mayRun()) await wait(GATE_POLL_MS);
      // `priority` (Fetch Priority) is Chromium's and Safari's; other browsers ignore the field.
      const init: RequestInit & { priority?: 'low' } = { mode: 'cors', credentials: 'omit', priority: 'low' };
      let abort = new AbortController();
      const res = await fetch(url, { ...init, signal: abort.signal });
      if (!res.ok || !res.body) return null;
      const declared = Number(res.headers.get('content-length')) || 0;
      if (declared > limits.maxFileBytes) {
        void res.body.cancel().catch(() => undefined);
        return null;
      }
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = res.body.getReader();
      let bytes = 0;
      /** Bytes a restarted request repeats (a server that ignored the range): read and dropped, not stored twice. */
      let skip = 0;
      // REQ-15 · The rest of the file after a let-go connection: from where it stopped, or from the start (skipping
      // what is already on disk) when the server doesn't take ranges.
      const resume = async (): Promise<ReadableStreamDefaultReader<Uint8Array>> => {
        abort = new AbortController();
        const again = await fetch(url, {
          ...init,
          signal: abort.signal,
          headers: { Range: `bytes=${bytes}-` },
        });
        const range = again.headers.get('content-range') ?? '';
        if (again.status === 206 && again.body && range.startsWith(`bytes ${bytes}-`)) {
          skip = 0;
          return again.body.getReader();
        }
        if (again.status === 200 && again.body) {
          skip = bytes;
          return again.body.getReader();
        }
        void again.body?.cancel().catch(() => undefined);
        throw new Error('the rest of the file was refused');
      };
      const gated = new ReadableStream<Uint8Array>({
        async pull(controller) {
          let heldSince: number | null = null;
          while (!mayRun()) {
            heldSince ??= Date.now();
            // REQ-15 · Held still too long: let the connection go instead of keeping a socket open unread.
            if (reader && Date.now() - heldSince > IDLE_ABORT_MS) {
              void reader.cancel().catch(() => undefined);
              abort.abort();
              reader = null;
            }
            await wait(GATE_POLL_MS);
          }
          reader ??= await resume();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              return;
            }
            let chunk = value;
            if (skip > 0) {
              if (chunk.byteLength <= skip) {
                skip -= chunk.byteLength;
                continue;
              }
              chunk = chunk.subarray(skip);
              skip = 0;
            }
            bytes += chunk.byteLength;
            if (bytes > limits.maxFileBytes) {
              void reader.cancel().catch(() => undefined);
              controller.error(new Error('over the device ceiling'));
              return;
            }
            controller.enqueue(chunk);
            return;
          }
        },
        cancel(reason) {
          return reader?.cancel(reason);
        },
      });
      const cache = await storage.open(CACHE_NAME);
      const type = res.headers.get('content-type') ?? 'application/octet-stream';
      // Cache Storage writes the body to disk as it streams in: nothing piles up in the tab's memory.
      await cache.put(cacheKey(path), new Response(gated, { headers: { 'content-type': type } }));
      if (!bytes) {
        await cache.delete(cacheKey(path)).catch(() => undefined);
        return null;
      }
      if (!(await remember(path, bytes, limits, gate.prefetched))) return null;
      return (await readStreamed(path)) ?? null;
    } catch {
      return null;
    } finally {
      inFlight.delete(path);
    }
  })();
  inFlight.set(path, { job, gate });
  return job;
}

/** The browser asks for less data (Chrome's «Ahorro de datos»). */
export function saveDataOn(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return Boolean(connection?.saveData);
}
