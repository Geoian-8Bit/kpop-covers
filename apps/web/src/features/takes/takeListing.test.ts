import { describe, expect, it } from 'vitest';
import { defaultReviewTake } from '@/features/review/reviewRules';
import { noteCountByTake, notesCount, takeListing, uniqueTakes, type TakeItem } from './takeRules';

const row = (id: string, over: Partial<TakeItem> = {}) =>
  ({ id, is_best: false, recorded_at: `2026-10-18T10:0${id.length}:00.000Z`, where: 'here', member_id: 'ana', ...over }) as TakeItem;

describe('the «Tomas» list (50)', () => {
  it('shows each take once', () => {
    const a = row('a');
    expect(uniqueTakes([a, row('b'), { ...a }]).map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('the take «Repaso» opens goes first and is not repeated below', () => {
    const takes = [
      row('a', { recorded_at: '2026-10-18T09:00:00.000Z' }),
      row('b', { recorded_at: '2026-10-18T11:00:00.000Z' }),
      row('c', { recorded_at: '2026-10-18T10:00:00.000Z', is_best: true }),
      row('b', { recorded_at: '2026-10-18T11:00:00.000Z' }),
    ];
    const featured = defaultReviewTake(uniqueTakes(takes), null);
    const { featured: first, rest } = takeListing(takes, featured?.id ?? null);
    expect(first?.id).toBe('b');
    expect(rest.map((t) => t.id)).toEqual(['c', 'a']);
    expect([first!, ...rest].map((t) => t.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('without a take to feature (or filtered out), the plain order', () => {
    const takes = [row('a', { recorded_at: '2026-10-18T09:00:00.000Z' }), row('b', { recorded_at: '2026-10-18T11:00:00.000Z' })];
    expect(takeListing(takes, null)).toEqual({ featured: null, rest: [takes[1], takes[0]] });
    expect(takeListing(takes, 'gone').featured).toBeNull();
  });

  it('counts notes per take', () => {
    const counts = noteCountByTake([{ take_id: 'a' }, { take_id: 'a' }, { take_id: null }, { take_id: 'b' }]);
    expect(counts.get('a')).toBe(2);
    expect(counts.get('b')).toBe(1);
    expect(counts.has('c')).toBe(false);
    expect(notesCount(1)).toBe('1 nota');
    expect(notesCount(3)).toBe('3 notas');
  });
});
