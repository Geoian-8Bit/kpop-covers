import { useEffect, useRef } from 'react';
import {
  createMediaEngine,
  mediaCaptured,
  releaseMediaAudio,
  resetMediaAudioAnalysis,
  withOffset,
  type PlayerEngine,
} from './engine';
import { clockMoved, shouldSwapSource, STALL, stallAction, type SwapInput } from './stallRules';
import { hasRange, usePlayer } from './store';

interface StageControls {
  /** Another file: load it as a new one. */
  change(next: string): void;
  /** The cloud file's downloaded copy is ready: move to it now if it's a quiet moment. */
  localReady(): void;
}

/**
 * HTML5 <video> backed stage for uploaded files (any speed between 0.25× and 2×), and for the file linked to a
 * YouTube entry (F1), played on the YouTube timeline through its offset.
 *
 * `localSrc`: the same file downloaded to this device while `src` streamed from the cloud. The stage moves to it at
 * the first quiet moment (paused, stuck loading, or a jump such as the loop's restart), keeping the moment and
 * whether it played, so loops stop asking a slow network for every jump back.
 *
 * The element's source is set here, not by React: a change has to keep the timeline's moment. A watchdog plays again
 * by itself when the video stays stuck loading (stallRules.ts).
 */
export function FileStage({ src, localSrc, offset = 0 }: { src: string; localSrc?: string; offset?: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  /** The URL the element plays now. */
  const active = useRef<string | null>(null);
  /** Downloaded copies the element couldn't play: back to the cloud file, and never again. */
  const failed = useRef(new Set<string>());
  const sources = useRef({ src, localSrc });
  const controls = useRef<StageControls | null>(null);
  /** The `src` last given to the element (a new one is another file). */
  const loadedSrc = useRef<string | null>(null);

  // F17: the voice/music graph lives as long as the element; a new file starts a new mono check.
  useEffect(() => {
    const el = ref.current;
    return () => {
      if (!el) return;
      releaseMediaAudio(el);
      active.current = null;
      loadedSrc.current = null;
      // Lets the phone free the decoder and the connection at once, not whenever the element is collected.
      el.removeAttribute('src');
      el.load();
    };
  }, []);
  useEffect(() => {
    if (ref.current) resetMediaAudioAnalysis(ref.current);
  }, [src]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const base = withOffset(createMediaEngine(el), offset);
    const { sync, attach, detach, suspend } = usePlayer.getState();
    /** Between asking for another source and its metadata: the element's own events say nothing about the song. */
    let reloading = false;

    // ── Watchdog: the video should move and doesn't. ──
    let watch: ReturnType<typeof setInterval> | undefined;
    let last = Number.NaN;
    let stuckSince: number | null = null;
    let retries = 0;
    const stopWatch = () => {
      clearInterval(watch);
      watch = undefined;
      last = Number.NaN;
      stuckSince = null;
      retries = 0;
    };
    const startWatch = () => {
      watch ??= setInterval(check, STALL.checkMs);
    };

    const pendingLocal = () => {
      const { localSrc: copy } = sources.current;
      return Boolean(copy && active.current !== copy && !failed.current.has(copy));
    };
    /** The same song from another URL: off the clock while it loads, back on the timeline's moment after. */
    const reload = (next: string) => {
      const attached = usePlayer.getState().engine === engine;
      if (attached) suspend(engine);
      reloading = true;
      active.current = next;
      el.src = next;
      if (usePlayer.getState().playing) startWatch();
    };
    const trySwap = (moment: SwapInput['moment']) => {
      const copy = sources.current.localSrc;
      if (!copy || !shouldSwapSource({ pending: pendingLocal(), captured: mediaCaptured(el), moment })) return false;
      // Not attached yet and past its metadata: the attach is under way, swap at the next moment.
      if (usePlayer.getState().engine !== engine && el.readyState >= 1 && !reloading) return false;
      reload(copy);
      return true;
    };

    const engine: PlayerEngine = {
      ...base,
      pause: () => {
        // The element's own «pause» is ignored while it reloads: say it here (a loop's gap, a tap).
        if (reloading) sync({ playing: false, buffering: false });
        base.pause();
      },
      seek: (seconds, opts) => {
        // A jump pauses for a moment anyway: the moment to move to the device copy.
        if (!opts?.preview && trySwap('seek')) return;
        base.seek(seconds, opts);
      },
    };

    function check() {
      const s = usePlayer.getState();
      const ours = s.engine === engine || (s.engine == null && reloading);
      const wants = ours && s.playing && s.countdownEndsAt == null && !s.scrubbing;
      if (!wants) {
        stopWatch();
        return;
      }
      const t = el!.currentTime;
      if (Number.isNaN(last)) {
        // First look since the watch started: nothing to compare with yet.
        last = t;
        return;
      }
      const moving = !el!.paused && !el!.seeking && el!.readyState >= 3 && clockMoved(last, t);
      last = t;
      if (moving) {
        stuckSince = null;
        retries = 0;
        // Some browsers miss «playing» after a «waiting» on a jump: the spinner must not outlive the stall.
        if (s.buffering && !reloading) sync({ buffering: false });
        return;
      }
      if (trySwap('stalled')) return;
      const now = performance.now();
      stuckSince ??= now;
      const action = stallAction({ stuckMs: now - stuckSince, retries, readyState: el!.readyState });
      if (action === 'none') return;
      retries++;
      if (action === 'play') void el!.play().catch(() => undefined);
      else if (action === 'reseek') {
        // Same spot again: the browser drops the stuck request and asks for the bytes anew.
        const at = el!.currentTime;
        el!.currentTime = at;
        void el!.play().catch(() => undefined);
      } else reload(active.current ?? sources.current.src);
    }

    const onMeta = () => {
      reloading = false;
      // A linked file opens on the song's moment, not at its own second 0 (which may be before the song starts).
      if (offset) {
        const { pendingSeek, time } = usePlayer.getState();
        if (pendingSeek == null) base.seek(time);
      }
      attach(engine);
      sync({ duration: engine.getDuration() });
    };
    const onPlay = () => {
      if (reloading) return;
      sync({ playing: true });
      startWatch();
    };
    const onPause = () => {
      if (reloading) return;
      sync({ playing: false, buffering: false });
      trySwap('paused');
    };
    const onWaiting = () => {
      if (reloading) return;
      sync({ buffering: true });
      startWatch();
    };
    const onPlaying = () => {
      if (reloading) return;
      sync({ buffering: false, playing: true });
      startWatch();
    };
    const onEnded = () => {
      // Same as the loop controller: a gap keeps the media paused while the countdown runs.
      const { loop, gap, loopAll, gapAll } = usePlayer.getState();
      const restartAt = loop.enabled && hasRange(loop) ? loop.start : loopAll ? 0 : null;
      if (restartAt != null) {
        const wait = loop.enabled && hasRange(loop) ? gap : gapAll;
        engine.seek(restartAt);
        if (wait > 0) {
          engine.pause();
          usePlayer.setState({ time: restartAt, countdownEndsAt: performance.now() + wait * 1000, playing: false });
        } else engine.play();
      } else {
        sync({ playing: false });
      }
    };
    // Recorded WebMs only learn their length late (after playing through): pick it up when it arrives.
    const onDuration = () => {
      const duration = engine.getDuration();
      if (duration > 0 && duration !== usePlayer.getState().duration) sync({ duration });
    };
    const onError = () => {
      // The downloaded copy won't play here: back to the cloud file (same song, same moment).
      const current = active.current;
      if (current && current !== sources.current.src && current === sources.current.localSrc) {
        failed.current.add(current);
        reload(sources.current.src);
        return;
      }
      reloading = false;
      sync({ error: 'No se pudo reproducir este archivo en el navegador.' });
    };

    controls.current = {
      change(next) {
        stopWatch();
        detach(engine);
        reloading = true;
        active.current = next;
        el.src = next;
      },
      localReady() {
        if (el.paused) trySwap('paused');
      },
    };

    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('stalled', startWatch);
    el.addEventListener('seeking', startWatch);
    el.addEventListener('playing', onPlaying);
    el.addEventListener('ended', onEnded);
    el.addEventListener('durationchange', onDuration);
    el.addEventListener('error', onError);
    if (el.readyState >= 1) onMeta();

    return () => {
      controls.current = null;
      stopWatch();
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('waiting', onWaiting);
      el.removeEventListener('stalled', startWatch);
      el.removeEventListener('seeking', startWatch);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('durationchange', onDuration);
      el.removeEventListener('error', onError);
      el.pause();
      detach(engine);
    };
  }, [offset]);

  // The source: first load, another file, or the cloud file's device copy arriving.
  useEffect(() => {
    sources.current = { src, localSrc };
    const el = ref.current;
    if (!el) return;
    const usable = localSrc && !failed.current.has(localSrc) ? localSrc : src;
    if (active.current == null) {
      active.current = usable;
      el.src = usable;
    } else if (loadedSrc.current !== src) {
      controls.current?.change(usable);
    } else {
      controls.current?.localReady();
    }
    loadedSrc.current = src;
  }, [src, localSrc]);

  return (
    <video
      ref={ref}
      // Lets the recorder tap the song's audio (cloud copies are served with CORS headers).
      crossOrigin="anonymous"
      playsInline
      preload="auto"
      className="absolute inset-0 size-full bg-black object-contain"
    />
  );
}
