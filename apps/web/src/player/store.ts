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
  nudge(delta: number): void;

  setRate(rate: number): void;
  setMirrored(mirrored: boolean): void;
  toggleMirror(): void;

  markStart(at?: number): void;
  markEnd(at?: number): void;
  setRange(start: number, end: number): void;
  clearLoop(): void;
  /** Returns false when there is no A–B range to loop. */
  toggleLoop(): boolean;
  setGap(seconds: number): void;
  applyClip(clip: ClipSettings, opts?: { autoplay?: boolean }): void;
  setActiveClip(id: string | null): void;
  setScrubbing(scrubbing: boolean): void;
}

const MIRROR_KEY = 'coverscape.mirrored';

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

export function hasRange(loop: LoopState): loop is LoopState & { start: number; end: number } {
  return loop.start != null && loop.end != null;
}

export const usePlayer = create<PlayerState>()((set, get) => ({
  ...initialStatus,
  engine: null,
  rate: 1,
  mirrored: readMirrorPreference(),
  loop: emptyLoop,
  gap: 0,
  countdownEndsAt: null,
  activeClipId: null,
  scrubbing: false,
  scrubEndedAt: 0,

  attach(engine) {
    engine.setRate(get().rate);
    set({ engine, ready: true, error: null, duration: engine.getDuration() || get().duration });
  },

  detach(engine) {
    if (get().engine === engine) set({ engine: null, ready: false, playing: false });
  },

  reset() {
    set({ ...initialStatus, engine: null, scrubbing: false, rate: 1, loop: emptyLoop, countdownEndsAt: null, activeClipId: null });
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
    set({ countdownEndsAt: null });
    engine.play();
  },

  pause() {
    set({ countdownEndsAt: null });
    get().engine?.pause();
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
    engine?.seek(target);
    set({ time: target });
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

  applyClip(clip, opts = {}) {
    const { autoplay = true } = opts;
    const range = normalizeRange(clip.start_seconds, clip.end_seconds, get().duration || clip.end_seconds);
    if (!range) return;
    get().setRate(clip.speed);
    // Session-only: opening a teammate's clip must not overwrite the saved mirror preference.
    set({ mirrored: clip.mirrored, loop: { ...range, enabled: true }, activeClipId: clip.id, countdownEndsAt: null });
    get().seek(range.start);
    if (autoplay) get().engine?.play();
  },

  setScrubbing(scrubbing) {
    set(scrubbing ? { scrubbing } : { scrubbing, scrubEndedAt: performance.now() });
  },

  setActiveClip(id) {
    set({ activeClipId: id });
  },
}));
