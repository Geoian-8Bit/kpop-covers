import { describe, expect, it } from 'vitest';
import { findClashes, clashingAt, clashRanges } from './clashRules';
import { DEFAULT_STAGE, diffKeyframes, formationError, fitPositions, keepPaths, memberTrack, positionsAt, withoutPaths, type Keyframe } from './formationRules';
import {
  addPathPoint,
  convertPath,
  curvePath,
  FREE_POINTS_MAX,
  pathValid,
  pointOnPath,
  polylineLength,
  removePathPoint,
  simplifyStroke,
  strokeToPath,
} from './pathRules';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const stage = DEFAULT_STAGE;
const kf = (id: string, at: number, positions: Keyframe['positions'], transition = 2): Keyframe => ({ id, at, transition, positions });

describe('pointOnPath', () => {
  const from = { x: 0, y: 0 };
  const to = { x: 4, y: 0 };

  it('is a straight line without a path', () => {
    expect(pointOnPath(from, to, undefined, 0.5)).toEqual({ x: 2, y: 0 });
  });

  it('follows a quadratic curve through its control point', () => {
    const mid = pointOnPath(from, to, { kind: 'curve', points: [{ x: 2, y: 4 }] }, 0.5);
    expect(mid.x).toBeCloseTo(2);
    expect(mid.y).toBeCloseTo(2); // 0.25·0 + 0.5·4 + 0.25·0
    expect(pointOnPath(from, to, { kind: 'curve', points: [{ x: 2, y: 4 }] }, 1)).toEqual(to);
  });

  it('walks through several points by distance travelled', () => {
    // 0,0 → 0,2 → 4,2 → 4,0: 8 m in all, half way is 4 m in: (2, 2).
    const path = { kind: 'points' as const, points: [{ x: 0, y: 2 }, { x: 4, y: 2 }] };
    const mid = pointOnPath(from, to, path, 0.5);
    expect(mid.x).toBeCloseTo(2);
    expect(mid.y).toBeCloseTo(2);
    const quarter = pointOnPath(from, to, path, 0.25);
    expect(quarter).toEqual({ x: 0, y: 2 });
  });
});

describe('positionsAt with paths', () => {
  it('moves along the destination formation’s path', () => {
    const list = [
      kf('f1', 0, { [A]: { x: 0, y: 0 } }),
      kf('f2', 10, { [A]: { x: 4, y: 0, path: { kind: 'curve', points: [{ x: 2, y: 4 }] } } }),
    ];
    // Half way through the 2 s move (9 s), eased half is exactly half.
    const at = positionsAt(list, 9, [A], stage)[A]!;
    expect(at.x).toBeCloseTo(2);
    expect(at.y).toBeCloseTo(2);
  });

  it('old rows without paths stay straight', () => {
    const list = [kf('f1', 0, { [A]: { x: 0, y: 0 } }), kf('f2', 10, { [A]: { x: 4, y: 0 } })];
    expect(positionsAt(list, 9, [A], stage)[A]).toEqual({ x: 2, y: 0 });
  });
});

describe('strokes', () => {
  it('simplifies a straight-ish line to its ends', () => {
    const stroke = Array.from({ length: 20 }, (_, i) => ({ x: i * 0.2, y: (i % 2) * 0.02 }));
    expect(simplifyStroke(stroke)).toHaveLength(2);
  });

  it('keeps the corner of an L', () => {
    const stroke = [
      ...Array.from({ length: 10 }, (_, i) => ({ x: 1, y: 1 + i * 0.3 })),
      ...Array.from({ length: 10 }, (_, i) => ({ x: 1 + (i + 1) * 0.3, y: 3.7 })),
    ];
    const path = strokeToPath(stroke, stage);
    expect(path?.kind).toBe('free');
    expect(path?.points).toEqual([{ x: 1, y: 3.7 }]);
  });

  it('a very short stroke, or a straight one, stays straight', () => {
    expect(strokeToPath([{ x: 1, y: 1 }, { x: 1.2, y: 1.1 }], stage)).toBeNull();
    expect(strokeToPath([{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }], stage)).toBeNull();
  });

  it('caps a long scribble at the maximum of points, inside the stage', () => {
    const stroke = Array.from({ length: 400 }, (_, i) => ({ x: 4 + Math.cos(i / 3) * 5, y: 3 + Math.sin(i / 3) * 5 }));
    const path = strokeToPath(stroke, stage)!;
    expect(path.points.length).toBeLessThanOrEqual(FREE_POINTS_MAX);
    expect(pathValid(path, stage)).toBe(true);
  });

  it('measures polylines', () => {
    expect(polylineLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 5 }])).toBe(6);
  });
});

describe('path edits', () => {
  const from = { x: 1, y: 1 };
  const to = { x: 5, y: 1 };

  it('a new curve bends beside the middle', () => {
    const c = curvePath(from, to, stage);
    expect(c.points[0]!.x).toBeCloseTo(3);
    expect(c.points[0]!.y).not.toBeCloseTo(1);
  });

  it('adds points in the longest stretch and removing the last one makes it straight', () => {
    let p = addPathPoint(from, to, undefined, stage);
    expect(p.points).toEqual([{ x: 3, y: 1 }]);
    p = addPathPoint(from, to, p, stage);
    expect(p.points).toEqual([{ x: 2, y: 1 }, { x: 3, y: 1 }]);
    const one = removePathPoint(p, 0)!;
    expect(one.points).toEqual([{ x: 3, y: 1 }]);
    expect(removePathPoint(one, 0)).toBeNull();
  });

  it('converts between kinds', () => {
    expect(convertPath('straight', from, to, undefined, stage)).toBeNull();
    expect(convertPath('points', from, to, undefined, stage)).toEqual({ kind: 'points', points: [{ x: 3, y: 1 }] });
    const curve = convertPath('curve', from, to, { kind: 'points', points: [{ x: 3, y: 3 }] }, stage)!;
    // The curve passes through the old point at its middle.
    const mid = pointOnPath(from, to, curve, 0.5);
    expect(mid.x).toBeCloseTo(3);
    expect(mid.y).toBeCloseTo(3);
    expect(convertPath('free', from, to, undefined, stage)).toBeUndefined();
  });

  it('validates like the server', () => {
    expect(pathValid({ kind: 'curve', points: [{ x: 1, y: 1 }] }, stage)).toBe(true);
    expect(pathValid({ kind: 'curve', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }, stage)).toBe(false);
    expect(pathValid({ kind: 'points', points: [] }, stage)).toBe(false);
    expect(pathValid({ kind: 'zigzag', points: [{ x: 1, y: 1 }] }, stage)).toBe(false);
    expect(pathValid({ kind: 'free', points: [{ x: 9, y: 1 }] }, stage)).toBe(false);
    expect(formationError(kf('f', 1, { [A]: { x: 1, y: 1, path: { kind: 'free', points: [{ x: 2, y: 2 }] } } }), stage)).toBeNull();
    expect(formationError(kf('f', 1, { [A]: { x: 1, y: 1, path: { kind: 'free', points: [{ x: 20, y: 2 }] } } }), stage)).toBe('formation_invalid');
  });

  it('keeps paths through moves, drops them on copies, fits them in a smaller stage and saves their changes', () => {
    const path = { kind: 'curve' as const, points: [{ x: 7, y: 5 }] };
    expect(keepPaths({ [A]: { x: 1, y: 1, path } }, { [A]: { x: 2, y: 2 } })).toEqual({ [A]: { x: 2, y: 2, path } });
    expect(withoutPaths({ [A]: { x: 1, y: 1, path } })).toEqual({ [A]: { x: 1, y: 1 } });
    expect(fitPositions({ [A]: { x: 1, y: 1, path } }, { width: 4, depth: 4 })[A]!.path!.points[0]).toEqual({ x: 4, y: 4 });
    const before = [kf('f', 1, { [A]: { x: 1, y: 1 } })];
    const after = [kf('f', 1, { [A]: { x: 1, y: 1, path } })];
    expect(diffKeyframes(before, after).save).toHaveLength(1);
  });

  it('«Mi recorrido» follows the path', () => {
    const list = [
      kf('f1', 0, { [A]: { x: 0, y: 0 } }),
      kf('f2', 10, { [A]: { x: 4, y: 0, path: { kind: 'points', points: [{ x: 2, y: 3 }] } } }),
    ];
    expect(memberTrack(list, A, [A], stage)).toEqual([{ x: 0, y: 0 }, { x: 2, y: 3 }, { x: 4, y: 0 }]);
  });
});

describe('findClashes', () => {
  it('finds two people crossing in the middle of a move', () => {
    const list = [
      kf('f1', 0, { [A]: { x: 1, y: 3 }, [B]: { x: 7, y: 3 } }),
      kf('f2', 10, { [A]: { x: 7, y: 3 }, [B]: { x: 1, y: 3 } }),
    ];
    const clashes = findClashes(list, [A, B], stage);
    expect(clashes).toHaveLength(1);
    const c = clashes[0]!;
    expect(c.formationId).toBe('f2');
    expect(c.start).toBeGreaterThan(8);
    expect(c.end).toBeLessThan(10);
    expect(c.distance).toBeLessThan(0.5);
    expect(c.routeA.length).toBeGreaterThan(0);
    expect(clashingAt(clashes, 9)).toEqual(new Set([A, B]));
    expect(clashingAt(clashes, 5).size).toBe(0);
    expect(clashRanges(clashes)).toHaveLength(1);
  });

  it('a curve around the other avoids the clash', () => {
    const list = [
      kf('f1', 0, { [A]: { x: 1, y: 3 }, [B]: { x: 7, y: 3 } }),
      kf('f2', 10, {
        [A]: { x: 7, y: 3, path: { kind: 'curve', points: [{ x: 4, y: 0 }] } },
        [B]: { x: 1, y: 3, path: { kind: 'curve', points: [{ x: 4, y: 6 }] } },
      }),
    ];
    expect(findClashes(list, [A, B], stage)).toHaveLength(0);
  });

  it('a clash at the very first instant counts', () => {
    const list = [
      kf('f1', 0, { [A]: { x: 1, y: 1 }, [B]: { x: 1.2, y: 1 } }),
      kf('f2', 10, { [A]: { x: 1, y: 5 }, [B]: { x: 7, y: 1 } }),
    ];
    const clashes = findClashes(list, [A, B], stage);
    expect(clashes).toHaveLength(1);
    expect(clashes[0]!.start).toBe(8);
  });

  it('nothing to check with a single formation', () => {
    expect(findClashes([kf('f1', 0, { [A]: { x: 1, y: 1 }, [B]: { x: 1, y: 1 } })], [A, B], stage)).toEqual([]);
  });
});
