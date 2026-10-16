import { describe, expect, it } from 'vitest';
import {
  clampDrawCount,
  countLabel,
  drawOrder,
  drawRemoves,
  effectiveNoRepeat,
  historyDay,
  historyLine,
  shuffle,
} from './drawRules';

/** Small seeded generator (mulberry32): the same sequence every run. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const item = (id: string, out = false) => ({ id, removed_at: out ? '2026-10-14T18:00:00Z' : null });

describe('shuffle', () => {
  it('keeps every element and does not touch the input', () => {
    const list = ['a', 'b', 'c', 'd', 'e'];
    const out = shuffle(list, seeded(1));
    expect([...out].sort()).toEqual(list);
    expect(list).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('reaches every order over many runs', () => {
    const random = seeded(7);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) seen.add(shuffle(['a', 'b', 'c'], random).join(''));
    expect(seen.size).toBe(6);
  });
});

describe('drawOrder', () => {
  it('never draws what was taken out', () => {
    const items = [item('a', true), item('b'), item('c', true)];
    for (let i = 0; i < 20; i++)
      expect(drawOrder(items, { count: 3, noRepeat: false, lastItemId: null }).map((x) => x.id)).toEqual([
        'b',
      ]);
  });

  it('draws nothing from an empty bag', () => {
    expect(drawOrder([item('a', true)], { count: 1, noRepeat: false, lastItemId: null })).toEqual([]);
  });

  it('draws between 1 and 10 at once', () => {
    const items = Array.from({ length: 14 }, (_, i) => item(`i${i}`));
    expect(drawOrder(items, { count: 0, noRepeat: false, lastItemId: null })).toHaveLength(1);
    expect(drawOrder(items, { count: 30, noRepeat: false, lastItemId: null })).toHaveLength(10);
    expect(
      new Set(drawOrder(items, { count: 10, noRepeat: false, lastItemId: null }).map((x) => x.id)).size,
    ).toBe(10);
  });

  it('«sin repetir seguidas»: never the last one again while there is anything else', () => {
    const random = seeded(3);
    const items = [item('a'), item('b')];
    let last: string | null = null;
    for (let i = 0; i < 50; i++) {
      const drawn: string = drawOrder(items, { count: 1, noRepeat: true, lastItemId: last, random })[0]!.id;
      expect(drawn).not.toBe(last);
      last = drawn;
    }
  });

  it('«sin repetir seguidas» with a single item still draws it', () => {
    expect(drawOrder([item('a')], { count: 1, noRepeat: true, lastItemId: 'a' }).map((x) => x.id)).toEqual([
      'a',
    ]);
  });

  it('without the option, the last one can come out again', () => {
    const random = seeded(11);
    const items = [item('a'), item('b')];
    let repeats = 0;
    for (let i = 0; i < 60; i++) {
      if (drawOrder(items, { count: 1, noRepeat: false, lastItemId: 'a', random })[0]!.id === 'a') repeats++;
    }
    expect(repeats).toBeGreaterThan(0);
  });
});

describe('modes', () => {
  it('takes out by the bag mode unless chosen otherwise', () => {
    expect(drawRemoves('remove', null)).toBe(true);
    expect(drawRemoves('keep', undefined)).toBe(false);
    expect(drawRemoves('remove', false)).toBe(false);
    expect(drawRemoves('keep', true)).toBe(true);
  });

  it('«sin repetir seguidas» only for bags that keep', () => {
    expect(effectiveNoRepeat('keep', true)).toBe(true);
    expect(effectiveNoRepeat('remove', true)).toBe(false);
  });

  it('clamps counts and names them', () => {
    expect(clampDrawCount(Number.NaN)).toBe(1);
    expect(clampDrawCount(3.4)).toBe(3);
    expect(countLabel('songs', 1)).toBe('1 canción');
    expect(countLabel('clips', 4)).toBe('4 clips');
    expect(countLabel('people', 2)).toBe('2 personas');
  });
});

describe('history', () => {
  const now = new Date(2026, 9, 16, 12, 0);

  it('says the weekday and the day', () => {
    expect(historyDay(new Date(2026, 9, 13, 19, 30).toISOString(), now)).toBe('martes 13');
  });

  it('adds the month (and year) when they are not the current ones', () => {
    expect(historyDay(new Date(2026, 6, 14, 19, 30).toISOString(), now)).toBe('martes 14 de julio');
    expect(historyDay(new Date(2025, 9, 14, 19, 30).toISOString(), now)).toBe('martes 14 de octubre de 2025');
  });

  it('reads like «martes 13: salió Hype Boy (quitada)»', () => {
    const drawn_at = new Date(2026, 9, 13, 19, 30).toISOString();
    expect(historyLine({ label: 'Hype Boy', removed: true, drawn_at }, 'songs', now)).toBe(
      'martes 13: salió Hype Boy (quitada)',
    );
    expect(historyLine({ label: 'Estribillo', removed: true, drawn_at }, 'clips', now)).toBe(
      'martes 13: salió Estribillo (quitado)',
    );
    expect(historyLine({ label: 'Flor', removed: false, drawn_at }, 'people', now)).toBe(
      'martes 13: salió Flor',
    );
  });
});
