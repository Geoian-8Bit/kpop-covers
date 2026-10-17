/**
 * F7 · Start recording with a clap: a double-clap detector fed with the microphone's raw samples.
 *
 * Pure logic (no Web Audio here): the app copies the newest samples from an AnalyserNode and hands them over chunk
 * by chunk; the detector filters them itself, so everything it decides on is measured here and testable.
 *
 * Every 0.5 ms ("hop") it measures, from two filtered copies of the signal:
 *   - the high band (above ~1.5 kHz): its peak (the level a clap must reach) and its energy;
 *   - the low band (below ~400 Hz): its energy (where a chair, a table, a door, footsteps and voices live).
 * A sound that crosses the threshold becomes an event; ~80 ms later it is judged on its timbre:
 *   - level: peak over `max(floor, ratio × background)` (the background follows the room, slowly);
 *   - attack: from the last quiet hop until a quarter of its energy has arrived; a clap takes ~1–2 ms, a knock,
 *     a step or a swelling sound longer;
 *   - decay: a clap falls to 40 % of its peak within tens of ms; a scrape, a voice or music stay up;
 *   - brightness: high-band energy over low-band energy around the peak; a clap is bright, a thump is dull;
 *   - crest: peak over RMS in the high band; a clap is a spike, a squeak or a whistle are steady.
 * Then the pair: two clap-like events between `CLAP_MIN_GAP` and `CLAP_MAX_GAP` apart, alike in level and
 * brightness, fire. A clap-like event sooner than `CLAP_MIN_GAP` after the first is its echo; any other sound in
 * between cancels a first clap; a lone clap expires.
 *
 * Nothing is allocated per chunk: buffers are made once and the reading is one object updated in place.
 */

/**
 * From the least to the most sensitive. `max` («Muy alta») takes the place of the old 3-level scale's «Alta» (a stored
 * «Alta» moves to it), but it is stricter than that was: it needs more above the background (ratio 4,5 instead of
 * 2,5) and passes the timbre checks.
 */
export type ClapSensitivity = 'low' | 'medium' | 'high' | 'max';
export type ClapState = 'idle' | 'first' | 'fired';
/** What a clap-like sound was taken for. */
export type ClapHit = 'first' | 'echo' | 'second';
/** Why a sound that crossed the threshold was not taken for a clap. */
export type ClapReject = 'attack' | 'decay' | 'dull' | 'steady' | 'unlike';

export const CLAP_SENSITIVITIES: readonly ClapSensitivity[] = ['low', 'medium', 'high', 'max'];

/** Version of the sensitivity scale stored with the settings (1 = the old low/medium/high). */
export const CLAP_SCALE = 2;

/**
 * A stored sensitivity on the current scale. The old 3-level scale (no version) maps to its equivalent: its «Alta»
 * is the new «Muy alta»; «Baja» and «Media» keep their names. Unknown values give null (the default applies).
 */
export function migrateClapSensitivity(value: unknown, scale: unknown): ClapSensitivity | null {
  if (scale === CLAP_SCALE) return (CLAP_SENSITIVITIES as readonly unknown[]).includes(value) ? (value as ClapSensitivity) : null;
  if (value === 'high') return 'max';
  if (value === 'low' || value === 'medium') return value;
  return null;
}

/** Seconds between the two claps' peaks. */
export const CLAP_MIN_GAP = 0.2;
export const CLAP_MAX_GAP = 0.8;
/** A clap is short: a sound above the release level for longer than this is something else. */
export const CLAP_MAX_LENGTH = 0.3;
/** Seconds of listening before anything counts, while the background is measured. */
export const CLAP_WARMUP = 0.5;
/** A clap is a spike: its high-band peak is at least this many times its RMS around it. */
export const CLAP_MIN_CREST = 3;
/** The two claps of a pair: peaks within this factor, brightness within `CLAP_PAIR_BRIGHTNESS`. */
export const CLAP_PAIR_LEVEL = 3;
export const CLAP_PAIR_BRIGHTNESS = 8;

export interface ClapLevel {
  /** How far above the background (high-band peak per hop) a clap must be. */
  ratio: number;
  /** Its absolute minimum, as peak amplitude 0–1 of the high band. */
  floor: number;
  /** High-band energy over low-band energy, at least. */
  minBrightness: number;
  /** Longest attack (ms): from the last quiet hop until a quarter of the sound's energy has arrived. */
  maxAttackMs: number;
  /** Longest time (ms) to fall to 40 % of the peak. */
  maxDecayMs: number;
}

/**
 * Low is for rooms with echo or noise: only loud, clean claps close by. Every level asks more than the old scale
 * (whose «Baja» fired on a chair being moved), `max` included: it replaces the old «Alta» with a higher level
 * (ratio 4,5 instead of 2,5) and the timbre checks.
 */
export const CLAP_LEVELS: Record<ClapSensitivity, ClapLevel> = {
  low: { ratio: 10, floor: 0.26, minBrightness: 2, maxAttackMs: 2.5, maxDecayMs: 35 },
  medium: { ratio: 7, floor: 0.15, minBrightness: 1.2, maxAttackMs: 3, maxDecayMs: 45 },
  high: { ratio: 5.5, floor: 0.095, minBrightness: 0.8, maxAttackMs: 3.5, maxDecayMs: 55 },
  max: { ratio: 4.5, floor: 0.06, minBrightness: 0.5, maxAttackMs: 3.5, maxDecayMs: 70 },
};

/** The threshold never goes above this, so a very loud room still has a reachable trigger. */
const THRESHOLD_CEILING = 0.92;
/** Band edges (Hz). */
const HIGH_HZ = 1500;
const LOW_HZ = 400;
/** One hop, in seconds. */
const HOP_SEC = 0.0005;
const HOP_MS = HOP_SEC * 1000;
/** Hops kept (256 ms): enough to look back before a crossing and forward to its decision. */
const RING = 512;
/** After the crossing, the peak is looked for this long (hops: 10 ms). */
const PEAK_SEARCH = 20;
/** The attack is looked for this far back from the crossing (hops: 15 ms); none found = a slow attack. */
const ATTACK_LOOKBACK = 30;
/** The attack ends when this share of the sound's energy has arrived. */
const ATTACK_ENERGY = 0.25;
/** A hop is quiet under this share of the peak (or near the background). */
const ATTACK_BOTTOM = 0.2;
const DECAY_TO = 0.4;
/** Brightness and crest window around the peak (hops: −2 ms … +25 ms). */
const BODY_BEFORE = 4;
const BODY_AFTER = 50;
/** An event is judged this many hops after it crossed (~80 ms): the longest decay plus a margin. */
const DECIDE_AFTER = PEAK_SEARCH + Math.ceil(Math.max(...Object.values(CLAP_LEVELS).map((l) => l.maxDecayMs)) / HOP_MS) + 4;
/** Background estimate: rises slowly (a burst of noise barely moves it), falls fast (the room went quiet). */
const NOISE_TAU_UP = 1.5;
const NOISE_TAU_DOWN = 0.3;
const NOISE_TAU_WARMUP = 0.1;
const NOISE_START = 0.005;
/** A sound ends when it falls under this share of the threshold, or of its own peak (reverb tails). */
const RELEASE_OF_THRESHOLD = 0.6;
const RELEASE_OF_PEAK = 0.3;

export interface ClapFeatures {
  /** Seconds (detector clock) of the event's peak. */
  at: number;
  /** High-band peak, 0–1. */
  peak: number;
  attackMs: number;
  /** Infinity when it did not fall within the longest allowed decay. */
  decayMs: number;
  brightness: number;
  crest: number;
}

export interface ClapReading {
  state: ClapState;
  /** Set on the chunk where a clap-like sound was judged; null otherwise. */
  hit: ClapHit | null;
  /** Set on the chunk where a sound that crossed the threshold was judged not to be a clap. */
  rejected: ClapReject | null;
  /** Features of the sound judged in this chunk, if any (the same object, overwritten by the next one). */
  judged: ClapFeatures | null;
  /** Loudest high-band hop of this chunk (0–1): the meter. */
  level: number;
  /** The background estimate. */
  noise: number;
  /** Level a sound must reach to count, now. */
  threshold: number;
  /** False during the first `CLAP_WARMUP` seconds. */
  ready: boolean;
}

export interface ClapDetector {
  /**
   * Feeds `samples[from…to)`, the samples that follow the previous chunk. Returns the reading (always the same
   * object, updated in place: read it before the next call).
   */
  process(samples: ArrayLike<number>, from?: number, to?: number): ClapReading;
  /** Samples that were lost (the page stalled): the clock moves on and a sound being followed is dropped. */
  skip(count: number): void;
  setSensitivity(sensitivity: ClapSensitivity): void;
  /** Back to listening from scratch (keeps the sensitivity and the background estimate). */
  reset(): void;
  readonly state: ClapState;
  /** Seconds of signal heard (including skipped samples). */
  readonly time: number;
}

export function clapThreshold(noise: number, sensitivity: ClapSensitivity): number {
  const { ratio, floor } = CLAP_LEVELS[sensitivity];
  return Math.min(THRESHOLD_CEILING, Math.max(floor, noise * ratio));
}

/** Why these features are not a clap at this sensitivity, or null when they are. Level is checked by the caller. */
export function clapRejection(f: ClapFeatures, sensitivity: ClapSensitivity): ClapReject | null {
  const l = CLAP_LEVELS[sensitivity];
  if (!(f.attackMs <= l.maxAttackMs)) return 'attack';
  if (!(f.decayMs <= l.maxDecayMs)) return 'decay';
  if (!(f.brightness >= l.minBrightness)) return 'dull';
  if (!(f.crest >= CLAP_MIN_CREST)) return 'steady';
  return null;
}

/** Two claps of one double clap sound alike: not a loud crack and a faint knock. */
export function clapsAlike(a: ClapFeatures, b: ClapFeatures): boolean {
  const level = a.peak / b.peak;
  const bright = a.brightness / b.brightness;
  return (
    level <= CLAP_PAIR_LEVEL &&
    level >= 1 / CLAP_PAIR_LEVEL &&
    bright <= CLAP_PAIR_BRIGHTNESS &&
    bright >= 1 / CLAP_PAIR_BRIGHTNESS
  );
}

/** RBJ biquad coefficients, normalised (b0, b1, b2, a1, a2). */
function biquad(kind: 'high' | 'low', hz: number, sampleRate: number): [number, number, number, number, number] {
  const w = (2 * Math.PI * Math.min(hz, sampleRate * 0.45)) / sampleRate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * Math.SQRT1_2);
  const a0 = 1 + alpha;
  const b1 = kind === 'high' ? -(1 + cos) : 1 - cos;
  const b0 = kind === 'high' ? (1 + cos) / 2 : (1 - cos) / 2;
  return [b0 / a0, b1 / a0, b0 / a0, (-2 * cos) / a0, (1 - alpha) / a0];
}

export function createClapDetector(
  options: { sampleRate?: number; sensitivity?: ClapSensitivity } = {},
): ClapDetector {
  const sampleRate = options.sampleRate ?? 48_000;
  let sensitivity: ClapSensitivity = options.sensitivity ?? 'medium';
  const hopSize = Math.max(1, Math.round(sampleRate * HOP_SEC));
  const hopSec = hopSize / sampleRate;
  const upCoef = 1 - Math.exp(-hopSec / NOISE_TAU_UP);
  const downCoef = 1 - Math.exp(-hopSec / NOISE_TAU_DOWN);
  const warmCoef = 1 - Math.exp(-hopSec / NOISE_TAU_WARMUP);
  const maxLengthHops = Math.round(CLAP_MAX_LENGTH / HOP_SEC);

  const [hb0, hb1, hb2, ha1, ha2] = biquad('high', HIGH_HZ, sampleRate);
  const [lb0, lb1, lb2, la1, la2] = biquad('low', LOW_HZ, sampleRate);
  let hx1 = 0, hx2 = 0, hy1 = 0, hy2 = 0;
  let lx1 = 0, lx2 = 0, ly1 = 0, ly2 = 0;

  // Per hop: high-band peak and energy, low-band energy, time of its end.
  const ringPeak = new Float32Array(RING);
  const ringHigh = new Float32Array(RING);
  const ringLow = new Float32Array(RING);
  const ringTime = new Float64Array(RING);
  let hop = 0; // hops completed
  /** Oldest hop that belongs to the current stretch of continuous signal (after a skip). */
  let validFrom = 0;
  let fill = 0;
  let accPeak = 0;
  let accHigh = 0;
  let accLow = 0;
  let samplesHeard = 0;

  let noise = NOISE_START;
  /** Background high-band energy per hop (follows like `noise`). */
  let noiseEnergy = 0;
  let state: ClapState = 'idle';
  let firstAt = 0;
  const first: ClapFeatures = { at: 0, peak: 0, attackMs: 0, decayMs: 0, brightness: 0, crest: 0 };
  const judged: ClapFeatures = { at: 0, peak: 0, attackMs: 0, decayMs: 0, brightness: 0, crest: 0 };

  // The sound above the threshold right now, if any.
  let active = false;
  let onset = 0;
  let peakHop = 0;
  let peak = 0;
  let decided = false;
  let long = false;

  const reading: ClapReading = {
    state: 'idle',
    hit: null,
    rejected: null,
    judged: null,
    level: 0,
    noise,
    threshold: clapThreshold(noise, sensitivity),
    ready: false,
  };

  const at = (h: number) => ringPeak[h % RING]!;

  /** Measures the event that crossed at `onset` (all its hops are in the ring by now). */
  function measure(): ClapFeatures {
    // Attack: from the last quiet hop before the crossing to the moment a quarter of the sound's energy (over the
    // background) has arrived. Energy, not single peaks: one lucky noise spike in a burst can't move it. "Quiet"
    // also means near the background, so a clap just over the threshold in a noisy room still shows its attack.
    const quiet = Math.max(peak * ATTACK_BOTTOM, noise * 1.25);
    const stop = Math.max(validFrom, onset - ATTACK_LOOKBACK);
    let j = onset - 1;
    while (j >= stop && at(j) >= quiet) j--;
    const end = Math.min(hop - 1, peakHop + BODY_AFTER);
    if (j < stop) judged.attackMs = Infinity;
    else {
      let total = 0;
      for (let i = j + 1; i <= end; i++) total += Math.max(0, ringHigh[i % RING]! - noiseEnergy);
      let sum = 0;
      let i = j + 1;
      for (; i <= end; i++) {
        sum += Math.max(0, ringHigh[i % RING]! - noiseEnergy);
        if (sum >= total * ATTACK_ENERGY) break;
      }
      judged.attackMs = (i - j) * HOP_MS;
    }

    // Decay: the first two hops in a row under 40 % of the peak (one dip in a noisy burst is not the end).
    const limit = Math.min(hop - 2, peakHop + DECIDE_AFTER - PEAK_SEARCH);
    const fall = peak * DECAY_TO;
    let d = Infinity;
    for (let i = peakHop + 1; i <= limit; i++) {
      if (at(i) < fall && at(i + 1) < fall) {
        d = (i - peakHop) * HOP_MS;
        break;
      }
    }
    judged.decayMs = d;

    // Timbre around the peak.
    let high = 0;
    let low = 0;
    const from = Math.max(validFrom, peakHop - BODY_BEFORE);
    const to = Math.min(hop - 1, peakHop + BODY_AFTER);
    for (let i = from; i <= to; i++) {
      high += ringHigh[i % RING]!;
      low += ringLow[i % RING]!;
    }
    const n = (to - from + 1) * hopSize;
    judged.brightness = high / Math.max(low, 1e-12 * n);
    judged.crest = high > 0 ? peak / Math.sqrt(high / n) : 0;
    judged.peak = peak;
    judged.at = ringTime[peakHop % RING]!;
    return judged;
  }

  function decide() {
    const f = measure();
    reading.judged = f;
    if (state === 'fired') return;
    const reject = clapRejection(f, sensitivity);
    if (state === 'first' && f.at - firstAt < CLAP_MIN_GAP) {
      // The room answering the first clap (or the same clap's tail): not a new sound.
      if (!reject) reading.hit = 'echo';
      return;
    }
    if (reject) {
      reading.rejected = reject;
      if (state === 'first') state = 'idle';
      return;
    }
    if (state === 'first' && f.at - firstAt <= CLAP_MAX_GAP && clapsAlike(first, f)) {
      state = 'fired';
      reading.hit = 'second';
      return;
    }
    if (state === 'first') reading.rejected = f.at - firstAt <= CLAP_MAX_GAP ? 'unlike' : null;
    // A first clap (or a clap unlike the first one, which starts the pair over).
    state = 'first';
    firstAt = f.at;
    Object.assign(first, f);
    reading.hit = 'first';
  }

  function endHop(time: number) {
    const slot = hop % RING;
    ringPeak[slot] = accPeak;
    ringHigh[slot] = accHigh;
    ringLow[slot] = accLow;
    ringTime[slot] = time;
    const level = accPeak;
    const energy = accHigh;
    accPeak = 0;
    accHigh = 0;
    accLow = 0;
    fill = 0;
    const k = hop;
    hop++;
    if (level > reading.level) reading.level = level;

    // Flush the filters' tails before they turn subnormal (slow on some CPUs).
    if (Math.abs(hy1) < 1e-20 && Math.abs(hy2) < 1e-20) hy1 = hy2 = 0;
    if (Math.abs(ly1) < 1e-20 && Math.abs(ly2) < 1e-20) ly1 = ly2 = 0;

    const ready = time >= CLAP_WARMUP;
    reading.ready = ready;
    // A lone clap waits only so long for its pair (a sound that started in time is still judged).
    if (state === 'first' && time - firstAt > CLAP_MAX_GAP) {
      const pending = active && !decided && ringTime[onset % RING]! - firstAt <= CLAP_MAX_GAP;
      if (!pending) state = 'idle';
    }
    const threshold = clapThreshold(noise, sensitivity);

    if (!active) {
      if (ready && level >= threshold) {
        active = true;
        onset = k;
        peakHop = k;
        peak = level;
        decided = false;
        long = false;
      } else {
        const coef = !ready ? warmCoef : level > noise ? upCoef : downCoef;
        noise += (level - noise) * coef;
        noiseEnergy += (energy - noiseEnergy) * (!ready ? warmCoef : energy > noiseEnergy ? upCoef : downCoef);
      }
      return;
    }

    const age = k - onset;
    if (age <= PEAK_SEARCH && level > peak) {
      peak = level;
      peakHop = k;
    }
    if (!decided) {
      if (age < DECIDE_AFTER) return;
      decided = true;
      decide();
    }
    // A sound that goes on is the room getting louder (music, chatter): the background follows it, slowly, so
    // the threshold rises above it and claps on top of it can count again.
    if (long) {
      noise += (level - noise) * upCoef;
      noiseEnergy += (energy - noiseEnergy) * upCoef;
    }
    const release = Math.max(threshold * RELEASE_OF_THRESHOLD, peak * RELEASE_OF_PEAK);
    if (level < release) active = false;
    else if (!long && age > maxLengthHops) {
      long = true;
      // Not a clap (a voice, music, something dragged): it also cancels a clap waiting for its pair.
      if (state === 'first') state = 'idle';
    }
  }

  function process(samples: ArrayLike<number>, from = 0, to = samples.length): ClapReading {
    reading.hit = null;
    reading.rejected = null;
    reading.judged = null;
    reading.level = 0;
    const end = Math.min(to, samples.length);
    for (let i = Math.max(0, from); i < end; i++) {
      let x = samples[i]!;
      if (!(x > -1)) x = x !== x ? 0 : -1;
      else if (x > 1) x = 1;
      const h = hb0 * x + hb1 * hx1 + hb2 * hx2 - ha1 * hy1 - ha2 * hy2;
      hx2 = hx1;
      hx1 = x;
      hy2 = hy1;
      hy1 = h;
      const l = lb0 * x + lb1 * lx1 + lb2 * lx2 - la1 * ly1 - la2 * ly2;
      lx2 = lx1;
      lx1 = x;
      ly2 = ly1;
      ly1 = l;
      const a = h < 0 ? -h : h;
      if (a > accPeak) accPeak = a;
      accHigh += h * h;
      accLow += l * l;
      samplesHeard++;
      if (++fill === hopSize) endHop(samplesHeard / sampleRate);
    }
    reading.state = state;
    reading.noise = noise;
    reading.threshold = clapThreshold(noise, sensitivity);
    if (reading.level > 1) reading.level = 1;
    return reading;
  }

  return {
    process,
    skip(count) {
      if (!(count > 0)) return;
      samplesHeard += Math.round(count);
      fill = 0;
      accPeak = accHigh = accLow = 0;
      active = false;
      validFrom = hop;
    },
    setSensitivity(next) {
      sensitivity = next;
    },
    reset() {
      state = 'idle';
      active = false;
    },
    get state() {
      return state;
    },
    get time() {
      return samplesHeard / sampleRate;
    },
  };
}

/**
 * Samples that went by since the last read of an analyser, from the audio clock in samples
 * (`round(ctx.currentTime × sampleRate)`). The newest `min(result, bufferLength)` of its buffer are new; any more
 * went by unread (a stalled page). The first read (no previous clock) takes the whole buffer.
 */
export function samplesSince(lastClock: number | null, clock: number, bufferLength: number): number {
  if (lastClock == null) return bufferLength;
  return Math.max(0, Math.round(clock - lastClock));
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

/** One sound the detector judged, kept for the «i» panel: what it was taken for and its measures. */
export interface ClapLogEntry {
  /** What it counted as, or why it didn't. */
  verdict: ClapHit | ClapReject;
  /** High-band peak over the threshold at that moment (≥ 1: it was loud enough). */
  overThreshold: number;
  brightness: number;
  attackMs: number;
  /** Infinity when it did not fall within the longest allowed decay. */
  decayMs: number;
  crest: number;
}

/** What to say about a judged sound, in the panel's words. */
export const CLAP_VERDICT_LABEL: Record<ClapHit | ClapReject, string> = {
  first: 'primera palmada',
  second: 'segunda: ¡señal!',
  echo: 'eco de la anterior',
  attack: 'no: empieza despacio',
  decay: 'no: dura demasiado',
  dull: 'no: suena sordo',
  steady: 'no: sonido continuo',
  unlike: 'distinta de la primera: cuenta como primera',
};

/**
 * The entry for a reading where a sound was judged (null otherwise), copied out of the reading (which the detector
 * overwrites on the next chunk). A sound judged without a verdict (a clap after the detector fired) is not kept.
 */
export function clapLogEntry(reading: ClapReading): ClapLogEntry | null {
  const f = reading.judged;
  if (!f) return null;
  const verdict = reading.rejected ?? reading.hit;
  if (!verdict) return null;
  return {
    verdict,
    overThreshold: reading.threshold > 0 ? f.peak / reading.threshold : 0,
    brightness: f.brightness,
    attackMs: f.attackMs,
    decayMs: f.decayMs,
    crest: f.crest,
  };
}
