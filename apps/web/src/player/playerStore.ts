import { clamp, clampSpeed, MIN_LOOP_LENGTH, normalizeRange } from '@coverscape/shared';
import { create } from 'zustand';
import type { VoiceMode } from '@/features/voice/voiceRules';
import type { PlayerEngine } from './engine';
import {
  emptyLoop,
  hasRange,
  markEndLoop,
  markStartLoop,
  toggleLoopState,
  type LoopState,
} from './loopActions';
import {
  readCountSoundPreference,
  readLoopAllPreference,
  readMirrorPreference,
  writeCountSoundPreference,
  writeLoopAllPreference,
  writeMirrorPreference,
} from './prefs';
import { clampZoom, NO_ZOOM, zoomOfClip, type Zoom } from './zoom';

interface ClipSettings {
  id: string;
  start_seconds: number;
  end_seconds: number;
  speed: number;
  mirrored: boolean;
  /** F9 · Saved zoom (older rows and lists without the columns: the whole video). */
  zoom_scale?: number;
  zoom_x?: number;
  zoom_y?: number;
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
   * F1 · 12 · What plays a YouTube entry that has its own file: the file when this device can reach it (the studio
   * decides on opening, see features/studio/stageRules.ts) or the YouTube player. Uploaded videos always play
   * their file.
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
  /**
   * The engine's media reloads the same song from another source (the cloud file's downloaded copy, a retry after a
   * dead connection): off the clock until it attaches again, then back where the timeline is, and playing if it
   * was. Unlike `detach`, the dancer's «playing» stays.
   */
  suspend(engine: PlayerEngine): void;
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
  /**
   * F9 · Zoom over the video, in the picture's own fractions (see player/zoom.ts). Only a file shows it (YouTube's
   * player is never altered); a clip opens with its saved zoom.
   */
  zoom: Zoom;
  setZoom(zoom: Zoom): void;
  /**
   * The studio is covered by the recorder (fixed, opaque) and keeps playing the song under it: whatever only paints
   * the studio from the clock (time readout, timeline, zoom layer…) holds still meanwhile and repaints on the way
   * back. The clock itself keeps running: the recorder reads it.
   */
  covered: boolean;
  setCovered(covered: boolean): void;
}

const initialStatus: PlayerStatus = {
  ready: false,
  playing: false,
  buffering: false,
  time: 0,
  duration: 0,
  error: null,
};

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

/** REQ-27 · The throttled drag seek's module state, grouped so tests (and `reset`) can clear it in one call. */
const scrubState = {
  timer: undefined as ReturnType<typeof setTimeout> | undefined,
  seekAt: 0,
  /** Latest drag target the engine hasn't been sent yet. */
  pending: null as number | null,
  /** Drops any queued preview (the timer and its target). */
  cancel() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = null;
  },
  reset() {
    this.cancel();
    this.seekAt = 0;
  },
};

function flushScrub() {
  clearTimeout(scrubState.timer);
  scrubState.timer = undefined;
  if (scrubState.pending == null) return;
  usePlayer.getState().engine?.seek(scrubState.pending, { preview: true });
  scrubState.pending = null;
  scrubState.seekAt = performance.now();
}

/**
 * Play/pause flip the UI at once (a phone's iframe can take a second to report back); this check
 * puts it right if the media didn't follow, e.g. a blocked autoplay.
 */
const playState = {
  check: undefined as ReturnType<typeof setTimeout> | undefined,
  /** A clip tapped while no engine is attached (switching stage, retrying, the file still loading) plays once one is. */
  onAttach: false,
  reset() {
    clearTimeout(this.check);
    this.check = undefined;
    this.onAttach = false;
  },
};
function verifyPlaying() {
  clearTimeout(playState.check);
  playState.check = setTimeout(() => {
    const { engine, playing, countdownEndsAt } = usePlayer.getState();
    const actual = engine?.isPlaying?.();
    if (actual == null || countdownEndsAt != null || actual === playing) return;
    usePlayer.setState({ playing: actual });
  }, 2500);
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
  zoom: NO_ZOOM,

  stage: 'youtube',
  pendingSeek: null,

  setStage(stage) {
    if (get().stage === stage) return;
    playState.onAttach = false;
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
    // A stage that mounts again (retry, a file uploaded, a new offset) lands where the timeline already is,
    // not at 0 under a playhead and an A–B that say otherwise.
    const { pendingSeek, time } = get();
    const at = pendingSeek ?? (time > 0 ? time : null);
    if (at != null) engine.seek(at);
    set({
      engine,
      ready: true,
      error: null,
      duration: engine.getDuration() || get().duration,
      pendingSeek: null,
      ...(at != null ? { time: at } : {}),
    });
    if (playState.onAttach) {
      playState.onAttach = false;
      // A loop's gap that began while the media reloaded keeps its countdown (it plays when the count ends).
      if (get().countdownEndsAt == null) get().play();
    }
  },

  detach(engine) {
    if (get().engine === engine) set({ engine: null, ready: false, playing: false, scrubbing: false });
  },

  suspend(engine) {
    const { engine: current, playing, countdownEndsAt } = get();
    if (current !== engine) return;
    playState.onAttach = playing && countdownEndsAt == null;
    set({ engine: null, scrubbing: false, buffering: playState.onAttach });
  },

  reset() {
    playState.reset();
    scrubState.cancel();
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
      zoom: NO_ZOOM,
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
    playState.onAttach = false;
    // Already paused: notify nobody (a subscriber that stops on "not playing" would re-enter forever).
    if (playing || buffering || countdownEndsAt != null)
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
    const target = clampTime(seconds, duration);
    scrubState.pending = null; // an explicit seek wins over a throttled drag position still in flight
    engine?.seek(target);
    // Without an engine the moment waits for the next one (it also beats an older pendingSeek from setStage).
    set(engine ? { time: target } : { time: target, pendingSeek: target });
  },

  scrubTo(seconds) {
    const { duration } = get();
    const target = clampTime(seconds, duration);
    set({ time: target });
    scrubState.pending = target;
    const wait = SCRUB_SEEK_MS - (performance.now() - scrubState.seekAt);
    if (wait <= 0) flushScrub();
    else scrubState.timer ??= setTimeout(flushScrub, wait);
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
    writeMirrorPreference(mirrored);
    set({ mirrored });
  },

  toggleCountSound() {
    const next = !get().countSound;
    writeCountSoundPreference(next);
    set({ countSound: next });
  },

  toggleLoopAll() {
    const next = !get().loopAll;
    writeLoopAllPreference(next);
    set({ loopAll: next });
  },

  toggleMirror() {
    get().setMirrored(!get().mirrored);
  },

  markStart(at) {
    // A new range also cancels a gap countdown, which would resume from the old A.
    set({ loop: markStartLoop(get().loop, at ?? get().time), activeClipId: null, countdownEndsAt: null });
  },

  markEnd(at) {
    const loop = markEndLoop(get().loop, at ?? get().time, get().duration);
    if (!loop) return;
    set({ loop, activeClipId: null, countdownEndsAt: null });
  },

  setRange(start, end) {
    const range = normalizeRange(start, end, get().duration);
    if (!range) return;
    set((s) => ({
      loop: { ...range, enabled: s.loop.enabled || !hasRange(s.loop) },
      activeClipId: null,
      countdownEndsAt: null,
    }));
  },

  clearLoop() {
    set({ loop: emptyLoop, activeClipId: null, countdownEndsAt: null });
  },

  toggleLoop() {
    const loop = toggleLoopState(get().loop);
    if (!loop) return false;
    set({ loop });
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
    if (duration > 0 && Math.min(clip.start_seconds, clip.end_seconds) > duration - MIN_LOOP_LENGTH)
      return false;
    const range = normalizeRange(clip.start_seconds, clip.end_seconds, duration || clip.end_seconds);
    if (!range) return false;
    get().setRate(clip.speed);
    // Session-only: opening a teammate's clip must not overwrite the saved mirror preference.
    set({
      mirrored: clip.mirrored,
      loop: { ...range, enabled: true },
      activeClipId: clip.id,
      countdownEndsAt: null,
      // F9 · The clip opens as it was saved: zoomed in, or the whole video.
      zoom: zoomOfClip(clip),
    });
    get().seek(range.start);
    if (!autoplay) playState.onAttach = false;
    else if (get().engine) get().play();
    else playState.onAttach = true;
    return true;
  },

  setScrubbing(scrubbing) {
    if (scrubbing) {
      // A plain tap sends only the exact seek on release; previews start once the finger travels.
      scrubState.seekAt = performance.now();
      set({ scrubbing });
      return;
    }
    if (!get().scrubbing) return;
    // Release: drop any queued preview and land exactly where the finger let go.
    scrubState.cancel();
    get().engine?.seek(get().time);
    set({ scrubbing, scrubEndedAt: performance.now() });
  },

  setActiveClip(id) {
    set({ activeClipId: id });
  },

  setZoom(zoom) {
    set({ zoom: clampZoom(zoom) });
  },

  covered: false,
  setCovered(covered) {
    if (get().covered !== covered) set({ covered });
  },
}));
