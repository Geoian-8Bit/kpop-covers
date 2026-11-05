import { describe, expect, it } from 'vitest';
import type { BagItemView } from '@/data/bags';
import { shownFor } from './bagVisibility';

// REQ-27 · shownFor moved out of BagPage.tsx: how each kind of item shows when it comes out.
const base = {
  video: null,
  clip: null,
  member: null,
  wish: null,
  youtube_id: null,
  title: null,
  artist: null,
};
const item = (extra: Record<string, unknown>) => ({ ...base, ...extra }) as unknown as BagItemView;
const draw = { label: 'Algo' };

describe('shownFor', () => {
  it('a song of the library: its title and artist, gold, 曲', () => {
    expect(shownFor(item({ video: { title: 'Butter', artist: 'BTS' } }), draw, 'songs')).toEqual({
      label: 'Butter',
      sub: 'BTS',
      tone: 'kin',
      glyph: '曲',
    });
  });

  it('a wish: its artist, or where it comes from', () => {
    expect(shownFor(item({ wish: { title: 'TT', artist: null } }), draw, 'songs')).toMatchObject({
      label: 'TT',
      sub: 'De la lista de deseos',
      glyph: '願',
    });
  });

  it('a member: «¡Te toca!» and the initial', () => {
    expect(shownFor(item({ member: { name: ' hana', color: 'rose' } }), draw, 'people')).toMatchObject({
      label: ' hana',
      sub: '¡Te toca!',
      glyph: 'H',
    });
  });

  it('a YouTube song kept only in the bag, and the fallback to the draw’s own label', () => {
    expect(
      shownFor(item({ youtube_id: 'x', title: 'Ditto', artist: 'NewJeans' }), draw, 'songs'),
    ).toMatchObject({
      label: 'Ditto',
      sub: 'NewJeans · de YouTube',
    });
    expect(shownFor(item({ youtube_id: 'x' }), draw, 'songs')).toMatchObject({
      label: 'Algo',
      sub: 'De YouTube',
    });
    expect(shownFor(undefined, draw, 'songs')).toMatchObject({ label: 'Algo', tone: 'kin' });
  });
});
