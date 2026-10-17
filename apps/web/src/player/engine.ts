import { createVoiceSplit, type VoiceSplit } from '@/features/voice/voiceSplit';
import type { VoiceMode } from '@/features/voice/voiceRules';
import { YTState, type YTPlayer } from '@/lib/youtubeIframe';
import {
  FILE_MAX_SEEK_MS,
  measuresFileSeek,
  nextLatency,
  seekLanded,
  YOUTUBE_MAX_SEEK_MS,
  youtubeSeekSample,
  type LoopTiming,
} from './loopRules';

/** Thin, source-agnostic transport the player store drives. */
export interface PlayerEngine {
  play(): void;
  pause(): void;
  /**
   * Jump to a moment. `preview` marks the in-between positions of a drag: the engine may land
   * roughly (only where it has data) – the release always follows with an exact seek. `loop` marks the loop's own
   * jump back (8): the seeks a loop anticipates, so the ones its timing is measured on.
   */
  seek(seconds: number, opts?: { preview?: boolean; loop?: boolean }): void;
  getCurrentTime(): number;
  /** What the media is really doing (playing or loading to play), to correct optimistic UI. */
  isPlaying?(): boolean;
  getDuration(): number;
  setRate(rate: number): void;
  /** Silence or sound the media (F5: the review plays two at once and only one is heard). */
  setMuted?(muted: boolean): void;
  /**
   * The song's own audio as a track, for recording dance videos with the original sound. Only media
   * files can offer it; the YouTube player is a cross-origin iframe whose audio the page can't reach.
   */
  captureAudio?(): MediaStreamTrack | null;
  /** F17 · Voice and music apart (files only: YouTube's sound can't be reached). False when it can't be applied. */
  setVoiceMode?(mode: VoiceMode): boolean;
  /** F17 · Whether the song looks mono (then «sin voz» can't separate anything). */
  voiceInfo?(): { monoLike: boolean; settled: boolean };
  /** 8 · How long this engine's seeks take (measured), so a loop can jump back ahead of time. */
  loopTiming?(): LoopTiming;
  /** P16 · The URL the media element plays (files only), e.g. for drawing its wave. Read from the element, not kept. */
  mediaUrl?(): string | null;
}

type CapturableMedia = HTMLMediaElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

/**
 * One Web Audio graph per element (an element can only be wired into Web Audio once): element → voice split (F17)
 * → speakers, and → a recordable stream. Built on first need (a voice mode other than original, or recording when
 * the element can't be captured directly); from then on the element only sounds through it, so the recorder must
 * take the graph's stream (it carries the voice mode too).
 */
interface ElementGraph {
  ctx: AudioContext;
  split: VoiceSplit;
  tap: MediaStream;
}
const elementGraphs = new WeakMap<HTMLMediaElement, ElementGraph>();
/** The track handed out last, reused while live: each camera switch asks again and must not pile up captures. */
const audioTracks = new WeakMap<HTMLMediaElement, MediaStreamTrack>();

function graphFor(el: HTMLMediaElement): ElementGraph | null {
  const known = elementGraphs.get(el);
  if (known) return known;
  try {
    const ctx = new AudioContext({ latencyHint: 'playback' });
    const source = ctx.createMediaElementSource(el);
    const split = createVoiceSplit(ctx, source);
    const out = ctx.createMediaStreamDestination();
    split.output.connect(ctx.destination);
    split.output.connect(out);
    void ctx.resume();
    const graph = { ctx, split, tap: out.stream };
    elementGraphs.set(el, graph);
    return graph;
  } catch {
    return null;
  }
}

/**
 * The element left the page for good: close its audio graph (one AudioContext each; browsers cap how many can be
 * open). Only for an unmounted element: a closed graph can't be rebuilt for the same element.
 */
export function releaseMediaAudio(el: HTMLMediaElement): void {
  const graph = elementGraphs.get(el);
  if (!graph) return;
  elementGraphs.delete(el);
  audioTracks.delete(el);
  graph.split.dispose();
  void graph.ctx.close().catch(() => undefined);
}

/** The element loads another file: forget what the mono check heard (the warning belongs to the old song). */
export function resetMediaAudioAnalysis(el: HTMLMediaElement): void {
  elementGraphs.get(el)?.split.resetAnalysis();
}

/** 8 · Seek latency per element (it outlives its engines: a new offset or file makes a new engine on it). */
interface SeekStats {
  latency: number | null;
  /** performance.now() of the exact seek being measured (null: none in flight). */
  startedAt: number | null;
}
const seekStats = new WeakMap<HTMLMediaElement, SeekStats>();
/** A file's seek before any was measured: decoding from the previous keyframe, typically a few frames. */
const FILE_SEEK_MS = 40;

type FrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number) => void) => number;
};

function statsFor(el: HTMLMediaElement): SeekStats {
  const known = seekStats.get(el);
  if (known) return known;
  const stats: SeekStats = { latency: null, startedAt: null };
  seekStats.set(el, stats);
  const record = (at: number) => {
    if (stats.startedAt == null) return;
    stats.latency = nextLatency(stats.latency, at - stats.startedAt);
    stats.startedAt = null;
  };
  // Measured up to the first frame shown at the new spot where the browser tells (requestVideoFrameCallback),
  // else up to «seeked». One listener per element, for as long as the element lives.
  el.addEventListener('seeked', () => {
    const video = el as FrameCallbackVideo;
    if (!el.paused && typeof video.requestVideoFrameCallback === 'function') video.requestVideoFrameCallback(record);
    else record(performance.now());
  });
  return stats;
}

export function createMediaEngine(el: HTMLMediaElement): PlayerEngine {
  const stats = statsFor(el);
  return {
    play: () => {
      // A suspended graph (built outside a tap, iOS interruptions) would hold the picture still: wake it with the
      // tap that plays.
      const graph = elementGraphs.get(el);
      if (graph && graph.ctx.state !== 'running') void graph.ctx.resume().catch(() => undefined);
      void el.play().catch(() => undefined);
    },
    pause: () => el.pause(),
    isPlaying: () => !el.paused,
    seek: (seconds, opts) => {
      // fastSeek jumps to the nearest keyframe: cheap enough to follow a finger.
      // Only the loop's own jumps, exact and while playing, say how long a loop's jump takes; any other seek cancels
      // a measurement in flight (its «seeked» would be counted instead).
      stats.startedAt = measuresFileSeek(opts, el.paused) ? performance.now() : null;
      if (opts?.preview && typeof el.fastSeek === 'function') el.fastSeek(seconds);
      else el.currentTime = seconds;
    },
    loopTiming: () => ({ latencyMs: stats.latency ?? FILE_SEEK_MS, maxLatencyMs: FILE_MAX_SEEK_MS, endMargin: 0 }),
    getCurrentTime: () => el.currentTime,
    getDuration: () => (Number.isFinite(el.duration) ? el.duration : 0),
    setRate: (rate) => {
      el.defaultPlaybackRate = rate;
      el.playbackRate = rate;
    },
    setMuted: (muted) => {
      el.muted = muted;
    },
    captureAudio: () => {
      const media = el as CapturableMedia;
      // Already routed through Web Audio (voice mode in use): record what is heard, the processed sound.
      const routed = elementGraphs.get(el);
      if (routed) return routed.tap.getAudioTracks()[0] ?? null;
      const cached = audioTracks.get(el);
      if (cached?.readyState === 'live') return cached;
      try {
        const track = (media.captureStream ?? media.mozCaptureStream)?.call(media).getAudioTracks()[0];
        if (track) {
          audioTracks.set(el, track);
          return track;
        }
      } catch {
        /* not capturable this way (e.g. Safari): fall back to Web Audio */
      }
      const graph = graphFor(el);
      const track = graph?.tap.getAudioTracks()[0] ?? null;
      if (track) audioTracks.set(el, track);
      return track;
    },
    setVoiceMode: (mode) => {
      // Original needs no graph; once built it stays (the element can't be unwired) and simply passes through.
      if (mode === 'original' && !elementGraphs.has(el)) return true;
      const graph = graphFor(el);
      if (!graph) return false;
      if (graph.ctx.state !== 'running') void graph.ctx.resume().catch(() => undefined);
      graph.split.setMode(mode);
      return true;
    },
    voiceInfo: () => {
      const graph = elementGraphs.get(el);
      return graph ? graph.split.analyse() : { monoLike: false, settled: false };
    },
    mediaUrl: () => el.currentSrc || el.getAttribute('src') || null,
  };
}

/**
 * F1 · A linked file plays on the YouTube video's timeline: the store, clips, notes and takes all speak YouTube
 * seconds; the file is `offset` seconds ahead (file time = YouTube time + offset).
 */
export function withOffset(engine: PlayerEngine, offset: number): PlayerEngine {
  if (!offset) return engine;
  return {
    ...engine,
    seek: (seconds, opts) => engine.seek(Math.max(0, seconds + offset), opts),
    // Before the song's start (the file's first seconds with a positive offset) the song is at 0.
    getCurrentTime: () => Math.max(0, engine.getCurrentTime() - offset),
    getDuration: () => {
      const d = engine.getDuration();
      return d > 0 ? Math.max(0, d - offset) : 0;
    },
  };
}

/** How long a seek target is trusted over the iframe's clock while YouTube is still loading it. */
const SEEK_TRUST_MS = 6000;
/** Seeks reach the iframe at most this often; the latest target always lands (trailing edge). */
const SEEK_GAP_MS = 250;
/** A YouTube seek before any was measured (within what's buffered, as a loop's start usually is). */
const YOUTUBE_SEEK_MS = 150;

/**
 * The IFrame API only refreshes `getCurrentTime()` a few times per second, so we interpolate
 * between reports while playing. That keeps the playhead smooth and A–B loops tight.
 *
 * After a seek the iframe keeps reporting the old position until the new one has loaded (seconds on
 * a slow connection). Until it has really moved there the engine reports the target, so the playhead
 * never snaps back. Bursts of seeks (rapid taps, ±5 streaks) are coalesced: on phones the iframe
 * shares the main thread, and every exact seek starts a new download.
 */
export function createYouTubeEngine(
  player: YTPlayer,
  onRateAdjusted: (actual: number, requested: number) => void,
): PlayerEngine & { dispose(): void } {
  let lastRaw = -1;
  let lastAt = 0;
  let disposed = false;
  let rateCheck: ReturnType<typeof setTimeout> | undefined;
  /** Where the playhead should be until the iframe confirms it got there. */
  let target: number | null = null;
  let targetAt = 0;
  /** The iframe's (stale) clock when the seek was sent, to tell "still old" from "landed". */
  let rawAtSend = Number.NaN;
  let sentAt = 0;
  let queued: { seconds: number; exact: boolean; loop: boolean } | null = null;
  let sendTimer: ReturnType<typeof setTimeout> | undefined;
  /** Whether the dancer asked to play: a seek must not start a video nobody started. */
  let wantPlay = false;
  /** 8 · Measured time for the loop's own jumps (sent while playing) to land (ms). */
  let latency: number | null = null;
  let measuring = false;
  /** 8 · BUFFERING seen while measuring: first and last time (ms), to tell a flicker from a download. */
  let bufferingFrom = Number.NaN;
  let bufferingTo = Number.NaN;

  const send = () => {
    sendTimer = undefined;
    if (disposed || !queued) return;
    const { seconds, exact, loop } = queued;
    queued = null;
    rawAtSend = player.getCurrentTime() ?? 0;
    sentAt = performance.now();
    const state = player.getPlayerState();
    // Only the loop's jumps: a tap far away (a download) or a ±5 s says nothing about jumping back within the clip.
    measuring = exact && loop && state === YTState.PLAYING;
    bufferingFrom = Number.NaN;
    bufferingTo = Number.NaN;
    // allowSeekAhead=false only moves within what's already buffered: no new request per drag step.
    player.seekTo(seconds, exact);
    // Seeking a cued (or ended) video starts it (IFrame API behaviour); keep it still unless play was asked for.
    if (!wantPlay && (state === YTState.CUED || state === YTState.UNSTARTED || state === YTState.ENDED)) player.pauseVideo();
  };

  return {
    dispose: () => {
      disposed = true;
      clearTimeout(rateCheck);
      clearTimeout(sendTimer);
    },
    play: () => {
      wantPlay = true;
      player.playVideo();
    },
    pause: () => {
      wantPlay = false;
      player.pauseVideo();
    },
    isPlaying: () => {
      const state = player.getPlayerState();
      return state === YTState.PLAYING || state === YTState.BUFFERING;
    },
    seek: (seconds, opts) => {
      lastRaw = -1;
      target = seconds;
      targetAt = performance.now();
      // Within one burst an exact seek wins over previews.
      queued = { seconds, exact: !opts?.preview || Boolean(queued?.exact && sendTimer), loop: Boolean(opts?.loop) };
      if (sendTimer) return;
      const wait = SEEK_GAP_MS - (performance.now() - sentAt);
      if (wait <= 0) send();
      else sendTimer = setTimeout(send, wait);
    },
    getCurrentTime: () => {
      if (disposed) return lastRaw > 0 ? lastRaw : 0;
      const raw = player.getCurrentTime() ?? 0;
      const now = performance.now();
      const playerState = player.getPlayerState();
      if (target != null) {
        if (measuring && playerState === YTState.BUFFERING) {
          if (Number.isNaN(bufferingFrom)) bufferingFrom = now;
          bufferingTo = now;
        }
        const fresh = !queued && raw !== rawAtSend && Math.abs(raw - target) < 1 && playerState !== YTState.BUFFERING;
        // 8 · Measured on the first report at the new spot, with no floor: the old 200 ms minimum meant every sample
        // was at least that long and the loop jumped early on every turn. The report's own position says how long ago
        // it landed (it has been playing since), so the sample doesn't hang on the iframe's report rhythm.
        if (measuring && fresh && seekLanded(raw, rawAtSend, target)) {
          const sample = youtubeSeekSample({
            elapsedMs: now - sentAt,
            raw,
            target,
            rate: player.getPlaybackRate(),
            bufferingMs: Number.isNaN(bufferingFrom) ? 0 : bufferingTo - bufferingFrom,
          });
          if (sample != null) latency = nextLatency(latency, sample);
          measuring = false;
        }
        const landed = fresh && now - sentAt > 200;
        if (landed || now - targetAt > SEEK_TRUST_MS) {
          target = null;
          measuring = false;
        } else return target;
      }
      if (raw !== lastRaw || player.getPlayerState() !== YTState.PLAYING) {
        // Re-anchor while paused too, so resuming never extrapolates from a stale timestamp.
        lastRaw = raw;
        lastAt = now;
        return raw;
      }
      return raw + Math.min((now - lastAt) / 1000, 0.6) * player.getPlaybackRate();
    },
    getDuration: () => player.getDuration() ?? 0,
    // The iframe reports its clock a few times a second, so a sample can run long: the cap keeps it modest.
    loopTiming: () => ({ latencyMs: latency ?? YOUTUBE_SEEK_MS, maxLatencyMs: YOUTUBE_MAX_SEEK_MS, endMargin: 0.3 }),
    setMuted: (muted) => {
      if (muted) player.mute?.();
      else player.unMute?.();
    },
    setRate: (rate) => {
      player.setPlaybackRate(rate);
      clearTimeout(rateCheck);
      // YouTube may round unsupported speeds – report what was actually applied.
      rateCheck = setTimeout(() => {
        if (disposed) return;
        const actual = player.getPlaybackRate();
        if (Math.abs(actual - rate) > 0.001) onRateAdjusted(actual, rate);
      }, 450);
    },
  };
}
