import type { FormationPositions, StagePoint } from '@coverscape/shared';
import { clampPoint, snapPoint, type Stage } from './formationRules';

/**
 * REQ-07 · Quick edits: templates (line, V, inverted V, circle, pyramid, «ventanas») and the selection's flip, rotate,
 * scale and swap. Everything stays inside the stage; templates also respect the grid and never put two people on
 * the same spot.
 */

export const TEMPLATES = ['line', 'v', 'inverted-v', 'circle', 'pyramid', 'windows'] as const;
export type TemplateKind = (typeof TEMPLATES)[number];

export const TEMPLATE_LABELS: Record<TemplateKind, string> = {
  line: 'Línea',
  v: 'V',
  'inverted-v': 'V invertida',
  circle: 'Círculo',
  pyramid: 'Pirámide',
  windows: 'Ventanas',
};

export const ROTATE_STEP = 15;
const round3 = (v: number) => Math.round(v * 1000) / 1000;
const MIN_GAP = 0.25;

/** Room between people: as roomy as the stage allows, on the grid, at least one grid step. */
function spacing(count: number, length: number, grid: number, ideal = 1.5): number {
  if (count <= 1) return 0;
  const fit = (length * 0.85) / (count - 1);
  const raw = Math.min(ideal, fit);
  const g = grid > 0 ? grid : 0.5;
  return Math.max(g, Math.floor(raw / g) * g);
}

/** Raw shape offsets (metres, around 0,0; +y towards the audience) for `n` people. */
function shape(kind: TemplateKind, n: number, stage: Stage): StagePoint[] {
  if (n === 1) return [{ x: 0, y: 0 }];
  const { width, depth, grid } = stage;
  switch (kind) {
    case 'line': {
      const s = spacing(n, width, grid);
      return Array.from({ length: n }, (_, i) => ({ x: (i - (n - 1) / 2) * s, y: 0 }));
    }
    case 'v':
    case 'inverted-v': {
      // The point of the V faces the audience; inverted, it faces the back.
      const half = Math.ceil(n / 2);
      const sx = spacing(Math.max(2, half * 2 - (n % 2 ? 1 : 0)), width, grid, 1);
      const sy = spacing(Math.max(2, half), depth, grid, 0.75);
      const dir = kind === 'v' ? 1 : -1;
      const pts: StagePoint[] = [];
      if (n % 2 === 1) pts.push({ x: 0, y: 0 });
      const arms = n % 2 === 1 ? (n - 1) / 2 : n / 2;
      for (let k = 1; k <= arms; k++) {
        const off = n % 2 === 1 ? k : k - 0.5;
        pts.push({ x: -off * sx, y: -dir * off * sy }, { x: off * sx, y: -dir * off * sy });
      }
      return pts.slice(0, n);
    }
    case 'circle': {
      const r = Math.max(grid, Math.min(width, depth) * 0.36, (n * 0.8) / (2 * Math.PI));
      return Array.from({ length: n }, (_, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        return { x: Math.cos(a) * r, y: Math.sin(a) * r };
      });
    }
    case 'pyramid': {
      // Rows of 1, 2, 3… with the single person at the front.
      const rows: number[] = [];
      let left = n;
      for (let size = 1; left > 0; size++) {
        rows.push(Math.min(size, left));
        left -= size;
      }
      const sx = spacing(Math.max(...rows), width, grid, 1.2);
      const sy = spacing(rows.length, depth, grid, 1);
      const pts: StagePoint[] = [];
      rows.forEach((count, r) => {
        for (let i = 0; i < count; i++) pts.push({ x: (i - (count - 1) / 2) * sx, y: -r * sy });
      });
      return pts;
    }
    case 'windows': {
      // Two staggered rows: the back row stands in the gaps of the front one.
      const front = Math.ceil(n / 2);
      const back = n - front;
      const s = spacing(Math.max(2, front * 2), width, grid, 0.75);
      const sy = Math.max(grid, Math.min(1.5, depth / 3));
      const pts: StagePoint[] = [];
      for (let i = 0; i < front; i++) pts.push({ x: (i * 2 - (front - 1)) * s, y: sy / 2 });
      for (let i = 0; i < back; i++) pts.push({ x: (i * 2 - (front - 1) + 1) * s, y: -sy / 2 });
      return pts;
    }
  }
}

/** Snapped, but never onto a spot somebody already has (then it stays where the shape put it). */
function placeAll(points: StagePoint[], stage: Stage, taken: StagePoint[]): StagePoint[] {
  const used = [...taken];
  return points.map((p) => {
    const snapped = snapPoint(p, stage, true);
    const free = (q: StagePoint) => used.every((u) => Math.hypot(u.x - q.x, u.y - q.y) >= MIN_GAP);
    const chosen = free(snapped) ? snapped : snapPoint(p, stage, false);
    used.push(chosen);
    return chosen;
  });
}

/**
 * A template for `ids` (in that order), centred on the stage (or on `center`). The others keep their places and
 * nobody lands on them.
 */
export function applyTemplate(
  kind: TemplateKind,
  ids: readonly string[],
  positions: FormationPositions,
  stage: Stage,
  center: StagePoint = { x: stage.width / 2, y: stage.depth / 2 },
): FormationPositions {
  const offsets = shape(kind, ids.length, stage);
  // Centre the shape's own bounding box, then fit it inside the stage.
  const xs = offsets.map((p) => p.x);
  const ys = offsets.map((p) => p.y);
  const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const raw = offsets.map((p) => clampPoint({ x: center.x + p.x - midX, y: center.y + p.y - midY }, stage));
  const others = Object.entries(positions)
    .filter(([id]) => !ids.includes(id))
    .map(([, p]) => p);
  const placed = placeAll(raw, stage, others);
  const out: FormationPositions = { ...positions };
  ids.forEach((id, i) => (out[id] = placed[i]!));
  return out;
}

export function centroid(points: readonly StagePoint[]): StagePoint {
  if (points.length === 0) return { x: 0, y: 0 };
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function transform(
  ids: readonly string[],
  positions: FormationPositions,
  stage: Stage,
  fn: (p: StagePoint, c: StagePoint) => StagePoint,
): FormationPositions {
  const chosen = ids.filter((id) => positions[id]);
  if (chosen.length === 0) return positions;
  const c = centroid(chosen.map((id) => positions[id]!));
  const out: FormationPositions = { ...positions };
  for (const id of chosen) {
    const p = clampPoint(fn(positions[id]!, c), stage);
    out[id] = { x: round3(p.x), y: round3(p.y) };
  }
  return out;
}

/** Left ↔ right around the selection's centre. */
export const flipHorizontal = (ids: readonly string[], positions: FormationPositions, stage: Stage) =>
  transform(ids, positions, stage, (p, c) => ({ x: 2 * c.x - p.x, y: p.y }));

/** Front ↔ back around the selection's centre. */
export const flipVertical = (ids: readonly string[], positions: FormationPositions, stage: Stage) =>
  transform(ids, positions, stage, (p, c) => ({ x: p.x, y: 2 * c.y - p.y }));

/** Turn by `degrees` (clockwise as seen from above) around the selection's centre. */
export function rotate(ids: readonly string[], positions: FormationPositions, stage: Stage, degrees: number) {
  const a = (degrees * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return transform(ids, positions, stage, (p, c) => {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
  });
}

/** Grow or shrink the selection around its centre (`factor` > 1 spreads people out). */
export function scale(ids: readonly string[], positions: FormationPositions, stage: Stage, factor: number) {
  return transform(ids, positions, stage, (p, c) => ({ x: c.x + (p.x - c.x) * factor, y: c.y + (p.y - c.y) * factor }));
}

/** Two people trade places. */
export function swap(a: string, b: string, positions: FormationPositions): FormationPositions {
  const pa = positions[a];
  const pb = positions[b];
  if (!pa || !pb || a === b) return positions;
  return { ...positions, [a]: pb, [b]: pa };
}

/** The smallest distance between two of these people (for the «no overlap» check). */
export function minDistance(positions: FormationPositions, ids: readonly string[]): number {
  let best = Infinity;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = positions[ids[i]!];
      const b = positions[ids[j]!];
      if (a && b) best = Math.min(best, Math.hypot(a.x - b.x, a.y - b.y));
    }
  }
  return best;
}
