import { YTState, type YTPlayer } from '@/lib/youtubeIframe';

/** Thin, source-agnostic transport the player store drives. */
export interface PlayerEngine {
  play(): void;
  pause(): void;
  /**
   * Jump to a moment. `preview` marks the in-between positions of a drag: the engine may land
   * roughly (only where it has data) – the release always follows with an exact seek.
   */
  seek(seconds: number, opts?: { preview?: boolean }): void;
  getCurrentTime(): number;
  /** What the media is really doing (playing or loading to play), to correct optimistic UI. */
  isPlaying?(): boolean;
  getDuration(): number;
  setRate(rate: number): void;
  /**
   * The song's own audio as a track, for recording dance videos with the original sound. Only media
   * files can offer it; the YouTube player is a cross-origin iframe whose audio the page can't reach.
   */
  captureAudio?(): MediaStreamTrack | null;
}

type CapturableMedia = HTMLMediaElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

/** Web Audio taps, one per element (an element can only be wired into Web Audio once). */
const audioTaps = new WeakMap<HTMLMediaElement, MediaStream>();
/** The track handed out last, reused while live: each camera switch asks again and must not pile up captures. */
const audioTracks = new WeakMap<HTMLMediaElement, MediaStreamTrack>();

export function createMediaEngine(el: HTMLMediaElement): PlayerEngine {
  return {
    play: () => {
      void el.play().catch(() => undefined);
    },
    pause: () => el.pause(),
    isPlaying: () => !el.paused,
    seek: (seconds, opts) => {
      // fastSeek jumps to the nearest keyframe: cheap enough to follow a finger.
      if (opts?.preview && typeof el.fastSeek === 'function') el.fastSeek(seconds);
      else el.currentTime = seconds;
    },
    getCurrentTime: () => el.currentTime,
    getDuration: () => (Number.isFinite(el.duration) ? el.duration : 0),
    setRate: (rate) => {
      el.defaultPlaybackRate = rate;
      el.playbackRate = rate;
    },
    captureAudio: () => {
      const media = el as CapturableMedia;
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
      try {
        let tap = audioTaps.get(el);
        if (!tap) {
          // Route the element through Web Audio: to the speakers as before, and into a recordable stream.
          const ctx = new AudioContext();
          const source = ctx.createMediaElementSource(el);
          const out = ctx.createMediaStreamDestination();
          source.connect(ctx.destination);
          source.connect(out);
          void ctx.resume();
          tap = out.stream;
          audioTaps.set(el, tap);
        }
        const track = tap.getAudioTracks()[0] ?? null;
        if (track) audioTracks.set(el, track);
        return track;
      } catch {
        return null;
      }
    },
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
    getCurrentTime: () => engine.getCurrentTime() - offset,
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
  let queued: { seconds: number; exact: boolean } | null = null;
  let sendTimer: ReturnType<typeof setTimeout> | undefined;
  /** Whether the dancer asked to play: a seek must not start a video nobody started. */
  let wantPlay = false;

  const send = () => {
    sendTimer = undefined;
    if (disposed || !queued) return;
    const { seconds, exact } = queued;
    queued = null;
    rawAtSend = player.getCurrentTime() ?? 0;
    sentAt = performance.now();
    const state = player.getPlayerState();
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
      queued = { seconds, exact: !opts?.preview || Boolean(queued?.exact && sendTimer) };
      if (sendTimer) return;
      const wait = SEEK_GAP_MS - (performance.now() - sentAt);
      if (wait <= 0) send();
      else sendTimer = setTimeout(send, wait);
    },
    getCurrentTime: () => {
      if (disposed) return lastRaw > 0 ? lastRaw : 0;
      const raw = player.getCurrentTime() ?? 0;
      const now = performance.now();
      if (target != null) {
        const landed =
          !queued &&
          now - sentAt > 200 &&
          raw !== rawAtSend &&
          Math.abs(raw - target) < 1 &&
          player.getPlayerState() !== YTState.BUFFERING;
        if (landed || now - targetAt > SEEK_TRUST_MS) target = null;
        else return target;
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
