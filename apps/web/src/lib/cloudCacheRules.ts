/**
 * Pure rules of the device's cache of group files (see cloudCache.ts): which cloud files are worth downloading whole
 * so loops play from the phone, and which old copies make room. No DOM.
 */
export const CLOUD_CACHE = {
  /** Copies kept (the songs of this week's rehearsals). */
  maxEntries: 4,
  /** Bytes kept in all. */
  maxBytes: 300 * 1024 * 1024,
  /** Bigger files keep streaming (the group's files are ≤ 50 MB: this only guards odd rows). */
  maxFileBytes: 120 * 1024 * 1024,
} as const;

export interface CacheEntry {
  key: string;
  bytes: number;
  usedAt: number;
}

/** Whether a cloud file should be fetched whole in the background. */
export function shouldCacheCloudFile(input: { url: string; bytes: number | null; saveData: boolean }): boolean {
  // The demo's pretend cloud already hands out device URLs.
  if (input.url.startsWith('blob:') || input.url.startsWith('data:')) return false;
  if (input.saveData) return false;
  return input.bytes == null || input.bytes <= CLOUD_CACHE.maxFileBytes;
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
