/**
 * F7 · Start recording with a clap: a double-clap detector fed with the microphone's level, window by window.
 *
 * Pure logic (no Web Audio here): the app reads the peak of each short window from an AnalyserNode and pushes it
 * with its time. The detector keeps an adaptive estimate of the room's background and only counts sharp sounds
 * well above it:
 *   - a clap is a sound over the threshold that drops again within `CLAP_MAX_LENGTH` (a voice, music or a long
 *     noise stays up longer and cancels a first clap);
 *   - two claps between `CLAP_MIN_GAP` and `CLAP_MAX_GAP` apart fire;
 *   - a peak sooner than `CLAP_MIN_GAP` after the first is its echo and counts as the same clap;
 *   - a single clap expires after `CLAP_MAX_GAP`;
 *   - a clap starts sharply: the window where it crosses the threshold must jump from a much lower level
 *     (`CLAP_ATTACK_RATIO`); a syllable or a swelling sound rises over several windows and is ignored.
 * The app also high-passes the microphone (~1.5 kHz) before measuring, so footsteps and voices, whose energy is
 * low, barely reach the threshold while a clap's crack does.
 */

export type ClapSensitivity = 'low' | 'medium' | 'high';
export type ClapState = 'idle' | 'first' | 'fired';
/** What a sound that crossed the threshold was taken for. */
export type ClapHit = 'first' | 'echo' | 'second';

export const CLAP_SENSITIVITIES: readonly ClapSensitivity[] = ['low', 'medium', 'high'];

/** Seconds between the two claps' starts. */
export const CLAP_MIN_GAP = 0.2;
export const CLAP_MAX_GAP = 0.8;
/** A clap is short: a sound above the threshold for longer than this is something else. */
export const CLAP_MAX_LENGTH = 0.3;
/** The window before a clap is at most this share of the clap's level (a sharp attack). */
export const CLAP_ATTACK_RATIO = 0.45;
/**
 * A clap is decided one window later: if the level keeps climbing past this factor of the crossing level, it was
 * a sound swelling in (a syllable), not a clap's crack (whose peak is already in the window that crosses).
 */
export const CLAP_RISE_LIMIT = 1.25;
/** Seconds of listening before anything counts, while the background is measured. */
export const CLAP_WARMUP = 0.5;

/**
 * How far above the background a clap must be (`ratio`) and its absolute minimum (`floor`), as peak amplitude 0–1.
 * Low sensitivity is for rooms with echo or noise: only loud, clear claps count.
 */
export const CLAP_SENSITIVITY: Record<ClapSensitivity, { ratio: number; floor: number }> = {
  high: { ratio: 2.5, floor: 0.06 },
  medium: { ratio: 3.5, floor: 0.12 },
  low: { ratio: 5, floor: 0.22 },
};

/** The threshold never goes above this, so a very loud room still has a reachable trigger. */
const THRESHOLD_CEILING = 0.92;
/** Background estimate: rises slowly (a burst of noise barely moves it), falls fast (the room went quiet). */
const NOISE_TAU_UP = 1.5;
const NOISE_TAU_DOWN = 0.3;
const NOISE_TAU_WARMUP = 0.1;
const NOISE_START = 0.01;
/** A sound ends when it falls under this share of the threshold, or of its own peak (reverb tails). */
const RELEASE_OF_THRESHOLD = 0.6;
const RELEASE_OF_PEAK = 0.3;

export interface ClapReading {
  state: ClapState;
  /** Set on the window where a sound crossed the threshold; null otherwise. */
  hit: ClapHit | null;
  /** This window's level (0–1), as pushed. */
  level: number;
  /** The background estimate. */
  noise: number;
  /** Level a sound must reach to count, now. */
  threshold: number;
  /** False during the first `CLAP_WARMUP` seconds. */
  ready: boolean;
}

export interface ClapDetector {
  /** One window: its time in seconds (any origin, increasing) and its peak level 0–1. */
  push(time: number, level: number): ClapReading;
  setSensitivity(sensitivity: ClapSensitivity): void;
  /** Back to listening from scratch (keeps the sensitivity and the background estimate). */
  reset(): void;
  readonly state: ClapState;
}

export function clapThreshold(noise: number, sensitivity: ClapSensitivity): number {
  const { ratio, floor } = CLAP_SENSITIVITY[sensitivity];
  return Math.min(THRESHOLD_CEILING, Math.max(floor, noise * ratio));
}

export function createClapDetector(options: { sensitivity?: ClapSensitivity } = {}): ClapDetector {
  let sensitivity: ClapSensitivity = options.sensitivity ?? 'medium';
  let noise = NOISE_START;
  let startedAt: number | null = null;
  let prevTime: number | null = null;
  let state: ClapState = 'idle';
  let firstAt = 0;
  /** The sound above the threshold right now, if any. */
  let sound: { at: number; max: number; long: boolean; pending: boolean } | null = null;
  let prevLevel = 0;

  function countClap(at: number): ClapHit | null {
    if (state === 'idle') {
      state = 'first';
      firstAt = at;
      return 'first';
    }
    if (state === 'first') {
      if (at - firstAt < CLAP_MIN_GAP) return 'echo';
      state = 'fired';
      return 'second';
    }
    return null;
  }

  function push(time: number, raw: number): ClapReading {
    const level = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
    startedAt ??= time;
    const dt = prevTime == null ? 0 : Math.max(0, time - prevTime);
    prevTime = time;
    const ready = time - startedAt >= CLAP_WARMUP;
    let hit: ClapHit | null = null;

    // A lone clap waits only so long for its pair.
    if (state === 'first' && time - firstAt > CLAP_MAX_GAP) state = 'idle';

    const threshold = clapThreshold(noise, sensitivity);
    if (sound?.pending) {
      sound.pending = false;
      if (level > sound.max * CLAP_RISE_LIMIT) sound.long = true;
      else hit = countClap(sound.at);
    }
    if (sound) {
      // A sound that goes on is the room getting louder (music, chatter): the background follows it, slowly, so the
      // threshold rises above it and claps on top of it can count again.
      if (sound.long && dt > 0) noise += (level - noise) * (1 - Math.exp(-dt / NOISE_TAU_UP));
      sound.max = Math.max(sound.max, level);
      const release = Math.max(threshold * RELEASE_OF_THRESHOLD, sound.max * RELEASE_OF_PEAK);
      if (level < release) sound = null;
      else if (!sound.long && time - sound.at > CLAP_MAX_LENGTH) {
        // Not a clap (a voice, music, something dragged): it also cancels a clap waiting for its pair.
        sound.long = true;
        if (state === 'first') state = 'idle';
      }
    } else {
      if (ready && level >= threshold && prevLevel > level * CLAP_ATTACK_RATIO) {
        // Crossed, but rising softly (a syllable, a swell): not a clap. Followed like any sound until it fades.
        sound = { at: time, max: level, long: true, pending: false };
      } else if (ready && level >= threshold) {
        // Sharp: a clap if the next window doesn't keep climbing.
        sound = { at: time, max: level, long: false, pending: true };
      } else if (dt > 0) {
        const tau = !ready ? NOISE_TAU_WARMUP : level > noise ? NOISE_TAU_UP : NOISE_TAU_DOWN;
        noise += (level - noise) * (1 - Math.exp(-dt / tau));
      }
    }

    prevLevel = level;
    return { state, hit, level, noise, threshold: clapThreshold(noise, sensitivity), ready };
  }

  return {
    push,
    setSensitivity(next) {
      sensitivity = next;
    },
    reset() {
      state = 'idle';
      sound = null;
    },
    get state() {
      return state;
    },
  };
}

/** Peak amplitude (0–1) of one window of samples. */
export function peakOf(samples: ArrayLike<number>): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i]!);
    if (v > peak) peak = v;
  }
  return Math.min(1, peak);
}

/** A level 0–1 on a meter that reads like the ear: decibels from −54 dB (empty) to 0 dB (full). */
export function levelToMeter(level: number): number {
  if (!(level > 0)) return 0;
  return Math.min(1, Math.max(0, (20 * Math.log10(level) + 54) / 54));
}
