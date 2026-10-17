import { describe, expect, it } from 'vitest';
import { isZoomed, NO_ZOOM } from '@/player/zoom';
import {
  associate,
  boxAt,
  boxFromDrag,
  cleanManualKeyframes,
  compressKeyframes,
  createFollower,
  estimateBytes,
  FOLLOW_MAX_BYTES,
  followAround,
  followSequence,
  followZoomAt,
  iou,
  parseKeyframes,
  pathScale,
  pickCandidate,
  pictureToScreen,
  removeKeyframeNear,
  sampleTimes,
  screenToPicture,
  smoothKeyframes,
  spliceFrom,
  spliceRange,
  upsertKeyframe,
  type Box,
  type Candidate,
  type FollowKeyframe,
} from './followPath';

const box = (x: number, y: number, w = 0.1, h = 0.4): Box => ({ x, y, w, h });

describe('reading keyframes', () => {
  it('keeps valid rows, sorted, inside the picture, one per moment', () => {
    const parsed = parseKeyframes([
      [2, 0.5, 0.2, 0.1, 0.4],
      'nope',
      [1, 0.95, -0.3, 0.1, 0.4],
      [Number.NaN, 0.1, 0.1, 0.1, 0.1],
      [3, 0.1, 0.1, 0, 0.1],
      [2, 0.4, 0.2, 0.1, 0.4],
    ]);
    expect(parsed).toEqual([
      [1, 0.9, 0, 0.1, 0.4],
      [2, 0.4, 0.2, 0.1, 0.4],
    ]);
    expect(parseKeyframes(null)).toEqual([]);
    expect(parseKeyframes({})).toEqual([]);
  });
});

describe('interpolation', () => {
  const kfs: FollowKeyframe[] = [
    [0, 0.1, 0.3, 0.1, 0.4],
    [1, 0.3, 0.3, 0.1, 0.4],
    [2, 0.5, 0.3, 0.1, 0.4],
    [4, 0.45, 0.2, 0.2, 0.6],
  ];

  it('passes through each keyframe and holds before and after', () => {
    expect(boxAt(kfs, 1)).toEqual(box(0.3, 0.3));
    expect(boxAt(kfs, -5)).toEqual(box(0.1, 0.3));
    expect(boxAt(kfs, 99)).toEqual({ x: 0.45, y: 0.2, w: 0.2, h: 0.6 });
    expect(boxAt([], 1)).toBeNull();
  });

  it('glides between keyframes (a straight move stays straight, the size changes linearly)', () => {
    const mid = boxAt(kfs, 0.5)!;
    expect(mid.x).toBeCloseTo(0.2, 5);
    expect(mid.y).toBeCloseTo(0.3, 5);
    const grow = boxAt(kfs, 3)!;
    expect(grow.w).toBeCloseTo(0.15, 5);
    expect(grow.h).toBeCloseTo(0.5, 5);
    // The centre stays put while only the size changes.
    expect(grow.x + grow.w / 2).toBeCloseTo(0.55, 5);
  });

  it('never overshoots past the two keyframes around t', () => {
    const zigzag: FollowKeyframe[] = [
      [0, 0, 0.3, 0.1, 0.4],
      [1, 0.8, 0.3, 0.1, 0.4],
      [2, 0.8, 0.3, 0.1, 0.4],
      [3, 0, 0.3, 0.1, 0.4],
    ];
    for (let t = 1; t <= 2; t += 0.1) {
      const b = boxAt(zigzag, t)!;
      expect(b.x).toBeCloseTo(0.8, 6);
    }
  });

  it('smooths jitter but keeps the times and a steady box steady', () => {
    const steady: FollowKeyframe[] = Array.from({ length: 6 }, (_, i) => [i, 0.4, 0.3, 0.1, 0.4]);
    expect(smoothKeyframes(steady)).toEqual(steady);
    const jitter: FollowKeyframe[] = Array.from({ length: 7 }, (_, i) => [
      i / 10,
      i % 2 ? 0.45 : 0.35,
      0.3,
      0.1,
      0.4,
    ]);
    const smooth = smoothKeyframes(jitter);
    expect(smooth.map((k) => k[0])).toEqual(jitter.map((k) => k[0]));
    const spread = (list: FollowKeyframe[]) =>
      Math.max(...list.map((k) => k[1])) - Math.min(...list.map((k) => k[1]));
    expect(spread(smooth)).toBeLessThan(spread(jitter) / 2);
  });
});

describe('choosing and following the dancer', () => {
  const people: Candidate[] = [
    { box: box(0.1, 0.3), id: 1 },
    { box: box(0.45, 0.3), id: 2 },
    { box: box(0.8, 0.3), id: 3 },
  ];

  it('a tap picks the person under the finger, or the nearest close by', () => {
    expect(pickCandidate(people, { point: { x: 0.5, y: 0.5 } })).toBe(1);
    expect(pickCandidate(people, { point: { x: 0.215, y: 0.5 } })).toBe(0); // just outside, inside the margin
    expect(pickCandidate(people, { point: { x: 0.5, y: 0.05 } })).toBeNull();
    expect(pickCandidate([], { point: { x: 0.5, y: 0.5 } })).toBeNull();
  });

  it('a drawn box picks whoever overlaps it most', () => {
    expect(pickCandidate(people, { box: box(0.78, 0.25, 0.14, 0.5) })).toBe(2);
    expect(pickCandidate(people, { box: box(0.3, 0.9, 0.05, 0.05) })).toBeNull();
  });

  it('IoU', () => {
    expect(iou(box(0, 0, 0.2, 0.2), box(0, 0, 0.2, 0.2))).toBeCloseTo(1);
    expect(iou(box(0, 0, 0.2, 0.2), box(0.1, 0, 0.2, 0.2))).toBeCloseTo(1 / 3);
    expect(iou(box(0, 0, 0.1, 0.1), box(0.5, 0.5, 0.1, 0.1))).toBe(0);
  });

  it('keeps the tracker id while it stays close, but not when it jumps far away', () => {
    const prev = box(0.45, 0.3);
    expect(
      associate(prev, 2, [
        { box: box(0.47, 0.3), id: 2 },
        { box: box(0.46, 0.31), id: 9 },
      ]),
    ).toBe(0);
    // The id now sits on someone across the stage: the overlapping box wins.
    expect(
      associate(prev, 2, [
        { box: box(0.9, 0.3), id: 2 },
        { box: box(0.46, 0.3), id: 5 },
      ]),
    ).toBe(1);
  });

  it('without ids: the best overlap, a near box of a similar size, or nobody', () => {
    const prev = box(0.4, 0.3);
    expect(associate(prev, null, [{ box: box(0.8, 0.3) }, { box: box(0.42, 0.3) }])).toBe(1);
    expect(associate(prev, null, [{ box: box(0.52, 0.3) }])).toBe(0); // no overlap, close enough
    expect(associate(prev, null, [{ box: box(0.52, 0.3, 0.02, 0.05) }])).toBeNull(); // too small: not them
    expect(associate(prev, null, [{ box: box(0.95, 0.3, 0.04, 0.4) }])).toBeNull();
    expect(associate(prev, null, [])).toBeNull();
  });

  it('follows through a crossing where the tracker swaps ids, and only keeps frames where the dancer is seen', () => {
    // A walks right (0.13 a second), B walks left; they pass each other at t≈2 and the tracker swaps their ids.
    const frames = [
      {
        t: 0,
        candidates: [
          { box: box(0.2, 0.3), id: 1 },
          { box: box(0.7, 0.3), id: 2 },
        ],
      },
      {
        t: 1,
        candidates: [
          { box: box(0.33, 0.3), id: 1 },
          { box: box(0.57, 0.3), id: 2 },
        ],
      },
      { t: 2, candidates: [] },
      {
        t: 3,
        candidates: [
          { box: box(0.5, 0.3), id: 2 },
          { box: box(0.3, 0.3), id: 1 },
        ],
      },
    ];
    const kfs = followSequence(frames, box(0.2, 0.3), 1);
    // Where A was heading wins over the swapped id; the empty frame leaves a gap the interpolation glides over.
    expect(kfs.map((k) => [k[0], k[1]])).toEqual([
      [0, 0.2],
      [1, 0.33],
      [3, 0.5],
    ]);
    expect(boxAt(kfs, 2)!.x).toBeGreaterThan(0.33);
    expect(boxAt(kfs, 2)!.x).toBeLessThan(0.5);
  });

  it('a dancer of another size close by is not taken for the one lost', () => {
    const f = createFollower(box(0.4, 0.3, 0.2, 0.3), 2, 0);
    expect(f.step(0.5, []).found).toBe(false);
    // Someone much taller where our dancer was: not them.
    expect(f.step(1, [{ box: box(0.45, 0.2, 0.14, 0.52), id: 4 }]).found).toBe(false);
    // Our dancer again, a bit further.
    const back = f.step(1.5, [
      { box: box(0.45, 0.2, 0.14, 0.52), id: 4 },
      { box: box(0.33, 0.31, 0.2, 0.31), id: 1 },
    ]);
    expect(back.found).toBe(true);
    expect(back.keyframe![1]).toBeCloseTo(0.33);
  });

  it('works backwards in time too', () => {
    const f = createFollower(box(0.5, 0.3), null, 10);
    expect(f.step(9.8, [{ box: box(0.52, 0.3) }, { box: box(0.1, 0.3) }]).keyframe![1]).toBeCloseTo(0.52);
    expect(f.step(9.6, [{ box: box(0.54, 0.3) }]).found).toBe(true);
  });

  it('samples frame times either way, ending on the target', () => {
    expect(sampleTimes(0, 1, 4)).toEqual([0.25, 0.5, 0.75, 1]);
    expect(sampleTimes(1, 0.1, 4)).toEqual([0.75, 0.5, 0.25, 0.1]);
    expect(sampleTimes(0, 0.3, 4)).toEqual([0.25, 0.3]);
    expect(sampleTimes(0, 0, 4)).toEqual([]);
  });
});

describe('corrections and manual mode', () => {
  const old: FollowKeyframe[] = [
    [0, 0.1, 0.3, 0.1, 0.4],
    [1, 0.2, 0.3, 0.1, 0.4],
    [2, 0.3, 0.3, 0.1, 0.4],
    [3, 0.4, 0.3, 0.1, 0.4],
  ];

  it('recalculating from a point keeps what was before and rewrites the rest', () => {
    const fresh: FollowKeyframe[] = [
      [2, 0.7, 0.3, 0.1, 0.4],
      [2.5, 0.72, 0.3, 0.1, 0.4],
      [1.5, 0.9, 0.9, 0.1, 0.1], // before the point: ignored
    ];
    expect(spliceFrom(old, 2, fresh)).toEqual([old[0], old[1], fresh[0], fresh[1]]);
  });

  it('places, replaces and removes manual points', () => {
    let kfs = upsertKeyframe([], 5, box(0.3, 0.2));
    kfs = upsertKeyframe(kfs, 1, box(0.1, 0.2));
    kfs = upsertKeyframe(kfs, 5.1, box(0.6, 0.2)); // within 0.25 s: replaces
    expect(kfs.map((k) => [k[0], k[1]])).toEqual([
      [1, 0.1],
      [5.1, 0.6],
    ]);
    expect(removeKeyframeNear(kfs, 5).map((k) => k[0])).toEqual([1]);
    expect(removeKeyframeNear(kfs, 3)).toEqual(kfs);
  });

  it('a drag draws a box; a tap gets a body-sized box inside the picture', () => {
    expect(boxFromDrag({ x: 0.6, y: 0.7 }, { x: 0.4, y: 0.2 })).toEqual({ x: 0.4, y: 0.2, w: 0.2, h: 0.5 });
    const tap = boxFromDrag({ x: 0.98, y: 0.9 }, { x: 0.98, y: 0.9 });
    expect(tap.w).toBeCloseTo(0.16);
    expect(tap.x + tap.w).toBeLessThanOrEqual(1);
    expect(tap.y + tap.h).toBeLessThanOrEqual(1);
  });
});

describe('size in the database', () => {
  it('rounds and drops what a straight line already gives', () => {
    const line: FollowKeyframe[] = Array.from({ length: 101 }, (_, i) => [
      i / 10,
      0.1 + i * 0.004,
      0.3,
      0.1,
      0.4,
    ]);
    const out = compressKeyframes(line);
    expect(out.length).toBeLessThan(10);
    expect(out[0]![0]).toBe(0);
    expect(out[out.length - 1]![0]).toBe(10);
    // Still the same path.
    for (const t of [0.35, 2.5, 7.77]) expect(boxAt(out, t)!.x).toBeCloseTo(boxAt(line, t)!.x, 2);
    const noisy = compressKeyframes([[0.123456, 0.1234567, 0.2, 0.1, 0.4]]);
    expect(noisy).toEqual([[0.12, 0.123, 0.2, 0.1, 0.4]]);
  });

  it('a long, busy path always fits well under 600 KB', () => {
    // An hour at 10 fps of a dancer that never stops moving.
    const busy: FollowKeyframe[] = Array.from({ length: 36000 }, (_, i) => [
      i / 10,
      0.45 + 0.4 * Math.sin(i * 1.7) * 0.5,
      0.3 + 0.1 * Math.cos(i * 2.3),
      0.1,
      0.4,
    ]);
    expect(estimateBytes(busy)).toBeGreaterThan(FOLLOW_MAX_BYTES);
    const out = compressKeyframes(busy);
    expect(estimateBytes(out)).toBeLessThanOrEqual(480_000);
    expect(JSON.stringify(out).length).toBeLessThan(FOLLOW_MAX_BYTES / 2);
    expect(out.every((k, i) => i === 0 || k[0] > out[i - 1]![0])).toBe(true);
  });
});

describe('from the path to the zoom', () => {
  const kfs: FollowKeyframe[] = [
    [0, 0.1, 0.2, 0.1, 0.35],
    [2, 0.6, 0.2, 0.1, 0.35],
  ];

  it('one scale for the whole path, from the dancer size', () => {
    expect(pathScale(kfs)).toBe(2);
    expect(pathScale([[0, 0, 0, 0.9, 0.9]])).toBe(1.2); // a dancer filling the frame: barely closer
    expect(pathScale([[0, 0.5, 0.5, 0.01, 0.02]])).toBe(3.5);
    expect(pathScale([])).toBe(2);
  });

  it('centres the zoom on the dancer at each moment', () => {
    expect(followZoomAt(kfs, 0)).toEqual({ scale: 2, x: 0.15, y: 0.375 });
    expect(followZoomAt(kfs, 1)).toEqual({ scale: 2, x: 0.4, y: 0.375 });
    expect(followZoomAt([], 1)).toEqual(NO_ZOOM);
    expect(isZoomed(followZoomAt(kfs, 1, { scale: 3 }))).toBe(true);
  });

  it('with the mirror outside the layer, the zoom flips to the screen side', () => {
    expect(followZoomAt(kfs, 0, { mirroredOutside: true })).toEqual({ scale: 2, x: 0.85, y: 0.375 });
  });

  it('turns stage taps into picture points and back, with zoom and mirror', () => {
    const stage = { width: 400, height: 200 };
    const media = { width: 1600, height: 900 }; // 16:9 in 2:1: bars on the sides
    const zoom = { scale: 2, x: 0.4, y: 0.5 };
    const b = box(0.35, 0.3, 0.1, 0.4);
    for (const mirrored of [false, true]) {
      const r = pictureToScreen(b, zoom, stage, media, mirrored);
      const tl = screenToPicture(
        { x: mirrored ? r.left + r.width : r.left, y: r.top },
        zoom,
        stage,
        media,
        mirrored,
      );
      expect(tl.x).toBeCloseTo(0.35, 6);
      expect(tl.y).toBeCloseTo(0.3, 6);
    }
    // No zoom, no mirror: the centre of the stage is the centre of the picture.
    expect(screenToPicture({ x: 200, y: 100 }, NO_ZOOM, stage, media, false)).toEqual({ x: 0.5, y: 0.5 });
    // Mirrored: a tap on the left of the screen is on the right of the picture.
    expect(screenToPicture({ x: 100, y: 100 }, NO_ZOOM, stage, media, true).x).toBeGreaterThan(0.5);
  });
});

describe('on real MoveNet detections', () => {
  // MoveNet MultiPose on the test video (three people; A walks right, B walks left, they cross at ~6 s, C stays at
  // the back): every 0.5 s, «#id x w h». B is often missed and the tracker gives its id to someone else later.
  const raw = `0.5 #1 .12 .14 .52 | #3 .45 .17 .45 | #2 .75 .20 .30
1.0 #1 .16 .14 .52 | #3 .47 .18 .44
1.5 #1 .18 .14 .52 | #3 .47 .17 .45
2.0 #1 .21 .14 .52
2.5 #1 .24 .15 .52
3.0 #1 .27 .15 .52 | #2 .61 .20 .30
3.5 #1 .30 .14 .52 | #2 .57 .20 .32
4.0
4.5 #1 .35 .13 .52 | #2 .52 .20 .32
5.0 #1 .38 .14 .51 | #2 .48 .21 .31
5.5 #2 .43 .24 .31
6.0 #2 .44 .20 .31
6.5 #2 .41 .20 .31
7.0 #2 .38 .20 .31
7.5 #4 .56 .10 .51
8.0 #4 .55 .14 .51
8.5 #4 .58 .14 .52 | #1 .30 .19 .32
9.0 #4 .60 .14 .50
9.5 #4 .63 .14 .50 | #2 .43 .16 .45
10.0 #2 .46 .16 .45 | #4 .66 .14 .51
10.5 #4 .69 .14 .51 | #2 .47 .17 .45
11.0 #1 .16 .20 .31 | #4 .72 .14 .51 | #2 .48 .17 .44
11.5 #4 .74 .14 .52
12.0 #2 .43 .18 .44 | #4 .77 .14 .52`;
  const frames = raw.split('\n').map((line) => {
    const [t, ...rest] = line.split(' ');
    const candidates: Candidate[] = rest
      .join(' ')
      .split('|')
      .map((p) => p.trim().split(' '))
      .filter((p) => p.length === 4)
      .map(([id, x, w, h]) => ({
        id: Number(id!.slice(1)),
        box: { x: Number(x), y: 0.25, w: Number(w), h: Number(h) },
      }));
    return { t: Number(t), candidates };
  });

  it('keeps each dancer through the crossing and the misses', () => {
    const a = followSequence(frames, box(0.1, 0.25, 0.14, 0.52), 1, 0);
    const b = followSequence(frames, box(0.78, 0.25, 0.2, 0.31), 2, 0);
    // A only ever moves right; B only ever moves left.
    expect(a.every((k, i) => i === 0 || k[1] >= a[i - 1]![1] - 0.02)).toBe(true);
    expect(b.every((k, i) => i === 0 || k[1] <= b[i - 1]![1] + 0.02)).toBe(true);
    expect(a[a.length - 1]![1]).toBeCloseTo(0.77);
    expect(b[b.length - 1]![1]).toBeCloseTo(0.16);
    // B is never mistaken for the taller dancers.
    expect(b.every((k) => k[4] < 0.35)).toBe(true);
  });

  it('builds the path both ways from the chosen moment (one pass over the video)', () => {
    const chosen = box(0.44, 0.25, 0.2, 0.31); // B at 6 s
    const both = followAround(frames, 6, chosen, true);
    expect(both.keyframes[0]![0]).toBe(0.5);
    expect(both.keyframes[0]![1]).toBeCloseTo(0.75);
    expect(both.keyframes[both.keyframes.length - 1]![1]).toBeCloseTo(0.16);
    expect(both.keyframes.every((k, i) => i === 0 || k[1] <= both.keyframes[i - 1]![1] + 0.02)).toBe(true);
    expect(both.seen).toBeLessThan(both.frames);
    const ahead = followAround(frames, 6, chosen, false);
    expect(ahead.keyframes[0]![0]).toBe(6);
  });
});

describe('manual points are never dropped', () => {
  it('three equal boxes at 0, 2 and 4 s stay three (an analysed path would drop the middle one)', () => {
    const same = box(0.4, 0.3);
    let kfs = cleanManualKeyframes(upsertKeyframe([], 0, same));
    kfs = cleanManualKeyframes(upsertKeyframe(kfs, 2, same));
    kfs = cleanManualKeyframes(upsertKeyframe(kfs, 4, same));
    expect(kfs.map((k) => k[0])).toEqual([0, 2, 4]);
    expect(compressKeyframes(kfs)).toHaveLength(2);
    expect(cleanManualKeyframes([[1.23456, 0.4444444, 0.3, 0.1, 0.4]])).toEqual([
      [1.23, 0.444, 0.3, 0.1, 0.4],
    ]);
  });
});

describe('15 · the faster analysis keeps the path right', () => {
  it('smoothing stops at a gap: the dancer hidden for a while is not pulled towards the other side', () => {
    const kfs: FollowKeyframe[] = [
      [0, 0.1, 0.3, 0.1, 0.4],
      [0.25, 0.1, 0.3, 0.1, 0.4],
      [0.5, 0.1, 0.3, 0.1, 0.4],
      // Hidden for 3 s; seen again on the other side of the picture.
      [3.5, 0.7, 0.3, 0.1, 0.4],
      [3.75, 0.7, 0.3, 0.1, 0.4],
      [4, 0.7, 0.3, 0.1, 0.4],
    ];
    const smooth = smoothKeyframes(kfs, 2);
    expect(smooth[2]![1]).toBeCloseTo(0.1, 6);
    expect(smooth[3]![1]).toBeCloseTo(0.7, 6);
  });

  it('a correction ready in part only replaces its own stretch', () => {
    const old: FollowKeyframe[] = [0, 2, 4, 6, 8].map((t) => [t, 0.1, 0.3, 0.1, 0.4]);
    const fresh: FollowKeyframe[] = [3, 4, 5, 9].map((t) => [t, 0.6, 0.3, 0.1, 0.4]);
    expect(spliceRange(old, 3, 5, fresh).map((k) => [k[0], k[1]])).toEqual([
      [0, 0.1],
      [2, 0.1],
      [3, 0.6],
      [4, 0.6],
      [5, 0.6],
      [6, 0.1],
      [8, 0.1],
    ]);
  });

  it('while the dancer is hidden, the neighbour standing where they stood is not taken for them', () => {
    const f = createFollower(box(0.4, 0.3), 1, 0);
    // Both seen: ours at 0.4, the neighbour at 0.55.
    expect(
      f.step(0.25, [
        { box: box(0.4, 0.3), id: 1 },
        { box: box(0.55, 0.3), id: 2 },
      ]).found,
    ).toBe(true);
    // Ours hidden: only the neighbour, where they were.
    expect(f.step(0.5, [{ box: box(0.555, 0.3), id: 2 }]).found).toBe(false);
    // Ours back.
    expect(
      f.step(0.75, [
        { box: box(0.41, 0.3), id: 1 },
        { box: box(0.55, 0.3), id: 2 },
      ]).found,
    ).toBe(true);
    expect(f.box.x).toBeCloseTo(0.41);
  });

  it('says where it expects the dancer and which person it took', () => {
    const f = createFollower(box(0.4, 0.3), null, 0);
    const r = f.step(1, [{ box: box(0.1, 0.3) }, { box: box(0.45, 0.3) }]);
    expect(r.index).toBe(1);
    // Moving right at 0.05 a second: half a second later, a little further right.
    expect(f.expect(1.5).x).toBeCloseTo(0.475, 3);
    expect(f.lastSeen).toBe(1);
  });
});
