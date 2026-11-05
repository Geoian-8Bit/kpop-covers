import {
  DOWNLOAD_HEADROOM_S,
  LOW_MEMORY_CACHE,
  type CacheEntry,
  type CacheLimits,
  type StageBuffer,
} from './cloudCacheRules';

/**
 * Pure rules of the quiet background prefetch (data/videos/prefetchFiles.ts): which cloud file of the songs most
 * likely played next is copied to this device ahead of time, so a rehearsal plays from the phone even when the 4G
 * dies, and when that copy may take the network. A guess must never cost the dancer anything: it never competes
 * with a playing video, an upload or another download, never pushes out the open or last played video and never
 * fills the device. Same rules on every browser: what a browser doesn't tell (connection type, memory, free space)
 * is treated cautiously, never as a reason to fail.
 */

/** A cloud file worth having here, most likely first. `bytes` null: size unknown. */
export interface PrefetchCandidate {
  videoId: string;
  path: string;
  bytes: number | null;
}

/** The file to copy and the most bytes its copy may take (the download stops past it). */
export type PrefetchPick = PrefetchCandidate & { maxBytes: number };

/**
 * The network as the browser reports it (`navigator.connection.type`, Chromium on Android / ChromeOS only).
 * `unknown`: Safari, Firefox, desktop Chrome — allowed, but cautiously (see `nextPrefetch`).
 */
export type ConnectionKind = 'unmetered' | 'cellular' | 'unknown';

export function connectionKind(type: string | null | undefined): ConnectionKind {
  if (type === 'cellular') return 'cellular';
  if (type === 'wifi' || type === 'ethernet') return 'unmetered';
  return 'unknown';
}

/** Free space (quota − usage) that must stay on the device after the copy, beyond the file itself. */
export const PREFETCH_STORAGE_MARGIN = 200 * 1024 * 1024;

/**
 * Whether the prefetch may read from the network now. Stricter than `downloadMayRun`: the page is on screen (a
 * hidden tab's sockets are frozen anyway), not on mobile data, the browser doesn't ask for less data, nothing else
 * downloads or uploads, no player streams (`mediaBusy`: YouTube, review, takes…), and the file stage (if any)
 * isn't fetching and has the rest of its file or a roomy buffer.
 */
export function prefetchMayRun(input: {
  stage: StageBuffer | null;
  visible: boolean;
  saveData: boolean;
  connection: ConnectionKind;
  otherDownloads: number;
  uploads: number;
  mediaBusy: boolean;
}): boolean {
  if (!input.visible || input.saveData || input.connection === 'cellular') return false;
  if (input.otherDownloads > 0 || input.uploads > 0 || input.mediaBusy) return false;
  const stage = input.stage;
  if (!stage) return true;
  return !stage.loading && stage.aheadS >= Math.min(DOWNLOAD_HEADROOM_S, stage.toEndS - 0.5);
}

/** A prefetched copy nobody has opened yet (cloudCache.ts notes it with `usedAt` 0). */
const isPrefetched = (e: CacheEntry) => e.usedAt === 0;

/**
 * The copies a prefetched file of `incoming` bytes would push out, oldest first, or null when it can't fit. Never
 * dropped: an open video, the last video played (the most recent copy that isn't a prefetch) and other prefetched
 * copies. So a 2-copy cache (low memory, or a browser that doesn't say) holds the last video plus one guess.
 */
export function prefetchEvictions(
  entries: readonly CacheEntry[],
  incoming: { key: string; bytes: number },
  open: ReadonlySet<string>,
  limits: Pick<CacheLimits, 'maxEntries' | 'maxBytes'>,
): string[] | null {
  const others = entries.filter((e) => e.key !== incoming.key);
  let last: CacheEntry | null = null;
  for (const e of others) if (!isPrefetched(e) && (!last || e.usedAt > last.usedAt)) last = e;
  let count = others.length + 1;
  let bytes = others.reduce((n, e) => n + Math.max(0, e.bytes), 0) + Math.max(0, incoming.bytes);
  const drop: string[] = [];
  const evictable = others
    .filter((e) => e !== last && !open.has(e.key) && !isPrefetched(e))
    .sort((a, b) => a.usedAt - b.usedAt);
  for (const e of evictable) {
    if (count <= limits.maxEntries && bytes <= limits.maxBytes) break;
    drop.push(e.key);
    count--;
    bytes -= Math.max(0, e.bytes);
  }
  return count <= limits.maxEntries && bytes <= limits.maxBytes ? drop : null;
}

/**
 * The next file to copy, or null. Its size counts as the most its copy may take when the row's size is unknown or
 * bigger (a lighter cloud copy keeps the original's size on the row): the download stops past that ceiling. It
 * must fit by `prefetchEvictions` and leave `PREFETCH_STORAGE_MARGIN` free (`freeBytes` null: the browser doesn't
 * say; the cache's own limits still apply). On an `unknown` connection (maybe mobile data) one guess at most, no
 * bigger than a low-memory phone's ceiling. Files already kept, on this device or in `skip` are passed over.
 */
export function nextPrefetch(input: {
  candidates: readonly PrefetchCandidate[];
  cached: readonly CacheEntry[];
  open: ReadonlySet<string>;
  skip: ReadonlySet<string>;
  limits: CacheLimits;
  connection: ConnectionKind;
  freeBytes: number | null;
}): PrefetchPick | null {
  const { limits, cached } = input;
  const cautious = input.connection !== 'unmetered';
  if (input.connection === 'cellular') return null;
  if (cautious && cached.some(isPrefetched)) return null;
  const maxBytes = cautious
    ? Math.min(limits.maxFileBytes, LOW_MEMORY_CACHE.maxFileBytes)
    : limits.maxFileBytes;
  const kept = new Set(cached.map((e) => e.key));
  for (const c of input.candidates) {
    if (kept.has(c.path) || input.skip.has(c.path) || input.skip.has(c.videoId)) continue;
    const bytes = c.bytes != null && c.bytes > 0 ? Math.min(c.bytes, maxBytes) : maxBytes;
    if (input.freeBytes != null && input.freeBytes < bytes + PREFETCH_STORAGE_MARGIN) continue;
    if (!prefetchEvictions(cached, { key: c.path, bytes }, input.open, limits)) continue;
    return { ...c, maxBytes };
  }
  return null;
}

/** Time a file whose copy failed is left alone before it's tried again. */
export const PREFETCH_RETRY_AFTER_MS = 10 * 60 * 1000;
