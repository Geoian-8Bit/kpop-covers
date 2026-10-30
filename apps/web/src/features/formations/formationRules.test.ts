import { describe, expect, it } from 'vitest';
import {
  activeIndex,
  DEFAULT_STAGE,
  describePoint,
  diffKeyframes,
  duplicateMoment,
  ease,
  fitPositions,
  formatMoment,
  formationError,
  freeMoment,
  historyPush,
  historyRedo,
  historyStart,
  historyUndo,
  memberTrack,
  mirrorPoint,
  moveWindow,
  nudgePoint,
  planNameError,
  positionsAt,
  rowPositions,
  sideSlot,
  snapPoint,
  sortKeyframes,
  stageSizeError,
  withDefaults,
  type Keyframe,
} from './formationRules';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';
const stage = DEFAULT_STAGE;

const kf = (id: string, at: number, positions: Keyframe['positions'], transition = 2): Keyframe => ({ id, at, transition, positions });

describe('positionsAt', () => {
  const list = sortKeyframes([
    kf('f2', 10, { [A]: { x: 6, y: 4 }, [B]: { x: 2, y: 4 } }),
    kf('f1', 0, { [A]: { x: 2, y: 2 }, [B]: { x: 6, y: 2 } }),
    kf('f3', 20, { [A]: { x: 4, y: 1 }, [B]: { x: 4, y: 5 } }),
  ]);
  const ids = [A, B];

  it('holds the first before it and the last after it', () => {
    expect(positionsAt(list, -3, ids, stage)[A]).toEqual({ x: 2, y: 2 });
    expect(positionsAt(list, 99, ids, stage)[B]).toEqual({ x: 4, y: 5 });
  });

  it('stays still until the move starts (transition 2 s before the formation)', () => {
    expect(positionsAt(list, 7.9, ids, stage)[A]).toEqual({ x: 2, y: 2 });
  });

  it('is half way at 9 s with a 2 s transition into 10 s (acceptance criterion)', () => {
    const p = positionsAt(list, 9, ids, stage);
    expect(p[A]!.x).toBeCloseTo(4);
    expect(p[A]!.y).toBeCloseTo(3);
    expect(p[B]!.x).toBeCloseTo(4);
  });

  it('lands exactly on the formation at its moment', () => {
    expect(positionsAt(list, 10, ids, stage)[A]).toEqual({ x: 6, y: 4 });
  });

  it('starts a transition longer than the gap at the previous formation', () => {
    const long = [kf('a', 0, { [A]: { x: 0, y: 0 } }), kf('b', 1, { [A]: { x: 2, y: 0 } }, 5)];
    expect(moveWindow(long[0]!, long[1]!)).toEqual({ start: 0, end: 1 });
    expect(positionsAt(long, 0.5, [A], stage)[A]!.x).toBeCloseTo(1);
  });

  it('gives a participant without a position a free spot at the side, in every formation', () => {
    const p = positionsAt(list, 5, [A, B, C], stage);
    expect(p[C]).toEqual({ x: 0.5, y: 0.5 });
    expect(positionsAt(list, 15, [A, B, C], stage)[C]).toEqual({ x: 0.5, y: 0.5 });
  });

  it('lines everybody up across the middle with no formations', () => {
    const p = positionsAt([], 3, [A, B], stage);
    expect(p[A]!.y).toBe(3);
    expect(p[A]!.x).toBeCloseTo(8 / 3, 2);
    expect(rowPositions([A], stage)[A]).toEqual({ x: 4, y: 3 });
  });

  it('eases softly and symmetrically', () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBe(0.5);
    expect(ease(0.25)).toBeLessThan(0.25);
    expect(ease(2)).toBe(1);
  });
});

describe('active formation and moments', () => {
  const list = [kf('a', 0, {}), kf('b', 10, {}), kf('c', 20, {})];

  it('is the last one reached', () => {
    expect(activeIndex(list, -1)).toBe(0);
    expect(activeIndex(list, 9.99)).toBe(0);
    expect(activeIndex(list, 10)).toBe(1);
    expect(activeIndex(list, 50)).toBe(2);
    expect(activeIndex([], 5)).toBe(-1);
  });

  it('moves a clash 0.1 s later and says so', () => {
    expect(freeMoment(list, 10)).toEqual({ at: 10.1, shifted: true });
    expect(freeMoment([...list, kf('d', 10.1, {})], 10)).toEqual({ at: 10.2, shifted: true });
    expect(freeMoment(list, 12.345)).toEqual({ at: 12.35, shifted: false });
    // Dragging a marker onto its own moment is no clash.
    expect(freeMoment(list, 10, 'b')).toEqual({ at: 10, shifted: false });
  });

  it('puts a duplicate at the current moment if free, else 2 s after the original', () => {
    expect(duplicateMoment(list, list[0]!, 5)).toEqual({ at: 5, shifted: false });
    expect(duplicateMoment(list, list[0]!, 10)).toEqual({ at: 2, shifted: false });
    expect(duplicateMoment([...list, kf('d', 2, {})], list[0]!, 0)).toEqual({ at: 2.1, shifted: true });
  });
});

describe('grid, stage and mirror', () => {
  it('snaps to the 0.5 m grid inside the stage', () => {
    expect(snapPoint({ x: 1.24, y: 3.76 }, stage)).toEqual({ x: 1, y: 4 });
    expect(snapPoint({ x: 1.24, y: 3.76 }, stage, false)).toEqual({ x: 1.24, y: 3.76 });
    expect(snapPoint({ x: -2, y: 9 }, stage)).toEqual({ x: 0, y: 6 });
    // A stage that isn't a multiple of the grid still keeps the point on it.
    expect(snapPoint({ x: 7.3, y: 1 }, { width: 7.3, depth: 6, grid: 0.5 }).x).toBeLessThanOrEqual(7.3);
  });

  it('mirrors left and right only', () => {
    expect(mirrorPoint({ x: 1, y: 2 }, stage, true)).toEqual({ x: 7, y: 2 });
    expect(mirrorPoint({ x: 1, y: 2 }, stage, false)).toEqual({ x: 1, y: 2 });
  });

  it('moves with the arrows by a grid step, Shift for a fine step, mirrored when the view is', () => {
    expect(nudgePoint({ x: 1, y: 1 }, 'ArrowRight', stage, false)).toEqual({ x: 1.5, y: 1 });
    expect(nudgePoint({ x: 1, y: 1 }, 'ArrowUp', stage, true)).toEqual({ x: 1, y: 0.9 });
    expect(nudgePoint({ x: 1, y: 1 }, 'ArrowRight', stage, false, true)).toEqual({ x: 0.5, y: 1 });
    expect(nudgePoint({ x: 0, y: 1 }, 'ArrowLeft', stage, false)).toEqual({ x: 0, y: 1 });
    expect(nudgePoint({ x: 0, y: 1 }, 'Enter', stage, false)).toBeNull();
  });

  it('pulls points inside a smaller stage', () => {
    expect(fitPositions({ [A]: { x: 7.5, y: 5.5 } }, { width: 6, depth: 4 })).toEqual({ [A]: { x: 6, y: 4 } });
  });

  it('finds free spots at the side, skipping taken ones', () => {
    expect(sideSlot([], stage)).toEqual({ x: 0.5, y: 0.5 });
    expect(sideSlot([{ x: 0.5, y: 0.5 }], stage)).toEqual({ x: 0.5, y: 1.5 });
    const p = withDefaults({ [A]: { x: 0.5, y: 0.5 } }, [A, B], stage);
    expect(p[B]).toEqual({ x: 0.5, y: 1.5 });
  });
});

describe('checks', () => {
  it('validates names and stage sizes', () => {
    expect(planNameError('  ')).not.toBeNull();
    expect(planNameError('a'.repeat(61))).not.toBeNull();
    expect(planNameError('Con 5')).toBeNull();
    expect(stageSizeError(8, 6)).toBeNull();
    expect(stageSizeError(1, 6)).not.toBeNull();
    expect(stageSizeError(8, 31)).not.toBeNull();
  });

  it('refuses what the server refuses', () => {
    expect(formationError(kf(A, 1, { [A]: { x: 1, y: 1 } }), stage)).toBeNull();
    expect(formationError(kf(A, -1, {}), stage)).toBe('formation_invalid');
    expect(formationError(kf(A, 1, {}, 31), stage)).toBe('formation_invalid');
    expect(formationError(kf(A, 1, { nadie: { x: 1, y: 1 } }), stage)).toBe('formation_invalid');
    expect(formationError(kf(A, 1, { [A]: { x: 9, y: 1 } }), stage)).toBe('formation_out_of_stage');
    expect(formationError({ ...kf(A, 1, {}), note: 'a'.repeat(281) }, stage)).toBe('formation_invalid');
  });
});

describe('history and diff', () => {
  it('undoes and redoes, and a new edit drops the redo', () => {
    let h = historyStart([1]);
    h = historyPush(h, [2]);
    h = historyPush(h, [3]);
    h = historyUndo(h);
    expect(h.present).toEqual([2]);
    h = historyRedo(h);
    expect(h.present).toEqual([3]);
    h = historyUndo(historyUndo(h));
    expect(h.present).toEqual([1]);
    expect(historyUndo(h)).toBe(h);
    h = historyPush(h, [9]);
    expect(h.future).toEqual([]);
    expect(historyRedo(h)).toBe(h);
  });

  it('says what to save and what to remove', () => {
    const a = kf('a', 0, { [A]: { x: 1, y: 1 } });
    const b = kf('b', 5, {});
    const a2 = { ...a, positions: { [A]: { x: 2, y: 1 } } };
    const c = kf('c', 9, {});
    const d = diffKeyframes([a, b], [a2, c]);
    expect(d.save.map((f) => f.id)).toEqual(['a', 'c']);
    expect(d.remove.map((f) => f.id)).toEqual(['b']);
    expect(diffKeyframes([a, b], [a, b])).toEqual({ save: [], remove: [] });
  });
});

describe('words', () => {
  it('formats moments and places', () => {
    expect(formatMoment(9)).toBe('0:09');
    expect(formatMoment(70.5)).toBe('1:10,5');
    expect(describePoint({ x: 1, y: 5.5 }, stage)).toBe('delante, izquierda (1 m, 5,5 m)');
  });

  it('draws a member’s path through the formations', () => {
    const list = [kf('a', 0, { [A]: { x: 1, y: 1 } }), kf('b', 5, { [A]: { x: 1, y: 1 } }), kf('c', 9, { [A]: { x: 3, y: 2 } })];
    expect(memberTrack(list, A, [A], stage)).toEqual([
      { x: 1, y: 1 },
      { x: 3, y: 2 },
    ]);
  });
});
