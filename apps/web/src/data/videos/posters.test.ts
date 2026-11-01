import { describe, expect, it, vi } from 'vitest';
import {
  posterLacking,
  posterMapFrom,
  loadPosters,
  posterOf,
  syncPosters,
  withPosters,
  type PosterStore,
} from './posters';

const key = (id: string, rev: string) => `oneshoot.poster.v1:${id}:${rev}`;

function memoryStore(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  const store: PosterStore & { map: Map<string, string> } = {
    map,
    read: vi.fn(async () => new Map(map)),
    keep: vi.fn(async (list: readonly [string, string][]) => list.forEach(([k, v]) => map.set(k, v))),
    drop: vi.fn(async (keys: readonly string[]) => keys.forEach((k) => map.delete(k))),
  };
  return store;
}

describe('syncPosters (REQ-14)', () => {
  it('downloads only the posters the device lacks, and keeps them', async () => {
    const store = memoryStore({ [key('a', '1')]: 'data:a1' });
    const fetchMissing = vi.fn(async (ids: string[]) =>
      ids.map((id) => ({ id, poster_rev: '1', thumbnail_url: `data:${id}1` })),
    );
    const out = await syncPosters(
      [
        { id: 'a', poster_rev: '1' },
        { id: 'b', poster_rev: '1' },
      ],
      store,
      fetchMissing,
    );
    expect(fetchMissing).toHaveBeenCalledWith(['b']);
    expect(out).toEqual({ a: { rev: '1', url: 'data:a1' }, b: { rev: '1', url: 'data:b1' } });
    await Promise.resolve();
    expect(store.map.get(key('b', '1'))).toBe('data:b1');
  });

  it('a second load with everything kept downloads nothing', async () => {
    const store = memoryStore({ [key('a', '1')]: 'data:a1', [key('b', '2')]: 'data:b2' });
    const fetchMissing = vi.fn(async () => []);
    await syncPosters(
      [
        { id: 'a', poster_rev: '1' },
        { id: 'b', poster_rev: '2' },
      ],
      store,
      fetchMissing,
    );
    expect(fetchMissing).not.toHaveBeenCalled();
  });

  it('a changed poster is downloaded again and the old revision and archived videos leave the device', async () => {
    const store = memoryStore({ [key('a', 'old')]: 'data:old', [key('gone', '1')]: 'data:gone' });
    const out = await syncPosters([{ id: 'a', poster_rev: 'new' }], store, async () => [
      { id: 'a', poster_rev: 'new', thumbnail_url: 'data:new' },
    ]);
    expect(out.a).toEqual({ rev: 'new', url: 'data:new' });
    await Promise.resolve();
    expect([...store.map.keys()]).toEqual([key('a', 'new')]);
  });

  it('blocked storage: everything comes from the network, with no error', async () => {
    const store = memoryStore();
    store.read = vi.fn(async () => {
      throw new Error('blocked');
    });
    const fetchMissing = vi.fn(async (ids: string[]) =>
      ids.map((id) => ({ id, poster_rev: '1', thumbnail_url: `data:${id}` })),
    );
    const out = await syncPosters([{ id: 'a', poster_rev: '1' }], store, fetchMissing);
    expect(fetchMissing).toHaveBeenCalledWith(['a']);
    expect(out.a?.url).toBe('data:a');
  });

  it('serves from memory without reading the device', async () => {
    const store = memoryStore();
    const out = await syncPosters([{ id: 'a', poster_rev: '1' }], store, async () => [], {
      a: { rev: '1', url: 'data:mem' },
    });
    expect(store.read).not.toHaveBeenCalled();
    expect(out.a?.url).toBe('data:mem');
  });
});

describe('combining posters by id (REQ-14)', () => {
  const posters = { up: { rev: '1', url: 'data:up' } };

  it('puts the inline poster back and leaves other rows untouched', () => {
    const yt = { id: 'yt', thumbnail_url: 'https://i.ytimg.com/x.jpg', poster_inline: false };
    const up = { id: 'up', thumbnail_url: null, poster_inline: true };
    const out = withPosters([yt, up], posters);
    expect(out[0]).toBe(yt);
    expect(out[1]).toEqual({ ...up, thumbnail_url: 'data:up' });
    expect(withPosters([yt], posters)[0]).toBe(yt);
  });

  it('a missing poster stays empty, as a video without one', () => {
    expect(posterOf({ id: 'x', thumbnail_url: null, poster_inline: true }, posters)).toBeNull();
  });

  it('a joined row without poster_inline takes the map, else its own URL', () => {
    expect(posterOf({ id: 'up', thumbnail_url: null }, posters)).toBe('data:up');
    expect(posterOf({ id: 'yt', thumbnail_url: 'https://y' }, posters)).toBe('https://y');
  });
});

describe('joined rows that say their poster revision (REQ-14)', () => {
  const posters = { up: { rev: '1', url: 'data:up' } };
  const row = (id: string, poster_rev: string) => ({
    id,
    thumbnail_url: null,
    poster_inline: true,
    poster_rev,
  });

  it('only the same revision is shown; an older one in the map is not', () => {
    expect(posterOf(row('up', '1'), posters)).toBe('data:up');
    expect(posterOf(row('up', '2'), posters)).toBeNull();
  });

  it('is lacking when the loaded map has no entry or another revision, never while it loads', () => {
    expect(posterLacking(row('up', '1'), posters)).toBe(false);
    expect(posterLacking(row('up', '2'), posters)).toBe(true);
    expect(posterLacking(row('new', '1'), posters)).toBe(true);
    expect(posterLacking(row('new', '1'), undefined)).toBe(false);
    expect(
      posterLacking(
        { id: 'yt', thumbnail_url: 'https://y', poster_inline: false, poster_rev: null },
        posters,
      ),
    ).toBe(false);
  });
});

describe('posterMapFrom (REQ-14 · first visit)', () => {
  it('maps every poster, keeps them, then drops what the device had from before', async () => {
    const store = memoryStore({ [key('a', '0')]: 'data:old', [key('z', '1')]: 'data:gone' });
    const kept = vi.fn();
    const out = posterMapFrom(
      [
        { id: 'a', poster_rev: '1', thumbnail_url: 'data:a1' },
        { id: 'b', poster_rev: '2', thumbnail_url: 'data:b2' },
      ],
      store,
      kept,
    );
    expect(out).toEqual({ a: { rev: '1', url: 'data:a1' }, b: { rev: '2', url: 'data:b2' } });
    await vi.waitFor(() => expect(store.drop).toHaveBeenCalled());
    expect(kept).toHaveBeenCalledTimes(1);
    expect([...store.map.keys()].sort()).toEqual([key('a', '1'), key('b', '2')]);
  });

  it('blocked storage: the map still comes back and nothing throws', async () => {
    const store = memoryStore();
    store.keep = vi.fn(async () => {
      throw new Error('blocked');
    });
    const kept = vi.fn();
    const out = posterMapFrom([{ id: 'a', poster_rev: '1', thumbnail_url: 'data:a1' }], store, kept);
    expect(out.a?.url).toBe('data:a1');
    await vi.waitFor(() => expect(store.keep).toHaveBeenCalled());
    expect(kept).not.toHaveBeenCalled();
  });
});

describe('loadPosters (REQ-14 · which request)', () => {
  const rows = [
    { id: 'a', poster_rev: '1' },
    { id: 'b', poster_rev: '1' },
  ];
  const poster = (id: string) => ({ id, poster_rev: '1', thumbnail_url: `data:${id}1` });
  const sources = (store: PosterStore, hinted: boolean) => ({
    hinted,
    store,
    listAll: vi.fn(async () => rows.map((r) => poster(r.id))),
    listRevs: vi.fn(async () => rows),
    fetchMissing: vi.fn(async (ids: string[]) => ids.map(poster)),
    markKept: vi.fn(),
  });

  it('no hint but the device already holds posters: only the missing ones are downloaded, and the hint is set', async () => {
    const src = sources(memoryStore({ [key('a', '1')]: 'data:a1' }), false);
    const out = await loadPosters(src);
    expect(src.listAll).not.toHaveBeenCalled();
    expect(src.fetchMissing).toHaveBeenCalledWith(['b']);
    expect(src.markKept).toHaveBeenCalledTimes(1);
    expect(out.a?.url).toBe('data:a1');
    expect(out.b?.url).toBe('data:b1');
  });

  it('no hint and an empty device: all posters at once, no revisions request', async () => {
    const src = sources(memoryStore(), false);
    const out = await loadPosters(src);
    expect(src.listAll).toHaveBeenCalledTimes(1);
    expect(src.listRevs).not.toHaveBeenCalled();
    expect(Object.keys(out)).toEqual(['a', 'b']);
    await vi.waitFor(() => expect(src.markKept).toHaveBeenCalledTimes(1));
  });

  it('no hint and unreachable storage: all posters at once', async () => {
    const store = memoryStore();
    store.read = vi.fn(async () => {
      throw new Error('blocked');
    });
    const src = sources(store, false);
    await loadPosters(src);
    expect(src.listAll).toHaveBeenCalledTimes(1);
    expect(src.listRevs).not.toHaveBeenCalled();
  });

  it('hint set: the device read runs alongside the revisions and nothing is asked for all', async () => {
    const store = memoryStore({ [key('a', '1')]: 'data:a1', [key('b', '1')]: 'data:b1' });
    const src = sources(store, true);
    const out = await loadPosters(src);
    expect(src.listAll).not.toHaveBeenCalled();
    expect(src.fetchMissing).not.toHaveBeenCalled();
    expect(src.markKept).not.toHaveBeenCalled();
    expect(Object.keys(out)).toEqual(['a', 'b']);
  });

  it('wrong hint (device emptied): the missing posters are downloaded', async () => {
    const src = sources(memoryStore(), true);
    await loadPosters(src);
    expect(src.fetchMissing).toHaveBeenCalledWith(['a', 'b']);
  });

  it('a refresh with the map of this visit skips the device read', async () => {
    const store = memoryStore();
    const src = {
      ...sources(store, false),
      known: { a: { rev: '1', url: 'data:a1' }, b: { rev: '1', url: 'data:b1' } },
    };
    await loadPosters(src);
    expect(store.read).not.toHaveBeenCalled();
    expect(src.listAll).not.toHaveBeenCalled();
  });
});
