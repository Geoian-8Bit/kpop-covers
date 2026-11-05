import { describe, expect, it } from 'vitest';
import { CLOUD_CACHE, LOW_MEMORY_CACHE } from './cloudCacheRules';
import {
  PREFETCH_STORAGE_MARGIN,
  connectionKind,
  nextPrefetch,
  prefetchEvictions,
  prefetchMayRun,
} from './cloudPrefetchRules';

const MB = 1024 * 1024;
const idle = {
  visible: true,
  saveData: false,
  connection: 'unmetered' as const,
  otherDownloads: 0,
  uploads: 0,
  mediaBusy: false,
};

describe('connectionKind', () => {
  it('reads the browser connection type; a browser that says nothing is unknown', () => {
    expect(connectionKind('cellular')).toBe('cellular');
    expect(connectionKind('wifi')).toBe('unmetered');
    expect(connectionKind('ethernet')).toBe('unmetered');
    // Safari / Firefox (no navigator.connection), desktop Chrome (no type), odd values.
    expect(connectionKind(undefined)).toBe('unknown');
    expect(connectionKind(null)).toBe('unknown');
    expect(connectionKind('unknown')).toBe('unknown');
    expect(connectionKind('bluetooth')).toBe('unknown');
  });
});

describe('prefetchMayRun', () => {
  it('runs with nothing else going on', () => {
    expect(prefetchMayRun({ ...idle, stage: null })).toBe(true);
    expect(prefetchMayRun({ ...idle, stage: null, connection: 'unknown' })).toBe(true);
  });
  it('waits while hidden, on mobile data, with «Ahorro de datos», another download or an upload', () => {
    expect(prefetchMayRun({ ...idle, stage: null, visible: false })).toBe(false);
    expect(prefetchMayRun({ ...idle, stage: null, connection: 'cellular' })).toBe(false);
    expect(prefetchMayRun({ ...idle, stage: null, saveData: true })).toBe(false);
    expect(prefetchMayRun({ ...idle, stage: null, otherDownloads: 1 })).toBe(false);
    expect(prefetchMayRun({ ...idle, stage: null, uploads: 1 })).toBe(false);
  });
  it('waits while any player streams (YouTube, review, takes)', () => {
    expect(prefetchMayRun({ ...idle, stage: null, mediaBusy: true })).toBe(false);
  });
  it('never takes bandwidth from a file stage fetching its file or short of buffer', () => {
    const fetching = { paused: false, loading: true, aheadS: 120, toEndS: 200 };
    expect(prefetchMayRun({ ...idle, stage: fetching })).toBe(false);
    const short = { paused: true, loading: false, aheadS: 5, toEndS: 200 };
    expect(prefetchMayRun({ ...idle, stage: short })).toBe(false);
  });
  it('runs when the stage has its whole file or a roomy buffer', () => {
    const whole = { paused: false, loading: false, aheadS: 40, toEndS: 40 };
    expect(prefetchMayRun({ ...idle, stage: whole })).toBe(true);
    const roomy = { paused: false, loading: false, aheadS: 30, toEndS: 200 };
    expect(prefetchMayRun({ ...idle, stage: roomy })).toBe(true);
  });
});

describe('prefetchEvictions', () => {
  const e = (key: string, bytes: number, usedAt: number) => ({ key, bytes, usedAt });
  const none = new Set<string>();
  const incoming = { key: 'p', bytes: 30 * MB };

  it('fits without dropping anything when there is room', () => {
    expect(prefetchEvictions([e('a', 30 * MB, 5)], incoming, none, CLOUD_CACHE)).toEqual([]);
  });
  it('drops the oldest played copy, never the last played one', () => {
    const entries = [e('old', 30 * MB, 1), e('last', 30 * MB, 9)];
    expect(prefetchEvictions(entries, incoming, none, LOW_MEMORY_CACHE)).toEqual(['old']);
  });
  it('never drops an open video', () => {
    const entries = [e('open', 30 * MB, 1), e('last', 30 * MB, 9)];
    expect(prefetchEvictions(entries, incoming, new Set(['open']), LOW_MEMORY_CACHE)).toBeNull();
  });
  it('never drops another prefetched copy', () => {
    const entries = [e('guess', 30 * MB, 0), e('last', 30 * MB, 9)];
    expect(prefetchEvictions(entries, incoming, none, LOW_MEMORY_CACHE)).toBeNull();
  });
  it('keeps the total under the byte limit', () => {
    const entries = [e('last', 50 * MB, 9)];
    expect(prefetchEvictions(entries, { key: 'p', bytes: 60 * MB }, none, LOW_MEMORY_CACHE)).toEqual([]);
    expect(prefetchEvictions(entries, { key: 'p', bytes: 71 * MB }, none, LOW_MEMORY_CACHE)).toBeNull();
  });
});

describe('nextPrefetch', () => {
  const song = (n: number, bytes: number | null = 30 * MB) => ({
    videoId: `v${n}`,
    path: `g/v${n}.mp4`,
    bytes,
  });
  const base = {
    cached: [],
    open: new Set<string>(),
    skip: new Set<string>(),
    limits: CLOUD_CACHE,
    connection: 'unmetered' as const,
    freeBytes: null,
  };

  it('takes the first song of the repertoire not kept yet', () => {
    const cached = [{ key: 'g/v1.mp4', bytes: 30 * MB, usedAt: 1 }];
    expect(nextPrefetch({ ...base, cached, candidates: [song(1), song(2), song(3)] })).toEqual({
      ...song(2),
      maxBytes: CLOUD_CACHE.maxFileBytes,
    });
  });
  it('passes over files on this device or failed lately', () => {
    const skip = new Set(['v1', 'g/v2.mp4']);
    expect(nextPrefetch({ ...base, skip, candidates: [song(1), song(2), song(3)] })?.path).toBe('g/v3.mp4');
  });
  it('tries a file of unknown or oversized row size, capped by the ceiling', () => {
    expect(nextPrefetch({ ...base, candidates: [song(1, null)] })?.maxBytes).toBe(CLOUD_CACHE.maxFileBytes);
    // A lighter cloud copy keeps the original's size on the row.
    expect(nextPrefetch({ ...base, candidates: [song(1, 500 * MB)] })?.path).toBe('g/v1.mp4');
  });
  it('a low-memory phone that played a video still gets one guess next to it', () => {
    const limits = LOW_MEMORY_CACHE;
    const old = { key: 'g/old.mp4', bytes: 40 * MB, usedAt: 1 };
    const last = { key: 'g/last.mp4', bytes: 40 * MB, usedAt: 9 };
    expect(nextPrefetch({ ...base, limits, cached: [old, last], candidates: [song(1)] })?.path).toBe(
      'g/v1.mp4',
    );
    // …but not when the other copy is open, nor a second guess.
    const open = new Set([old.key]);
    expect(nextPrefetch({ ...base, limits, cached: [old, last], open, candidates: [song(1)] })).toBeNull();
    const guess = { key: 'g/v1.mp4', bytes: 30 * MB, usedAt: 0 };
    expect(
      nextPrefetch({ ...base, limits, cached: [last, guess], candidates: [song(1), song(2)] }),
    ).toBeNull();
  });
  it('an unknown connection (Safari, Firefox, desktop) prefetches one small file at most', () => {
    const pick = nextPrefetch({ ...base, connection: 'unknown', candidates: [song(1, null)] });
    expect(pick?.maxBytes).toBe(LOW_MEMORY_CACHE.maxFileBytes);
    const cached = [{ key: 'g/v1.mp4', bytes: 30 * MB, usedAt: 0 }];
    expect(nextPrefetch({ ...base, connection: 'unknown', cached, candidates: [song(2)] })).toBeNull();
  });
  it('nothing on mobile data', () => {
    expect(nextPrefetch({ ...base, connection: 'cellular', candidates: [song(1)] })).toBeNull();
  });
  it('leaves the device its margin of free space; an unreported estimate relies on the cache limits', () => {
    const candidates = [song(1, 30 * MB)];
    expect(nextPrefetch({ ...base, candidates, freeBytes: PREFETCH_STORAGE_MARGIN + 29 * MB })).toBeNull();
    const roomy = nextPrefetch({ ...base, candidates, freeBytes: PREFETCH_STORAGE_MARGIN + 30 * MB });
    expect(roomy?.path).toBe('g/v1.mp4');
    expect(nextPrefetch({ ...base, candidates, freeBytes: null })?.path).toBe('g/v1.mp4');
  });
  it('nothing to do without candidates', () => {
    expect(nextPrefetch({ ...base, candidates: [] })).toBeNull();
  });
});
