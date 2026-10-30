import type { FormationProp, FormationPositions, FormationSpot, StagePoint } from '@coverscape/shared';
import { clampPath, pathPolyline, pathValid, pointOnPath, samePath } from './pathRules';
import { lerpAngle, propsError, sameProps } from './propRules';

/**
 * REQ-06 · Pure rules of the formation editor: where everybody is at a moment, the grid, the mirror, the moments
 * of new formations and the checks the server repeats. Coordinates are metres from the stage's back-left corner as
 * the audience sees it (x to the right, y towards the audience).
 */

export interface Stage {
  width: number;
  depth: number;
  grid: number;
}

/** What the rules need of a formation (the row has more). */
export interface Keyframe {
  id: string;
  at: number;
  transition: number;
  positions: FormationPositions;
  note?: string | null;
  /** REQ-10 · Props on stage in this formation (old rows: none). */
  props?: FormationProp[];
}

export const PLAN_NAME_MAX = 60;
export const NOTE_MAX = 280;
export const STAGE_MIN = 2;
export const STAGE_MAX = 30;
export const DEFAULT_STAGE: Stage = { width: 8, depth: 6, grid: 0.5 };
export const DEFAULT_TRANSITION = 2;
export const TRANSITION_MAX = 30;
/** Two formations closer than this share a moment (the server rounds `at` to 0.01 s). */
export const SAME_MOMENT = 0.05;
/** How far a clashing formation is pushed (REQ-06: «se desplaza 0,1 s»). */
export const CLASH_STEP = 0.1;
export const FINE_STEP = 0.1;

export const roundTime = (t: number) => Math.round(t * 100) / 100;
const round3 = (v: number) => Math.round(v * 1000) / 1000;

export function sortKeyframes<T extends Keyframe>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

/** Smooth in and out (smoothstep): starts and lands softly, exactly half way at half time. */
export function ease(p: number): number {
  const c = Math.min(1, Math.max(0, p));
  return c * c * (3 - 2 * c);
}

export function lerpPoint(a: StagePoint, b: StagePoint, p: number): StagePoint {
  return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
}

export function clampPoint(p: StagePoint, stage: Pick<Stage, 'width' | 'depth'>): StagePoint {
  return { x: Math.min(stage.width, Math.max(0, p.x)), y: Math.min(stage.depth, Math.max(0, p.y)) };
}

export function snapValue(v: number, grid: number): number {
  return grid > 0 ? round3(Math.round(v / grid) * grid) : round3(v);
}

/** On the grid (when on) and always inside the stage. */
export function snapPoint(p: StagePoint, stage: Stage, snap = true): StagePoint {
  const c = clampPoint(p, stage);
  if (!snap) return { x: round3(c.x), y: round3(c.y) };
  // Snapping never pushes a point off a stage whose size isn't a multiple of the grid.
  return clampPoint({ x: snapValue(c.x, stage.grid), y: snapValue(c.y, stage.grid) }, stage);
}

/** «Desde los bailarines»: the stage mirrored left to right. */
export function mirrorPoint(p: StagePoint, stage: Pick<Stage, 'width'>, mirrored: boolean): StagePoint {
  return mirrored ? { x: stage.width - p.x, y: p.y } : p;
}

/** Arrow keys: one grid step (or a fine step with Shift), inside the stage. */
export function nudgePoint(p: StagePoint, key: string, stage: Stage, fine: boolean, mirrored = false): StagePoint | null {
  const step = fine ? FINE_STEP : stage.grid;
  let dx = 0;
  let dy = 0;
  if (key === 'ArrowLeft') dx = -step;
  else if (key === 'ArrowRight') dx = step;
  else if (key === 'ArrowUp') dy = -step;
  else if (key === 'ArrowDown') dy = step;
  else return null;
  // On a mirrored stage «left» on screen is «right» on the stage.
  if (mirrored) dx = -dx;
  const moved = clampPoint({ x: p.x + dx, y: p.y + dy }, stage);
  return { x: round3(moved.x), y: round3(moved.y) };
}

/**
 * Where somebody without a position stands: a free spot down the left side of the stage (REQ-06: a participant added
 * later appears «en una posición libre a un lado del escenario»). Then the right side, then the front edge.
 */
export function sideSlot(taken: readonly StagePoint[], stage: Stage, index = 0): StagePoint {
  const step = Math.min(Math.max(stage.grid, 0.5) * 2, stage.depth / 2);
  const margin = Math.min(stage.grid || 0.5, stage.width / 4);
  const columns = [margin, stage.width - margin];
  const free = (p: StagePoint) => taken.every((t) => Math.hypot(t.x - p.x, t.y - p.y) >= 0.25);
  let seen = 0;
  for (const x of columns) {
    for (let y = margin; y <= stage.depth - margin + 1e-9; y += step) {
      const p = snapPoint({ x, y }, stage);
      if (free(p)) {
        if (seen === index) return p;
        seen++;
      }
    }
  }
  // Everything taken: along the front edge.
  return snapPoint({ x: margin + ((index * stage.grid) % Math.max(stage.width - 2 * margin, stage.grid)), y: stage.depth }, stage);
}

/** Positions for every participant: their own, or a free spot at the side when they have none. */
export function withDefaults(positions: FormationPositions, memberIds: readonly string[], stage: Stage): FormationPositions {
  const out: FormationPositions = {};
  const taken: StagePoint[] = [];
  for (const id of memberIds) {
    const p = positions[id];
    if (p) {
      // REQ-08: the path that leads here travels with the place.
      out[id] = p.path ? { ...clampPoint(p, stage), path: p.path } : clampPoint(p, stage);
      taken.push(out[id]);
    }
  }
  for (const id of memberIds) {
    if (out[id]) continue;
    const slot = sideSlot(taken, stage);
    out[id] = slot;
    taken.push(slot);
  }
  return out;
}

/** Empty plan: the participants in a row across the middle of the stage. */
export function rowPositions(memberIds: readonly string[], stage: Stage): FormationPositions {
  const out: FormationPositions = {};
  const n = memberIds.length;
  memberIds.forEach((id, i) => {
    const x = n === 1 ? stage.width / 2 : (stage.width * (i + 1)) / (n + 1);
    out[id] = snapPoint({ x, y: stage.depth / 2 }, stage, false);
  });
  return out;
}

/** Index of the formation in force at `t` (the last one reached), 0 before the first, -1 with none. */
export function activeIndex(list: readonly Keyframe[], t: number): number {
  if (list.length === 0) return -1;
  let index = 0;
  for (let i = 0; i < list.length; i++) if (list[i]!.at <= t + 1e-6) index = i;
  return index;
}

/** Index of the next formation still to come after `t`, or -1 when none is left. */
export function nextIndex(list: readonly Keyframe[], t: number): number {
  return list.findIndex((f) => f.at > t + 1e-6);
}

/** The formation sitting exactly at `t` (within the same moment), if any. */
export function formationAt<T extends Keyframe>(list: readonly T[], t: number): T | null {
  return list.find((f) => Math.abs(f.at - t) < SAME_MOMENT) ?? null;
}

/**
 * Where a move between two formations runs: it ends at `next.at` and starts `transition` earlier, never before the
 * previous formation (REQ-06: a transition longer than the gap starts at the previous formation).
 */
export function moveWindow(prev: Keyframe, next: Keyframe): { start: number; end: number } {
  const start = Math.max(prev.at, next.at - Math.max(0, next.transition));
  return { start, end: next.at };
}

/**
 * Everybody's position at `t` (`list` sorted). Before the first formation: the first; after the last: the last;
 * between two: a straight line with soft easing during the move, still before it.
 */
export function positionsAt(list: readonly Keyframe[], t: number, memberIds: readonly string[], stage: Stage): FormationPositions {
  if (list.length === 0) return rowPositions(memberIds, stage);
  const first = list[0]!;
  if (t <= first.at) return withDefaults(first.positions, memberIds, stage);
  const last = list[list.length - 1]!;
  if (t >= last.at) return withDefaults(last.positions, memberIds, stage);
  let i = 0;
  while (i < list.length - 1 && list[i + 1]!.at <= t) i++;
  const prev = list[i]!;
  const next = list[i + 1]!;
  const from = withDefaults(prev.positions, memberIds, stage);
  const { start, end } = moveWindow(prev, next);
  if (t <= start) return from;
  const to = withDefaults(next.positions, memberIds, stage);
  const p = ease(end > start ? (t - start) / (end - start) : 1);
  const out: FormationPositions = {};
  // REQ-08: along the destination's path (straight without one).
  for (const id of memberIds) out[id] = pointOnPath(from[id]!, to[id]!, to[id]!.path, p);
  return out;
}

/** REQ-10 · A prop as drawn at a moment: fading in or out when only one side of the move has it. */
export interface PropFrame extends FormationProp {
  opacity: number;
}

/** REQ-10 · The props at `t` (`list` sorted): the same timing as people, matched by id; turns take the short way. */
export function propsAt(list: readonly Keyframe[], t: number): PropFrame[] {
  if (list.length === 0) return [];
  const still = (f: Keyframe) => (f.props ?? []).map((p) => ({ ...p, opacity: 1 }));
  const first = list[0]!;
  if (t <= first.at) return still(first);
  const last = list[list.length - 1]!;
  if (t >= last.at) return still(last);
  let i = 0;
  while (i < list.length - 1 && list[i + 1]!.at <= t) i++;
  const prev = list[i]!;
  const next = list[i + 1]!;
  const { start, end } = moveWindow(prev, next);
  if (t <= start) return still(prev);
  const p = ease(end > start ? (t - start) / (end - start) : 1);
  const after = new Map((next.props ?? []).map((q) => [q.id, q]));
  const out: PropFrame[] = [];
  for (const a of prev.props ?? []) {
    const b = after.get(a.id);
    if (!b) {
      out.push({ ...a, opacity: 1 - p });
      continue;
    }
    after.delete(a.id);
    out.push({ ...b, ...lerpPoint(a, b, p), rot: lerpAngle(a.rot, b.rot, p), opacity: 1 });
  }
  for (const b of after.values()) out.push({ ...b, opacity: p });
  return out;
}

/** REQ-10 · The props a new formation made at `t` starts with: those (mostly) on stage at that moment. */
export function propsSnapshot(list: readonly Keyframe[], t: number): FormationProp[] {
  return propsAt(list, t)
    .filter((p) => p.opacity >= 0.5)
    .map(({ opacity: _opacity, ...p }) => ({ ...p, x: round3(p.x), y: round3(p.y) }));
}

/** REQ-08 · Places without the path that led to them (a copy elsewhere in time can't keep the old route). */
export function withoutPaths(positions: FormationPositions): FormationPositions {
  const out: FormationPositions = {};
  for (const [id, p] of Object.entries(positions)) out[id] = { x: p.x, y: p.y };
  return out;
}

/**
 * REQ-08 · After an edit that moved people (drag, template, flip…), each one keeps the path that led to their old
 * place: the path's ends follow the formations, so it still joins them. Only explicit path edits change it.
 */
export function keepPaths(before: FormationPositions, after: FormationPositions): FormationPositions {
  const out: FormationPositions = {};
  for (const [id, p] of Object.entries(after)) {
    const old = before[id]?.path;
    out[id] = p.path === undefined && old ? { x: p.x, y: p.y, path: old } : p;
  }
  return out;
}

/**
 * A free moment for a formation wanted at `t`: the same moment as another one isn't allowed, so it moves 0.1 s later
 * until it is free. `shifted` says so (the editor tells the person).
 */
export function freeMoment(list: readonly Keyframe[], t: number, exceptId?: string): { at: number; shifted: boolean } {
  let at = roundTime(Math.max(0, t));
  let shifted = false;
  for (let guard = 0; guard < 1000; guard++) {
    const clash = list.some((f) => f.id !== exceptId && Math.abs(f.at - at) < SAME_MOMENT);
    if (!clash) break;
    at = roundTime(at + CLASH_STEP);
    shifted = true;
  }
  return { at, shifted };
}

/** «Duplicar»: the copy goes at the current moment when it's free, else 2 s after the original (then the next free). */
export function duplicateMoment(list: readonly Keyframe[], source: Keyframe, now: number): { at: number; shifted: boolean } {
  const nowFree = !list.some((f) => Math.abs(f.at - now) < SAME_MOMENT);
  if (nowFree) return { at: roundTime(Math.max(0, now)), shifted: false };
  return freeMoment(list, source.at + DEFAULT_TRANSITION);
}

/** «Mi recorrido»: the places somebody passes through, formation after formation (consecutive repeats dropped). */
export function memberTrack(list: readonly Keyframe[], memberId: string, memberIds: readonly string[], stage: Stage): StagePoint[] {
  const out: StagePoint[] = [];
  let before: FormationSpot | null = null;
  for (const f of list) {
    const p = withDefaults(f.positions, memberIds, stage)[memberId];
    if (!p) continue;
    // REQ-08: the route between two places follows the path into the second one.
    const route = before && p.path ? pathPolyline(before, p, p.path, 16).slice(1) : [p];
    for (const q of route) {
      const prev = out[out.length - 1];
      if (!prev || Math.hypot(prev.x - q.x, prev.y - q.y) > 1e-6) out.push({ x: q.x, y: q.y });
    }
    before = p;
  }
  return out;
}

/** Points pulled inside a smaller stage (the server does the same when the plan shrinks). */
export function fitPositions(positions: FormationPositions, stage: Pick<Stage, 'width' | 'depth'>): FormationPositions {
  const out: FormationPositions = {};
  for (const [id, p] of Object.entries(positions)) {
    out[id] = p.path ? { ...clampPoint(p, stage), path: clampPath(p.path, stage) } : clampPoint(p, stage);
  }
  return out;
}

export function samePositions(a: FormationPositions, b: FormationPositions): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every(
    (k) => b[k] != null && Math.abs(a[k]!.x - b[k]!.x) < 1e-6 && Math.abs(a[k]!.y - b[k]!.y) < 1e-6 && samePath(a[k]!.path, b[k]!.path),
  );
}

export function sameKeyframe(a: Keyframe, b: Keyframe): boolean {
  return (
    a.id === b.id &&
    Math.abs(a.at - b.at) < 1e-6 &&
    Math.abs(a.transition - b.transition) < 1e-6 &&
    (a.note ?? null) === (b.note ?? null) &&
    samePositions(a.positions, b.positions) &&
    sameProps(a.props, b.props)
  );
}

// ───────────── Checks (the same as the server's) ─────────────

export function planNameError(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Ponle un nombre al plan.';
  if (trimmed.length > PLAN_NAME_MAX) return `El nombre admite hasta ${PLAN_NAME_MAX} letras.`;
  return null;
}

export function stageSizeError(width: number, depth: number): string | null {
  const ok = (v: number) => Number.isFinite(v) && v >= STAGE_MIN && v <= STAGE_MAX;
  return ok(width) && ok(depth) ? null : `El escenario mide entre ${STAGE_MIN} y ${STAGE_MAX} m por lado.`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Why the server would refuse this formation (`formation_invalid` / `formation_out_of_stage`), or null. */
export function formationError(f: Keyframe, stage: Pick<Stage, 'width' | 'depth'>): 'formation_invalid' | 'formation_out_of_stage' | null {
  if (!Number.isFinite(f.at) || f.at < 0 || f.at > 36000) return 'formation_invalid';
  if (!Number.isFinite(f.transition) || f.transition < 0 || f.transition > TRANSITION_MAX) return 'formation_invalid';
  if (f.note != null && f.note.length > NOTE_MAX) return 'formation_invalid';
  const entries = Object.entries(f.positions ?? {});
  if (entries.length > 40) return 'formation_invalid';
  for (const [id, p] of entries) {
    if (!UUID.test(id) || typeof p?.x !== 'number' || typeof p?.y !== 'number') return 'formation_invalid';
    if (Object.keys(p).some((k) => k !== 'x' && k !== 'y' && k !== 'path')) return 'formation_invalid';
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return 'formation_invalid';
    if (p.x < 0 || p.y < 0 || p.x > stage.width || p.y > stage.depth) return 'formation_out_of_stage';
    // REQ-08: a path out of the stage is malformed too (the client keeps it inside).
    if (p.path !== undefined && !pathValid(p.path, stage)) return 'formation_invalid';
  }
  return f.props === undefined ? null : propsError(f.props, stage);
}

/** «m:ss.d» for the markers (a formation can sit between seconds). */
export function formatMoment(t: number): string {
  const total = Math.max(0, t);
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  const whole = Math.floor(s);
  const tenth = Math.floor((s - whole) * 10 + 1e-6);
  return `${m}:${String(whole).padStart(2, '0')}${tenth ? `,${tenth}` : ''}`;
}

/** The position of a point in words, for the text alternative of the stage. */
export function describePoint(p: StagePoint, stage: Pick<Stage, 'width' | 'depth'>): string {
  const third = (v: number, size: number, low: string, mid: string, high: string) =>
    v < size / 3 ? low : v > (size * 2) / 3 ? high : mid;
  const across = third(p.x, stage.width, 'izquierda', 'centro', 'derecha');
  const depth = third(p.y, stage.depth, 'fondo', 'medio', 'delante');
  const fmt = (v: number) => v.toLocaleString('es-ES', { maximumFractionDigits: 1 });
  return `${depth}, ${across} (${fmt(p.x)} m, ${fmt(p.y)} m)`;
}

// ───────────── Undo / redo ─────────────

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export const HISTORY_LIMIT = 100;

export function historyStart<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

export function historyPush<T>(h: History<T>, next: T): History<T> {
  if (next === h.present) return h;
  const past = [...h.past, h.present];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { past, present: next, future: [] };
}

export function historyUndo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  const previous = h.past[h.past.length - 1]!;
  return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future] };
}

export function historyRedo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  const [next, ...future] = h.future;
  return { past: [...h.past, h.present], present: next!, future };
}

/** What has to be written to go from one list of formations to another (undo, redo or an edit). */
export function diffKeyframes<T extends Keyframe>(from: readonly T[], to: readonly T[]): { save: T[]; remove: T[] } {
  const before = new Map(from.map((f) => [f.id, f]));
  const after = new Map(to.map((f) => [f.id, f]));
  const save = to.filter((f) => {
    const old = before.get(f.id);
    return !old || !sameKeyframe(old, f);
  });
  const remove = from.filter((f) => !after.has(f.id));
  return { save, remove };
}
