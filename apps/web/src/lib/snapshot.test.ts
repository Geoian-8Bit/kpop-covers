import type { Crew } from '@coverscape/shared';
import { describe, expect, it } from 'vitest';
import type { VideoWithClipCount } from './backend';
import {
  crewSnapshot,
  libraryRowsSnapshot,
  parseCrew,
  parseEvents,
  parseLibrary,
  parseQuickClips,
  readSnapshot,
  stripInlineThumbnail,
  videoFromLibraryRow,
  writeSnapshot,
} from './snapshot';

function memoryStore() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const CREW = 'c1';
const row = (over: Partial<VideoWithClipCount> = {}): VideoWithClipCount => ({
  id: 'v1',
  crew_id: CREW,
  title: 'Supernova',
  artist: 'aespa',
  source: 'youtube',
  youtube_id: 'WPdWvnAAurg',
  thumbnail_url: 'https://i.ytimg.com/vi/WPdWvnAAurg/hqdefault.jpg',
  duration_seconds: 180,
  created_at: '2026-10-01T00:00:00Z',
  file_name: null,
  aspect_ratio: null,
  clips: [{ count: 3 }],
  ...over,
});

describe('readSnapshot / writeSnapshot', () => {
  it('round-trips through the store and validates on the way back', () => {
    const store = memoryStore();
    expect(writeSnapshot('videos.c1', libraryRowsSnapshot([row()]), store)).toBe(true);
    expect(readSnapshot('videos.c1', (v) => parseLibrary(v, CREW), store)).toEqual([row()]);
  });

  it('keeps the video proportion, and reads an older copy without one as unknown', () => {
    const store = memoryStore();
    writeSnapshot('videos.c1', libraryRowsSnapshot([row({ aspect_ratio: 0.5625 })]), store);
    expect(readSnapshot('videos.c1', (v) => parseLibrary(v, CREW), store)?.[0]?.aspect_ratio).toBe(0.5625);
    const { aspect_ratio: _gone, ...old } = row();
    expect(parseLibrary([old], CREW)?.[0]?.aspect_ratio).toBeNull();
  });

  it('skips (and removes) a snapshot that is too big', () => {
    const store = memoryStore();
    writeSnapshot('k', [1], store);
    expect(store.map.size).toBe(1);
    expect(writeSnapshot('k', 'x'.repeat(50), store, 20)).toBe(false);
    expect(store.map.size).toBe(0);
  });

  it('survives broken JSON, a throwing store and no store at all', () => {
    const store = memoryStore();
    store.map.set('oneshoot.snap.v1.k', '{not json');
    expect(readSnapshot('k', () => 1, store)).toBeUndefined();
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readSnapshot('k', () => 1, throwing)).toBeUndefined();
    expect(writeSnapshot('k', [1], throwing)).toBe(false);
    expect(readSnapshot('k', () => 1, null)).toBeUndefined();
    expect(writeSnapshot('k', [1], null)).toBe(false);
  });
});

describe('the group', () => {
  const crew: Crew = { id: 'c1', name: 'Crew', invite_code: 'SECRET01', created_by: null, created_at: '2026-01-01' };

  it('keeps no invite code and reads back a valid group', () => {
    const kept = crewSnapshot(crew);
    expect(kept.invite_code).toBe('');
    expect(parseCrew(JSON.parse(JSON.stringify(kept)))).toEqual(kept);
  });

  it('refuses odd shapes', () => {
    expect(parseCrew(null)).toBeNull();
    expect(parseCrew([])).toBeNull();
    expect(parseCrew({ id: '', name: 'x', created_at: 'y' })).toBeNull();
    expect(parseCrew({ id: 'c1', name: 3, created_at: 'y' })).toBeNull();
    expect(parseCrew({ id: 'c1', name: 'x', created_at: 'y', created_by: 5 })).toBeNull();
  });
});

describe('the library', () => {
  it('leaves inline posters out', () => {
    expect(stripInlineThumbnail('data:image/webp;base64,AAAA')).toBeNull();
    expect(stripInlineThumbnail('https://i.ytimg.com/vi/x/hqdefault.jpg')).toBe('https://i.ytimg.com/vi/x/hqdefault.jpg');
    expect(stripInlineThumbnail(null)).toBeNull();
    const kept = libraryRowsSnapshot([row({ source: 'upload', thumbnail_url: `data:image/webp;base64,${'A'.repeat(40_000)}` })]);
    expect(kept[0]!.thumbnail_url).toBeNull();
    expect(JSON.stringify(kept).length).toBeLessThan(1000);
  });

  it('keeps only the card columns', () => {
    const extra = { ...row(), storage_path: 'c1/v1.mp4' } as VideoWithClipCount;
    expect(Object.keys(libraryRowsSnapshot([extra])[0]!)).not.toContain('storage_path');
  });

  it('drops the whole list for one bad row or another group', () => {
    expect(parseLibrary([row(), { ...row(), title: 7 }], CREW)).toBeNull();
    expect(parseLibrary([row({ crew_id: 'other' })], CREW)).toBeNull();
    expect(parseLibrary({ length: 1 }, CREW)).toBeNull();
    expect(parseLibrary([], CREW)).toEqual([]);
  });

  it('repairs a missing clip count', () => {
    const { clips: _clips, ...bare } = row();
    expect(parseLibrary([bare], CREW)?.[0]?.clips).toEqual([{ count: 0 }]);
  });
});

describe('quick access and events', () => {
  const clip = {
    id: 'k1',
    crew_id: CREW,
    video_id: 'v1',
    name: 'Coro',
    color: 'wine',
    created_at: '2026-10-01',
    start_seconds: 10,
    end_seconds: 20,
    speed: 1,
    mirrored: true,
    is_pinned: false,
    video: { id: 'v1', title: 'Supernova', artist: null, source: 'youtube', youtube_id: 'WPdWvnAAurg' },
  };

  it('accepts valid clips of the group only', () => {
    expect(parseQuickClips([clip], CREW)).toHaveLength(1);
    expect(parseQuickClips([{ ...clip, video: null }], CREW)).toHaveLength(1);
    expect(parseQuickClips([{ ...clip, start_seconds: '10' }], CREW)).toBeNull();
    expect(parseQuickClips([{ ...clip, video: { id: 'v1' } }], CREW)).toBeNull();
    expect(parseQuickClips([{ ...clip, crew_id: 'other' }], CREW)).toBeNull();
  });

  it('checks events field by field', () => {
    const event = { id: 'e1', crew_id: CREW, name: 'Festival', place: null, starts_at: '2026-11-01', created_at: '2026-10-01', archived_at: null, songs: 4 };
    expect(parseEvents([event])).toEqual([event]);
    expect(parseEvents([{ ...event, songs: '4' }])).toBeNull();
    expect(parseEvents([{ ...event, starts_at: null }])).toBeNull();
  });
});

describe('videoFromLibraryRow (P3 placeholder)', () => {
  it('opens a YouTube entry without a file from its library row', () => {
    const video = videoFromLibraryRow(row());
    expect(video).toMatchObject({ id: 'v1', youtube_id: 'WPdWvnAAurg', file_name: null, storage_path: null, file_offset_seconds: null });
  });

  it('waits for the real row otherwise', () => {
    expect(videoFromLibraryRow(undefined)).toBeUndefined();
    expect(videoFromLibraryRow(row({ file_name: 'take.mp4' }))).toBeUndefined();
    expect(videoFromLibraryRow(row({ source: 'upload', youtube_id: null }))).toBeUndefined();
    expect(videoFromLibraryRow(row({ youtube_id: null }))).toBeUndefined();
  });
});
