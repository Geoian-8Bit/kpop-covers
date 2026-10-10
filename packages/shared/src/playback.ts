export const MIN_SPEED = 0.25;
export const MAX_SPEED = 2;
export const SPEED_STEP = 0.05;
export const SPEED_PRESETS = [0.5, 0.6, 0.75, 0.8, 1, 1.2, 1.5, 2] as const;

/** Smallest A–B loop we allow, in seconds. */
export const MIN_LOOP_LENGTH = 0.2;
/** Max file size that gets synced to the crew's cloud storage (Supabase free tier limit). */
export const MAX_CLOUD_UPLOAD_BYTES = 50 * 1024 * 1024;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Clamps to [0.25, 2] and snaps to 0.05 steps, avoiding float noise (0.6000000001). */
export function clampSpeed(value: number): number {
  if (!Number.isFinite(value)) return 1;
  const snapped = Math.round(value / SPEED_STEP) * SPEED_STEP;
  return Number(clamp(snapped, MIN_SPEED, MAX_SPEED).toFixed(2));
}

export function stepSpeed(current: number, direction: 1 | -1): number {
  return clampSpeed(current + direction * SPEED_STEP);
}

export function formatSpeed(value: number): string {
  return `${Number(value.toFixed(2))}×`;
}

export interface LoopRange {
  start: number;
  end: number;
}

/**
 * Orders two marks into a valid range inside [0, duration] that is at least MIN_LOOP_LENGTH long.
 * Returns null when the media is too short for any loop.
 */
export function normalizeRange(a: number, b: number, duration: number): LoopRange | null {
  if (!Number.isFinite(duration) || duration < MIN_LOOP_LENGTH) return null;
  let start = clamp(Math.min(a, b), 0, duration);
  let end = clamp(Math.max(a, b), 0, duration);
  if (end - start < MIN_LOOP_LENGTH) {
    end = Math.min(duration, start + MIN_LOOP_LENGTH);
    start = Math.max(0, end - MIN_LOOP_LENGTH);
  }
  return { start: round3(start), end: round3(end) };
}

/** True once playback has reached (or passed) the loop end and should jump back to start. */
export function shouldWrap(time: number, range: LoopRange, epsilon = 0.02): boolean {
  return time >= range.end - epsilon;
}

export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
