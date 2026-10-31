import type { FormationPath, FormationPathKind, StagePoint } from '@coverscape/shared';

/**
 * REQ-08 · Paths: how somebody travels from one formation to the next. Straight by default (no path); a curve with
 * one control point (an arc, quadratic Bézier) or two (cubic Bézier: arcs and S bends); several points passed through;
 * or a hand-drawn line, simplified. «Puntos» and «A mano» are walked as a smooth spline (centripetal Catmull–Rom) that
 * passes through every point, so a turn is a curve, never a corner. The path is stored in the destination formation
 * (`positions[memberId].path`) and its ends are always the two formations' positions, so moving a person never leaves a
 * path dangling.
 */

/** Control points of a `curve`: 1 = arc (quadratic), 2 = cubic (S bends). Old rows have 1. */
export const CURVE_POINTS_MAX = 2;
export const PATH_POINTS_MAX = 8;
export const FREE_POINTS_MAX = 40;
/** A drawn line shorter than this is a tap or a slip: it stays straight (REQ-08). */
export const MIN_STROKE = 0.5;
/** How far (metres) the simplified line may stray from the drawn one. */
export const SIMPLIFY_EPSILON = 0.12;

export type PathChoice = 'straight' | FormationPathKind;
/** The two shapes of a `curve`: one control point (arc) or two bending opposite ways (S). */
export type CurveShape = 'arc' | 's';

export const PATH_LABELS: Record<PathChoice, string> = {
  straight: 'Recto',
  curve: 'Curvo',
  points: 'Puntos',
  free: 'A mano',
};

interface Size {
  width: number;
  depth: number;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;
const dist = (a: StagePoint, b: StagePoint) => Math.hypot(a.x - b.x, a.y - b.y);
const inside = (p: StagePoint, s: Size): StagePoint => ({
  x: round3(Math.min(s.width, Math.max(0, p.x))),
  y: round3(Math.min(s.depth, Math.max(0, p.y))),
});

function lerp(a: StagePoint, b: StagePoint, p: number): StagePoint {
  return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
}

export function polylineLength(points: readonly StagePoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1]!, points[i]!);
  return total;
}

/** The point at fraction `p` (0–1) of a polyline's length. */
function alongPolyline(points: readonly StagePoint[], p: number): StagePoint {
  const total = polylineLength(points);
  if (points.length === 0) return { x: 0, y: 0 };
  if (total <= 1e-9) return { ...points[0]! };
  let left = Math.min(1, Math.max(0, p)) * total;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const d = dist(a, b);
    if (left <= d || i === points.length - 1) return lerp(a, b, d > 0 ? Math.min(1, left / d) : 1);
    left -= d;
  }
  return { ...points[points.length - 1]! };
}

function bezier(from: StagePoint, to: StagePoint, ctrl: readonly StagePoint[], t: number): StagePoint {
  const u = 1 - t;
  if (ctrl.length >= 2) {
    const a = ctrl[0]!;
    const b = ctrl[1]!;
    const w0 = u * u * u;
    const w1 = 3 * u * u * t;
    const w2 = 3 * u * t * t;
    const w3 = t * t * t;
    return { x: w0 * from.x + w1 * a.x + w2 * b.x + w3 * to.x, y: w0 * from.y + w1 * a.y + w2 * b.y + w3 * to.y };
  }
  const k = ctrl[0]!;
  return { x: u * u * from.x + 2 * u * t * k.x + t * t * to.x, y: u * u * from.y + 2 * u * t * k.y + t * t * to.y };
}

/** Centripetal Catmull–Rom knot step (never 0, so repeated points don't divide by zero). */
const knot = (a: StagePoint, b: StagePoint) => Math.max(1e-4, Math.sqrt(dist(a, b)));

function mix(a: StagePoint, b: StagePoint, ta: number, tb: number, t: number): StagePoint {
  const w = tb - ta > 1e-12 ? (t - ta) / (tb - ta) : 0;
  return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w };
}

/**
 * A smooth line through every point (centripetal Catmull–Rom: no loops nor wild overshoot with uneven spacing),
 * `steps` samples per stretch. The ends get a mirrored phantom neighbour, so the line leaves and arrives along its
 * first and last stretch.
 */
export function splineThrough(points: readonly StagePoint[], steps = 8): StagePoint[] {
  if (points.length < 3) return points.map((p) => ({ ...p }));
  const n = points.length;
  const first = points[0]!;
  const last = points[n - 1]!;
  const ext = [
    { x: 2 * first.x - points[1]!.x, y: 2 * first.y - points[1]!.y },
    ...points,
    { x: 2 * last.x - points[n - 2]!.x, y: 2 * last.y - points[n - 2]!.y },
  ];
  const out: StagePoint[] = [];
  for (let i = 1; i < ext.length - 2; i++) {
    const p0 = ext[i - 1]!;
    const p1 = ext[i]!;
    const p2 = ext[i + 1]!;
    const p3 = ext[i + 2]!;
    const t1 = knot(p0, p1);
    const t2 = t1 + knot(p1, p2);
    const t3 = t2 + knot(p2, p3);
    out.push({ ...p1 });
    for (let k = 1; k < steps; k++) {
      const t = t1 + ((t2 - t1) * k) / steps;
      // Barry–Goldman pyramid.
      const a1 = mix(p0, p1, 0, t1, t);
      const a2 = mix(p1, p2, t1, t2, t);
      const a3 = mix(p2, p3, t2, t3, t);
      const b1 = mix(a1, a2, 0, t2, t);
      const b2 = mix(a2, a3, t1, t3, t);
      out.push(mix(b1, b2, t1, t2, t));
    }
  }
  out.push({ ...last });
  return out;
}

/** Samples per stretch between two points of a spline: enough to look round, fewer when there are many points. */
const splineSteps = (stretches: number) => Math.max(4, Math.ceil(48 / Math.max(1, stretches)));

/** The spline of a `points` / `free` path, cached per path object (every frame of the player asks for it again). */
const splineCache = new WeakMap<FormationPath, { from: StagePoint; to: StagePoint; line: StagePoint[] }>();
function splineOf(from: StagePoint, to: StagePoint, path: FormationPath): StagePoint[] {
  const hit = splineCache.get(path);
  if (hit && hit.from.x === from.x && hit.from.y === from.y && hit.to.x === to.x && hit.to.y === to.y) return hit.line;
  const through = [from, ...path.points, to];
  const line = splineThrough(through, splineSteps(through.length - 1));
  splineCache.set(path, { from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, line });
  return line;
}

/** Where somebody is at fraction `p` (already eased) of the move `from` → `to` along `path`. */
export function pointOnPath(from: StagePoint, to: StagePoint, path: FormationPath | undefined | null, p: number): StagePoint {
  const c = Math.min(1, Math.max(0, p));
  if (!path || path.points.length === 0) return lerp(from, to, c);
  if (c >= 1) return { x: to.x, y: to.y };
  if (path.kind === 'curve') return bezier(from, to, path.points, c);
  // Through the points by distance travelled along the smooth line: an even pace.
  return alongPolyline(splineOf(from, to, path), c);
}

/** The path as a polyline to draw (or to sample for clashes): from `from` to `to`, following the real curve. */
export function pathPolyline(from: StagePoint, to: StagePoint, path: FormationPath | undefined | null, samples = 24): StagePoint[] {
  if (!path || path.points.length === 0) return [from, to];
  if (path.kind !== 'curve') return splineOf(from, to, path);
  return Array.from({ length: samples + 1 }, (_, i) => pointOnPath(from, to, path, i / samples));
}

/** Ramer–Douglas–Peucker: the fewest points that keep the line within `epsilon` of the drawn one. */
export function simplifyStroke(points: readonly StagePoint[], epsilon = SIMPLIFY_EPSILON): StagePoint[] {
  if (points.length <= 2) return [...points];
  const first = points[0]!;
  const last = points[points.length - 1]!;
  let worst = -1;
  let worstAt = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = distanceToSegment(points[i]!, first, last);
    if (d > worst) {
      worst = d;
      worstAt = i;
    }
  }
  if (worst <= epsilon) return [first, last];
  const left = simplifyStroke(points.slice(0, worstAt + 1), epsilon);
  const right = simplifyStroke(points.slice(worstAt), epsilon);
  return [...left.slice(0, -1), ...right];
}

function distanceToSegment(p: StagePoint, a: StagePoint, b: StagePoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(p, a);
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/**
 * A hand-drawn line → a `free` path: simplified, its ends dropped (they are the two formations' positions), at most
 * FREE_POINTS_MAX points. Too short, or straight once simplified: null (the move stays straight).
 */
export function strokeToPath(stroke: readonly StagePoint[], stage: Size): FormationPath | null {
  if (stroke.length < 2 || polylineLength(stroke) < MIN_STROKE) return null;
  let epsilon = SIMPLIFY_EPSILON;
  let simple = simplifyStroke(stroke, epsilon);
  while (simple.length - 2 > FREE_POINTS_MAX) {
    epsilon *= 1.5;
    simple = simplifyStroke(stroke, epsilon);
  }
  const middle = simple.slice(1, -1).map((p) => inside(p, stage));
  return middle.length ? { kind: 'free', points: middle } : null;
}

/** A fresh curve: its control point beside the middle of the move, bending to the right of the direction of travel. */
export function curvePath(from: StagePoint, to: StagePoint, stage: Size): FormationPath {
  const mid = lerp(from, to, 0.5);
  const d = dist(from, to);
  if (d < 1e-6) return { kind: 'curve', points: [inside({ x: mid.x, y: mid.y - 1 }, stage)] };
  const bend = Math.min(1.5, Math.max(0.5, d / 2));
  const nx = -(to.y - from.y) / d;
  const ny = (to.x - from.x) / d;
  return { kind: 'curve', points: [inside({ x: mid.x + nx * bend, y: mid.y + ny * bend }, stage)] };
}

/**
 * A fresh S bend: a cubic curve whose two control points sit at a third and two thirds of the move, on opposite
 * sides, so it swings one way and then the other.
 */
export function sCurvePath(from: StagePoint, to: StagePoint, stage: Size): FormationPath {
  const d = dist(from, to);
  const a = lerp(from, to, 1 / 3);
  const b = lerp(from, to, 2 / 3);
  if (d < 1e-6) return { kind: 'curve', points: [inside({ x: a.x - 1, y: a.y - 1 }, stage), inside({ x: b.x + 1, y: b.y + 1 }, stage)] };
  const bend = Math.min(2, Math.max(0.6, d / 2.5));
  const nx = -(to.y - from.y) / d;
  const ny = (to.x - from.x) / d;
  return {
    kind: 'curve',
    points: [inside({ x: a.x + nx * bend, y: a.y + ny * bend }, stage), inside({ x: b.x - nx * bend, y: b.y - ny * bend }, stage)],
  };
}

/** The shape of a curve: one control point = arc, two = S (or any cubic). */
export function curveShape(path: FormationPath | undefined | null): CurveShape | null {
  if (path?.kind !== 'curve') return null;
  return path.points.length >= 2 ? 's' : 'arc';
}

/**
 * «Arco» / «En S» inside «Curvo». Arc → S makes a fresh S; S → arc keeps the bend: the quadratic control point whose
 * curve has the same middle as the cubic one.
 */
export function setCurveShape(
  shape: CurveShape,
  from: StagePoint,
  to: StagePoint,
  current: FormationPath | undefined | null,
  stage: Size,
): FormationPath {
  if (current && curveShape(current) === shape) return current;
  if (shape === 's') return sCurvePath(from, to, stage);
  if (current?.kind === 'curve' && current.points.length >= 2) {
    const m = bezier(from, to, current.points, 0.5);
    const mid = lerp(from, to, 0.5);
    return { kind: 'curve', points: [inside({ x: 2 * m.x - mid.x, y: 2 * m.y - mid.y }, stage)] };
  }
  return curvePath(from, to, stage);
}

/** «Invertir»: the path bends to the other side (each point mirrored across the straight line from → to). */
export function flipPath(from: StagePoint, to: StagePoint, path: FormationPath, stage: Size): FormationPath {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return path;
  return {
    ...path,
    points: path.points.map((p) => {
      const t = ((p.x - from.x) * dx + (p.y - from.y) * dy) / len2;
      const foot = { x: from.x + t * dx, y: from.y + t * dy };
      return inside({ x: 2 * foot.x - p.x, y: 2 * foot.y - p.y }, stage);
    }),
  };
}

/** Switching the kind of a move (the segmented choice). `free` waits for a drawing: it keeps the current path. */
export function convertPath(
  choice: PathChoice,
  from: StagePoint,
  to: StagePoint,
  current: FormationPath | undefined,
  stage: Size,
): FormationPath | null | undefined {
  if (choice === 'straight') return null;
  if (current?.kind === choice) return current;
  if (choice === 'curve') {
    // From several points: the control point that bends through their middle.
    if (current && current.points.length) {
      const m = pointOnPath(from, to, current, 0.5);
      const mid = lerp(from, to, 0.5);
      return { kind: 'curve', points: [inside({ x: 2 * m.x - mid.x, y: 2 * m.y - mid.y }, stage)] };
    }
    return curvePath(from, to, stage);
  }
  if (choice === 'points') {
    if (current?.kind === 'curve') {
      // An arc → its middle; an S → the two points where it swings, so the spline keeps the S.
      const at = current.points.length >= 2 ? [1 / 3, 2 / 3] : [0.5];
      return { kind: 'points', points: at.map((t) => inside(pointOnPath(from, to, current, t), stage)) };
    }
    if (current?.kind === 'free') return { kind: 'points', points: reduceTo(current.points, PATH_POINTS_MAX) };
    return { kind: 'points', points: [inside(lerp(from, to, 0.5), stage)] };
  }
  return current;
}

function reduceTo(points: readonly StagePoint[], max: number): StagePoint[] {
  if (points.length <= max) return points.map((p) => ({ ...p }));
  return Array.from({ length: max }, (_, i) => ({ ...points[Math.round((i * (points.length - 1)) / (max - 1))]! }));
}

/** «Añadir punto»: a new point in the middle of the longest stretch (up to PATH_POINTS_MAX). */
export function addPathPoint(from: StagePoint, to: StagePoint, path: FormationPath | undefined, stage: Size): FormationPath {
  const points = path?.kind === 'points' ? path.points : [];
  if (points.length >= PATH_POINTS_MAX) return { kind: 'points', points: [...points] };
  const all = [from, ...points, to];
  let longest = 0;
  let at = 0;
  for (let i = 1; i < all.length; i++) {
    const d = dist(all[i - 1]!, all[i]!);
    if (d > longest) {
      longest = d;
      at = i;
    }
  }
  const mid = inside(lerp(all[at - 1]!, all[at]!, 0.5), stage);
  const next = [...points];
  next.splice(at - 1, 0, mid);
  return { kind: 'points', points: next };
}

/** «Quitar punto»: without points left the move is straight again (null). */
export function removePathPoint(path: FormationPath, index: number): FormationPath | null {
  const points = path.points.filter((_, i) => i !== index);
  if (points.length === 0 || path.kind === 'curve') return null;
  return { ...path, points };
}

export function movePathPoint(path: FormationPath, index: number, to: StagePoint, stage: Size): FormationPath {
  return { ...path, points: path.points.map((p, i) => (i === index ? inside(to, stage) : p)) };
}

/** Every point of a path inside a (smaller) stage. */
export function clampPath(path: FormationPath, stage: Size): FormationPath {
  return { ...path, points: path.points.map((p) => inside(p, stage)) };
}

export function samePath(a: FormationPath | undefined | null, b: FormationPath | undefined | null): boolean {
  if (!a || !b) return !a && !b;
  return (
    a.kind === b.kind &&
    a.points.length === b.points.length &&
    a.points.every((p, i) => Math.abs(p.x - b.points[i]!.x) < 1e-6 && Math.abs(p.y - b.points[i]!.y) < 1e-6)
  );
}

/** The same check as the server's: a known kind and the right number of points, each inside the stage. */
export function pathValid(path: unknown, stage: Size): boolean {
  if (typeof path !== 'object' || path === null || Array.isArray(path)) return false;
  const keys = Object.keys(path);
  if (keys.some((k) => k !== 'kind' && k !== 'points')) return false;
  const { kind, points } = path as { kind?: unknown; points?: unknown };
  if (kind !== 'curve' && kind !== 'points' && kind !== 'free') return false;
  if (!Array.isArray(points)) return false;
  const max = kind === 'curve' ? CURVE_POINTS_MAX : kind === 'points' ? PATH_POINTS_MAX : FREE_POINTS_MAX;
  if (points.length < 1 || points.length > max) return false;
  return points.every((p: unknown) => {
    if (typeof p !== 'object' || p === null) return false;
    const o = p as Record<string, unknown>;
    if (Object.keys(o).some((k) => k !== 'x' && k !== 'y')) return false;
    const { x, y } = o;
    return (
      typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y) &&
      x >= 0 && y >= 0 && x <= stage.width && y <= stage.depth
    );
  });
}
