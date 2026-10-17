import { learnLead, STEM_SYNC, stemSyncAction } from './voiceRules';

/**
 * 18 · Playing the tracks separated by the AI model (instrumental and voice) in step with the video of the same
 * file, for «Sin voz» and «Voz». Each track is an <audio> element wired into the video's Web Audio graph (see
 * `voiceSplit.ts`), so the recorder's «con la canción sin voz» records it too. The video stays the clock: the
 * tracks follow its play, pause, seeks, loops, speed (pitch kept like the video's) and mute.
 *
 * Which tracks go with which video element: the studio registers the signed URLs of the tracks under the URL the
 * element plays (`registerStems`); the voice graph looks them up by the element's `src`. No player state here.
 */

export interface StemSources {
  /** Signed URLs of the two tracks. */
  instrumental: string;
  vocals: string;
  /** Measured encoder delay: the tracks' sound starts this much later than the file's. */
  delay: number;
}

// ───────────────────────── Registry ─────────────────────────

const registry = new Map<string, StemSources>();
const listeners = new Set<() => void>();

const keyOf = (url: string) => {
  try {
    return new URL(url, typeof location !== 'undefined' ? location.href : undefined).href;
  } catch {
    return url;
  }
};

/** The tracks for the media playing `mediaUrl`. Returns the undo (call it when the stage or the tracks change). */
export function registerStems(mediaUrl: string, sources: StemSources): () => void {
  const key = keyOf(mediaUrl);
  registry.set(key, sources);
  listeners.forEach((l) => l());
  return () => {
    if (registry.get(key) === sources) {
      registry.delete(key);
      listeners.forEach((l) => l());
    }
  };
}

export function stemsFor(mediaUrl: string): StemSources | null {
  return mediaUrl ? (registry.get(keyOf(mediaUrl)) ?? null) : null;
}

export function onStemsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ───────────────────────── Followers ─────────────────────────

type PitchMedia = HTMLMediaElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean };

/** A start from a pause or a seek of the video (`start`), or a jump of the track while playing (`seek`). */
type JumpKind = 'start' | 'seek';

/**
 * How late an <audio> element of this device starts after each kind of jump, learnt from the jumps so far (see
 * `learnLead`). Device timing, not UI state: shared by every player of the session.
 */
const learnt: Record<JumpKind, number> = { start: STEM_SYNC.seekLead, seek: STEM_SYNC.seekLead };

export interface StemPlayer {
  readonly sources: StemSources;
  /** Gains of each track inside the graph (0 … 1). */
  readonly instrumentalGain: AudioParam;
  readonly vocalsGain: AudioParam;
  /** Follow the video (a stem mode is on) or rest (paused, no download beyond what is preloaded). */
  setActive(active: boolean): void;
  /**
   * Since the last activation the tracks have played in step at least once (or the video isn't playing): the
   * switch from the file's own sound can happen without a gap.
   */
  readonly ready: boolean;
  readonly failed: boolean;
  /** iOS only lets a media element play from a tap: call it from one (a mode change). */
  prime(): void;
  dispose(): void;
}

export function createStemPlayer(
  ctx: BaseAudioContext,
  master: HTMLMediaElement,
  sources: StemSources,
  output: AudioNode,
  events: { onReady?: () => void; onFail?: () => void } = {},
): StemPlayer {
  const make = (url: string) => {
    const el = new Audio() as PitchMedia;
    el.crossOrigin = 'anonymous';
    // Only the header until a stem mode is first used (no 8 MB download for someone who never uses it).
    el.preload = 'metadata';
    el.src = url;
    const pitch = (master as PitchMedia).preservesPitch ?? (master as PitchMedia).webkitPreservesPitch ?? true;
    el.preservesPitch = pitch;
    el.webkitPreservesPitch = pitch;
    const source = (ctx as AudioContext).createMediaElementSource(el);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain).connect(output);
    return { el, source, gain };
  };
  const tracks = [make(sources.instrumental), make(sources.vocals)] as const;
  // After each jump, the first steady reading of each track's drift teaches how late it really started.
  const jumps = tracks.map(() => ({ kind: null as JumpKind | null, landed: 0 }));
  let active = false;
  let ready = false;
  let failed = false;
  let disposed = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const masterPlaying = () => !master.paused && !master.ended && !master.seeking && master.readyState >= 3;

  const markReady = () => {
    if (ready) return;
    ready = true;
    events.onReady?.();
  };

  const rateNow = () => (master.playbackRate > 0 ? master.playbackRate : 1);
  const targetNow = () => master.currentTime + sources.delay;

  const tick = () => {
    if (disposed || failed) return;
    const playing = active && masterPlaying();
    let inStep = true;
    tracks.forEach(({ el }, i) => {
      const jump = jumps[i]!;
      el.muted = master.muted;
      el.volume = master.volume;
      if (!playing) {
        if (!el.paused) el.pause();
        // A stall or a pause: whatever was being measured no longer says anything.
        if (jump.kind === 'seek') jump.kind = null;
        return;
      }
      if (el.readyState < 1) {
        inStep = false;
        return;
      }
      // First steady reading after a jump (both clocks running): learn the lead, then correct as usual.
      const steady = !el.paused && !el.seeking && el.readyState >= 3;
      if (jump.kind && steady) {
        const drift = el.currentTime - targetNow();
        learnt[jump.kind] = learnLead(learnt[jump.kind], drift, rateNow(), jump.landed);
        jump.kind = null;
      }
      const action = stemSyncAction({
        masterTime: master.currentTime,
        masterRate: master.playbackRate,
        trackTime: el.currentTime,
        trackDuration: el.duration,
        delay: sources.delay,
        seekLead: learnt.seek,
      });
      if (action.kind === 'stop') {
        if (!el.paused) el.pause();
        return;
      }
      if (action.kind === 'seek') {
        el.currentTime = action.to;
        jump.kind = 'seek';
        jump.landed = learnt.seek;
        inStep = false;
      } else {
        el.defaultPlaybackRate = master.playbackRate;
        // Until the jump's drift has been read, play at the video's rate (a nudge would skew the reading).
        el.playbackRate = jump.kind ? master.playbackRate : action.rate;
        const drift = Math.abs(el.currentTime - targetNow());
        if (el.paused || el.seeking || drift > STEM_SYNC.readySeconds) inStep = false;
      }
      if (el.paused) {
        if (!jump.kind) {
          // Resuming after a stall: not moved ahead, but how late it starts still teaches.
          jump.kind = 'start';
          jump.landed = (el.currentTime - targetNow()) / rateNow();
        }
        void el.play().catch(() => undefined);
      }
    });
    if (!active) return;
    if (!masterPlaying() || inStep) markReady();
  };

  // While paused (or seeking), keep the tracks where the video is, a learnt lead ahead: an <audio> starts a moment
  // after the video once play is pressed or the seek ends, so they meet.
  const park = () => {
    if (!active) return tick();
    tracks.forEach(({ el }, i) => {
      const jump = jumps[i]!;
      if (!el.paused) el.pause();
      if (el.readyState >= 1) {
        const to = Math.max(0, targetNow() + learnt.start * rateNow());
        if (Math.abs(el.currentTime - to) > STEM_SYNC.okSeconds) el.currentTime = to;
        jump.kind = 'start';
        jump.landed = (el.currentTime - targetNow()) / rateNow();
      }
    });
    tick();
  };

  const onFail = () => {
    if (failed || disposed) return;
    failed = true;
    for (const { el } of tracks) el.pause();
    events.onFail?.();
  };

  const MASTER_EVENTS = ['play', 'playing', 'waiting', 'seeked', 'ratechange', 'volumechange', 'ended'] as const;
  for (const name of MASTER_EVENTS) master.addEventListener(name, tick);
  master.addEventListener('pause', park);
  master.addEventListener('seeking', park);
  for (const { el } of tracks) {
    el.addEventListener('error', onFail);
    el.addEventListener('canplay', tick);
    // Read the drift as soon as the track really runs again (the reading is what the next jump learns from).
    el.addEventListener('playing', tick);
  }

  return {
    sources,
    instrumentalGain: tracks[0].gain.gain,
    vocalsGain: tracks[1].gain.gain,
    get ready() {
      return ready;
    },
    get failed() {
      return failed;
    },
    setActive(next) {
      if (disposed || next === active) return;
      active = next;
      ready = false;
      if (active) {
        for (const { el } of tracks) el.preload = 'auto';
        timer ??= setInterval(tick, 200);
        if (!masterPlaying()) park();
        tick();
      } else {
        if (timer != null) clearInterval(timer);
        timer = null;
        for (const { el } of tracks) if (!el.paused) el.pause();
      }
    },
    prime() {
      if (disposed || failed) return;
      for (const { el } of tracks) {
        if (!el.paused) continue;
        const shouldPlay = active && masterPlaying();
        const attempt = el.play();
        if (!shouldPlay) {
          // Unlocked by the tap; stays where it was.
          void attempt.then(() => (active && masterPlaying() ? undefined : el.pause())).catch(() => undefined);
        } else void attempt.catch(() => undefined);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer != null) clearInterval(timer);
      for (const name of MASTER_EVENTS) master.removeEventListener(name, tick);
      master.removeEventListener('pause', park);
      master.removeEventListener('seeking', park);
      for (const { el, source, gain } of tracks) {
        el.removeEventListener('error', onFail);
        el.removeEventListener('canplay', tick);
        el.removeEventListener('playing', tick);
        el.pause();
        el.removeAttribute('src');
        el.load();
        source.disconnect();
        gain.disconnect();
      }
    },
  };
}
