import { describe, expect, it } from 'vitest';
import { centreOf, createFollower, type Box, type Candidate } from './followPath';
import {
  applyCalibration,
  createModelChooser,
  createOnlineTracker,
  cropAround,
  cropDraw,
  DEFAULT_CALIBRATION,
  isCrowded,
  keypointBox,
  learnCalibration,
  type Crop,
  type Detectors,
} from './followTrack';

const box = (x: number, y: number, w = 0.12, h = 0.42): Box => ({ x, y, w, h });
const FRAME = { width: 1920, height: 1080 };

describe('the crop around the dancer', () => {
  it('a square around the box, a little bigger than its longer side', () => {
    const c = cropAround(box(0.4, 0.3), FRAME, 1.4);
    expect(c.size).toBeCloseTo(0.42 * 1080 * 1.4);
    expect(c.x + c.size / 2).toBeCloseTo(0.46 * 1920);
    expect(c.y + c.size / 2).toBeCloseTo(0.51 * 1080);
  });

  it('only the part inside the frame is drawn, at its place in the square', () => {
    const crop: Crop = { x: -100, y: 980, size: 400 };
    const d = cropDraw(crop, FRAME, 192)!;
    expect(d).toMatchObject({ sx: 0, sy: 980, sw: 300, sh: 100 });
    expect(d.dx).toBeCloseTo(48);
    expect(d.dy).toBeCloseTo(0);
    expect(d.dw).toBeCloseTo(144);
    expect(d.dh).toBeCloseTo(48);
    expect(cropDraw({ x: 3000, y: 0, size: 100 }, FRAME, 192)).toBeNull();
  });

  it('the points seen in the crop come back as a box of the frame', () => {
    const crop: Crop = { x: 800, y: 200, size: 600 };
    // A person standing in the middle of the crop: 17 points between 30 % and 70 % across, 10 % to 95 % down.
    const kps = Array.from({ length: 17 }, (_, i) => ({
      x: 192 * (0.3 + 0.4 * ((i % 4) / 3)),
      y: 192 * (0.1 + 0.85 * (i / 16)),
      score: 0.8,
    }));
    const b = keypointBox(kps, crop, 192, FRAME)!;
    expect(b.x).toBeCloseTo((800 + 0.3 * 600) / 1920);
    expect(b.w).toBeCloseTo((0.4 * 600) / 1920);
    expect(b.y).toBeCloseTo((200 + 0.1 * 600) / 1080);
    expect(b.h).toBeCloseTo((0.85 * 600) / 1080);
  });

  it('a hand or a head at the edge is not a person', () => {
    const crop: Crop = { x: 0, y: 0, size: 600 };
    const unsure = Array.from({ length: 17 }, (_, i) => ({ x: 10 * i, y: 10 * i, score: i < 5 ? 0.9 : 0.1 }));
    expect(keypointBox(unsure, crop, 192, FRAME)).toBeNull();
    // Many points but no hip: not a clear person either.
    const noHips = Array.from({ length: 17 }, (_, i) => ({
      x: 10 * i,
      y: 10 * i,
      score: i === 11 || i === 12 ? 0 : 0.9,
    }));
    expect(keypointBox(noHips, crop, 192, FRAME)).toBeNull();
  });
});

describe('the same box from both models', () => {
  it('learns how the model box sits around the points and applies it', () => {
    const kp = box(0.4, 0.32, 0.1, 0.36);
    const model = box(0.39, 0.29, 0.12, 0.42);
    let c = DEFAULT_CALIBRATION;
    for (let i = 0; i < 12; i++) c = learnCalibration(c, kp, model);
    const back = applyCalibration(kp, c);
    expect(back.w).toBeCloseTo(0.12, 3);
    expect(back.h).toBeCloseTo(0.42, 3);
    expect(centreOf(back).x).toBeCloseTo(centreOf(model).x, 3);
    expect(centreOf(back).y).toBeCloseTo(centreOf(model).y, 3);
  });

  it('a strange pair never makes the boxes absurd', () => {
    const c = learnCalibration(DEFAULT_CALIBRATION, box(0.4, 0.3, 0.1, 0.4), box(0, 0, 1, 1), 1);
    expect(c.sw).toBeLessThanOrEqual(1.8);
    expect(c.sh).toBeLessThanOrEqual(1.5);
    expect(Math.abs(c.dx)).toBeLessThanOrEqual(0.3);
  });
});

describe('which model looks at the next frame', () => {
  it('the whole picture first, then the crop, and a check every few frames', () => {
    const ch = createModelChooser(3);
    expect(ch.next()).toBe('multi');
    ch.afterMulti({ found: true, crowded: false });
    const seq: string[] = [];
    for (let i = 0; i < 7; i++) {
      const m = ch.next();
      seq.push(m);
      if (m === 'single') ch.afterSingle(true);
      else ch.afterMulti({ found: true, crowded: false });
    }
    expect(seq).toEqual(['single', 'single', 'single', 'multi', 'single', 'single', 'single']);
  });

  it('back to the whole picture when the crop loses them, or someone is next to them', () => {
    const ch = createModelChooser(6);
    ch.afterMulti({ found: true, crowded: false });
    ch.afterSingle(false);
    expect(ch.next()).toBe('multi');
    ch.afterMulti({ found: true, crowded: true });
    expect(ch.next()).toBe('multi');
    ch.afterMulti({ found: true, crowded: false });
    expect(ch.next()).toBe('single');
  });

  it('someone right next to them is a crowd; a dancer a body away is not', () => {
    const me = box(0.4, 0.3);
    expect(isCrowded([{ box: me }, { box: box(0.5, 0.3) }], 0)).toBe(true); // touching
    expect(isCrowded([{ box: me }, { box: box(0.66, 0.3) }], 0)).toBe(false); // a body width away
    expect(isCrowded([{ box: me }, { box: box(0.45, 0.85, 0.12, 0.1) }], 0)).toBe(false); // not at the same height
  });
});

/**
 * A synthetic dance: 5 dancers in a line swaying, ours (the middle one) crosses with the next one twice, at
 * 40–43 s and back at 120–123 s. With `hideAt`, nobody sees our dancer for a second from then. The fake SinglePose
 * sees the person nearest the middle of its crop (as MoveNet does) and returns the span of their points; the fake
 * MultiPose sees everyone, with the tracker's ids.
 */
function dance(hideAt: number | null = null) {
  const length = 180;
  const bases = [0.1, 0.27, 0.44, 0.61, 0.78];
  const swap = (t: number) =>
    t < 40 ? 0 : t < 43 ? (t - 40) / 3 : t < 120 ? 1 : t < 123 ? 1 - (t - 120) / 3 : 0;
  const at = (i: number, t: number): Box | null => {
    let x = bases[i]!;
    if (i === 2) x = bases[2]! + (bases[3]! - bases[2]!) * swap(t);
    if (i === 3) x = bases[3]! + (bases[2]! - bases[3]!) * swap(t);
    x += 0.04 * Math.sin(t * 0.9 + i);
    if (i === 2 && hideAt != null && t >= hideAt && t < hideAt + 1) return null;
    return box(x, 0.3 + 0.02 * Math.sin(t * 2 + i));
  };
  return { length, at };
}

type Scene = ReturnType<typeof dance>;

function fakeDetectors(scene: Scene, t: () => number): Detectors {
  const shrink = (b: Box): Box => ({
    x: b.x + b.w * 0.07,
    y: b.y + b.h * 0.07,
    w: b.w / 1.15,
    h: b.h / 1.12,
  });
  return {
    async multi() {
      const out: Candidate[] = [];
      for (let i = 0; i < 5; i++) {
        const b = scene.at(i, t());
        if (b) out.push({ box: b, id: i + 1, kp: shrink(b) });
      }
      return out;
    },
    async single(crop) {
      const cx = (crop.x + crop.size / 2) / FRAME.width;
      const cy = (crop.y + crop.size / 2) / FRAME.height;
      let best: Box | null = null;
      let bestD = Infinity;
      for (let i = 0; i < 5; i++) {
        const b = scene.at(i, t());
        if (!b) continue;
        const c = centreOf(b);
        const inside =
          c.x * FRAME.width > crop.x &&
          c.x * FRAME.width < crop.x + crop.size &&
          c.y * FRAME.height > crop.y &&
          c.y * FRAME.height < crop.y + crop.size;
        const d = Math.hypot(c.x - cx, c.y - cy);
        if (inside && d < bestD) {
          bestD = d;
          best = b;
        }
      }
      return best ? shrink(best) : null;
    },
  };
}

/** Share of the frames with a box where it sits on the right dancer (centre within a third of their width). */
function judge(scene: Scene) {
  let right = 0;
  let judged = 0;
  return {
    add(t: number, k: readonly number[] | null) {
      const real = scene.at(2, t);
      if (!k || !real) return;
      judged++;
      if (Math.abs(k[1]! + k[3]! / 2 - centreOf(real).x) < 0.04) right++;
    },
    get share() {
      return judged ? right / judged : 0;
    },
  };
}

/** The new way: 4 frames a second, the crop when it can. */
async function followNew(scene: Scene) {
  let now = 0;
  const detectors = fakeDetectors(scene, () => now);
  const tracker = createOnlineTracker({ start: scene.at(2, 0)!, startId: 3, startT: 0, frame: FRAME });
  const score = judge(scene);
  for (let i = 1; i <= scene.length * 4; i++) {
    now = i / 4;
    score.add(now, (await tracker.step(now, detectors)).keyframe);
  }
  return { share: score.share, ...tracker.stats };
}

/** The way before: 6 frames a second (a 3-min song), the whole picture every time. */
async function followOld(scene: Scene) {
  let now = 0;
  const detectors = fakeDetectors(scene, () => now);
  const follower = createFollower(scene.at(2, 0)!, 3, 0);
  const score = judge(scene);
  for (let i = 1; i <= scene.length * 6; i++) {
    now = i / 6;
    score.add(now, follower.step(now, await detectors.multi()).keyframe);
  }
  return { share: score.share, frames: scene.length * 6 };
}

describe('following a whole dance with the crop', () => {
  it('keeps the same dancer through two crossings, looking at the whole picture only now and then', async () => {
    const run = await followNew(dance());
    expect(run.frames).toBe(720);
    expect(run.share).toBeGreaterThan(0.98);
    // Most frames only need the crop: before this change every frame went through the whole picture.
    expect(run.multi / run.frames).toBeLessThan(0.4);
    expect(run.cropOnly / run.frames).toBeGreaterThan(0.6);
  });

  it('is never worse than looking at the whole picture every frame, even when the dancer disappears', async () => {
    // Hidden for a second at 20 s or 90 s: the neighbour is not taken for them. Hidden in the middle of a crossing
    // (41 s) neither way can tell who is who afterwards: that is what «Corregir desde aquí» is for.
    for (const hideAt of [null, 20, 41, 90]) {
      const scene = dance(hideAt);
      const fresh = await followNew(scene);
      const old = await followOld(scene);
      expect(fresh.share).toBeGreaterThanOrEqual(old.share - 0.01);
      if (hideAt !== 41) expect(fresh.share).toBeGreaterThan(0.98);
      // 720 frames instead of 1080, most of them on the small crop.
      expect(fresh.frames).toBeLessThan(old.frames * 0.7);
    }
  });
});
