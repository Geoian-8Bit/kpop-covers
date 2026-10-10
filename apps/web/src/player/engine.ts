import { YTState, type YTPlayer } from '@/lib/youtubeIframe';

/** Thin, source-agnostic transport the player store drives. */
export interface PlayerEngine {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  setRate(rate: number): void;
}

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
