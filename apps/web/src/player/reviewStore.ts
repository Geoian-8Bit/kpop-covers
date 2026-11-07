import { clamp, normalizeRange, originalTime, round3, songTimeAt } from '@coverscape/shared';
import { create } from 'zustand';
import type { PlayerEngine } from './engine';
import {
  emptyLoop,
  hasRange,
  markEndLoop,
  markStartLoop,
  toggleLoopState,
  type LoopState,
} from './loopActions';
import { needsAlignOnPlay } from './reviewAlign';
import { clampZoom, NO_ZOOM, type Zoom } from './zoom';

// F5 · Review (take vs original). REQ-27 · Its own module (out of player/store.ts) so phase 6 can work on it alone.
/**
 * How a take maps onto the original: the song second it started at, its recording speed, the fine adjustment
 * (±0.3 s, saved with the take), the take's second where the song starts (`lead`) and where the original plays (the
 * linked or uploaded file is `offset` seconds ahead of the song; YouTube plays the song's own timeline).
 */
export interface ReviewTiming {
  songStart: number;
  speed: number;
  adjust: number;
  /** The take's second where the song starts (0 for a take recorded here). Before it the original waits at 0. */
  lead: number;
  offset: number;
  onFile: boolean;
}

/** Which of the two is heard (the other is muted). */
type ReviewAudio = 'take' | 'original';

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
  /** «Solo toma»: the take alone and big, with its own sound; the original stays paused and out of sight. */
  solo: boolean;
  setSolo(solo: boolean): void;
  /**
   * F9 · Zoom over each one, in its picture's own fractions (player/zoom.ts). «Apilado»: each panel its own;
   * «Superpuesto»: the take's zoom takes in both (the original keeps its fit over the take).
   */
  zoomTake: Zoom;
  zoomOriginal: Zoom;
  setZoom(which: 'take' | 'original', zoom: Zoom): void;

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
  /** The same, unclamped: below 0 the take is still before the song's start (the original waits at 0). */
  originalRawTarget(takeSeconds?: number): number;
  /** Put the original exactly where the take is. */
  alignOriginal(opts?: { preview?: boolean }): void;
}

const REVIEW_FRAME = 1 / 30;
const REVIEW_RATE_MIN = 0.5;
const REVIEW_RATE_MAX = 1.25;
const NO_TIMING: ReviewTiming = { songStart: 0, speed: 1, adjust: 0, lead: 0, offset: 0, onFile: false };
const initialReview: ReviewStatus = {
  playing: false,
  time: 0,
  duration: 0,
  scrubbing: false,
  takeError: null,
  originalError: null,
};

/** performance.now() of the last seek sent to the original: the clock leaves it alone while it lands. */
const reviewAlignState = {
  at: 0,
  reset() {
    this.at = 0;
  },
};
export function msSinceReviewAlign(): number {
  return performance.now() - reviewAlignState.at;
}

/**
 * The original is parked at its 0 waiting for the take to reach the song's start (`lead`): set when the review plays
 * from there, kept by the review's clock, which starts the original when the take gets there.
 */
export const originalWaitState = { waiting: false };

/** A moment of the take this far before the song (its original second below 0) still waits. */
const WAIT_EPSILON = 0.0005;

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
  solo: false,
  zoomTake: NO_ZOOM,
  zoomOriginal: NO_ZOOM,

  setSolo(solo) {
    if (get().solo === solo) return;
    set({ solo });
    get().setAudio(get().audio);
    const { originalEngine, playing } = get();
    if (!originalEngine) return;
    if (solo) {
      originalEngine.pause();
      originalWaitState.waiting = false;
      return;
    }
    // Back to comparing: the original goes to the take's moment and plays if the take does (or waits for the song).
    originalEngine.setRate(reviewOriginalRate(get().timing, get().rate));
    get().alignOriginal();
    if (playing) startOriginal(get());
  },

  setZoom(which, zoom) {
    set(which === 'take' ? { zoomTake: clampZoom(zoom) } : { zoomOriginal: clampZoom(zoom) });
  },

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
      solo: false,
      zoomTake: NO_ZOOM,
      zoomOriginal: NO_ZOOM,
    });
  },

  end() {
    const { takeEngine, originalEngine } = get();
    takeEngine?.pause();
    originalEngine?.pause();
    set({
      ...initialReview,
      takeEngine: null,
      originalEngine: null,
      originalKind: null,
      loop: emptyLoop,
      activeClipId: null,
    });
  },

  attachTake(engine) {
    engine.setRate(get().rate);
    engine.setMuted?.(!takeHeard(get()));
    const length = engine.getDuration();
    set({
      takeEngine: engine,
      takeError: null,
      ...(length > 0 && Number.isFinite(length) ? { duration: length } : {}),
    });
    if (get().time > 0) engine.seek(get().time);
  },

  detachTake(engine) {
    if (get().takeEngine === engine) set({ takeEngine: null, playing: false });
  },

  attachOriginal(engine, kind) {
    set({ originalEngine: engine, originalKind: kind, originalError: null });
    engine.setRate(reviewOriginalRate(get().timing, get().rate));
    engine.setMuted?.(!originalHeard(get()));
    get().alignOriginal();
    if (get().playing && !get().solo) startOriginal(get());
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
    if (originalEngine && !get().solo) {
      originalEngine.setRate(reviewOriginalRate(timing, rate));
      // 51 · Paused, the original already waits at its spot: a jump here would make it load again and start late.
      const drift = originalEngine.getCurrentTime() - get().originalTarget();
      if (at !== time || needsAlignOnPlay(get().originalKind ?? 'file', drift)) get().alignOriginal();
      startOriginal(get());
    }
    // Both start from the same tap (the take carries the sound: it must play inside the gesture).
    takeEngine.play();
  },

  pause() {
    const { takeEngine, originalEngine, playing } = get();
    if (playing) set({ playing: false });
    takeEngine?.pause();
    originalEngine?.pause();
    originalWaitState.waiting = false;
    if (originalEngine && !get().solo) {
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
    const next =
      Math.round(clamp(Number.isFinite(rate) ? rate : 1, REVIEW_RATE_MIN, REVIEW_RATE_MAX) * 100) / 100;
    get().takeEngine?.setRate(next);
    get().originalEngine?.setRate(reviewOriginalRate(get().timing, next));
    set({ rate: next });
  },

  markStart(at) {
    set({ loop: markStartLoop(get().loop, at ?? get().time), activeClipId: null });
  },

  markEnd(at) {
    const loop = markEndLoop(get().loop, at ?? get().time, get().duration);
    if (!loop) return;
    set({ loop, activeClipId: null });
  },

  toggleLoop() {
    const loop = toggleLoopState(get().loop);
    if (!loop) return false;
    set({ loop });
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
    takeEngine?.setMuted?.(!takeHeard(get()));
    originalEngine?.setMuted?.(!originalHeard(get()));
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
    return Math.max(0, get().originalRawTarget(takeSeconds));
  },

  originalRawTarget(takeSeconds) {
    const { timing, time } = get();
    const song = songTimeAt(timing, takeSeconds ?? time);
    return originalTime(song, timing.offset, timing.onFile);
  },

  alignOriginal(opts) {
    const { originalEngine, solo } = get();
    // «Solo toma»: the hidden original is left alone (YouTube would load at every scrub); it is placed on the way back.
    if (!originalEngine || solo) return;
    originalEngine.seek(get().originalTarget(), opts);
    reviewAlignState.at = performance.now();
  },
}));

/** The take is heard when chosen, and always when alone («Solo toma»). */
function takeHeard(s: Pick<ReviewState, 'audio' | 'solo'>): boolean {
  return s.solo || s.audio === 'take';
}
function originalHeard(s: Pick<ReviewState, 'audio' | 'solo'>): boolean {
  return !s.solo && s.audio === 'original';
}

/**
 * Plays the original with the take, unless the take is still before the song's start: then it waits (paused at its
 * 0, where `alignOriginal` put it) and the review's clock starts it when the take gets there.
 */
function startOriginal(s: Pick<ReviewState, 'originalEngine' | 'originalRawTarget'>): void {
  const engine = s.originalEngine;
  if (!engine) return;
  if (s.originalRawTarget() < -WAIT_EPSILON) {
    engine.pause();
    originalWaitState.waiting = true;
    return;
  }
  originalWaitState.waiting = false;
  engine.play();
}
