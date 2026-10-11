import { YTState, type YTPlayer } from '@/lib/youtubeIframe';

/** Thin, source-agnostic transport the player store drives. */
export interface PlayerEngine {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  getCurrentTime(): number;
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

export function createMediaEngine(el: HTMLMediaElement): PlayerEngine {
  return {
    play: () => {
      void el.play().catch(() => undefined);
    },
    pause: () => el.pause(),
    seek: (seconds) => {
      el.currentTime = seconds;
    },
    getCurrentTime: () => el.currentTime,
    getDuration: () => (Number.isFinite(el.duration) ? el.duration : 0),
    setRate: (rate) => {
      el.defaultPlaybackRate = rate;
      el.playbackRate = rate;
    },
    captureAudio: () => {
      const media = el as CapturableMedia;
      try {
        const track = (media.captureStream ?? media.mozCaptureStream)?.call(media).getAudioTracks()[0];
        if (track) return track;
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
        return tap.getAudioTracks()[0] ?? null;
      } catch {
        return null;
      }
    },
  };
}

/**
 * The IFrame API only refreshes `getCurrentTime()` a few times per second, so we interpolate
 * between reports while playing. That keeps the playhead smooth and A–B loops tight.
 */
export function createYouTubeEngine(
  player: YTPlayer,
  onRateAdjusted: (actual: number, requested: number) => void,
): PlayerEngine & { dispose(): void } {
  let lastRaw = -1;
  let lastAt = 0;
  let disposed = false;
  let rateCheck: ReturnType<typeof setTimeout> | undefined;

  return {
    dispose: () => {
      disposed = true;
      clearTimeout(rateCheck);
    },
    play: () => player.playVideo(),
    pause: () => player.pauseVideo(),
    seek: (seconds) => {
      lastRaw = -1;
      player.seekTo(seconds, true);
    },
    getCurrentTime: () => {
      if (disposed) return lastRaw > 0 ? lastRaw : 0;
      const raw = player.getCurrentTime() ?? 0;
      const now = performance.now();
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
