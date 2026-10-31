import type { BrowserContext } from '@playwright/test';
import { PNG } from 'pngjs';

/**
 * REQ-03 · The outside world, made deterministic. The lab measures the app, not YouTube's CDN or Google Fonts, and the
 * machine may have no route to them at all (a hanging request would turn every LCP into a timeout). Anything that is
 * not loopback is answered here, with a body of fixed size, so a run on a laptop and a run on CI see the same page.
 *
 * Declared in the JSON (`meta.stubs`) so nobody reads a number as «with the real YouTube».
 */
export const STUBS = [
  'i.ytimg.com / img.youtube.com thumbnails: a flat 480x360 PNG',
  'fonts.googleapis.com: empty stylesheet; fonts.gstatic.com: 404 (system fonts)',
  'www.youtube.com/iframe_api: a fake YT.Player that is ready at once (YouTube’s own load time is not measured)',
  'any other non-loopback request: aborted',
];

const THUMB = (() => {
  const png = new PNG({ width: 480, height: 360 });
  for (let i = 0; i < png.data.length; i += 4) {
    const y = Math.floor(i / 4 / 480);
    png.data[i] = 70 + Math.round((y / 360) * 40);
    png.data[i + 1] = 60;
    png.data[i + 2] = 110;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
})();

/** A YT.Player stand-in with a clock: enough for the studio's YouTube stage to be ready, play, seek and loop. */
const FAKE_YT = `
(() => {
  const S = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };
  class Player {
    constructor(el, o) {
      this.o = o; this.state = S.UNSTARTED; this.rate = 1; this.t = 0; this.since = 0; this.dur = 213;
      setTimeout(() => this.o.events && this.o.events.onReady && this.o.events.onReady({ target: this, data: null }), 0);
    }
    now() { return this.state === S.PLAYING ? this.t + ((performance.now() - this.since) / 1000) * this.rate : this.t; }
    set(state) { this.t = this.now(); this.since = performance.now(); this.state = state;
      this.o.events && this.o.events.onStateChange && this.o.events.onStateChange({ target: this, data: state }); }
    playVideo() { this.set(S.PLAYING); }
    pauseVideo() { this.set(S.PAUSED); }
    seekTo(s) { this.t = s; this.since = performance.now(); }
    getCurrentTime() { return Math.min(this.now(), this.dur); }
    getDuration() { return this.dur; }
    getPlayerState() { return this.state; }
    setPlaybackRate(r) { this.t = this.now(); this.since = performance.now(); this.rate = r; }
    getPlaybackRate() { return this.rate; }
    getAvailablePlaybackRates() { return [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]; }
    mute() {} unMute() {} setPlaybackQuality() {}
    getVideoData() { return { title: 'stub', author: 'stub', video_id: this.o.videoId }; }
    destroy() {}
  }
  window.YT = { Player, PlayerState: S };
  setTimeout(() => window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady(), 0);
})();
`;

const isLoopback = (url: URL) =>
  ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
  url.protocol === 'data:' ||
  url.protocol === 'blob:';

export async function stubOutside(context: BrowserContext): Promise<void> {
  await context.route(
    (url) => !isLoopback(url),
    (route) => {
      const url = new URL(route.request().url());
      if (
        /(^|\.)(ytimg\.com|youtube\.com)$/.test(url.hostname) &&
        /\.(jpg|jpeg|png|webp)$/i.test(url.pathname)
      )
        return route.fulfill({ status: 200, contentType: 'image/png', body: THUMB });
      if (url.hostname === 'www.youtube.com' && url.pathname === '/iframe_api')
        return route.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_YT });
      if (url.hostname === 'fonts.googleapis.com')
        return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      if (url.hostname === 'fonts.gstatic.com') return route.fulfill({ status: 404, body: '' });
      return route.abort('blockedbyclient');
    },
  );
}
