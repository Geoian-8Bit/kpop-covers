import { describe, expect, it } from 'vitest';
import {
  entrySize,
  isPersistedKey,
  needsWrite,
  PERSIST_MAX_AGE_MS,
  PERSIST_MAX_ENTRIES,
  PERSIST_REFRESH_MS,
  planSave,
  shouldFill,
  usableEntry,
  type FillState,
  type PersistedEntry,
} from './queryPersistRules';

const NOW = 1_800_000_000_000;
const entry = (hash: string, updatedAt = NOW, data: unknown = [{ id: hash }]): PersistedEntry => ({
  hash,
  queryKey: ['videos', hash],
  data,
  updatedAt,
});

describe('isPersistedKey', () => {
  it('keeps plain group rows', () => {
    for (const key of [
      ['group'],
      ['videos', 'c1'],
      ['video', 'v1'],
      ['clips', 'v1'],
      ['notes', 'v1'],
      ['members'],
    ])
      expect(isPersistedKey(key)).toBe(true);
  });

  it('leaves out signed URLs, inline posters, takes and live state', () => {
    for (const key of [
      ['video-posters', 'c1'],
      ['video-play', 'v1'],
      ['video-stems-urls', 's1'],
      ['takes'],
      ['takes', 'video', 'v1'],
      ['take-reactions', 'v1'],
      ['poll-votes'],
      ['bag-holding'],
      ['bag-draws', 'b1'],
      ['calendar-changes', '2026-01-01'],
      ['profile', 'u1'],
      ['note-sketches', 'v1'],
      [],
      [42],
    ])
      expect(isPersistedKey(key)).toBe(false);
  });
});

describe('entrySize', () => {
  it('measures JSON and refuses what JSON cannot hold', () => {
    expect(entrySize([1, 2])).toBe(5);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(entrySize(cyclic)).toBe(Infinity);
    expect(entrySize(undefined)).toBe(Infinity);
  });
});

describe('usableEntry', () => {
  it('keeps an entry of this build, not too old', () => {
    expect(usableEntry({ ...entry('a'), buster: 'b1' }, 'b1', NOW)).toEqual(entry('a'));
  });

  it('refuses other builds, expired entries and odd shapes', () => {
    expect(usableEntry({ ...entry('a'), buster: 'b0' }, 'b1', NOW)).toBeNull();
    expect(usableEntry({ ...entry('a', NOW - PERSIST_MAX_AGE_MS - 1), buster: 'b1' }, 'b1', NOW)).toBeNull();
    expect(usableEntry(null, 'b1', NOW)).toBeNull();
    expect(usableEntry({ hash: 'x', buster: 'b1' }, 'b1', NOW)).toBeNull();
    expect(
      usableEntry({ ...entry('p'), queryKey: ['video-posters', 'c'], buster: 'b1' }, 'b1', NOW),
    ).toBeNull();
    expect(usableEntry({ ...entry('u'), data: undefined, buster: 'b1' }, 'b1', NOW)).toBeNull();
  });
});

describe('needsWrite', () => {
  it('writes new answers and changed data', () => {
    expect(needsWrite(undefined, entry('a'), NOW)).toBe(true);
    expect(needsWrite(entry('a', NOW - 1000, ['old']), entry('a', NOW, ['new']), NOW)).toBe(true);
  });

  it('skips a refetch that brought the same rows (same reference) until the copy gets old', () => {
    const rows = [{ id: 1 }];
    expect(needsWrite(entry('a', NOW - 8000, rows), entry('a', NOW, rows), NOW)).toBe(false);
    expect(needsWrite(entry('a', NOW - PERSIST_REFRESH_MS, rows), entry('a', NOW, rows), NOW)).toBe(true);
  });

  it('never goes back to an older answer', () => {
    expect(needsWrite(entry('a', NOW, ['new']), entry('a', NOW - 1, ['old']), NOW)).toBe(false);
  });
});

describe('planSave', () => {
  it('writes only the changed entries and keeps the others (even if gone from the cache)', () => {
    const kept = new Map([
      ['a', entry('a', NOW - 1000)],
      ['b', entry('b', NOW - 2000)],
    ]);
    const fresh = entry('a', NOW, ['new']);
    const { write, drop, next } = planSave(kept, [fresh], NOW);
    expect(write).toEqual([fresh]);
    expect(drop).toEqual([]);
    expect([...next.keys()].sort()).toEqual(['a', 'b']);
    expect(next.get('a')).toBe(fresh);
  });

  it('drops expired entries and the ones past the cap (least recent first)', () => {
    const kept = new Map<string, PersistedEntry>();
    for (let i = 0; i < PERSIST_MAX_ENTRIES; i++) kept.set(`k${i}`, entry(`k${i}`, NOW - 10 - i));
    kept.set('gone', entry('gone', NOW - PERSIST_MAX_AGE_MS - 1));
    const { write, drop, next } = planSave(kept, [entry('new', NOW)], NOW);
    expect(write.map((e) => e.hash)).toEqual(['new']);
    expect(drop.sort()).toEqual(['gone', `k${PERSIST_MAX_ENTRIES - 1}`].sort());
    expect(next.size).toBe(PERSIST_MAX_ENTRIES);
  });
});

describe('shouldFill', () => {
  const base: FillState = {
    hasData: false,
    status: 'pending',
    fetchStatus: 'fetching',
    transientError: false,
    showingPlaceholder: false,
  };
  const failed: FillState = { ...base, status: 'error', fetchStatus: 'idle', transientError: true };

  it('never replaces real data', () => {
    expect(shouldFill({ ...failed, hasData: true }, true)).toBe(false);
  });

  it('fills a request that failed on the network, even over a placeholder', () => {
    expect(shouldFill(failed, false)).toBe(true);
    expect(shouldFill({ ...failed, showingPlaceholder: true }, false)).toBe(true);
  });

  it('never fills over a real refusal from the server (RLS, missing row, 4xx)', () => {
    expect(shouldFill({ ...failed, transientError: false }, true)).toBe(false);
  });

  it('fills a paused or slow first request unless a snapshot already shows', () => {
    expect(shouldFill({ ...base, fetchStatus: 'paused' }, false)).toBe(true);
    expect(shouldFill(base, true)).toBe(true);
    expect(shouldFill(base, false)).toBe(false);
    expect(shouldFill({ ...base, fetchStatus: 'paused', showingPlaceholder: true }, true)).toBe(false);
    expect(shouldFill({ ...base, showingPlaceholder: true }, true)).toBe(false);
  });

  it('leaves idle pending queries alone (disabled)', () => {
    expect(shouldFill({ ...base, fetchStatus: 'idle' }, true)).toBe(false);
  });
});
