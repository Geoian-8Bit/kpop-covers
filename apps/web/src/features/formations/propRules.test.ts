import type { FormationProp } from '@coverscape/shared';
import { describe, expect, it } from 'vitest';
import { DEFAULT_STAGE, diffKeyframes, formationError, propsAt, propsSnapshot, type Keyframe } from './formationRules';
import { findClashes } from './clashRules';
import {
  addPropFrom,
  fitProps,
  lerpAngle,
  newProp,
  normalizeAngle,
  patchProp,
  propsError,
  readProps,
  relabelProp,
  removePropFrom,
} from './propRules';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const P = '00000000-0000-4000-8000-0000000000c1';
const Q = '00000000-0000-4000-8000-0000000000c2';
const stage = DEFAULT_STAGE;
const chair = (x: number, y: number, rot = 0, id = P): FormationProp => ({ id, kind: 'chair', x, y, rot });
const kf = (id: string, at: number, props: FormationProp[], transition = 2): Keyframe => ({ id, at, transition, positions: {}, props });

describe('propsAt', () => {
  const list = [kf('f1', 0, [chair(1, 1, 0)]), kf('f2', 10, [chair(5, 3, 90)])];

  it('holds still before the move and at both ends', () => {
    expect(propsAt(list, 0)).toEqual([{ ...chair(1, 1, 0), opacity: 1 }]);
    expect(propsAt(list, 7)).toEqual([{ ...chair(1, 1, 0), opacity: 1 }]);
    expect(propsAt(list, 30)).toEqual([{ ...chair(5, 3, 90), opacity: 1 }]);
  });

  it('a chair moved between two formations travels with the same timing as people', () => {
    const mid = propsAt(list, 9)[0]!;
    expect(mid.x).toBeCloseTo(3);
    expect(mid.y).toBeCloseTo(2);
    expect(mid.rot).toBeCloseTo(45);
    expect(mid.opacity).toBe(1);
  });

  it('fades props that only one side of the move has', () => {
    const fade = [kf('f1', 0, [chair(1, 1)]), kf('f2', 10, [chair(2, 2, 0, Q)])];
    const mid = propsAt(fade, 9);
    expect(mid.find((p) => p.id === P)?.opacity).toBeCloseTo(0.5);
    expect(mid.find((p) => p.id === Q)?.opacity).toBeCloseTo(0.5);
    expect(propsSnapshot(fade, 9.5).map((p) => p.id)).toEqual([Q]);
  });

  it('old rows without props show nothing', () => {
    expect(propsAt([{ id: 'f', at: 0, transition: 2, positions: {} }], 0)).toEqual([]);
  });

  it('props never count as clashes', () => {
    const people: Keyframe[] = [
      { id: 'f1', at: 0, transition: 2, positions: { [A]: { x: 1, y: 1 }, [B]: { x: 7, y: 5 } }, props: [chair(1, 1)] },
      { id: 'f2', at: 10, transition: 2, positions: { [A]: { x: 2, y: 1 }, [B]: { x: 7, y: 4 } }, props: [chair(2, 1)] },
    ];
    expect(findClashes(people, [A, B], stage)).toEqual([]);
  });
});

describe('angles', () => {
  it('turns the short way and normalises', () => {
    expect(lerpAngle(350, 10, 0.5)).toBeCloseTo(0);
    expect(lerpAngle(10, 350, 0.25)).toBeCloseTo(5);
    expect(normalizeAngle(-15)).toBe(345);
    expect(normalizeAngle(360)).toBe(0);
  });
});

describe('prop edits', () => {
  const list = [kf('f1', 0, []), kf('f2', 10, []), kf('f3', 20, [])];

  it('a new prop stays on stage from its formation on, and leaves from where it is removed', () => {
    const added = addPropFrom(list, 'f2', chair(2, 2));
    expect(added.map((f) => f.props?.length)).toEqual([0, 1, 1]);
    const removed = removePropFrom(added, 'f3', P);
    expect(removed.map((f) => f.props?.length)).toEqual([0, 1, 0]);
    expect(diffKeyframes(list, added).save.map((f) => f.id)).toEqual(['f2', 'f3']);
  });

  it('moves and turns in one formation; a mark’s text changes everywhere', () => {
    expect(patchProp([chair(1, 1)], P, { x: 20, rot: -15 }, stage)).toEqual([chair(8, 1, 345)]);
    const marked = addPropFrom(list, 'f1', { id: Q, kind: 'mark', x: 1, y: 1, rot: 0, label: 'X' });
    expect(relabelProp(marked, Q, '  Salida  ').every((f) => f.props?.[0]?.label === 'Salida')).toBe(true);
  });

  it('places new props on free spots near the front', () => {
    const first = newProp('bench', [], stage, P);
    expect(first).toEqual({ id: P, kind: 'bench', x: 4, y: 5, rot: 0 });
    const second = newProp('chair', [first], stage, Q);
    expect(second.x).not.toBe(4);
  });

  it('reads old or odd rows without failing, and checks like the server', () => {
    expect(readProps(null)).toEqual([]);
    expect(readProps([{ id: P, kind: 'chair', x: 1, y: 1 }, { kind: 'sofa' }, 3])).toEqual([chair(1, 1)]);
    expect(propsError([chair(1, 1)], stage)).toBeNull();
    expect(propsError([chair(1, 1), chair(2, 2)], stage)).toBe('formation_invalid'); // same id twice
    expect(propsError([{ ...chair(1, 1), kind: 'sofa' }], stage)).toBe('formation_invalid');
    expect(propsError([chair(9, 1)], stage)).toBe('formation_out_of_stage');
    expect(propsError([{ ...chair(1, 1), rot: 360 }], stage)).toBe('formation_invalid');
    expect(propsError([{ ...chair(1, 1), label: 'a'.repeat(25) }], stage)).toBe('formation_invalid');
    expect(formationError({ ...kf('f', 1, [chair(9, 1)]) }, stage)).toBe('formation_out_of_stage');
    expect(fitProps([chair(9, 7)], stage)).toEqual([chair(8, 6)]);
  });
});
