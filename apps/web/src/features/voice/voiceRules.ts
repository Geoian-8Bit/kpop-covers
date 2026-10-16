/**
 * F17 · Separar la voz y la música — the pure part: which gains each mode uses, how long a change glides, and
 * whether a track «sounds mono» from L/R correlation readings. No Web Audio here; covered by `voiceRules.test.ts`.
 *
 * How the separation works (and why it is only an approximation): most pop mixes put the lead vocal, the kick,
 * the bass and the snare in the centre (identical in both channels) and spread the rest (guitars, keys, pads,
 * backing vocals, reverb) across the sides. With
 *
 *     mid  = (L + R) / 2   → what is in the centre
 *     side = (L − R) / 2   → what differs between the channels
 *
 * removing the centre leaves the sides («sin voz»), and keeping only the centre, band-limited to where a voice
 * lives, brings the voice forward («voz»). See `voiceSplit.ts` for the graph and its limits.
 */

export type VoiceMode = 'original' | 'sin-voz' | 'voz';

/** In display and keyboard order. */
export const VOICE_MODES: readonly VoiceMode[] = ['original', 'sin-voz', 'voz'];

export function isVoiceMode(value: unknown): value is VoiceMode {
  return typeof value === 'string' && (VOICE_MODES as readonly string[]).includes(value);
}

/** Tuning of the split. Frequencies in Hz, gains linear. */
export interface SplitTuning {
  /** «Sin voz» keeps the centre below this (kick and bass would vanish otherwise). */
  bassHz: number;
  /** «Sin voz» may keep the centre above this (hi-hats, air); how much is `keepHighs`. */
  highHz: number;
  /** 0…1: share of the centre's highs kept in «sin voz». 0 by default: sibilants of the voice live up there too. */
  keepHighs: number;
  /** «Voz»: band of the centre that is kept (a voice's fundamentals and formants, without kick, bass and cymbals). */
  voiceLowHz: number;
  voiceHighHz: number;
  /**
   * Level of the side in «sin voz». The side is (L − R) / 2, so a sound panned hard to one side comes out at half
   * its level; uncorrelated stereo content loses ~3 dB. 1.25 brings it back near the original loudness while
   * leaving headroom (a hard-left and hard-right sound at full scale at once would reach 1.25 — rare in a mix).
   */
  sideGain: number;
  /** Make-up gain for «voz» (the band-pass takes some level away). */
  voiceGain: number;
}

export const DEFAULT_TUNING: SplitTuning = {
  bassHz: 150,
  highHz: 8000,
  keepHighs: 0,
  voiceLowHz: 200,
  voiceHighHz: 6000,
  sideGain: 1.25,
  voiceGain: 1.2,
};

/** Merges a partial tuning over the defaults, ignoring non-finite values and clamping to sane ranges. */
export function resolveTuning(partial: Partial<SplitTuning> = {}): SplitTuning {
  const pick = (key: keyof SplitTuning, min: number, max: number) => {
    const value = partial[key];
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.min(max, Math.max(min, value))
      : DEFAULT_TUNING[key];
  };
  return {
    bassHz: pick('bassHz', 40, 400),
    highHz: pick('highHz', 2000, 16000),
    keepHighs: pick('keepHighs', 0, 1),
    voiceLowHz: pick('voiceLowHz', 60, 1000),
    voiceHighHz: pick('voiceHighHz', 1500, 12000),
    sideGain: pick('sideGain', 0, 2),
    voiceGain: pick('voiceGain', 0, 2),
  };
}

/** Gain of each path of the graph (see `voiceSplit.ts`). All paths are summed into the output. */
export interface ModeGains {
  /** The untouched stereo signal. */
  dry: number;
  /** Side, written +side to the left and −side to the right. */
  side: number;
  /** Centre below `bassHz`, to both channels. */
  bass: number;
  /** Centre above `highHz`, to both channels. */
  highs: number;
  /** Centre band-passed to the voice band, to both channels. */
  voice: number;
}

export function modeGains(mode: VoiceMode, tuning: SplitTuning = DEFAULT_TUNING): ModeGains {
  switch (mode) {
    case 'sin-voz':
      return { dry: 0, side: tuning.sideGain, bass: 1, highs: tuning.keepHighs, voice: 0 };
    case 'voz':
      return { dry: 0, side: 0, bass: 0, highs: 0, voice: tuning.voiceGain };
    case 'original':
    default:
      return { dry: 1, side: 0, bass: 0, highs: 0, voice: 0 };
  }
}

/** Default glide between modes: long enough that nothing clicks, short enough to feel immediate. */
export const DEFAULT_RAMP_MS = 180;

/** Glide length in seconds: default when missing or not a number, never negative, at most 2 s. */
export function rampSeconds(rampMs?: number): number {
  if (rampMs == null || !Number.isFinite(rampMs)) return DEFAULT_RAMP_MS / 1000;
  return Math.min(2000, Math.max(0, rampMs)) / 1000;
}

// ───────────────────────── «Parece mono» ─────────────────────────

/** One reading of the two channels (one analyser frame). */
export interface FrameStats {
  /** Pearson-like correlation of L and R around zero, −1…1 (1 = identical channels). */
  correlation: number;
  /** Side energy / mid energy (0 for a mono track). */
  sideRatio: number;
}

export const MONO_RULES = {
  /** Below this RMS (≈ −60 dBFS) a frame is silence and says nothing about the track. */
  silenceRms: 1e-3,
  /** A frame at or above this correlation counts as mono (equal-level channels ⇒ side ≈ −18 dB under mid). */
  correlation: 0.97,
  /** Frames needed before deciding (at one every 250 ms: 3 s of sound). */
  minFrames: 12,
  /** Share of mono frames needed to call the whole track mono (a stereo song has the odd centred moment). */
  share: 0.8,
  /** Frames kept (at one every 250 ms: the last 10 s). */
  maxFrames: 40,
} as const;

export type MonoRules = { [K in keyof typeof MONO_RULES]: number };

/**
 * Reads one pair of time-domain buffers. `null` when the frame is silence (it must not count either way).
 * A channel that is silent while the other sounds is the opposite of mono: correlation 0.
 */
export function frameStats(
  left: ArrayLike<number>,
  right: ArrayLike<number>,
  rules: Pick<MonoRules, 'silenceRms'> = MONO_RULES,
): FrameStats | null {
  const n = Math.min(left.length, right.length);
  if (n === 0) return null;
  let ll = 0;
  let rr = 0;
  let lr = 0;
  for (let i = 0; i < n; i++) {
    const l = left[i]!;
    const r = right[i]!;
    ll += l * l;
    rr += r * r;
    lr += l * r;
  }
  const rms = Math.sqrt((ll + rr) / (2 * n));
  if (!(rms >= rules.silenceRms)) return null;
  const mid = (ll + rr + 2 * lr) / 4;
  const side = (ll + rr - 2 * lr) / 4;
  const sideRatio = mid > 0 ? Math.max(0, side) / mid : Number.POSITIVE_INFINITY;
  const denominator = Math.sqrt(ll * rr);
  // One channel (practically) silent: not mono in the sense that matters here (L ≈ R).
  const correlation = denominator > 1e-12 ? Math.max(-1, Math.min(1, lr / denominator)) : 0;
  return { correlation, sideRatio };
}

/** Appends a frame and keeps only the newest `max`. Returns a new array. */
export function pushFrame(
  frames: readonly FrameStats[],
  frame: FrameStats,
  max: number = MONO_RULES.maxFrames,
): FrameStats[] {
  const next = [...frames, frame];
  return next.length > max ? next.slice(next.length - max) : next;
}

export interface MonoJudgement {
  /** The track looks mono: «sin voz» can't separate anything (it would leave only the bass). */
  monoLike: boolean;
  /** Enough sound has been heard to decide. Until then `monoLike` is false (don't warn on a hunch). */
  settled: boolean;
  /** Median correlation of the frames heard, or null before any. */
  correlation: number | null;
}

export function judgeMono(frames: readonly FrameStats[], rules: MonoRules = MONO_RULES): MonoJudgement {
  if (frames.length === 0) return { monoLike: false, settled: false, correlation: null };
  const sorted = frames.map((f) => f.correlation).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const correlation =
    sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  const settled = frames.length >= rules.minFrames;
  const monoFrames = frames.filter((f) => f.correlation >= rules.correlation).length;
  return { monoLike: settled && monoFrames / frames.length >= rules.share, settled, correlation };
}

// ───────────────────────── Keyboard ─────────────────────────

/** Radio-group keys: arrows move (wrapping), Home/End jump. `null` for any other key. */
export function stepMode(current: VoiceMode, key: string): VoiceMode | null {
  const n = VOICE_MODES.length;
  const index = Math.max(0, VOICE_MODES.indexOf(current));
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return VOICE_MODES[(index + 1) % n]!;
    case 'ArrowLeft':
    case 'ArrowUp':
      return VOICE_MODES[(index - 1 + n) % n]!;
    case 'Home':
      return VOICE_MODES[0]!;
    case 'End':
      return VOICE_MODES[n - 1]!;
    default:
      return null;
  }
}
