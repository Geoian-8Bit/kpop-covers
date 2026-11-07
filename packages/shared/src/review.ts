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
  /**
   * The take's second where the song starts (a video uploaded from the gallery: the dance starts 12,57 s in).
   * Before it the song time is below `songStart` (negative for a take of the whole song): the original waits.
   */
  lead?: number | null;
}

/** Most a take may run before the song starts (s). */
export const SONG_LEAD_LIMIT = 600;

export function clampLead(value: number | null | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(SONG_LEAD_LIMIT, Math.max(0, n)) * 1000) / 1000;
}

export function clampAdjust(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(SYNC_ADJUST_LIMIT, Math.max(-SYNC_ADJUST_LIMIT, value)) * 1000) / 1000;
}

/** The song's second shown at a moment of the take. */
export function songTimeAt(take: TakeTiming, takeSeconds: number): number {
  return (
    take.songStart + (takeSeconds - clampLead(take.lead)) * (take.speed || 1) + clampAdjust(take.adjust ?? 0)
  );
}

/** The take's moment for a second of the song (inverse of songTimeAt). */
export function takeTimeAt(take: TakeTiming, songSeconds: number): number {
  return (
    (songSeconds - take.songStart - clampAdjust(take.adjust ?? 0)) / (take.speed || 1) + clampLead(take.lead)
  );
}

/** Where the original plays: the YouTube timeline itself, or the linked file ahead by its offset (F1). */
export function originalTime(
  songSeconds: number,
  fileOffset: number | null | undefined,
  onFile: boolean,
): number {
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
export function takeRangeToSong(
  take: TakeTiming,
  range: { start: number; end: number },
): { start: number; end: number } {
  const s = songTimeAt(take, Math.min(range.start, range.end));
  const e = songTimeAt(take, Math.max(range.start, range.end));
  return { start: Math.max(0, Math.round(s * 1000) / 1000), end: Math.max(0, Math.round(e * 1000) / 1000) };
}

/** The song's start in the take, with hundredths, as the review shows it: 12.57 → «0:12,57». */
export function formatLead(seconds: number): string {
  return formatCents(clampLead(seconds));
}

/** A second with hundredths: 65.3 → «1:05,30» (the sync point's seconds, in the take or in the song). */
export function formatCents(seconds: number): string {
  const cents = Math.round((Number.isFinite(seconds) && seconds > 0 ? seconds : 0) * 100);
  const m = Math.floor(cents / 6000);
  const s = Math.floor((cents % 6000) / 100);
  return `${m}:${String(s).padStart(2, '0')},${String(cents % 100).padStart(2, '0')}`;
}

/**
 * A second typed by hand: «1:05,30», «1:05.3», «65,3», or «1.05,30» (a phone's number pad has no colon: the dot
 * stands for it when a comma follows). Null when it can't be read.
 */
export function parseCents(input: string): number | null {
  let raw = input.trim().replace(/\s+/g, '');
  if (!raw) return null;
  if (!raw.includes(':') && raw.includes('.') && raw.includes(',')) raw = raw.replace('.', ':');
  raw = raw.replace(',', '.');
  const parts = raw.split(':');
  if (parts.length > 2) return null;
  const last = parts[parts.length - 1]!;
  if (!/^\d+(\.\d+)?$/.test(last)) return null;
  if (parts.length === 2) {
    if (!/^\d+$/.test(parts[0]!) || Number(last) >= 60) return null;
    return Math.round((Number(parts[0]) * 60 + Number(last)) * 1000) / 1000;
  }
  return Math.round(Number(last) * 1000) / 1000;
}

/** The song's second that matches the take's sync point: at least 0, at most the original's length when known. */
export function clampSongStart(value: number, songLength?: number | null): number {
  if (!Number.isFinite(value)) return 0;
  const top = songLength != null && Number.isFinite(songLength) && songLength > 0 ? songLength : Infinity;
  return Math.round(Math.min(top, Math.max(0, value)) * 1000) / 1000;
}

/**
 * Where the take ends in the song, saved with its start (the database asks end ≥ start): from the sync point to the
 * take's end at its speed. Null when the take's length isn't known.
 */
export function songEndFor(take: {
  songStart: number;
  lead?: number | null;
  speed: number;
  duration: number | null | undefined;
}): number | null {
  const duration = Number(take.duration);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const end =
    take.songStart + Math.max(0, duration - clampLead(take.lead)) * (take.speed > 0 ? take.speed : 1);
  return Math.round(end * 1000) / 1000;
}
