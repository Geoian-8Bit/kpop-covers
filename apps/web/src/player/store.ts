import {
  clamp,
  clampSpeed,
  MIN_LOOP_LENGTH,
  normalizeRange,
  originalTime,
  round3,
  songTimeAt,
} from '@coverscape/shared';
import { create } from 'zustand';
import type { VoiceMode } from '@/features/voice/voiceRules';
import type { PlayerEngine } from './engine';

export interface LoopState {
  start: number | null;
  end: number | null;
  enabled: boolean;
}

export interface ClipSettings {
  id: string;
  start_seconds: number;
  end_seconds: number;
  speed: number;
  mirrored: boolean;
}

interface PlayerStatus {
  ready: boolean;
  playing: boolean;
  buffering: boolean;
  time: number;
  duration: number;
  error: string | null;
}

interface PlayerState extends PlayerStatus {
  engine: PlayerEngine | null;
  rate: number;
  mirrored: boolean;
  loop: LoopState;
  /** Seconds to wait (paused) before each loop repetition – time to get back in position. */
  gap: number;
  countdownEndsAt: number | null;
  /** True while the user drags a timeline: the playhead follows the pointer, not the (laggy) engine clock. */
  scrubbing: boolean;
  /** performance.now() of the last scrub release; the engine clock is distrusted briefly after it. */
  scrubEndedAt: number;
  activeClipId: string | null;
  /**
   * F1 · What plays a YouTube entry that has its own file: the YouTube player (default) or the file. Uploaded
   * videos always play their file.
   */
  stage: 'youtube' | 'file';
  /** Where to land once the other stage's engine attaches (switching keeps the moment). */
  pendingSeek: number | null;
  setStage(stage: 'youtube' | 'file'): void;
  /** F17 · Voice and music apart, for files (the engine applies it; YouTube can't). */
  voiceMode: VoiceMode;
  setVoiceMode(mode: VoiceMode): void;

  attach(engine: PlayerEngine): void;
  detach(engine: PlayerEngine): void;
  reset(): void;
  sync(patch: Partial<PlayerStatus>): void;

  play(): void;
  pause(): void;
  togglePlay(): void;
  seek(seconds: number): void;
  /** Drag-seek: the playhead follows at once, the engine only every ~130 ms (the last spot lands on release). */
  scrubTo(seconds: number): void;
  nudge(delta: number): void;

  setRate(rate: number): void;
  setMirrored(mirrored: boolean): void;
  toggleMirror(): void;
  /** Repeat the whole song when it ends (A–B loop wins while enabled). Remembered per device. */
  loopAll: boolean;
  toggleLoopAll(): void;
  /** Metronome ticks during the pause between repetitions. Remembered per device. */
  countSound: boolean;
  toggleCountSound(): void;

  markStart(at?: number): void;
  markEnd(at?: number): void;
  setRange(start: number, end: number): void;
  clearLoop(): void;
  /** Returns false when there is no A–B range to loop. */
  toggleLoop(): boolean;
  setGap(seconds: number): void;
  /** Pause between whole-song repetitions (independent of the A–B pause). */
  gapAll: number;
  setGapAll(seconds: number): void;
  /**
   * Returns false (and changes nothing) when the clip lies past the end of this video, e.g. a clip
   * saved on a longer linked copy: the caller says so instead of looping the last 0.2 s.
   */
  applyClip(clip: ClipSettings, opts?: { autoplay?: boolean }): boolean;
  setActiveClip(id: string | null): void;
  setScrubbing(scrubbing: boolean): void;
}

const MIRROR_KEY = 'coverscape.mirrored';
const LOOP_ALL_KEY = 'coverscape.loopAll';
const COUNT_SOUND_KEY = 'coverscape.countSound';

function readCountSoundPreference(): boolean {
  try {
    return localStorage.getItem(COUNT_SOUND_KEY) !== 'false';
  } catch {
    return true;
  }
}

function readLoopAllPreference(): boolean {
  try {
    return localStorage.getItem(LOOP_ALL_KEY) === 'true';
  } catch {
    return false;
  }
}

function readMirrorPreference(): boolean {
  try {
    return localStorage.getItem(MIRROR_KEY) !== 'false';
  } catch {
    return true;
  }
}

const initialStatus: PlayerStatus = {
  ready: false,
  playing: false,
  buffering: false,
  time: 0,
  duration: 0,
  error: null,
};

const emptyLoop: LoopState = { start: null, end: null, enabled: false };

/** Never before 0; past the end only while the length is still unknown. */
function clampTime(seconds: number, duration: number): number {
  return duration > 0 ? clamp(seconds, 0, duration) : Math.max(0, seconds);
}

/**
 * Seeking the YouTube iframe on every pointermove floods it (and on phones the iframe shares the main
 * thread, so the whole app stalls). Drags send cheap preview seeks at most this often; the exact seek
 * happens once, on release.
 */
const SCRUB_SEEK_MS = 220;
let scrubTimer: ReturnType<typeof setTimeout> | undefined;
let scrubSeekAt = 0;
/** Latest drag target the engine hasn't been sent yet. */
let scrubPending: number | null = null;

function flushScrub() {
  clearTimeout(scrubTimer);
  scrubTimer = undefined;
  if (scrubPending == null) return;
  usePlayer.getState().engine?.seek(scrubPending, { preview: true });
  scrubPending = null;
  scrubSeekAt = performance.now();
}

/**
 * Play/pause flip the UI at once (a phone's iframe can take a second to report back); this check
 * puts it right if the media didn't follow, e.g. a blocked autoplay.
 */
let playCheck: ReturnType<typeof setTimeout> | undefined;
function verifyPlaying() {
  clearTimeout(playCheck);
  playCheck = setTimeout(() => {
    const { engine, playing, countdownEndsAt } = usePlayer.getState();
    const actual = engine?.isPlaying?.();
    if (actual == null || countdownEndsAt != null || actual === playing) return;
    usePlayer.setState({ playing: actual });
  }, 2500);
}

export function hasRange(loop: LoopState): loop is LoopState & { start: number; end: number } {
  return loop.start != null && loop.end != null;
}

export const usePlayer = create<PlayerState>()((set, get) => ({
  ...initialStatus,
  engine: null,
  rate: 1,
  mirrored: readMirrorPreference(),
  loopAll: readLoopAllPreference(),
  countSound: readCountSoundPreference(),
  loop: emptyLoop,
  gap: 0,
  gapAll: 0,
  countdownEndsAt: null,
  activeClipId: null,
  scrubbing: false,
  scrubEndedAt: 0,

  stage: 'youtube',
  pendingSeek: null,

  setStage(stage) {
    if (get().stage === stage) return;
    get().engine?.pause();
    // The moment carries over: the new engine lands there when it attaches (same timeline, see withOffset).
    set({ stage, pendingSeek: get().time, playing: false, buffering: false, countdownEndsAt: null });
  },

  voiceMode: 'original',
  setVoiceMode(mode) {
    // Only what is really applied is shown: no file engine (YouTube) or no Web Audio → the whole song.
    const applied = get().engine?.setVoiceMode?.(mode) ?? false;
    set({ voiceMode: applied ? mode : 'original' });
  },

  attach(engine) {
    engine.setRate(get().rate);
    const wanted = get().voiceMode;
    const voiceApplied = wanted === 'original' || (engine.setVoiceMode?.(wanted) ?? false);
    if (!voiceApplied) set({ voiceMode: 'original' });
    const { pendingSeek } = get();
    if (pendingSeek != null) engine.seek(pendingSeek);
    set({
      engine,
      ready: true,
      error: null,
      duration: engine.getDuration() || get().duration,
      pendingSeek: null,
      ...(pendingSeek != null ? { time: pendingSeek } : {}),
    });
  },

  detach(engine) {
    if (get().engine === engine) set({ engine: null, ready: false, playing: false, scrubbing: false });
  },

  reset() {
    clearTimeout(playCheck);
    clearTimeout(scrubTimer);
    scrubTimer = undefined;
    scrubPending = null;
    set({
      ...initialStatus,
      engine: null,
      scrubbing: false,
      rate: 1,
      // A clip may have flipped the mirror for this session only.
      mirrored: readMirrorPreference(),
      loop: emptyLoop,
      countdownEndsAt: null,
      activeClipId: null,
      stage: 'youtube',
      pendingSeek: null,
      voiceMode: 'original',
    });
  },

  sync(patch) {
    set(patch);
  },

  play() {
    const { engine, loop, time } = get();
    if (!engine) return;
    if (loop.enabled && hasRange(loop) && (time < loop.start - 0.05 || time >= loop.end - 0.05)) {
      engine.seek(loop.start);
      set({ time: loop.start });
    }
    set({ countdownEndsAt: null, playing: true });
    engine.play();
    verifyPlaying();
  },

  pause() {
    const { engine, playing, buffering, countdownEndsAt } = get();
    // Already paused: notify nobody (a subscriber that stops on "not playing" would re-enter forever).
    if (playing || buffering || countdownEndsAt != null) set({ countdownEndsAt: null, playing: false, buffering: false });
    engine?.pause();
    if (engine) verifyPlaying();
  },

  togglePlay() {
    const { playing, countdownEndsAt } = get();
    if (countdownEndsAt != null) {
      set({ countdownEndsAt: null });
      return;
    }
    if (playing) get().pause();
    else get().play();
  },

  seek(seconds) {
    const { engine, duration } = get();
    const target = clampTime(seconds, duration);
    scrubPending = null; // an explicit seek wins over a throttled drag position still in flight
    engine?.seek(target);
    set({ time: target });
  },

  scrubTo(seconds) {
    const { duration } = get();
    const target = clampTime(seconds, duration);
    set({ time: target });
    scrubPending = target;
    const wait = SCRUB_SEEK_MS - (performance.now() - scrubSeekAt);
    if (wait <= 0) flushScrub();
    else scrubTimer ??= setTimeout(flushScrub, wait);
  },

  nudge(delta) {
    get().seek(get().time + delta);
  },

  setRate(rate) {
    const next = clampSpeed(rate);
    get().engine?.setRate(next);
    set({ rate: next });
  },

  setMirrored(mirrored) {
    try {
      localStorage.setItem(MIRROR_KEY, String(mirrored));
    } catch {
      /* ignore */
    }
    set({ mirrored });
  },

  toggleCountSound() {
    const next = !get().countSound;
    try {
      localStorage.setItem(COUNT_SOUND_KEY, String(next));
    } catch {
      /* ignore */
    }
    set({ countSound: next });
  },

  toggleLoopAll() {
    const next = !get().loopAll;
    try {
      localStorage.setItem(LOOP_ALL_KEY, String(next));
    } catch {
      /* ignore */
    }
    set({ loopAll: next });
  },

  toggleMirror() {
    get().setMirrored(!get().mirrored);
  },

  markStart(at) {
    const t = round3(at ?? get().time);
    const { loop } = get();
    const end = loop.end != null && loop.end - t >= MIN_LOOP_LENGTH ? loop.end : null;
    // A new range also cancels a gap countdown, which would resume from the old A.
    set({ loop: { start: t, end, enabled: end != null ? true : loop.enabled }, activeClipId: null, countdownEndsAt: null });
  },

  markEnd(at) {
    const t = round3(at ?? get().time);
    const { loop, duration } = get();
    const range = normalizeRange(loop.start ?? 0, t, duration || t);
    if (!range) return;
    set({ loop: { ...range, enabled: true }, activeClipId: null, countdownEndsAt: null });
  },

  setRange(start, end) {
    const range = normalizeRange(start, end, get().duration);
    if (!range) return;
    set((s) => ({ loop: { ...range, enabled: s.loop.enabled || !hasRange(s.loop) }, activeClipId: null, countdownEndsAt: null }));
  },

  clearLoop() {
    set({ loop: emptyLoop, activeClipId: null, countdownEndsAt: null });
  },

  toggleLoop() {
    const { loop } = get();
    if (!hasRange(loop)) return false;
    set({ loop: { ...loop, enabled: !loop.enabled } });
    return true;
  },

  setGap(seconds) {
    set({ gap: clamp(seconds, 0, 10) });
  },

  setGapAll(seconds) {
    set({ gapAll: clamp(seconds, 0, 10) });
  },

  applyClip(clip, opts = {}) {
    const { autoplay = true } = opts;
    const { duration } = get();
    if (duration > 0 && Math.min(clip.start_seconds, clip.end_seconds) > duration - MIN_LOOP_LENGTH) return false;
    const range = normalizeRange(clip.start_seconds, clip.end_seconds, duration || clip.end_seconds);
    if (!range) return false;
    get().setRate(clip.speed);
    // Session-only: opening a teammate's clip must not overwrite the saved mirror preference.
    set({
      mirrored: clip.mirrored,
      loop: { ...range, enabled: true },
      activeClipId: clip.id,
      countdownEndsAt: null,
    });
    get().seek(range.start);
    if (autoplay) get().play();
    return true;
  },

  setScrubbing(scrubbing) {
    if (scrubbing) {
      // A plain tap sends only the exact seek on release; previews start once the finger travels.
      scrubSeekAt = performance.now();
      set({ scrubbing });
      return;
    }
    if (!get().scrubbing) return;
    // Release: drop any queued preview and land exactly where the finger let go.
    clearTimeout(scrubTimer);
    scrubTimer = undefined;
    scrubPending = null;
    get().engine?.seek(get().time);
    set({ scrubbing, scrubEndedAt: performance.now() });
  },

  setActiveClip(id) {
    set({ activeClipId: id });
  },
}));

// ───────────────────────────── F5 · Review (take vs original) ─────────────────────────────

/**
 * How a take maps onto the original: the song second it started at, its recording speed, the fine adjustment
 * (±0.3 s, saved with the take) and where the original plays (the linked or uploaded file is `offset` seconds
 * ahead of the song; YouTube plays the song's own timeline).
 */
export interface ReviewTiming {
  songStart: number;
  speed: number;
  adjust: number;
  offset: number;
  onFile: boolean;
}

/** Which of the two is heard (the other is muted). */
export type ReviewAudio = 'take' | 'original';

interface ReviewStatus {
  playing: boolean;
  /** The clock: seconds of the take. */
  time: number;
  duration: number;
  scrubbing: boolean;
  takeError: string | null;
  originalError: string | null;
}

interface ReviewState extends ReviewStatus {
  takeEngine: PlayerEngine | null;
  originalEngine: PlayerEngine | null;
  originalKind: 'file' | 'youtube' | null;
  timing: ReviewTiming;
  /** Common speed (0.5–1.25×): the take plays at it, the original at take speed × it. */
  rate: number;
  /** A–B on the take's time; the original follows the take, so it loops in both. */
  loop: LoopState;
  activeClipId: string | null;
  audio: ReviewAudio;
  mirrorTake: boolean;
  mirrorOriginal: boolean;

  /** A take opens: fresh state (the screen registers its two engines right after). */
  begin(opts: { timing: ReviewTiming; duration: number; mirrored: boolean }): void;
  /** The screen closes: both stop, engines are forgotten. */
  end(): void;
  attachTake(engine: PlayerEngine): void;
  detachTake(engine: PlayerEngine): void;
  attachOriginal(engine: PlayerEngine, kind: 'file' | 'youtube'): void;
  detachOriginal(engine: PlayerEngine): void;
  sync(patch: Partial<ReviewStatus>): void;
  setTiming(patch: Partial<ReviewTiming>): void;

  play(): void;
  pause(): void;
  togglePlay(): void;
  seek(seconds: number, opts?: { preview?: boolean }): void;
  /** Frame by frame (≈1/30 s): pauses first. */
  step(frames: number): void;
  setRate(rate: number): void;
  markStart(at?: number): void;
  markEnd(at?: number): void;
  /** Returns false when there is no A–B range to loop. */
  toggleLoop(): boolean;
  clearLoop(): void;
  /** Loop a range of the take (a clip of the song that falls in it) and go to its start. */
  loopRange(range: { start: number; end: number }, clipId?: string | null): void;
  setAudio(audio: ReviewAudio): void;
  toggleMirrorTake(): void;
  toggleMirrorOriginal(): void;
  setScrubbing(scrubbing: boolean): void;

  /** Where the original should be for a moment of the take (now by default), in the original's own seconds. */
  originalTarget(takeSeconds?: number): number;
  /** Put the original exactly where the take is. */
  alignOriginal(opts?: { preview?: boolean }): void;
}

const REVIEW_FRAME = 1 / 30;
const REVIEW_RATE_MIN = 0.5;
const REVIEW_RATE_MAX = 1.25;
const NO_TIMING: ReviewTiming = { songStart: 0, speed: 1, adjust: 0, offset: 0, onFile: false };
const initialReview: ReviewStatus = {
  playing: false,
  time: 0,
  duration: 0,
  scrubbing: false,
  takeError: null,
  originalError: null,
};

/** performance.now() of the last seek sent to the original: the clock leaves it alone while it lands. */
let reviewAlignAt = 0;
export function msSinceReviewAlign(): number {
  return performance.now() - reviewAlignAt;
}

/** The original's speed: the take's recording speed × the common speed. */
export function reviewOriginalRate(timing: Pick<ReviewTiming, 'speed'>, rate: number): number {
  return Math.round(clamp((timing.speed || 1) * rate, 0.25, 2) * 1000) / 1000;
}

export const useReview = create<ReviewState>()((set, get) => ({
  ...initialReview,
  takeEngine: null,
  originalEngine: null,
  originalKind: null,
  timing: NO_TIMING,
  rate: 1,
  loop: emptyLoop,
  activeClipId: null,
  audio: 'take',
  mirrorTake: false,
  mirrorOriginal: false,

  begin({ timing, duration, mirrored }) {
    set({
      ...initialReview,
      duration: duration > 0 ? duration : 0,
      timing,
      rate: 1,
      loop: emptyLoop,
      activeClipId: null,
      audio: 'take',
      // As it was practised: an original watched in a mirror, and the take seen as in a mirror too.
      mirrorTake: mirrored,
      mirrorOriginal: mirrored,
    });
  },

  end() {
    const { takeEngine, originalEngine } = get();
    takeEngine?.pause();
    originalEngine?.pause();
    set({ ...initialReview, takeEngine: null, originalEngine: null, originalKind: null, loop: emptyLoop, activeClipId: null });
  },

  attachTake(engine) {
    engine.setRate(get().rate);
    engine.setMuted?.(get().audio !== 'take');
    const length = engine.getDuration();
    set({ takeEngine: engine, takeError: null, ...(length > 0 && Number.isFinite(length) ? { duration: length } : {}) });
    if (get().time > 0) engine.seek(get().time);
  },

  detachTake(engine) {
    if (get().takeEngine === engine) set({ takeEngine: null, playing: false });
  },

  attachOriginal(engine, kind) {
    set({ originalEngine: engine, originalKind: kind, originalError: null });
    engine.setRate(reviewOriginalRate(get().timing, get().rate));
    engine.setMuted?.(get().audio !== 'original');
    get().alignOriginal();
    if (get().playing) engine.play();
  },

  detachOriginal(engine) {
    if (get().originalEngine === engine) set({ originalEngine: null, originalKind: null });
  },

  sync(patch) {
    set(patch);
  },

  setTiming(patch) {
    set({ timing: { ...get().timing, ...patch } });
    get().alignOriginal();
  },

  play() {
    const { takeEngine, originalEngine, loop, time, duration, timing, rate } = get();
    if (!takeEngine) return;
    let at = time;
    if (loop.enabled && hasRange(loop) && (at < loop.start - 0.05 || at >= loop.end - 0.05)) at = loop.start;
    else if (duration > 0 && at >= duration - 0.05) at = 0;
    if (at !== time) {
      takeEngine.seek(at);
      set({ time: at });
    }
    set({ playing: true });
    takeEngine.play();
    if (originalEngine) {
      originalEngine.setRate(reviewOriginalRate(timing, rate));
      get().alignOriginal();
      originalEngine.play();
    }
  },

  pause() {
    const { takeEngine, originalEngine, playing } = get();
    if (playing) set({ playing: false });
    takeEngine?.pause();
    originalEngine?.pause();
    if (originalEngine) {
      // A nudged speed must not outlive the pause; paused frames match exactly.
      originalEngine.setRate(reviewOriginalRate(get().timing, get().rate));
      get().alignOriginal();
    }
  },

  togglePlay() {
    if (get().playing) get().pause();
    else get().play();
  },

  seek(seconds, opts) {
    const { takeEngine, duration } = get();
    const target = duration > 0 ? clamp(seconds, 0, duration) : Math.max(0, seconds);
    takeEngine?.seek(target, opts);
    set({ time: target });
    get().alignOriginal(opts);
  },

  step(frames) {
    if (get().playing) get().pause();
    get().seek(round3(get().time + frames * REVIEW_FRAME));
  },

  setRate(rate) {
    const next = Math.round(clamp(Number.isFinite(rate) ? rate : 1, REVIEW_RATE_MIN, REVIEW_RATE_MAX) * 100) / 100;
    get().takeEngine?.setRate(next);
    get().originalEngine?.setRate(reviewOriginalRate(get().timing, next));
    set({ rate: next });
  },

  markStart(at) {
    const t = round3(at ?? get().time);
    const { loop } = get();
    const end = loop.end != null && loop.end - t >= MIN_LOOP_LENGTH ? loop.end : null;
    set({ loop: { start: t, end, enabled: end != null ? true : loop.enabled }, activeClipId: null });
  },

  markEnd(at) {
    const t = round3(at ?? get().time);
    const { loop, duration } = get();
    const range = normalizeRange(loop.start ?? 0, t, duration || t);
    if (!range) return;
    set({ loop: { ...range, enabled: true }, activeClipId: null });
  },

  toggleLoop() {
    const { loop } = get();
    if (!hasRange(loop)) return false;
    set({ loop: { ...loop, enabled: !loop.enabled } });
    return true;
  },

  clearLoop() {
    set({ loop: emptyLoop, activeClipId: null });
  },

  loopRange(range, clipId = null) {
    const normal = normalizeRange(range.start, range.end, get().duration || range.end);
    if (!normal) return;
    set({ loop: { ...normal, enabled: true }, activeClipId: clipId });
    get().seek(normal.start);
  },

  setAudio(audio) {
    set({ audio });
    const { takeEngine, originalEngine } = get();
    takeEngine?.setMuted?.(audio !== 'take');
    originalEngine?.setMuted?.(audio !== 'original');
  },

  toggleMirrorTake() {
    set({ mirrorTake: !get().mirrorTake });
  },

  toggleMirrorOriginal() {
    set({ mirrorOriginal: !get().mirrorOriginal });
  },

  setScrubbing(scrubbing) {
    if (get().scrubbing === scrubbing) return;
    set({ scrubbing });
    // Release: both land exactly where the finger let go.
    if (!scrubbing) get().seek(get().time);
  },

  originalTarget(takeSeconds) {
    const { timing, time } = get();
    const song = songTimeAt(timing, takeSeconds ?? time);
    return Math.max(0, originalTime(song, timing.offset, timing.onFile));
  },

  alignOriginal(opts) {
    const { originalEngine } = get();
    if (!originalEngine) return;
    originalEngine.seek(get().originalTarget(), opts);
    reviewAlignAt = performance.now();
  },
}));
