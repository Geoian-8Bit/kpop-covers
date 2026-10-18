import { recordingTap } from '@/player/engine';
import { paceLog } from './pace';
import { IS_IOS } from './recorder';
import { delaySeconds, MAX_AUDIO_DELAY_MS, planSync, renderAheadMs, type SyncInput, type SyncPlan } from './syncRules';

/**
 * 43 · The take's sound goes to the recorder through a delay line, so the file's sound lands where the dancer heard
 * it (the rules and the reasons are in syncRules.ts). Only the recorded copy is delayed: what plays on the speaker
 * and the camera's preview are untouched, and nothing here is wired to the speakers.
 *
 * A song that already sounds through the engine's Web Audio graph is delayed inside that graph (player/engine.ts,
 * `recordingTap`). Otherwise (the element's capture on Android, the microphone) one AudioContext of this module for
 * the whole visit (browsers cap how many can be open), created and woken only when a take will need it
 * (`primeSyncAudio`), never on iPhone. When the context that delays isn't running at the moment a take starts, the
 * take records its sound as before (undelayed) rather than risk a silent file; one that stops during a take is first
 * woken again and only reported if it stays stopped (`watch`, `ensure`).
 */

type AudioCtor = typeof AudioContext;
let ctx: AudioContext | null = null;

/** How long a context that left «running» gets to come back (a brief iOS route change) before the take is paused. */
export const REVIVE_GRACE_MS = 400;

function context(): AudioContext | null {
  if (ctx && ctx.state !== 'closed') return ctx;
  if (typeof window === 'undefined') return null;
  const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext) as
    | AudioCtor
    | undefined;
  if (!Ctor) return null;
  try {
    // 'playback': the song's own graph uses the same hint, so its render buffer and this one's roughly cancel out.
    ctx = new Ctor({ latencyHint: 'playback' });
  } catch {
    ctx = null;
  }
  return ctx;
}

/** The sound a take would record now: the first live one, as `roll` chooses it. */
const pick = (tracks: (MediaStreamTrack | null | undefined)[]) => tracks.find((t) => t?.readyState === 'live') ?? null;

/**
 * Call from a tap (the shutter, arming the clap) or once the take's sound is chosen, with the candidate sounds (song
 * first): wakes the context that will delay it. This module's own context is only created for a sound that needs
 * it (the microphone, or a song captured from the element), and never on iPhone (not used there); a song from the
 * engine's graph wakes that graph's context instead.
 */
export function primeSyncAudio(...tracks: (MediaStreamTrack | null | undefined)[]): void {
  const sound = pick(tracks);
  if (!sound) return;
  const tap = recordingTap(sound);
  if (tap) {
    if (tap.ctx.state !== 'running') void tap.ctx.resume().catch(() => undefined);
    return;
  }
  if (IS_IOS) return;
  const c = context();
  if (c && c.state !== 'running') void c.resume().catch(() => undefined);
}

/** The recorder closed: let the context sleep (it is woken again when a take needs it). */
export function restSyncAudio(): void {
  if (ctx?.state === 'running') void ctx.suspend().catch(() => undefined);
}

/** What the context says about this phone's speaker right now. */
function clock(c: AudioContext): Pick<SyncInput, 'outputLatency' | 'baseLatency' | 'renderAheadMs'> {
  let ahead: number | null = null;
  try {
    ahead = renderAheadMs(c.currentTime, c.getOutputTimestamp?.().contextTime);
  } catch {
    /* not available here */
  }
  return {
    outputLatency: typeof c.outputLatency === 'number' ? c.outputLatency : null,
    baseLatency: typeof c.baseLatency === 'number' ? c.baseLatency : null,
    renderAheadMs: ahead,
  };
}

export interface SyncedAudio {
  /** The track to record: the delayed copy, or the original (delayed in its own graph, or not at all). */
  track: MediaStreamTrack;
  /** What was planned, and whether the delay line was really in the take's path (false: recorded undelayed). */
  plan: SyncPlan;
  applied: boolean;
  /** The sound still reaches the take: its context runs and the recorded track is live. */
  alive(): boolean;
  /**
   * When not `alive`, wakes the context and calls `onLost` only if it is still not alive REVIVE_GRACE_MS later (a
   * resume after a pause, a brief interruption). Nothing when alive.
   */
  ensure(onLost: () => void): void;
  /** Calls `ensure(onLost)` whenever the context leaves «running» and when the recorded track ends. Returns the unwatch. */
  watch(onLost: () => void): () => void;
  /** Undoes the delay (after the recorder stopped). The original track is left alone. */
  dispose(): void;
}

type SyncOpts = Omit<SyncInput, keyof ReturnType<typeof clock> | 'crossContext'>;

/** alive / ensure / watch for a take's sound that depends on `c` (null: on nothing but the track itself). */
function keeper(c: AudioContext | null, track: MediaStreamTrack): Pick<SyncedAudio, 'alive' | 'ensure' | 'watch'> {
  const alive = () => track.readyState === 'live' && (!c || c.state === 'running');
  let pending: ReturnType<typeof setTimeout> | undefined;
  const ensure = (onLost: () => void) => {
    if (alive()) return;
    if (track.readyState !== 'live') return onLost();
    if (c && c.state !== 'closed') void c.resume().catch(() => undefined);
    clearTimeout(pending);
    pending = setTimeout(() => {
      if (!alive()) onLost();
    }, REVIVE_GRACE_MS);
  };
  const watch = (onLost: () => void) => {
    const check = () => ensure(onLost);
    c?.addEventListener('statechange', check);
    track.addEventListener('ended', check);
    return () => {
      clearTimeout(pending);
      c?.removeEventListener('statechange', check);
      track.removeEventListener('ended', check);
    };
  };
  return { alive, ensure, watch };
}

/**
 * The take's sound, delayed by what this phone needs (see syncRules.ts). Never throws.
 * - A song from the engine's own Web Audio graph (iPhone, «Voz» / «Sin voz») is delayed inside that graph, on the
 *   copy that goes to the recorder (the speakers keep it undelayed): no second context in between.
 * - Any other sound (the element's capture on Android, the microphone) goes through this module's context. Not on
 *   iPhone, where passing a track between contexts is untested: there it records undelayed, as before.
 */
export function syncTakeAudio(source: MediaStreamTrack, opts: SyncOpts): SyncedAudio {
  const tap = opts.sound === 'song' ? recordingTap(source) : null;
  if (tap) {
    const measured = clock(tap.ctx);
    const plan = planSync({ ...opts, ...measured, crossContext: false });
    const running = tap.ctx.state === 'running';
    paceLog('sync', { ...opts, ...measured, via: 'engine graph', state: tap.ctx.state, sampleRate: tap.ctx.sampleRate, ...plan });
    if (running) tap.setDelay(delaySeconds(plan.delayMs, tap.ctx.sampleRate));
    return {
      track: source,
      plan,
      applied: running,
      ...keeper(tap.ctx, source),
      dispose: () => tap.setDelay(0),
    };
  }

  const c = IS_IOS ? null : context();
  const measured = c ? clock(c) : {};
  const plan = planSync({ ...opts, ...measured, crossContext: true });
  // Nothing to delay (the fine adjustment takes it to 0): the line isn't needed, the sound goes as it is.
  const passThrough = (applied: boolean): SyncedAudio => ({
    track: source,
    plan,
    applied,
    ...keeper(null, source),
    dispose: () => undefined,
  });
  // «[oneshoot:pace] sync» in chrome://inspect: what the phone said and what was applied.
  paceLog('sync', { ...opts, ...measured, via: c ? 'sync context' : 'none', state: c?.state ?? 'none', sampleRate: c?.sampleRate, ...plan });
  if (plan.delayMs <= 0) return passThrough(true);
  if (!c || c.state !== 'running') return passThrough(false);
  try {
    const input = c.createMediaStreamSource(new MediaStream([source]));
    const line = c.createDelay(MAX_AUDIO_DELAY_MS / 1000 + 0.05);
    line.delayTime.value = delaySeconds(plan.delayMs, c.sampleRate);
    const out = c.createMediaStreamDestination();
    // As many channels as the sound has (a mono microphone stays mono, a stereo song stays stereo).
    const channels = source.getSettings().channelCount;
    if (channels === 1 || channels === 2) out.channelCount = channels;
    input.connect(line);
    line.connect(out);
    const track = out.stream.getAudioTracks()[0];
    if (!track) {
      input.disconnect();
      line.disconnect();
      return passThrough(false);
    }
    return {
      track,
      plan,
      applied: true,
      ...keeper(c, track),
      dispose() {
        track.stop();
        try {
          input.disconnect();
          line.disconnect();
        } catch {
          /* already disconnected */
        }
      },
    };
  } catch {
    return passThrough(false);
  }
}
