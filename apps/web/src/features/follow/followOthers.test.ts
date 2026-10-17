import { describe, expect, it } from 'vitest';
import { createFollower, type Box, type Candidate } from './followPath';
import {
  createOnlineTracker,
  cropAround,
  cropMasks,
  DEFAULT_CALIBRATION,
  MASK_MARGIN,
  MASK_MARGIN_PER_S,
  MAX_CROP_WIDEN,
  type Detectors,
  type MaskBox,
} from './followTrack';

const box = (x: number, y = 0.3, w = 0.1, h = 0.4): Box => ({ x, y, w, h });
const FRAME = { width: 1920, height: 1080 };

describe('15 · the others are followed too, and forgotten', () => {
  it('two dancers swap places while ours is hidden for 2 s: the other one is not taken for ours', () => {
    // Ours (A) at 0.35, the other (B) at 0.6. A is hidden from 1 s to 3 s; meanwhile B walks to where A was, and A
    // comes back where B stood.
    const f = createFollower(box(0.35), 1, 0);
    for (let t = 0.25; t <= 1; t += 0.25) {
      expect(
        f.step(t, [
          { box: box(0.35), id: 1 },
          { box: box(0.6), id: 2 },
        ]).found,
      ).toBe(true);
    }
    for (let t = 1.25; t < 3; t += 0.25) {
      const bx = 0.6 - 0.25 * Math.min(1, (t - 1.25) / 1.5);
      expect(f.step(t, [{ box: box(bx), id: 2 }]).found).toBe(false);
    }
    const back = f.step(3, [
      { box: box(0.35), id: 2 },
      { box: box(0.6), id: 1 },
    ]);
    expect(back.found).toBe(true);
    expect(f.box.x).toBeCloseTo(0.6);
  });

  it('someone not seen for over 1.5 s no longer stands in the way: ours, back where they stood, is ours', () => {
    const f = createFollower(box(0.35), null, 0);
    expect(f.step(0.25, [{ box: box(0.35) }, { box: box(0.5) }]).found).toBe(true);
    // Nobody seen for 2 s (ours hidden, the other one gone out of the picture).
    for (let t = 0.5; t <= 2.25; t += 0.25) expect(f.step(t, []).found).toBe(false);
    // Ours comes back where the other one was 2 s ago.
    expect(f.step(2.5, [{ box: box(0.5) }]).found).toBe(true);
  });

  it('ours hidden behind B, then B hidden behind ours: ours is still ours (the memory of B does not keep them)', () => {
    // Ours (O) stands at 0.35; B walks in from the right, covers O (only B seen), then goes behind O (only O seen)
    // and comes out on the left.
    const f = createFollower(box(0.35), null, 0);
    for (const [t, bx] of [
      [0.25, 0.56],
      [0.5, 0.52],
      [0.75, 0.48],
    ] as const) {
      expect(f.step(t, [{ box: box(0.35) }, { box: box(bx) }]).index).toBe(0);
    }
    for (const [t, bx] of [
      [1, 0.43],
      [1.25, 0.415],
      [1.5, 0.4],
      [1.75, 0.38],
    ] as const) {
      expect(f.step(t, [{ box: box(bx) }]).found).toBe(false);
    }
    for (const t of [2, 2.25, 2.5]) expect(f.step(t, [{ box: box(0.35) }]).found).toBe(true);
    for (const [t, bx] of [
      [2.75, 0.28],
      [3, 0.24],
      [3.25, 0.2],
    ] as const) {
      expect(f.step(t, [{ box: box(0.35) }, { box: box(bx) }]).index).toBe(0);
    }
    expect(f.box.x).toBeCloseTo(0.35);
  });

  it('B walks slowly in front of ours, through ours’ spot: B is not taken for ours on the way', () => {
    const f = createFollower(box(0.35), null, 0);
    for (const [t, bx] of [
      [0.25, 0.56],
      [0.5, 0.52],
      [0.75, 0.48],
    ] as const) {
      f.step(t, [{ box: box(0.35) }, { box: box(bx) }]);
    }
    for (const [t, bx] of [
      [1, 0.43],
      [1.25, 0.415],
      // Nearer ours' spot than B's last place, but right where B was heading: still B.
      [1.5, 0.37],
      [1.75, 0.33],
    ] as const) {
      expect(f.step(t, [{ box: box(bx) }]).found).toBe(false);
    }
    for (const [t, bx] of [
      [2, 0.29],
      [2.25, 0.25],
      [2.5, 0.21],
    ] as const) {
      expect(f.step(t, [{ box: box(0.35) }, { box: box(bx) }]).index).toBe(0);
    }
    expect(f.box.x).toBeCloseTo(0.35);
  });

  it('a crop (one person) says nothing about where the others are', () => {
    const f = createFollower(box(0.35), null, 0);
    f.step(0.25, [{ box: box(0.35) }, { box: box(0.6) }]);
    f.step(0.5, [{ box: box(0.36) }], false);
    expect(f.othersAt(0.5)).toEqual([box(0.6)]);
    // Too old to cover in a crop, still remembered.
    expect(f.othersAt(1.25)).toEqual([]);
  });
});

describe('15 · the crop never goes to the neighbour', () => {
  it('the others inside the crop are painted out, never over our dancer', () => {
    const dancer = box(0.45, 0.3, 0.1, 0.4);
    const crop = cropAround(dancer, FRAME);
    const right = box(0.53, 0.3, 0.1, 0.4);
    const left = box(0.37, 0.3, 0.1, 0.4);
    const far = box(0.9, 0.3, 0.08, 0.4);
    const masks = cropMasks(
      crop,
      [right, left, far].map((b) => ({ box: b, age: 0 })),
      dancer,
      FRAME,
      192,
    );
    expect(masks).toHaveLength(2);
    const k = 192 / crop.size;
    const dancerLeft = ((dancer.x - dancer.w * MASK_MARGIN) * FRAME.width - crop.x) * k;
    const dancerRight = ((dancer.x + dancer.w * (1 + MASK_MARGIN)) * FRAME.width - crop.x) * k;
    const [r, l] = masks;
    expect(r!.x).toBeCloseTo(dancerRight);
    expect(l!.x + l!.w).toBeCloseTo(dancerLeft);
    for (const m of masks) {
      expect(m.x).toBeGreaterThanOrEqual(0);
      expect(m.x + m.w).toBeLessThanOrEqual(192);
    }
  });

  it('the older the sighting of the other, the more room is left around ours', () => {
    const dancer = box(0.45, 0.3, 0.1, 0.4);
    const crop = cropAround(dancer, FRAME);
    const right = box(0.53, 0.3, 0.1, 0.4);
    const k = 192 / crop.size;
    const [fresh] = cropMasks(crop, [{ box: right, age: 0 }], dancer, FRAME, 192);
    const [old] = cropMasks(crop, [{ box: right, age: 0.5 }], dancer, FRAME, 192);
    expect(old!.x - fresh!.x).toBeCloseTo(dancer.w * MASK_MARGIN_PER_S * 0.5 * FRAME.width * k);
  });

  it('a mask is where the other was heading, not where they were last seen', () => {
    const f = createFollower(box(0.3), null, 0);
    f.step(0.25, [{ box: box(0.3) }, { box: box(0.7) }]);
    f.step(0.5, [{ box: box(0.3) }, { box: box(0.65) }]);
    f.step(0.75, [{ box: box(0.3) }], false); // a crop: the other not seen
    const [m] = f.masksAt(0.75);
    expect(m!.age).toBeCloseTo(0.25);
    expect(m!.box.x).toBeCloseTo(0.6);
  });

  it('a crop box much wider than the dancer is not trusted: the whole picture looks', async () => {
    const start = box(0.45);
    const tracker = createOnlineTracker({ start, startId: 1, startT: 0, frame: FRAME });
    let wide = false;
    const d: Detectors = {
      multi: async () => [
        { box: box(0.45), id: 1 },
        { box: box(0.7), id: 2 },
      ],
      single: async () =>
        wide ? { x: 0.4, y: 0.33, w: 0.1 * MAX_CROP_WIDEN * 1.3, h: 0.36 } : box(0.455, 0.33, 0.087, 0.36),
    };
    expect((await tracker.step(0.25, d)).used).toBe('multi');
    expect((await tracker.step(0.5, d)).used).toBe('single');
    wide = true;
    expect((await tracker.step(0.75, d)).used).toBe('both');
  });

  it('the crop is told who to cover: the others the whole picture saw', async () => {
    const tracker = createOnlineTracker({ start: box(0.45), startId: 1, startT: 0, frame: FRAME });
    const seen: (readonly MaskBox[] | undefined)[] = [];
    const d: Detectors = {
      multi: async () => [
        { box: box(0.45), id: 1 },
        { box: box(0.6), id: 2 },
      ],
      single: async (_crop, masks) => {
        seen.push(masks);
        return box(0.455, 0.33, 0.087, 0.36);
      },
    };
    await tracker.step(0.25, d);
    await tracker.step(0.5, d);
    expect(seen[0]).toEqual([{ box: box(0.6), age: 0.25 }]);
  });
});

describe('15 · both models measured on the same picture', () => {
  it('the calibration comes from SinglePose on that frame, not from MultiPose’s own points', async () => {
    const tracker = createOnlineTracker({ start: box(0.45), startId: 1, startT: 0, frame: FRAME });
    const model = box(0.45, 0.3, 0.1, 0.4);
    // MultiPose's points at 256 px miss the ankles (a short box): learning from them would stretch the boxes.
    const multi: Candidate = { box: model, id: 1, kp: box(0.46, 0.32, 0.08, 0.25) };
    let asked = 0;
    const d: Detectors = {
      multi: async () => [multi],
      single: async () => null,
      calibrate: async () => {
        asked++;
        return { x: 0.455, y: 0.31, w: 0.1 / 1.2, h: 0.4 / 1.1 };
      },
    };
    await tracker.step(0.25, d);
    expect(asked).toBe(1);
    expect(tracker.calibration.sh).toBeCloseTo(DEFAULT_CALIBRATION.sh * 0.6 + 1.1 * 0.4, 3);
    expect(tracker.calibration.sw).toBeCloseTo(DEFAULT_CALIBRATION.sw * 0.6 + 1.2 * 0.4, 3);
  });

  it('after a crop that lost the dancer there is no copy of that frame: no calibration then', async () => {
    const tracker = createOnlineTracker({ start: box(0.45), startId: 1, startT: 0, frame: FRAME });
    let asked = 0;
    let single: Box | null = box(0.455, 0.33, 0.087, 0.36);
    const d: Detectors = {
      multi: async () => [{ box: box(0.45), id: 1 }],
      single: async () => single,
      calibrate: async () => {
        asked++;
        return null;
      },
    };
    await tracker.step(0.25, d); // multi first: calibrates
    await tracker.step(0.5, d); // crop
    single = null;
    expect((await tracker.step(0.75, d)).used).toBe('both');
    expect(asked).toBe(1);
  });
});
