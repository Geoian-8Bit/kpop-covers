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

// ───────────────────────── 18 · Separated tracks (AI) ─────────────────────────

/**
 * With tracks separated by the AI model, «Sin voz» and «Voz» play those instead of the mid/side split: gains of
 * the file's own sound (`dry`) and of each track. The mid/side paths stay at 0 meanwhile.
 */
export interface StemGains {
  dry: number;
  instrumental: number;
  vocals: number;
}

export function stemModeGains(mode: VoiceMode): StemGains {
  switch (mode) {
    case 'sin-voz':
      return { dry: 0, instrumental: 1, vocals: 0 };
    case 'voz':
      return { dry: 0, instrumental: 0, vocals: 1 };
    case 'original':
    default:
      return { dry: 1, instrumental: 0, vocals: 0 };
  }
}

/**
 * Keeping a track (an <audio> element) on the video's clock. Small drifts are absorbed by playing the track a
 * little faster or slower (pitch kept, inaudible at ±5 %); big ones (a jump, a loop, a stall) by seeking it.
 *
 * After every jump (a loop back to A, a seek, a resume) an <audio> element starts some 30–100 ms late on phones,
 * which sits under `seekSeconds`. Two things keep that from being heard: the jump lands ahead by a lead learnt from
 * the previous jumps (`learnLead`), and while the drift is still beyond `catchUpSeconds` the nudge is stronger (up
 * to `maxCatchUp`, still a gentle tempo change with the pitch kept).
 */
export const STEM_SYNC = {
  /** Beyond this the track jumps to where it should be. */
  seekSeconds: 0.25,
  /** Within this nothing is corrected (the clocks' own jitter). */
  okSeconds: 0.02,
  /** Rate correction per second of drift, capped at `maxNudge`. */
  gain: 1,
  maxNudge: 0.05,
  /** Beyond this drift (heard as a late beat) the correction is stronger… */
  catchUpSeconds: 0.06,
  catchUpGain: 1,
  /** …but never more than this tempo change (pitch kept: a few hundred ms at 8 % don't sound odd). */
  maxCatchUp: 0.08,
  /** Lead of a jump before anything has been learnt (the track's seek takes a moment while the video carries on). */
  seekLead: 0.04,
  /** Learning the lead: weight of each new reading, the lead's range, and the largest reading believed. */
  leadAlpha: 0.5,
  maxLead: 0.2,
  maxLeadSample: 0.25,
  /** The track counts as in step (the switch from the file's own sound can happen) within this. */
  readySeconds: 0.06,
} as const;

export type StemSyncAction =
  | { kind: 'seek'; to: number }
  | { kind: 'rate'; rate: number }
  | { kind: 'stop' };

/** Rate correction for a drift (track − where it should be, s): ahead (> 0) a little slower, behind a little faster. */
export function stemNudge(drift: number): number {
  const size = Math.abs(drift);
  if (!(size > STEM_SYNC.okSeconds)) return 0;
  const strong = size > STEM_SYNC.catchUpSeconds;
  const gain = strong ? STEM_SYNC.catchUpGain : STEM_SYNC.gain;
  const cap = strong ? STEM_SYNC.maxCatchUp : STEM_SYNC.maxNudge;
  return Math.max(-cap, Math.min(cap, drift * gain));
}

/**
 * What a playing track should do now. Times in the track's own seconds; `delay` is the measured encoder delay
 * (the track's sound starts that much later than the file's), so the track should be at `master + delay`.
 * `seekLead` (wall seconds) is how far ahead a jump lands: the learnt one when there is one.
 */
export function stemSyncAction(args: {
  masterTime: number;
  masterRate: number;
  trackTime: number;
  trackDuration: number;
  delay: number;
  seekLead?: number;
}): StemSyncAction {
  const target = args.masterTime + args.delay;
  const rate = args.masterRate > 0 ? args.masterRate : 1;
  if (Number.isFinite(args.trackDuration) && args.trackDuration > 0 && target >= args.trackDuration - 0.05) {
    return { kind: 'stop' };
  }
  const drift = args.trackTime - target;
  const lead = clampLead(args.seekLead ?? STEM_SYNC.seekLead);
  if (Math.abs(drift) > STEM_SYNC.seekSeconds) return { kind: 'seek', to: Math.max(0, target + lead * rate) };
  return { kind: 'rate', rate: rate * (1 - stemNudge(drift)) };
}

function clampLead(lead: number): number {
  return Number.isFinite(lead) ? Math.min(STEM_SYNC.maxLead, Math.max(0, lead)) : STEM_SYNC.seekLead;
}

/**
 * Learns how far ahead a jump has to land. After a jump that landed `lead` ahead, the first steady reading of the
 * drift (track − where it should be, both clocks running at the same rate) says how late the track really started:
 * `landed − drift / rate`, where `landed` is how far ahead that jump really landed (the learnt lead, unless the track
 * was already close enough not to be moved). The learnt lead moves part of the way there (`leadAlpha`) and stays
 * within 0…`maxLead`; a reading too big to be a start-up delay (a stall, buffering) teaches nothing.
 */
export function learnLead(learnt: number, drift: number, rate = 1, landed: number = learnt): number {
  const current = clampLead(learnt);
  if (!Number.isFinite(drift) || !Number.isFinite(landed) || Math.abs(drift) > STEM_SYNC.maxLeadSample) return current;
  const r = rate > 0 && Number.isFinite(rate) ? rate : 1;
  const ideal = landed - drift / r;
  return clampLead(current + STEM_SYNC.leadAlpha * (ideal - current));
}

/** The parts of a separation the player needs (see `video_stems`). */
export interface StemRow {
  id: string;
  source_file_name: string;
  source_file_size: number;
  vocals_path: string | null;
  instrumental_path: string | null;
  delay_seconds: number;
  created_at: string;
}

/**
 * Which separation goes with the video's file now: the newest complete one made from this same file (name and
 * size, like the linked file's identity). A replaced file never plays with the old file's tracks.
 */
export function pickStems<T extends StemRow>(
  video: { file_name: string | null; file_size: number | null },
  rows: readonly T[],
): (T & { vocals_path: string; instrumental_path: string }) | null {
  if (!video.file_name || video.file_size == null) return null;
  let best: T | null = null;
  for (const row of rows) {
    if (!row.vocals_path || !row.instrumental_path) continue;
    if (row.source_file_name !== video.file_name || Number(row.source_file_size) !== Number(video.file_size)) continue;
    if (!best || row.created_at > best.created_at) best = row;
  }
  return best as (T & { vocals_path: string; instrumental_path: string }) | null;
}

/** 18 · An entry with a file of its own that the AI separation could take (an upload, or a YouTube entry's file). */
export function hasSeparableFile(video: { source: string; file_name: string | null }): boolean {
  return Boolean(video.file_name) && (video.source === 'upload' || video.source === 'youtube');
}

/**
 * Global review 2 [5] · Whether «Separar voz y música» shows. It stays mounted for as long as the song has a file
 * (the stage letting its engine go — «YouTube» picked, a resync, a media error — must not cancel the work); it
 * shows while the file plays on the stage, and a separation already running keeps showing its progress meanwhile.
 */
export function separateShown(o: { hasFile: boolean; available: boolean; running: boolean }): boolean {
  return o.hasFile && (o.available || o.running);
}
