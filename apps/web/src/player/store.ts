import { clamp, clampSpeed, MIN_LOOP_LENGTH, normalizeRange, round3 } from '@coverscape/shared';
import { create } from 'zustand';
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
  applyClip(clip: ClipSettings, opts?: { autoplay?: boolean }): void;
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

  attach(engine) {
    engine.setRate(get().rate);
    set({ engine, ready: true, error: null, duration: engine.getDuration() || get().duration });
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
      loop: emptyLoop,
      countdownEndsAt: null,
      activeClipId: null,
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
    const { engine } = get();
    set({ countdownEndsAt: null, playing: false, buffering: false });
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
    const target = clamp(seconds, 0, duration || seconds);
    scrubPending = null; // an explicit seek wins over a throttled drag position still in flight
    engine?.seek(target);
    set({ time: target });
  },

  scrubTo(seconds) {
    const { duration } = get();
    const target = clamp(seconds, 0, duration || seconds);
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
    set({ loop: { start: t, end, enabled: end != null ? true : loop.enabled }, activeClipId: null });
  },

  markEnd(at) {
    const t = round3(at ?? get().time);
    const { loop, duration } = get();
    const range = normalizeRange(loop.start ?? 0, t, duration || t);
    if (!range) return;
    set({ loop: { ...range, enabled: true }, activeClipId: null });
  },

  setRange(start, end) {
    const range = normalizeRange(start, end, get().duration);
    if (!range) return;
    set((s) => ({ loop: { ...range, enabled: s.loop.enabled || !hasRange(s.loop) }, activeClipId: null }));
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
    const range = normalizeRange(clip.start_seconds, clip.end_seconds, get().duration || clip.end_seconds);
    if (!range) return;
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
