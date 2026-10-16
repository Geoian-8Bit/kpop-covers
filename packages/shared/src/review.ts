/**
 * F5 · Review a take against the original, in sync. When a take is recorded the app knows the song's second it
 * started at and the speed it played at, so every moment of the take maps to an exact moment of the song:
 *
 *   song time = start + take time × speed + adjustment
 *
 * The original may be the YouTube video (song time) or the linked file (song time + the file's offset, F1).
 * `adjustment` (±0.3 s) absorbs the phone's own camera/audio latency and is saved with the take.
 */

export const SYNC_ADJUST_LIMIT = 0.3;

export interface TakeTiming {
  /** Song second the take started at. */
  songStart: number;
  /** Song speed while recording (1 = normal). */
  speed: number;
  /** Fine adjustment saved with the take (seconds of song, ±0.3). */
  adjust?: number | null;
}

export function clampAdjust(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(SYNC_ADJUST_LIMIT, Math.max(-SYNC_ADJUST_LIMIT, value)) * 1000) / 1000;
}

/** The song's second shown at a moment of the take. */
export function songTimeAt(take: TakeTiming, takeSeconds: number): number {
  return take.songStart + takeSeconds * (take.speed || 1) + clampAdjust(take.adjust ?? 0);
}

/** The take's moment for a second of the song (inverse of songTimeAt). */
export function takeTimeAt(take: TakeTiming, songSeconds: number): number {
  return (songSeconds - take.songStart - clampAdjust(take.adjust ?? 0)) / (take.speed || 1);
}

/** Where the original plays: the YouTube timeline itself, or the linked file ahead by its offset (F1). */
export function originalTime(songSeconds: number, fileOffset: number | null | undefined, onFile: boolean): number {
  return onFile ? songSeconds + (fileOffset ?? 0) : songSeconds;
}

/**
 * How to keep the original following the take (the take is the clock): a big gap is a seek; a small one is fixed
 * by playing the original slightly faster or slower for a moment, so it doesn't stutter.
 */
export function followCorrection(
  drift: number,
  baseRate: number,
  opts: { seekOver?: number; nudgeOver?: number } = {},
): { kind: 'seek' } | { kind: 'rate'; rate: number } | { kind: 'none' } {
  const seekOver = opts.seekOver ?? 0.35;
  const nudgeOver = opts.nudgeOver ?? 0.04;
  const abs = Math.abs(drift);
  if (abs > seekOver) return { kind: 'seek' };
  if (abs > nudgeOver) {
    // drift > 0: the original is ahead → slow it a little (at most ±8 %).
    const factor = 1 - Math.max(-0.08, Math.min(0.08, drift * 0.5));
    return { kind: 'rate', rate: Math.round(baseRate * factor * 1000) / 1000 };
  }
  return { kind: 'none' };
}

/** A clip (song range) as a range inside the take, clamped to the take's length; null when they don't overlap. */
export function clipInTake(
  take: TakeTiming & { duration: number },
  clip: { start: number; end: number },
): { start: number; end: number } | null {
  const a = Math.max(0, takeTimeAt(take, clip.start));
  const b = Math.min(take.duration, takeTimeAt(take, clip.end));
  return b - a > 0.2 ? { start: Math.round(a * 1000) / 1000, end: Math.round(b * 1000) / 1000 } : null;
}

/** A range marked on the take as a song range (to save it as a clip of the song, F8). */
export function takeRangeToSong(take: TakeTiming, range: { start: number; end: number }): { start: number; end: number } {
  const s = songTimeAt(take, Math.min(range.start, range.end));
  const e = songTimeAt(take, Math.max(range.start, range.end));
  return { start: Math.max(0, Math.round(s * 1000) / 1000), end: Math.max(0, Math.round(e * 1000) / 1000) };
}
