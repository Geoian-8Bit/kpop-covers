import { describe, expect, it } from 'vitest';
import {
  applyTemplate,
  centroid,
  flipHorizontal,
  flipVertical,
  minDistance,
  rotate,
  scale,
  swap,
  TEMPLATES,
} from './formationEditRules';
import { DEFAULT_STAGE, type Stage } from './formationRules';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `m${i}`);
const stage = DEFAULT_STAGE;
const inside = (p: { x: number; y: number }, s: Stage) => p.x >= 0 && p.y >= 0 && p.x <= s.width && p.y <= s.depth;

describe('templates', () => {
  it.each(TEMPLATES)('%s places 1 to 12 people inside the stage without overlapping', (kind) => {
    for (let n = 1; n <= 12; n++) {
      const people = ids(n);
      const out = applyTemplate(kind, people, {}, stage);
      for (const id of people) expect(inside(out[id]!, stage)).toBe(true);
      if (n > 1) expect(minDistance(out, people)).toBeGreaterThanOrEqual(0.25);
    }
  });

  it('puts a single person in the centre', () => {
    expect(applyTemplate('circle', ['a'], {}, stage)).toEqual({ a: { x: 4, y: 3 } });
  });

  it('keeps the line on the grid and centred', () => {
    const out = applyTemplate('line', ids(3), {}, stage);
    expect(out.m0).toEqual({ x: 2.5, y: 3 });
    expect(out.m1).toEqual({ x: 4, y: 3 });
    expect(out.m2).toEqual({ x: 5.5, y: 3 });
  });

  it('points the V to the audience and the inverted V to the back', () => {
    const v = applyTemplate('v', ids(3), {}, stage);
    const inv = applyTemplate('inverted-v', ids(3), {}, stage);
    expect(v.m0!.y).toBeGreaterThan(v.m1!.y);
    expect(inv.m0!.y).toBeLessThan(inv.m1!.y);
  });

  it('only moves the chosen people and avoids the others', () => {
    const before = { a: { x: 4, y: 3 }, b: { x: 1, y: 1 }, c: { x: 2, y: 2 } };
    const out = applyTemplate('line', ['b', 'c'], before, stage);
    expect(out.a).toEqual({ x: 4, y: 3 });
    expect(minDistance(out, ['a', 'b', 'c'])).toBeGreaterThanOrEqual(0.25);
  });

  it('fits a small stage', () => {
    const small: Stage = { width: 2, depth: 2, grid: 0.5 };
    const people = ids(6);
    const out = applyTemplate('windows', people, {}, small);
    for (const id of people) expect(inside(out[id]!, small)).toBe(true);
  });
});

describe('selection transforms', () => {
  const pos = { a: { x: 2, y: 2 }, b: { x: 4, y: 2 }, c: { x: 6, y: 5 } };

  it('flips around the selection centre', () => {
    expect(flipHorizontal(['a', 'b'], pos, stage)).toMatchObject({ a: { x: 4, y: 2 }, b: { x: 2, y: 2 }, c: pos.c });
    expect(flipVertical(['a', 'c'], pos, stage)).toMatchObject({ a: { x: 2, y: 5 }, c: { x: 6, y: 2 } });
  });

  it('rotates in 15° steps around the centre (90° turns a row into a column)', () => {
    const out = rotate(['a', 'b'], pos, stage, 90);
    expect(out.a).toEqual({ x: 3, y: 1 });
    expect(out.b).toEqual({ x: 3, y: 3 });
    expect(rotate(['a', 'b'], pos, stage, 360).a).toEqual({ x: 2, y: 2 });
  });

  it('scales around the centre', () => {
    const out = scale(['a', 'b'], pos, stage, 2);
    expect(out.a).toEqual({ x: 1, y: 2 });
    expect(out.b).toEqual({ x: 5, y: 2 });
    expect(centroid([out.a!, out.b!])).toEqual({ x: 3, y: 2 });
  });

  it('keeps everybody inside the stage when growing or turning', () => {
    const out = scale(['a', 'c'], pos, stage, 5);
    expect(inside(out.a!, stage) && inside(out.c!, stage)).toBe(true);
    const turned = rotate(['a', 'c'], pos, stage, 45);
    expect(inside(turned.a!, stage) && inside(turned.c!, stage)).toBe(true);
  });

  it('does nothing with an empty selection', () => {
    expect(scale([], pos, stage, 2)).toBe(pos);
    expect(flipHorizontal(['zz'], pos, stage)).toBe(pos);
  });

  it('swaps two places', () => {
    expect(swap('a', 'c', pos)).toMatchObject({ a: pos.c, c: pos.a, b: pos.b });
    expect(swap('a', 'a', pos)).toBe(pos);
    expect(swap('a', 'zz', pos)).toBe(pos);
  });
});
