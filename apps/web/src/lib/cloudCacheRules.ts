/**
 * Pure rules of the device's cache of group files (see cloudCache.ts): which cloud files are worth downloading whole
 * so loops play from the phone, when that download may use the network, and which old copies make room. No DOM.
 */
export const CLOUD_CACHE = {
  /** Copies kept (the songs of this week's rehearsals). */
  maxEntries: 4,
  /** Bytes kept in all. */
  maxBytes: 300 * 1024 * 1024,
  /** Bigger files keep streaming (the group's files are ≤ 50 MB: this only guards odd rows). */
  maxFileBytes: 120 * 1024 * 1024,
} as const;

/**
 * REQ-15 · Phones that report ≤ 4 GB (`navigator.deviceMemory`; a 6 GB Redmi Note 12 Pro says 4) keep fewer, smaller
 * copies: their storage and their tab's memory are the first to run out.
 */
export const LOW_MEMORY_CACHE = {
  maxEntries: 2,
  maxBytes: 120 * 1024 * 1024,
  maxFileBytes: 60 * 1024 * 1024,
} as const;

export type CacheLimits = { maxEntries: number; maxBytes: number; maxFileBytes: number };

/**
 * The limits for a device that reports `deviceMemory` GB. Undefined (Safari, Firefox: the browser doesn't say) gets
 * the low-memory limits: an iPhone's tab is the first to be killed.
 */
export function cacheLimits(deviceMemory: number | undefined): CacheLimits {
  return deviceMemory == null || deviceMemory <= 4 ? LOW_MEMORY_CACHE : CLOUD_CACHE;
}

/**
 * REQ-15 · The copies on disk (`stored`, by path; null = not one of ours) that no index line or running download
 * accounts for: they would hold space forever.
 */
export function orphanCopies(stored: (string | null)[], known: string[]): string[] {
  const keep = new Set(known);
  return stored.filter((path): path is string => path != null && !keep.has(path));
}

export interface CacheEntry {
  key: string;
  bytes: number;
  usedAt: number;
}

/** Whether a cloud file should be fetched whole in the background. */
export function shouldCacheCloudFile(input: {
  url: string;
  bytes: number | null;
  saveData: boolean;
  limits?: CacheLimits;
}): boolean {
  // The demo's pretend cloud already hands out device URLs.
  if (input.url.startsWith('blob:') || input.url.startsWith('data:')) return false;
  if (input.saveData) return false;
  return input.bytes == null || input.bytes <= (input.limits ?? CLOUD_CACHE).maxFileBytes;
}

/** REQ-15 · Seconds the playing video must have buffered ahead before the background download takes bandwidth. */
export const DOWNLOAD_HEADROOM_S = 30;

/** What the file stage's <video> is doing now (see player/stageBuffer.ts). */
export interface StageBuffer {
  paused: boolean;
  /** The element is still fetching (networkState NETWORK_LOADING). */
  loading: boolean;
  /** Seconds buffered from the current moment on. */
  aheadS: number;
  /** Seconds from the current moment to the end of the file. */
  toEndS: number;
}

/**
 * REQ-15 · Whether the background download may read from the network now. It must never compete with the picture
 * on a thin 4G: it runs with no stage on screen, while paused once the element stopped fetching, or while playing
 * with a roomy buffer (or the rest of the file already there). Otherwise it waits, and since the download is read
 * chunk by chunk, waiting holds the connection still and leaves the bandwidth to the video.
 */
export function downloadMayRun(stage: StageBuffer | null): boolean {
  if (!stage) return true;
  if (stage.aheadS >= Math.min(DOWNLOAD_HEADROOM_S, stage.toEndS - 0.5)) return true;
  return stage.paused && !stage.loading;
}

/**
 * The keys to drop so the cache fits again, least recently used first. `keep` (the file just added or playing) is
 * never dropped.
 */
export function cacheEvictions(
  entries: readonly CacheEntry[],
  keep: string,
  limits: { maxEntries: number; maxBytes: number } = CLOUD_CACHE,
): string[] {
  let count = entries.length;
  let bytes = entries.reduce((n, e) => n + Math.max(0, e.bytes), 0);
  const drop: string[] = [];
  const oldestFirst = [...entries].filter((e) => e.key !== keep).sort((a, b) => a.usedAt - b.usedAt);
  for (const entry of oldestFirst) {
    if (count <= limits.maxEntries && bytes <= limits.maxBytes) break;
    drop.push(entry.key);
    count--;
    bytes -= Math.max(0, entry.bytes);
  }
  return drop;
}
