/**
 * F10 · Seguir a un bailarín. Pure rules for a «recorrido»: where one dancer is over time, as keyframes
 * [seconds, x, y, w, h] with the box in fractions of the picture (0…1, top-left corner and size), sorted by time.
 * No DOM and no model here: the analysis (MoveNet) feeds these functions with the people it sees in each frame, and
 * the studio turns the result into the F9 zoom. The tests share them.
 */
import type { FollowKeyframe } from '@coverscape/shared';
import {
  clampZoom,
  contentBox,
  mirrorZoom,
  NO_ZOOM,
  unmirror,
  zoomInBox,
  type Pt,
  type Size,
  type Zoom,
} from '@/player/zoom';

export type { FollowKeyframe };

/** A box in the picture's own fractions: top-left corner and size. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A person seen in one frame: their box and, with MoveNet's tracker, an id kept from frame to frame. */
export interface Candidate {
  box: Box;
  id?: number | null;
  score?: number;
}

/** What the user chose on the paused video: a tap on the dancer, or a box drawn around them. */
export type FollowPick = { point: { x: number; y: number } } | { box: Box };

/** Database limit (`follow_paths_keyframes_shape`): 600 KB; we stay well under it. */
export const FOLLOW_MAX_BYTES = 600_000;
export const FOLLOW_BUDGET_BYTES = 480_000;
/** Same as the database: a label of 1–40 characters. */
export const FOLLOW_LABEL_MAX = 40;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const round = (v: number, places: number) => {
  const k = 10 ** places;
  return Math.round(v * k) / k;
};

// ───────────── Reading what the database holds ─────────────

/** Anything odd is dropped: rows with five finite numbers, boxes inside the picture, sorted, one per moment. */
export function parseKeyframes(raw: unknown): FollowKeyframe[] {
  if (!Array.isArray(raw)) return [];
  const out: FollowKeyframe[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const [t, x, y, w, h] = row.slice(0, 5).map(Number) as [number, number, number, number, number];
    if (![t, x, y, w, h].every(Number.isFinite) || t < 0 || !(w > 0) || !(h > 0)) continue;
    out.push(fitKeyframe([t, x, y, w, h]));
  }
  return normalizeKeyframes(out);
}

/** The box held inside the picture (size up to the whole frame). */
function fitKeyframe([t, x, y, w, h]: FollowKeyframe): FollowKeyframe {
  const fw = clamp(w, 0.005, 1);
  const fh = clamp(h, 0.005, 1);
  return [Math.max(0, t), clamp(x, 0, 1 - fw), clamp(y, 0, 1 - fh), fw, fh];
}

/** Sorted by time; two keyframes at the same moment (1 ms): the later one wins. */
export function normalizeKeyframes(kfs: readonly FollowKeyframe[]): FollowKeyframe[] {
  const sorted = kfs.map((k, i) => ({ k, i })).sort((a, b) => a.k[0] - b.k[0] || a.i - b.i);
  const out: FollowKeyframe[] = [];
  for (const { k } of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0] - k[0]) < 0.001) out[out.length - 1] = k;
    else out.push(k);
  }
  return out;
}

export const boxOf = (k: FollowKeyframe): Box => ({ x: k[1], y: k[2], w: k[3], h: k[4] });
export const keyframe = (t: number, b: Box): FollowKeyframe => fitKeyframe([t, b.x, b.y, b.w, b.h]);
export const centreOf = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

// ───────────── Where the dancer is at a moment ─────────────

function search(kfs: readonly FollowKeyframe[], t: number): number {
  // First index whose time is > t.
  let lo = 0;
  let hi = kfs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (kfs[mid]![0] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The box at `t`: a smooth curve through the keyframes (the centre glides, no corner at each point; a cubic whose
 * slopes come from the neighbours, in seconds, so uneven gaps keep an even speed) and the size in a straight line
 * between them. Before the first or after the last keyframe the box stays where it was.
 */
export function boxAt(kfs: readonly FollowKeyframe[], t: number): Box | null {
  if (!kfs.length || !Number.isFinite(t)) return null;
  const i = search(kfs, t);
  if (i === 0) return boxOf(kfs[0]!);
  if (i >= kfs.length) return boxOf(kfs[kfs.length - 1]!);
  const a = kfs[i - 1]!;
  const b = kfs[i]!;
  const span = b[0] - a[0];
  const u = span > 0 ? clamp((t - a[0]) / span, 0, 1) : 1;
  const prev = kfs[i - 2];
  const next = kfs[i + 1];
  const cx = (k: FollowKeyframe) => k[1] + k[3] / 2;
  const cy = (k: FollowKeyframe) => k[2] + k[4] / 2;
  const w = a[3] + (b[3] - a[3]) * u;
  const h = a[4] + (b[4] - a[4]) * u;
  const slope = (p: FollowKeyframe, q: FollowKeyframe, f: (k: FollowKeyframe) => number) =>
    q[0] > p[0] ? (f(q) - f(p)) / (q[0] - p[0]) : 0;
  const hermite = (f: (k: FollowKeyframe) => number) => {
    const ma = prev ? slope(prev, b, f) : slope(a, b, f);
    const mb = next ? slope(a, next, f) : slope(a, b, f);
    const u2 = u * u;
    const u3 = u2 * u;
    const v =
      (2 * u3 - 3 * u2 + 1) * f(a) +
      (u3 - 2 * u2 + u) * span * ma +
      (-2 * u3 + 3 * u2) * f(b) +
      (u3 - u2) * span * mb;
    // The curve may overshoot a little around a turn: never past the two keyframes' own range.
    return clamp(v, Math.min(f(a), f(b)), Math.max(f(a), f(b)));
  };
  const x = hermite(cx);
  const y = hermite(cy);
  return { x: x - w / 2, y: y - h / 2, w, h };
}

/** Jitter out: each box becomes a weighted average of its neighbours (±`radius` keyframes); times stay. */
export function smoothKeyframes(kfs: readonly FollowKeyframe[], radius = 2): FollowKeyframe[] {
  if (kfs.length < 3 || radius < 1) return kfs.slice();
  return kfs.map((k, i) => {
    let sw = 0;
    const acc = [0, 0, 0, 0];
    for (let d = -radius; d <= radius; d++) {
      const n = kfs[i + d];
      if (!n) continue;
      const weight = radius + 1 - Math.abs(d);
      // Centres are averaged (not corners), so a box that grows doesn't drift.
      acc[0]! += (n[1] + n[3] / 2) * weight;
      acc[1]! += (n[2] + n[4] / 2) * weight;
      acc[2]! += n[3] * weight;
      acc[3]! += n[4] * weight;
      sw += weight;
    }
    const w = round(acc[2]! / sw, 6);
    const h = round(acc[3]! / sw, 6);
    return fitKeyframe([k[0], round(acc[0]! / sw - w / 2, 6), round(acc[1]! / sw - h / 2, 6), w, h]);
  });
}

// ───────────── Who is who between frames ─────────────

export function iou(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

export function centreDistance(a: Box, b: Box): number {
  const ca = centreOf(a);
  const cb = centreOf(b);
  return Math.hypot(ca.x - cb.x, ca.y - cb.y);
}

const contains = (b: Box, p: { x: number; y: number }, margin = 0) =>
  p.x >= b.x - b.w * margin &&
  p.x <= b.x + b.w * (1 + margin) &&
  p.y >= b.y - b.h * margin &&
  p.y <= b.y + b.h * (1 + margin);

/**
 * Which of the people seen is the one the user chose. A tap: the person whose box holds it (the closest centre if
 * several overlap), or else the nearest within a short reach. A drawn box: the person that clearly overlaps it.
 * Null: nobody there (a drawn box is then followed as drawn).
 */
export function pickCandidate(candidates: readonly Candidate[], pick: FollowPick): number | null {
  if (!candidates.length) return null;
  if ('point' in pick) {
    const p = pick.point;
    let best: number | null = null;
    let bestScore = Infinity;
    candidates.forEach((c, i) => {
      if (!contains(c.box, p, 0.1)) return;
      const cc = centreOf(c.box);
      // Normalised by the box: a tap in the middle of a small person beats the edge of a big one.
      const score = Math.hypot((p.x - cc.x) / c.box.w, (p.y - cc.y) / c.box.h);
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best != null) return best;
    let nearest: number | null = null;
    let nearestD = 0.12;
    candidates.forEach((c, i) => {
      const cc = centreOf(c.box);
      const d = Math.hypot(p.x - cc.x, p.y - cc.y);
      if (d < nearestD) {
        nearestD = d;
        nearest = i;
      }
    });
    return nearest;
  }
  // A drawn box means «this one», even where the model sees nobody: only a clear overlap snaps it to a person.
  const target = pick.box;
  let best: number | null = null;
  let bestIou = 0.3;
  candidates.forEach((c, i) => {
    const o = iou(c.box, target);
    if (o >= bestIou) {
      bestIou = o;
      best = i;
    }
  });
  return best;
}

/**
 * The same dancer in the next frame, from where they are expected to be (`prev`). Only people of a similar size
 * count (a crossing dancer of another height is not them), unless they overlap a lot; among them, the closest, with
 * the overlap and the tracker's id (it can jump to someone else after a crossing, so it only tips the balance).
 * The search widens slowly with the seconds the dancer has not been seen. Null: not seen in this frame.
 */
export function associate(
  prev: Box,
  prevId: number | null | undefined,
  candidates: readonly Candidate[],
  lostSeconds = 0,
): number | null {
  if (!candidates.length) return null;
  const size = Math.max(prev.w, prev.h) || 0.01;
  // Someone hidden behind another dancer comes back about where they were: the reach grows only a little.
  const reach = Math.min(1.1, 0.6 + 0.25 * Math.max(0, lostSeconds));
  let best: number | null = null;
  let bestCost = Infinity;
  candidates.forEach((c, i) => {
    const o = iou(prev, c.box);
    const hr = c.box.h / (prev.h || 0.01);
    const wr = c.box.w / (prev.w || 0.01);
    const similar = hr >= 0.72 && hr <= 1.38 && wr >= 0.5 && wr <= 2;
    if (!similar && !(o >= 0.5 && hr >= 0.45 && hr <= 2.2)) return;
    const d = centreDistance(prev, c.box) / size;
    const same = prevId != null && c.id === prevId;
    if (o < 0.2 && d > reach + (same ? 0.6 : 0)) return;
    const cost = d - o - (same ? 0.15 : 0);
    if (cost < bestCost) {
      bestCost = cost;
      best = i;
    }
  });
  return best;
}

/** Fastest believable move of a dancer across the picture: a whole frame width in under 2 s. */
const MAX_SPEED = 0.6;

/**
 * Follows one dancer frame after frame, in either direction of time (`startT`: the moment they were chosen). While
 * they are not seen, the search looks where they were heading (their speed, for up to 1.5 s). Only frames where
 * they are seen give a keyframe: the gaps are glided over by the interpolation.
 */
export function createFollower(start: Box, startId?: number | null, startT?: number) {
  let last = start;
  let lastT: number | null = startT ?? null;
  let id = startId ?? null;
  let vx = 0;
  let vy = 0;
  let moved = false;
  return {
    step(t: number, candidates: readonly Candidate[]): { keyframe: FollowKeyframe | null; found: boolean } {
      const dt = lastT == null ? 0 : t - lastT;
      const ahead = Math.sign(dt) * Math.min(Math.abs(dt), 1.5);
      const expected: Box = {
        ...last,
        x: clamp(last.x + vx * ahead, 0, Math.max(0, 1 - last.w)),
        y: clamp(last.y + vy * ahead, 0, Math.max(0, 1 - last.h)),
      };
      const i = associate(expected, id, candidates, Math.max(0, Math.abs(dt) - 0.25));
      if (i == null) return { keyframe: null, found: false };
      const c = candidates[i]!;
      if (lastT != null && dt !== 0) {
        const nx = clamp((centreOf(c.box).x - centreOf(last).x) / dt, -MAX_SPEED, MAX_SPEED);
        const ny = clamp((centreOf(c.box).y - centreOf(last).y) / dt, -MAX_SPEED, MAX_SPEED);
        // The first measured move is taken as is; after that, half old, half new (steady, but quick to turn).
        vx = moved ? vx * 0.5 + nx * 0.5 : nx;
        vy = moved ? vy * 0.5 + ny * 0.5 : ny;
        moved = true;
      }
      last = c.box;
      lastT = t;
      if (c.id != null) id = c.id;
      return { keyframe: keyframe(t, c.box), found: true };
    },
    get box() {
      return last;
    },
  };
}

/** A whole sequence at once (the analysis does the same frame by frame): the keyframes where the dancer was seen. */
export function followSequence(
  frames: readonly { t: number; candidates: readonly Candidate[] }[],
  start: Box,
  startId?: number | null,
  startT?: number,
): FollowKeyframe[] {
  const follower = createFollower(start, startId, startT ?? frames[0]?.t);
  const out: FollowKeyframe[] = [];
  for (const f of frames) {
    const k = follower.step(f.t, f.candidates).keyframe;
    if (k) out.push(k);
  }
  return out;
}

/** People seen at one moment of the analysis pass. */
export interface Sample {
  t: number;
  candidates: readonly Candidate[];
}

/**
 * The whole path from one pass over the video: from the chosen moment `at` forwards and (with `both`) backwards,
 * each way with its own follower. The ids in the samples come from another tracker session than the choice, so
 * the first sample next to `at` that clearly overlaps the chosen box gives the id to start with.
 */
export function followAround(
  samples: readonly Sample[],
  at: number,
  start: Box,
  both: boolean,
): { keyframes: FollowKeyframe[]; frames: number; seen: number } {
  const ahead = samples.filter((s) => s.t > at + 0.001).sort((a, b) => a.t - b.t);
  const behind = both ? samples.filter((s) => s.t < at - 0.001).sort((a, b) => b.t - a.t) : [];
  const seedId = (list: readonly Sample[]) => {
    const first = list[0];
    if (!first || Math.abs(first.t - at) > 0.5) return null;
    let id: number | null = null;
    let best = 0.3;
    for (const c of first.candidates) {
      const o = iou(c.box, start);
      if (o > best) {
        best = o;
        id = c.id ?? null;
      }
    }
    return id;
  };
  const run = (list: readonly Sample[]) => {
    const follower = createFollower(start, seedId(list), at);
    const out: FollowKeyframe[] = [];
    for (const s of list) {
      const k = follower.step(s.t, s.candidates).keyframe;
      if (k) out.push(k);
    }
    return out;
  };
  const forward = run(ahead);
  const backward = run(behind);
  return {
    keyframes: normalizeKeyframes([...backward.reverse(), keyframe(at, start), ...forward]),
    frames: ahead.length + behind.length + 1,
    seen: forward.length + backward.length + 1,
  };
}

/** The frame times to analyse from `from` towards `to` (either way), every 1/fps s, ending on `to`. */
export function sampleTimes(from: number, to: number, fps: number): number[] {
  if (!(fps > 0) || !Number.isFinite(from) || !Number.isFinite(to) || from === to) return [];
  const step = 1 / fps;
  const dir = to > from ? 1 : -1;
  const n = Math.floor(Math.abs(to - from) / step + 1e-9);
  const out: number[] = [];
  for (let i = 1; i <= n; i++) out.push(round(from + dir * i * step, 3));
  if (!out.length || Math.abs(out[out.length - 1]! - to) > 1e-3) out.push(round(to, 3));
  return out;
}

// ───────────── Corrections and the manual mode ─────────────

/** «Recalcular desde aquí»: what was before `from` stays; from there on, the fresh keyframes. */
export function spliceFrom(
  old: readonly FollowKeyframe[],
  from: number,
  fresh: readonly FollowKeyframe[],
): FollowKeyframe[] {
  const keep = old.filter((k) => k[0] < from - 0.001);
  const next = fresh.filter((k) => k[0] >= from - 0.001);
  return normalizeKeyframes([...keep, ...next]);
}

/** Manual mode: the box placed at `t` (replaces one placed within `window` seconds). */
export function upsertKeyframe(
  kfs: readonly FollowKeyframe[],
  t: number,
  box: Box,
  window = 0.25,
): FollowKeyframe[] {
  const rest = kfs.filter((k) => Math.abs(k[0] - t) > window);
  return normalizeKeyframes([...rest, keyframe(round(t, 2), box)]);
}

/** Manual mode: takes away the point placed near `t` (none: unchanged). */
export function removeKeyframeNear(
  kfs: readonly FollowKeyframe[],
  t: number,
  window = 0.25,
): FollowKeyframe[] {
  let best = -1;
  let bestD = window;
  kfs.forEach((k, i) => {
    const d = Math.abs(k[0] - t);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  return best < 0 ? kfs.slice() : kfs.filter((_, i) => i !== best);
}

/** The box drawn between two points (picture fractions); a tap (tiny drag) gets a body-sized box around it. */
export function boxFromDrag(a: { x: number; y: number }, b: { x: number; y: number }): Box {
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);
  if (w < 0.03 || h < 0.03) {
    const bw = 0.16;
    const bh = 0.5;
    return { x: clamp(b.x - bw / 2, 0, 1 - bw), y: clamp(b.y - bh / 2, 0, 1 - bh), w: bw, h: bh };
  }
  const x = round(clamp01(Math.min(a.x, b.x)), 4);
  const y = round(clamp01(Math.min(a.y, b.y)), 4);
  return { x, y, w: round(Math.min(w, 1 - x), 4), h: round(Math.min(h, 1 - y), 4) };
}

// ───────────── Size in the database ─────────────

/** A conservative guess of the jsonb size (each number ~12 bytes plus the row's own overhead). */
export function estimateBytes(kfs: readonly FollowKeyframe[]): number {
  return 32 + kfs.length * 80;
}

function simplify(kfs: readonly FollowKeyframe[], tol: number, maxGap: number): FollowKeyframe[] {
  if (kfs.length <= 2) return kfs.slice();
  const out: FollowKeyframe[] = [kfs[0]!];
  let anchor = 0;
  for (let i = 2; i <= kfs.length; i++) {
    // Can every point between the anchor and i be drawn as a straight line from anchor to i?
    const end = Math.min(i, kfs.length - 1);
    const a = kfs[anchor]!;
    const b = kfs[end]!;
    let fits = i < kfs.length && b[0] - a[0] <= maxGap && end - anchor <= 60;
    for (let j = anchor + 1; fits && j < end; j++) {
      const k = kfs[j]!;
      const u = (k[0] - a[0]) / (b[0] - a[0] || 1);
      for (let c = 1; c <= 4; c++) {
        if (Math.abs(a[c]! + (b[c]! - a[c]!) * u - k[c]!) > tol) {
          fits = false;
          break;
        }
      }
    }
    if (!fits && anchor !== i - 1) {
      out.push(kfs[i - 1]!);
      anchor = i - 1;
    }
  }
  const last = kfs[kfs.length - 1]!;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/**
 * Manual mode, ready to save: only rounded and one per moment. Every point stays (a person placed it, and there are
 * few), even one that lies on the line between its neighbours.
 */
export function cleanManualKeyframes(kfs: readonly FollowKeyframe[]): FollowKeyframe[] {
  return normalizeKeyframes(
    kfs
      .map((k) => fitKeyframe(k))
      .map(
        (k) =>
          [round(k[0], 2), round(k[1], 3), round(k[2], 3), round(k[3], 3), round(k[4], 3)] as FollowKeyframe,
      ),
  );
}

/**
 * Ready to save an analysed path: rounded (time to 1/100 s, boxes to 1/1000 of the frame), points that a straight
 * line already gives dropped, and coarser and coarser until it fits `maxBytes` (well under the database's 600 KB).
 * Not for manual paths (see cleanManualKeyframes).
 */
export function compressKeyframes(
  kfs: readonly FollowKeyframe[],
  maxBytes = FOLLOW_BUDGET_BYTES,
): FollowKeyframe[] {
  const rounded = normalizeKeyframes(
    kfs
      .map((k) => fitKeyframe(k))
      .map(
        (k) =>
          [round(k[0], 2), round(k[1], 3), round(k[2], 3), round(k[3], 3), round(k[4], 3)] as FollowKeyframe,
      ),
  );
  let tol = 0.002;
  let out = simplify(rounded, tol, 4);
  while (estimateBytes(out) > maxBytes && tol < 0.05) {
    tol *= 2;
    out = simplify(rounded, tol, 8);
  }
  if (estimateBytes(out) > maxBytes) {
    // Still too long (hours of video): keep every n-th point.
    const room = Math.max(2, Math.floor((maxBytes - 32) / 80));
    const every = Math.ceil(out.length / room);
    out = out.filter((_, i) => i % every === 0 || i === out.length - 1);
  }
  return out;
}

// ───────────── From the path to the zoom (F9) ─────────────

/**
 * How close the zoom goes for this dancer: their height about 70 % of the view (and the width never cut), one
 * scale for the whole path so the picture doesn't breathe in and out. Taken on the larger boxes (80th
 * percentile), so jumping or crouching keeps them in view.
 */
export function pathScale(kfs: readonly FollowKeyframe[], fill = 0.7): number {
  if (!kfs.length) return 2;
  const pct = (values: number[]) => {
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.8))]!;
  };
  const h = pct(kfs.map((k) => k[4]));
  const w = pct(kfs.map((k) => k[3]));
  const s = Math.min(fill / Math.max(h, 0.01), 0.85 / Math.max(w, 0.01));
  return round(clamp(s, 1.2, 3.5), 2);
}

/**
 * The zoom that follows the dancer at `t`, in the picture's fractions (the studio's zoom layer sits inside the
 * mirror, so it needs no flip). `mirroredOutside`: for a layer outside the mirror (the review's «Superpuesto»),
 * the zoom as seen on the flipped screen.
 */
export function followZoomAt(
  kfs: readonly FollowKeyframe[],
  t: number,
  opts: { scale?: number; mirroredOutside?: boolean } = {},
): Zoom {
  const b = boxAt(kfs, t);
  if (!b) return NO_ZOOM;
  const c = centreOf(b);
  const zoom = clampZoom({ scale: opts.scale ?? pathScale(kfs), x: c.x, y: c.y });
  return mirrorZoom(zoom, Boolean(opts.mirroredOutside));
}

/** A point on the stage (px in its box) as a point of the picture (fractions; outside 0…1: on the black bars). */
export function screenToPicture(
  p: Pt,
  zoom: Zoom,
  stage: Size,
  media: Size | null | undefined,
  mirrored: boolean,
): { x: number; y: number } {
  const q = unmirror(p, stage, mirrored);
  const { scale, cx, cy } = zoomInBox(zoom, stage, media);
  const lx = cx + (q.x - stage.width / 2) / scale;
  const ly = cy + (q.y - stage.height / 2) / scale;
  const c = contentBox(stage, media);
  return { x: c.width > 0 ? (lx - c.left) / c.width : 0.5, y: c.height > 0 ? (ly - c.top) / c.height : 0.5 };
}

/** A box of the picture as drawn on the stage (px), with the zoom and the mirror applied. */
export function pictureToScreen(
  b: Box,
  zoom: Zoom,
  stage: Size,
  media: Size | null | undefined,
  mirrored: boolean,
): { left: number; top: number; width: number; height: number } {
  const c = contentBox(stage, media);
  const { scale, cx, cy } = zoomInBox(zoom, stage, media);
  const lx = c.left + b.x * c.width;
  const ly = c.top + b.y * c.height;
  const left = (lx - cx) * scale + stage.width / 2;
  const top = (ly - cy) * scale + stage.height / 2;
  const width = b.w * c.width * scale;
  const height = b.h * c.height * scale;
  return { left: mirrored ? stage.width - left - width : left, top, width, height };
}

/** «Siguiendo a Minji» when the label is clear; the label alone otherwise. */
export function followLabel(label: string): string {
  return label.trim().slice(0, FOLLOW_LABEL_MAX) || 'Bailarín';
}
