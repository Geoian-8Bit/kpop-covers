import type { StagePoint } from '@coverscape/shared';
import { ease, moveWindow, withDefaults, type Keyframe, type Stage } from './formationRules';
import { pointOnPath } from './pathRules';

/**
 * REQ-08 · Clashes: two people closer than 0.5 m at some moment of a transition. Each move is sampled (start
 * included: a clash at the very first instant counts) along everybody's real route (paths too). Props never count.
 */

export const CLASH_DISTANCE = 0.5;
export const CLASH_SAMPLES = 24;

export interface Clash {
  /** The formation the move leads to. */
  formationId: string;
  a: string;
  b: string;
  /** When they are too close (seconds of the video). */
  start: number;
  end: number;
  /** The closest they get (metres). */
  distance: number;
  /** The stretch of each one's route while too close, to paint it red. */
  routeA: StagePoint[];
  routeB: StagePoint[];
}

/** Every clash of the plan (`list` sorted by time), move by move. */
export function findClashes(
  list: readonly Keyframe[],
  memberIds: readonly string[],
  stage: Stage,
  minDistance = CLASH_DISTANCE,
  samples = CLASH_SAMPLES,
): Clash[] {
  const out: Clash[] = [];
  for (let i = 1; i < list.length; i++) {
    const prev = list[i - 1]!;
    const next = list[i]!;
    const { start, end } = moveWindow(prev, next);
    const from = withDefaults(prev.positions, memberIds, stage);
    const to = withDefaults(next.positions, memberIds, stage);
    // A jump (no transition time) still checks where it starts and where it lands.
    const steps = end > start ? samples : 1;
    const open = new Map<string, Clash>();
    for (let k = 0; k <= steps; k++) {
      const lin = k / steps;
      const t = start + (end - start) * lin;
      const e = ease(lin);
      const at = new Map<string, StagePoint>();
      for (const id of memberIds) at.set(id, pointOnPath(from[id]!, to[id]!, to[id]!.path, e));
      for (let x = 0; x < memberIds.length; x++) {
        for (let y = x + 1; y < memberIds.length; y++) {
          const a = memberIds[x]!;
          const b = memberIds[y]!;
          const pa = at.get(a)!;
          const pb = at.get(b)!;
          const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
          const key = `${a}|${b}`;
          const running = open.get(key);
          if (d < minDistance) {
            if (running) {
              running.end = t;
              running.distance = Math.min(running.distance, d);
              running.routeA.push(pa);
              running.routeB.push(pb);
            } else {
              open.set(key, { formationId: next.id, a, b, start: t, end: t, distance: d, routeA: [pa], routeB: [pb] });
            }
          } else if (running) {
            out.push(running);
            open.delete(key);
          }
        }
      }
    }
    out.push(...open.values());
  }
  return out.sort((p, q) => p.start - q.start || p.a.localeCompare(q.a) || p.b.localeCompare(q.b));
}

/** The people in a clash at `t` (with half a sample of slack: playback never lands exactly on a sample). */
export function clashingAt(clashes: readonly Clash[], t: number, slack = 0.05): Set<string> {
  const ids = new Set<string>();
  for (const c of clashes) {
    if (t >= c.start - slack && t <= c.end + slack) {
      ids.add(c.a);
      ids.add(c.b);
    }
  }
  return ids;
}

/** The stretches of the timeline with a clash, merged where they overlap. */
export function clashRanges(clashes: readonly Clash[]): { start: number; end: number }[] {
  const sorted = [...clashes].sort((a, b) => a.start - b.start);
  const out: { start: number; end: number }[] = [];
  for (const c of sorted) {
    const last = out[out.length - 1];
    if (last && c.start <= last.end + 1e-6) last.end = Math.max(last.end, c.end);
    else out.push({ start: c.start, end: c.end });
  }
  return out;
}
