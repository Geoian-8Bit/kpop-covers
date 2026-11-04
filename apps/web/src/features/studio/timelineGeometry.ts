// REQ-27 · The timeline's pure geometry (the wave, the clip lanes, the note dots), out of Timeline.tsx and tested.
import { clamp, type Clip, type Note } from '@coverscape/shared';

export const POINTS = 90;
export const W = 1000;
export const H = 100;

/** Deterministic swell per song: a few long sines plus a little chop, 0..1. */
export function seededSwell(seed: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
  const p1 = rand() * 6.28;
  const p2 = rand() * 6.28;
  const k1 = 2 + rand() * 2;
  const k2 = 5 + rand() * 4;
  let chop = 0;
  return Array.from({ length: POINTS + 1 }, (_, i) => {
    const x = i / POINTS;
    chop = chop * 0.6 + (rand() - 0.5) * 0.4;
    const v = 0.55 * Math.sin(x * Math.PI * k1 + p1) + 0.3 * Math.sin(x * Math.PI * k2 + p2) + chop;
    return clamp(0.5 + v * 0.5, 0.05, 1);
  });
}

export function buildPaths(levels: number[]) {
  const pts = levels.map((v, i) => [(i / POINTS) * W, H - (14 + v * 70)] as const);
  let line = `M${pts[0]![0]},${pts[0]![1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i]!;
    const [nx, ny] = pts[i + 1]!;
    line += ` Q${x},${y} ${(x + nx) / 2},${(y + ny) / 2}`;
  }
  const last = pts[pts.length - 1]!;
  line += ` L${last[0]},${last[1]}`;
  return { line, area: `${line} L${W},${H} L0,${H} Z`, levels };
}

/**
 * Packs clips into lanes so overlapping ones never stack on the same row.
 * A small gap (1.5% of the song) also separates clips that would touch visually.
 */
export function assignLanes(clips: Clip[], duration: number) {
  const pad = duration * 0.015;
  const sorted = [...clips].sort(
    (a, b) => a.start_seconds - b.start_seconds || a.end_seconds - b.end_seconds,
  );
  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();
  for (const clip of sorted) {
    let lane = laneEnds.findIndex((end) => end + pad <= clip.start_seconds);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(clip.end_seconds);
    } else {
      laneEnds[lane] = clip.end_seconds;
    }
    lanes.set(clip.id, lane);
  }
  return { lanes, count: laneEnds.length };
}

export const LANE_H = 10;
export const LANE_GAP = 5;
export const LANE_PAD = 7;
export const LANE_MIN = 30;

/** Height of the wave line at a fraction of the song (0..1), as a fraction of the track height. */
export function waveY(levels: number[], fraction: number): number {
  const p = clamp(fraction, 0, 1) * POINTS;
  const i = Math.min(Math.floor(p), POINTS - 1);
  const v = levels[i]! + (levels[i + 1]! - levels[i]!) * (p - i);
  return (H - (14 + v * 70)) / H;
}

/** Highest point of the wave (smallest y fraction) within ±`span` samples of a position. */
export function localPeakY(levels: number[], fraction: number, span = 4): number {
  const centre = Math.round(clamp(fraction, 0, 1) * POINTS);
  let peak = 1;
  for (let i = Math.max(0, centre - span); i <= Math.min(POINTS, centre + span); i++) {
    peak = Math.min(peak, (H - (14 + levels[i]! * 70)) / H);
  }
  return peak;
}

/**
 * Where each note's dot floats: a little above the nearest crest (higher hills lift it higher), so a
 * note in a valley never hides in the wave. Notes close together step up alternately so their dots
 * don't sit on top of each other. Fractions of the track height, 0 = top.
 */
export function layoutNoteDots(notes: Note[], levels: number[], duration: number) {
  let prevF = -1;
  let stack = 0;
  return notes.map((note) => {
    const f = note.at_seconds / duration;
    stack = f - prevF < 0.035 ? stack + 1 : 0;
    prevF = f;
    const anchor = waveY(levels, f);
    const dot = Math.max(0.1, localPeakY(levels, f) - 0.12 - (stack % 3) * 0.13);
    return { note, f, anchor, dot };
  });
}
