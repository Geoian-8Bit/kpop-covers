import { describe, expect, it } from 'vitest';
import { CLOUD_CACHE, cacheEvictions, shouldCacheCloudFile } from './cloudCacheRules';

const MB = 1024 * 1024;

describe('shouldCacheCloudFile', () => {
  it('downloads the group files', () => {
    expect(shouldCacheCloudFile({ url: 'https://x.supabase.co/a.mp4?token=1', bytes: 48 * MB, saveData: false })).toBe(true);
    expect(shouldCacheCloudFile({ url: 'https://x/a.mp4', bytes: null, saveData: false })).toBe(true);
  });

  it('skips device URLs, data saver and oversized rows', () => {
    expect(shouldCacheCloudFile({ url: 'blob:http://localhost/1', bytes: 1, saveData: false })).toBe(false);
    expect(shouldCacheCloudFile({ url: 'https://x/a.mp4', bytes: 1, saveData: true })).toBe(false);
    expect(shouldCacheCloudFile({ url: 'https://x/a.mp4', bytes: CLOUD_CACHE.maxFileBytes + 1, saveData: false })).toBe(false);
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
