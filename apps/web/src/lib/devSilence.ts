/**
 * Local demo only (`pnpm dev` with VITE_DEMO=true, used for automated tests): the app makes no sound at all — the
 * metronome and Web Audio reach the speakers at zero gain, every <video>/<audio> plays at volume 0 and YouTube
 * players start muted. Nothing changes in production builds (this module does nothing there). To hear the demo,
 * set localStorage `oneshoot.dev.sound` = `on` and reload.
 */

const silent = (() => {
  if (!import.meta.env.DEV || import.meta.env.VITE_DEMO !== 'true') return false;
  try {
    return localStorage.getItem('oneshoot.dev.sound') !== 'on';
  } catch {
    return true;
  }
})();

if (silent && typeof window !== 'undefined') {
  // Web Audio: anything wired to the speakers goes through a zero gain (graphs keep running, recordings still get
  // their audio from MediaStreamDestination taps).
  const connect = AudioNode.prototype.connect as (this: AudioNode, ...args: unknown[]) => unknown;
  AudioNode.prototype.connect = function (this: AudioNode, ...args: unknown[]) {
    const [dest] = args;
    if (typeof AudioDestinationNode !== 'undefined' && dest instanceof AudioDestinationNode) {
      const mute = this.context.createGain();
      mute.gain.value = 0;
      connect.call(this, mute, ...args.slice(1));
      connect.call(mute, dest);
      return dest;
    }
    return connect.apply(this, args);
  } as typeof AudioNode.prototype.connect;

  // Media elements: always volume 0 (muted stays the app's to decide, so capture keeps working).
  const volume = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
  if (volume?.set) {
    Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
      configurable: true,
      get() {
        return volume.get?.call(this) as number;
      },
      set() {
        volume.set!.call(this, 0);
      },
    });
  }
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    volume?.set?.call(this, 0);
    return play.call(this);
  };

  // YouTube: wrap the player constructor once the API loads, muting every player when it's ready.
  const wrapYT = () => {
    const w = window as unknown as { YT?: { Player?: unknown; __silenced?: boolean } };
    const yt = w.YT;
    if (!yt?.Player || yt.__silenced) return false;
    const Original = yt.Player as new (el: unknown, opts: Record<string, unknown>) => { mute?: () => void };
    yt.Player = function (el: unknown, opts: Record<string, unknown> = {}) {
      const events = (opts.events ?? {}) as Record<string, (e: { target: { mute?: () => void } }) => void>;
      const onReady = events.onReady;
      const player = new Original(el, {
        ...opts,
        events: {
          ...events,
          onReady: (e: { target: { mute?: () => void } }) => {
            e.target.mute?.();
            onReady?.(e);
          },
          onStateChange: (e: { target: { mute?: () => void } }) => {
            e.target.mute?.();
            events.onStateChange?.(e);
          },
        },
      });
      return player;
    } as unknown as typeof yt.Player;
    yt.__silenced = true;
    return true;
  };
  // The API calls window.onYouTubeIframeAPIReady when YT.Player exists, before the app's code creates players:
  // wrap it right there.
  let readyHandler: (() => void) | undefined;
  Object.defineProperty(window, 'onYouTubeIframeAPIReady', {
    configurable: true,
    // The wrapper captures the handler of the moment: the app chains to whatever was there before, so a wrapper
    // that read the variable later would call itself forever.
    get() {
      const handler = readyHandler;
      return handler
        ? () => {
            wrapYT();
            handler();
          }
        : undefined;
    },
    set(fn: (() => void) | undefined) {
      readyHandler = fn;
    },
  });
  const timer = setInterval(() => {
    if (wrapYT()) clearInterval(timer);
  }, 200);
}

export {};
