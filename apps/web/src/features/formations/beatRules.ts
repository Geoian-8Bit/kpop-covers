import { freeMoment, roundTime, sortKeyframes, type Keyframe } from './formationRules';

/**
 * REQ-09 · Counts of eight: BPM from taps, where the beats fall and snapping formations onto them. The first beat
 * (`firstBeat`, seconds of the video) is a «1»; every 8 beats a new eight starts.
 */

export const BPM_MIN = 40;
export const BPM_MAX = 240;
export const MIN_TAPS = 4;

export function validBpm(bpm: number | null | undefined): bpm is number {
  return typeof bpm === 'number' && Number.isFinite(bpm) && bpm >= BPM_MIN && bpm <= BPM_MAX;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * «Marcar al ritmo»: the BPM from the taps (seconds, in order) with the median of the intervals, so one late tap
 * doesn't matter. Null with fewer than 4 taps or outside 40–240. Rounded to 0.1.
 */
export function bpmFromTaps(taps: readonly number[]): number | null {
  if (taps.length < MIN_TAPS) return null;
  const gaps: number[] = [];
  for (let i = 1; i < taps.length; i++) {
    const gap = taps[i]! - taps[i - 1]!;
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length < MIN_TAPS - 1) return null;
  const bpm = Math.round((60 / median(gaps)) * 10) / 10;
  return validBpm(bpm) ? bpm : null;
}

/** Taps further apart than this start a new count (the person stopped and started again). */
export const TAP_RESET_SECONDS = 2;

/** Adds a tap; a long pause starts over. Keeps the last 16. */
export function addTap(taps: readonly number[], at: number): number[] {
  const last = taps[taps.length - 1];
  const kept = last != null && at - last > TAP_RESET_SECONDS ? [] : [...taps];
  kept.push(at);
  return kept.slice(-16);
}

export interface Beat {
  t: number;
  /** 1…8 within its eight. */
  count: number;
  /** Which eight (0 = the one starting at the first beat; negative before it). */
  eight: number;
}

/** The beats between `from` and `to` (seconds). At most `limit` of them (the view thins them out when crowded). */
export function beatsBetween(bpm: number, firstBeat: number, from: number, to: number, limit = 2000): Beat[] {
  if (!validBpm(bpm) || to < from) return [];
  const step = 60 / bpm;
  const startIndex = Math.ceil((from - firstBeat) / step - 1e-9);
  const out: Beat[] = [];
  for (let i = startIndex; out.length < limit; i++) {
    const t = firstBeat + i * step;
    if (t > to + 1e-9) break;
    const eight = Math.floor(i / 8);
    out.push({ t: Math.round(t * 1000) / 1000, count: i - eight * 8 + 1, eight });
  }
  return out;
}

/** The beat nearest to `t`. */
export function nearestBeat(t: number, bpm: number, firstBeat: number): number {
  if (!validBpm(bpm)) return t;
  const step = 60 / bpm;
  return roundTime(firstBeat + Math.round((t - firstBeat) / step) * step);
}

/** Count and eight at `t` («5 del 3.º ocho»). */
export function countAt(t: number, bpm: number, firstBeat: number): { count: number; eight: number } | null {
  if (!validBpm(bpm)) return null;
  const i = Math.round((t - firstBeat) / (60 / bpm));
  const eight = Math.floor(i / 8);
  return { count: i - eight * 8 + 1, eight };
}

/**
 * «Ajustar formaciones al tiempo»: every formation onto its nearest beat (never before 0). Two landing on the same
 * beat: the later one goes to the next free moment.
 */
export function snapFormationsToBeats<T extends Keyframe>(list: readonly T[], bpm: number, firstBeat: number): T[] {
  if (!validBpm(bpm)) return [...list];
  const out: T[] = [];
  for (const f of sortKeyframes(list)) {
    let at = Math.max(0, nearestBeat(f.at, bpm, firstBeat));
    if (at < 0) at = 0;
    const { at: free } = freeMoment(out, at);
    out.push({ ...f, at: free });
  }
  return out;
}
