import { describe, expect, it } from 'vitest';
import { checkWishLink, interestByWish, liveWishes, membersLabel, parseMembersCount, sortByInterest } from './wishRules';

describe('checkWishLink', () => {
  const list = [{ youtube_id: 'dQw4w9WgXcQ' }];

  it('accepts the usual YouTube links', () => {
    for (const link of [
      'https://www.youtube.com/watch?v=WPdWvnAAurg',
      'https://youtu.be/WPdWvnAAurg?si=abc',
      'youtube.com/shorts/WPdWvnAAurg',
      'https://m.youtube.com/watch?v=WPdWvnAAurg&t=30s',
    ]) {
      expect(checkWishLink(link, list)).toEqual({ ok: true, youtubeId: 'WPdWvnAAurg' });
    }
  });

  it('accepts a bare id that looks random (as the library does)', () => {
    expect(checkWishLink('gdZLi9oWNZg', list)).toEqual({ ok: true, youtubeId: 'gdZLi9oWNZg' });
  });

  it('refuses empty, non-YouTube links and plain words', () => {
    expect(checkWishLink('   ', list)).toEqual({ ok: false, reason: 'empty' });
    expect(checkWishLink('https://vimeo.com/123', list)).toEqual({ ok: false, reason: 'not-youtube' });
    expect(checkWishLink('NewJeansOMG', list)).toEqual({ ok: false, reason: 'not-youtube' });
    expect(checkWishLink('https://www.youtube.com/watch?v=short', list)).toEqual({ ok: false, reason: 'not-youtube' });
  });

  it('refuses a song already wished for or already in the library', () => {
    expect(checkWishLink('https://youtu.be/dQw4w9WgXcQ', list)).toEqual({ ok: false, reason: 'duplicate' });
    expect(checkWishLink('https://youtu.be/gdZLi9oWNZg', list, [null, 'gdZLi9oWNZg'])).toEqual({
      ok: false,
      reason: 'in-library',
    });
  });
});

describe('order by interest', () => {
  const wishes = [
    { id: 'a', created_at: '2026-10-01T00:00:00Z' },
    { id: 'b', created_at: '2026-10-02T00:00:00Z' },
    { id: 'c', created_at: '2026-10-03T00:00:00Z' },
  ];

  it('most «Me apunto» first, then the newest', () => {
    const counts: Record<string, number> = { a: 2, b: 0, c: 2 };
    expect(sortByInterest(wishes, (id) => counts[id] ?? 0).map((w) => w.id)).toEqual(['c', 'a', 'b']);
  });

  it('groups interest per wish, once per person, in the order they joined', () => {
    const map = interestByWish([
      { wish_id: 'a', member_id: 'm2', created_at: '2026-10-02T00:00:00Z' },
      { wish_id: 'a', member_id: 'm1', created_at: '2026-10-01T00:00:00Z' },
      { wish_id: 'a', member_id: 'm1', created_at: '2026-10-03T00:00:00Z' },
      { wish_id: 'b', member_id: 'm3', created_at: '2026-10-01T00:00:00Z' },
    ]);
    expect(map.get('a')).toEqual(['m1', 'm2']);
    expect(map.get('b')).toEqual(['m3']);
  });

  it('a wish passed to the library leaves the list', () => {
    expect(liveWishes([{ added_video_id: null }, { added_video_id: 'v1' }])).toHaveLength(1);
  });
});

describe('optional fields', () => {
  it('reads the number of members (1–30)', () => {
    expect(parseMembersCount('')).toBeNull();
    expect(parseMembersCount(' 5 ')).toBe(5);
    expect(parseMembersCount('0')).toBe('invalid');
    expect(parseMembersCount('31')).toBe('invalid');
    expect(parseMembersCount('4.5')).toBe('invalid');
    expect(membersLabel(1)).toBe('1 miembro');
    expect(membersLabel(9)).toBe('9 miembros');
    expect(membersLabel(null)).toBeNull();
  });
});
