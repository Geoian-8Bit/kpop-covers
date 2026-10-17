/**
 * 15 · Following the dancer cheaply, frame by frame. Once they are known, only a small square around them is
 * looked at with MoveNet SinglePose Lightning (much faster than MultiPose on the whole picture, and it prefers the
 * person in the middle of what it is given). The whole picture goes back to MultiPose when that crop loses them,
 * when someone else is right next to them (a crossing: the crop could pick the other one), and every 1.5 s anyway,
 * to check. Pure rules: the models come in as functions, so the tests can play a whole dance without them.
 */
import { centreOf, createFollower, type Box, type Candidate, type FollowKeyframe } from './followPath';

export interface Size {
  width: number;
  height: number;
}

/** A square of the frame in pixels (it may stick out of the picture: that part is black). */
export interface Crop {
  x: number;
  y: number;
  size: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** The square around a box (frame fractions), `pad` times its longer side, never smaller than 48 px. */
export function cropAround(box: Box, frame: Size, pad = 1.4): Crop {
  const bw = box.w * frame.width;
  const bh = box.h * frame.height;
  const size = clamp(Math.max(bw, bh) * pad, 48, Math.max(frame.width, frame.height) * 1.2);
  const c = centreOf(box);
  return { x: c.x * frame.width - size / 2, y: c.y * frame.height - size / 2, size };
}

/**
 * The drawImage arguments for a crop on an `input`-pixel square canvas: only the part inside the frame is copied,
 * at the place and scale it has in the crop (the rest stays black). Null: the crop misses the frame.
 */
export function cropDraw(
  crop: Crop,
  frame: Size,
  input: number,
): { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number } | null {
  const sx = Math.max(0, crop.x);
  const sy = Math.max(0, crop.y);
  const ex = Math.min(frame.width, crop.x + crop.size);
  const ey = Math.min(frame.height, crop.y + crop.size);
  if (!(ex - sx > 1) || !(ey - sy > 1) || !(crop.size > 0)) return null;
  const k = input / crop.size;
  return {
    sx,
    sy,
    sw: ex - sx,
    sh: ey - sy,
    dx: (sx - crop.x) * k,
    dy: (sy - crop.y) * k,
    dw: (ex - sx) * k,
    dh: (ey - sy) * k,
  };
}

/** A rectangle on the crop's canvas, in its pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Someone else to cover in the crop: where they should be now, and how long ago they were seen (s). */
export interface MaskBox {
  box: Box;
  age: number;
}

/** Room left uncovered on each side of our dancer, in their widths (a faster move, an arm out)… */
export const MASK_MARGIN = 0.15;
/** …and more for each second since that other was seen (they may have come closer than their box says). */
export const MASK_MARGIN_PER_S = 0.4;

/**
 * 15 · The others inside the crop, to paint black before SinglePose looks (it could take the neighbour, or mix
 * their arms with ours). Only the part of each one outside our dancer's own width and a margin is covered (never our
 * dancer; the margin grows with how long ago that other was seen), a little taller than their box (hair, raised
 * hands). In the crop canvas's pixels (`input` square).
 */
export function cropMasks(
  crop: Crop,
  others: readonly MaskBox[],
  dancer: Box,
  frame: Size,
  input: number,
): Rect[] {
  const k = input / (crop.size || 1);
  const dc = (dancer.x + dancer.w / 2) * frame.width;
  const out: Rect[] = [];
  for (const { box: o, age } of others) {
    const margin = MASK_MARGIN + MASK_MARGIN_PER_S * Math.max(0, age);
    const ex0 = (dancer.x - dancer.w * margin) * frame.width;
    const ex1 = (dancer.x + dancer.w * (1 + margin)) * frame.width;
    let x0 = (o.x - o.w * 0.1) * frame.width;
    let x1 = (o.x + o.w * 1.1) * frame.width;
    const y0 = (o.y - o.h * 0.1) * frame.height;
    const y1 = (o.y + o.h * 1.1) * frame.height;
    const oc = (o.x + o.w / 2) * frame.width;
    if (oc < dc) x1 = Math.min(x1, ex0);
    else x0 = Math.max(x0, ex1);
    // Into the crop's canvas, clipped to it.
    const cx0 = clamp((x0 - crop.x) * k, 0, input);
    const cx1 = clamp((x1 - crop.x) * k, 0, input);
    const cy0 = clamp((y0 - crop.y) * k, 0, input);
    const cy1 = clamp((y1 - crop.y) * k, 0, input);
    if (cx1 - cx0 >= 2 && cy1 - cy0 >= 2) out.push({ x: cx0, y: cy0, w: cx1 - cx0, h: cy1 - cy0 });
  }
  return out;
}

/** 15 · A crop's box this much wider than expected took in a neighbour (or mixed two people): not trusted. */
export const MAX_CROP_WIDEN = 1.4;

export interface Keypoint {
  x: number;
  y: number;
  score?: number;
}

/** MoveNet's 17 points: 5–6 are the shoulders, 11–12 the hips. */
const SHOULDERS = [5, 6];
const HIPS = [11, 12];

/**
 * The person a single-pose run saw, as a box of the frame (fractions), from the points it is sure of. Null when it
 * is not a clear person: too few points, or no shoulder or no hip (a hand or a head at the edge of the crop).
 */
export function keypointBox(
  keypoints: readonly Keypoint[],
  crop: Crop,
  input: number,
  frame: Size,
  minScore = 0.3,
): Box | null {
  const ok = (k: Keypoint | undefined) => k != null && (k.score ?? 0) >= minScore;
  const sure = keypoints.filter(ok);
  if (sure.length < 6) return null;
  if (!SHOULDERS.some((i) => ok(keypoints[i])) || !HIPS.some((i) => ok(keypoints[i]))) return null;
  const k = crop.size / input;
  const xs = sure.map((p) => (crop.x + p.x * k) / frame.width);
  const ys = sure.map((p) => (crop.y + p.y * k) / frame.height);
  const x0 = clamp(Math.min(...xs), 0, 1);
  const y0 = clamp(Math.min(...ys), 0, 1);
  const x1 = clamp(Math.max(...xs), 0, 1);
  const y1 = clamp(Math.max(...ys), 0, 1);
  if (!(x1 - x0 > 0.003) || !(y1 - y0 > 0.01)) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** A box from points (fractions of the frame `size`, in px) with a confident score; null when fewer than 4. */
export function pointsBox(keypoints: readonly Keypoint[], size: Size, minScore = 0.3): Box | null {
  const sure = keypoints.filter((k) => (k.score ?? 0) >= minScore);
  if (sure.length < 4 || !(size.width > 0) || !(size.height > 0)) return null;
  const xs = sure.map((k) => k.x / size.width);
  const ys = sure.map((k) => k.y / size.height);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
}

// ───────────── Same size of box from both models ─────────────

/**
 * How MultiPose's own box sits around the span of the points (the points miss the top of the head and the feet).
 * Learned on each MultiPose frame where the dancer is found, so single-pose boxes come out the same size: the zoom
 * doesn't breathe when the analysis switches model.
 */
export interface Calibration {
  /** Centre offset, in units of the points' box. */
  dx: number;
  dy: number;
  /** Size ratios. */
  sw: number;
  sh: number;
}

export const DEFAULT_CALIBRATION: Calibration = { dx: 0, dy: -0.02, sw: 1.15, sh: 1.12 };

export function learnCalibration(prev: Calibration, kp: Box, model: Box, weight = 0.4): Calibration {
  if (!(kp.w > 0.005) || !(kp.h > 0.02)) return prev;
  const ck = centreOf(kp);
  const cm = centreOf(model);
  const seen: Calibration = {
    dx: clamp((cm.x - ck.x) / kp.w, -0.3, 0.3),
    dy: clamp((cm.y - ck.y) / kp.h, -0.3, 0.3),
    sw: clamp(model.w / kp.w, 0.9, 1.8),
    sh: clamp(model.h / kp.h, 0.9, 1.5),
  };
  const mix = (a: number, b: number) => a * (1 - weight) + b * weight;
  return {
    dx: mix(prev.dx, seen.dx),
    dy: mix(prev.dy, seen.dy),
    sw: mix(prev.sw, seen.sw),
    sh: mix(prev.sh, seen.sh),
  };
}

export function applyCalibration(kp: Box, c: Calibration): Box {
  const ck = centreOf(kp);
  const w = Math.min(1, kp.w * c.sw);
  const h = Math.min(1, kp.h * c.sh);
  const cx = ck.x + c.dx * kp.w;
  const cy = ck.y + c.dy * kp.h;
  const x = clamp(cx - w / 2, 0, 1 - w);
  const y = clamp(cy - h / 2, 0, 1 - h);
  return { x, y, w, h };
}

// ───────────── Which model for the next frame ─────────────

/** Someone else touching the dancer (boxes overlapping or a hair apart): a crop around them could catch the other one. */
export function isCrowded(candidates: readonly Candidate[], index: number): boolean {
  const me = candidates[index];
  if (!me) return false;
  const a = me.box;
  return candidates.some((c, i) => {
    if (i === index) return false;
    const b = c.box;
    const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
    const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return overlapY > 0.25 * Math.min(a.h, b.h) && gapX < 0.1 * a.w;
  });
}

export type ModelKind = 'single' | 'multi';

/** MultiPose after a loss or while crowded, and every `recheckEvery` frames; SinglePose on the crop otherwise. */
export function createModelChooser(recheckEvery = 6) {
  let since = Infinity;
  let needMulti = true;
  return {
    next(): ModelKind {
      return needMulti || since >= recheckEvery ? 'multi' : 'single';
    },
    afterMulti(r: { found: boolean; crowded: boolean }) {
      since = 0;
      needMulti = !r.found || r.crowded;
    },
    afterSingle(found: boolean) {
      since++;
      if (!found) needMulti = true;
    },
  };
}

// ───────────── The tracker ─────────────

export interface Detectors {
  /** Everyone in the whole frame (MultiPose; boxes in frame fractions, with their points' box when there is one). */
  multi(): Promise<Candidate[]>;
  /**
   * The person in this crop of the frame (SinglePose), as the box of their points; null when none is clear.
   * `masks`: the others' boxes (frame fractions) to cover first; `dancer`: where ours is expected (never covered).
   */
  single(crop: Crop, masks?: readonly MaskBox[], dancer?: Box): Promise<Box | null>;
  /**
   * 15 · SinglePose on the same frame MultiPose just saw (a copy taken when the frame came), to learn how one
   * model's box sits on the other's on one and the same picture. Optional: without it, MultiPose's own points.
   */
  calibrate?(crop: Crop, masks?: readonly MaskBox[], dancer?: Box): Promise<Box | null>;
}

export interface TrackStep {
  keyframe: FollowKeyframe | null;
  found: boolean;
  /** What looked at this frame: the crop alone, the whole picture, or the crop then the picture (it lost them). */
  used: 'single' | 'multi' | 'both';
}

/**
 * Follows the dancer forwards in time, deciding per frame which model looks. `start`: their box at `startT`
 * (where they were chosen, or where the previous stretch left them).
 */
export function createOnlineTracker(opts: {
  start: Box;
  startId?: number | null;
  startT: number;
  frame: Size;
  calibration?: Calibration;
  recheckEvery?: number;
}) {
  const follower = createFollower(opts.start, opts.startId, opts.startT);
  const chooser = createModelChooser(opts.recheckEvery);
  let calibration = opts.calibration ?? DEFAULT_CALIBRATION;
  /** single, multi: model runs; cropOnly: frames that only needed the crop; seen: frames that found the dancer. */
  const stats = { single: 0, multi: 0, cropOnly: 0, seen: 0, frames: 0 };

  async function whole(t: number, d: Detectors, first: boolean) {
    const candidates = await d.multi();
    stats.multi++;
    const r = follower.step(t, candidates);
    const c = r.index != null ? candidates[r.index] : undefined;
    const crowded = r.index != null && isCrowded(candidates, r.index);
    if (c && d.calibrate) {
      // Both models on the same picture (only when MultiPose looked first: the copy is of this frame).
      if (first && !crowded) {
        const kp = await d.calibrate(cropAround(c.box, opts.frame), follower.masksAt(t), c.box);
        if (kp) calibration = learnCalibration(calibration, kp, c.box);
      }
    } else if (c?.kp) {
      calibration = learnCalibration(calibration, c.kp, c.box);
    }
    chooser.afterMulti({ found: r.found, crowded });
    return r;
  }

  return {
    /** Which model will look at the next frame (the analysis takes a copy of it when it is the whole picture). */
    next: (): ModelKind => chooser.next(),
    async step(t: number, d: Detectors): Promise<TrackStep> {
      stats.frames++;
      let tried = false;
      if (chooser.next() === 'single') {
        tried = true;
        const expected = follower.expect(t);
        const kp = await d.single(cropAround(expected, opts.frame), follower.masksAt(t), expected);
        stats.single++;
        const seen = kp ? applyCalibration(kp, calibration) : null;
        // Much wider than the dancer: the crop took in a neighbour, or mixed two people.
        if (seen && seen.w <= expected.w * MAX_CROP_WIDEN) {
          const r = follower.step(t, [{ box: seen, id: null }], false);
          if (r.found) {
            chooser.afterSingle(true);
            stats.seen++;
            stats.cropOnly++;
            return { keyframe: r.keyframe, found: true, used: 'single' };
          }
        }
        chooser.afterSingle(false);
      }
      const r = await whole(t, d, !tried);
      if (r.found) stats.seen++;
      return { keyframe: r.keyframe, found: r.found, used: tried ? 'both' : 'multi' };
    },
    /** Where the dancer is expected at `t` (for the next stretch to start from). */
    expect: (t: number) => follower.expect(t),
    get box() {
      return follower.box;
    },
    get lastSeen() {
      return follower.lastSeen;
    },
    get calibration() {
      return calibration;
    },
    stats,
  };
}
