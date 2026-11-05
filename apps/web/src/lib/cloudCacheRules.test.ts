import { describe, expect, it } from 'vitest';
import {
  CLOUD_CACHE,
  DOWNLOAD_HEADROOM_S,
  LOW_MEMORY_CACHE,
  cacheEvictions,
  cacheLimits,
  downloadMayRun,
  orphanCopies,
  shouldCacheCloudFile,
} from './cloudCacheRules';

const MB = 1024 * 1024;

describe('shouldCacheCloudFile', () => {
  it('downloads the group files', () => {
    expect(
      shouldCacheCloudFile({ url: 'https://x.supabase.co/a.mp4?token=1', bytes: 48 * MB, saveData: false }),
    ).toBe(true);
    expect(shouldCacheCloudFile({ url: 'https://x/a.mp4', bytes: null, saveData: false })).toBe(true);
  });

  it('skips device URLs, data saver and oversized rows', () => {
    expect(shouldCacheCloudFile({ url: 'blob:http://localhost/1', bytes: 1, saveData: false })).toBe(false);
    expect(shouldCacheCloudFile({ url: 'https://x/a.mp4', bytes: 1, saveData: true })).toBe(false);
    expect(
      shouldCacheCloudFile({ url: 'https://x/a.mp4', bytes: CLOUD_CACHE.maxFileBytes + 1, saveData: false }),
    ).toBe(false);
  });
});

describe('cacheEvictions', () => {
  const limits = { maxEntries: 2, maxBytes: 100 };

  it('drops nothing when it fits', () => {
    expect(cacheEvictions([{ key: 'a', bytes: 10, usedAt: 1 }], 'a', limits)).toEqual([]);
  });

  it('drops the least recently used beyond the count', () => {
    const entries = [
      { key: 'old', bytes: 10, usedAt: 1 },
      { key: 'mid', bytes: 10, usedAt: 5 },
      { key: 'new', bytes: 10, usedAt: 9 },
    ];
    expect(cacheEvictions(entries, 'new', limits)).toEqual(['old']);
  });

  it('drops until the bytes fit, never the kept one', () => {
    const entries = [
      { key: 'keep', bytes: 90, usedAt: 0 },
      { key: 'b', bytes: 20, usedAt: 2 },
    ];
    expect(cacheEvictions(entries, 'keep', limits)).toEqual(['b']);
  });
});

describe('cacheLimits', () => {
  it('keeps less on phones with little memory', () => {
    expect(cacheLimits(8)).toBe(CLOUD_CACHE);
    expect(cacheLimits(4)).toBe(LOW_MEMORY_CACHE);
    expect(cacheLimits(2)).toBe(LOW_MEMORY_CACHE);
    expect(LOW_MEMORY_CACHE.maxFileBytes).toBeLessThan(CLOUD_CACHE.maxFileBytes);
    expect(LOW_MEMORY_CACHE.maxBytes).toBeLessThan(CLOUD_CACHE.maxBytes);
  });

  it('treats a browser that does not say its memory (Safari, Firefox) as low memory', () => {
    expect(cacheLimits(undefined)).toBe(LOW_MEMORY_CACHE);
    expect(LOW_MEMORY_CACHE).toEqual({ maxEntries: 2, maxBytes: 120 * MB, maxFileBytes: 60 * MB });
  });
});

describe('orphanCopies', () => {
  it('drops the copies no index line or running download knows', () => {
    expect(orphanCopies(['a', 'b', null, 'c'], ['a', 'c'])).toEqual(['b']);
    expect(orphanCopies(['a'], ['a'])).toEqual([]);
    expect(orphanCopies([], ['a'])).toEqual([]);
  });

  it('a low-memory phone skips files above its own ceiling', () => {
    const url = 'https://x/a.mp4';
    const bytes = LOW_MEMORY_CACHE.maxFileBytes + 1;
    expect(shouldCacheCloudFile({ url, bytes, saveData: false })).toBe(true);
    expect(shouldCacheCloudFile({ url, bytes, saveData: false, limits: LOW_MEMORY_CACHE })).toBe(false);
  });
});

describe('downloadMayRun', () => {
  const playing = { paused: false, loading: true };

  it('runs with no stage on screen', () => {
    expect(downloadMayRun(null)).toBe(true);
  });

  it('waits while the video plays on a thin buffer', () => {
    expect(downloadMayRun({ ...playing, aheadS: 5, toEndS: 120 })).toBe(false);
    expect(downloadMayRun({ ...playing, aheadS: DOWNLOAD_HEADROOM_S - 1, toEndS: 120 })).toBe(false);
  });

  it('runs once the video has a roomy buffer, or holds the rest of the file', () => {
    expect(downloadMayRun({ ...playing, aheadS: DOWNLOAD_HEADROOM_S, toEndS: 120 })).toBe(true);
    expect(downloadMayRun({ ...playing, aheadS: 9.8, toEndS: 10 })).toBe(true);
  });

  it('runs while paused only once the video stopped loading', () => {
    expect(downloadMayRun({ paused: true, loading: true, aheadS: 2, toEndS: 120 })).toBe(false);
    expect(downloadMayRun({ paused: true, loading: false, aheadS: 2, toEndS: 120 })).toBe(true);
  });
});
