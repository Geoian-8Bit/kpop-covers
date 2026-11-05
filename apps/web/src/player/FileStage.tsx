import { useEffect, useRef } from 'react';
import {
  createMediaEngine,
  releaseMediaAudio,
  resetMediaAudioAnalysis,
  withOffset,
  type PlayerEngine,
} from './engine';
import {
  clockMoved,
  errorAction,
  errorRetryDelayMs,
  resignMissAction,
  resumeAfterDrop,
  signatureExpired,
  STALL,
  stallAction,
} from './stallRules';
import { restartOnEnded } from './restartOnEnded';
import { watchStageBuffer } from './stageBuffer';
import { usePlayer } from './store';

interface StageControls {
  /** Another file: load it as a new one. */
  change(next: string): void;
}

/** REQ-15 · A pause this soon after the player asked for one is that one. */
const PAUSE_ASKED_MS = 500;
const FAIL_MESSAGE = 'No se pudo reproducir este archivo en el navegador.';

/** A URL that goes to the network (a signed cloud URL), not a file already on this device. */
const isNetworkUrl = (url: string) => !url.startsWith('blob:') && !url.startsWith('data:');

/**
 * HTML5 <video> backed stage for uploaded files (any speed between 0.25× and 2×), and for the file linked to a
 * YouTube entry (F1), played on the YouTube timeline through its offset.
 *
 * `localSrc`: the same file downloaded whole to this device while `src` streamed from the cloud. REQ-15 · It never
 * replaces the source of a video under way (that cut playback mid-song on phones): the next visit opens it directly,
 * and here it only serves as the way back when the cloud file has to be reloaded anyway.
 *
 * `resign`: a fresh signed URL of the cloud file (the remembered one forgotten). REQ-15 · A video that stays stuck or
 * fails on the network reloads from it on the same moment, playing if it played, and never gives up while the stage
 * is open (stallRules.ts spaces the attempts).
 *
 * The element's source is set here, not by React: a change has to keep the timeline's moment.
 */
export function FileStage({
  src,
  localSrc,
  offset = 0,
  resign,
}: {
  src: string;
  localSrc?: string;
  offset?: number;
  resign?: () => Promise<string | null>;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  /** The URL the element plays now. */
  const active = useRef<string | null>(null);
  /** Downloaded copies the element couldn't play: back to the cloud file, and never again. */
  const failed = useRef(new Set<string>());
  const sources = useRef({ src, localSrc, resign });
  const controls = useRef<StageControls | null>(null);
  /** The `src` last given to the element (a new one is another file). */
  const loadedSrc = useRef<string | null>(null);

  // F17: the voice/music graph lives as long as the element; a new file starts a new mono check.
  useEffect(() => {
    const el = ref.current;
    // REQ-15 · The background download of the cloud file reads this element's buffer to stay out of its way.
    const release = el ? watchStageBuffer(el) : undefined;
    return () => {
      release?.();
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
    let disposed = false;

    // ── Watchdog: the video should move and doesn't. ──
    let watch: ReturnType<typeof setInterval> | undefined;
    let last = Number.NaN;
    let stuckSince: number | null = null;
    let retries = 0;
    // ── REQ-15 · Recovery from network errors: one pending at a time, spaced, reset once the video moves. ──
    let recoverTimer: ReturnType<typeof setTimeout> | undefined;
    let errorAttempts = 0;
    let recovering = false;
    /** When the player last asked the element to pause, and when the element paused by itself while playing. */
    let askedPauseAt = Number.NEGATIVE_INFINITY;
    let droppedPlayAt = Number.NEGATIVE_INFINITY;
    let errorAt = Number.NEGATIVE_INFINITY;
    /** REQ-15 · When the dancer last paused (through the engine, or the store while the engine is off reloading). */
    let userPausedAt = Number.NEGATIVE_INFINITY;
    /** Set while onPause reports the element's own pause, so the store listener doesn't take it for the dancer's. */
    let reportingDrop = false;
    /** REQ-15 · The song had opened since the last change() (a refused source then may be an expired token). */
    let hadMetadata = false;
    /** REQ-15 · Empty fresh signatures in a row after a network error (see resignMissAction). */
    let resignMisses = 0;
    /** REQ-15 · Bumped by change(): a signature that lands after another file was asked for is dropped. */
    let generation = 0;
    /** REQ-15 · The element paused itself around the last network error: the song was playing, so it plays on. */
    const resumeIfDropped = () => {
      const playing = usePlayer.getState().playing;
      if (resumeAfterDrop({ playing, droppedAt: droppedPlayAt, errorAt, userPausedAt }))
        sync({ playing: true });
    };
    const offPauseWatch = usePlayer.subscribe((s, prev) => {
      if (prev.playing && !s.playing && !reportingDrop) userPausedAt = performance.now();
    });
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

    /** The same song from another URL: off the clock while it loads, back on the timeline's moment after. */
    const reload = (next: string) => {
      const attached = usePlayer.getState().engine === engine;
      if (attached) suspend(engine);
      reloading = true;
      active.current = next;
      el.src = next;
      if (usePlayer.getState().playing) startWatch();
    };
    /**
     * REQ-15 · Another way to the same file: the device's whole copy when there is one, else a fresh signature (the
     * remembered one may carry an expired token). Without a signature (offline) the same URL is tried again; its
     * failure comes back through `error` and waits its turn.
     */
    const recover = async (afterError = false) => {
      if (recovering) return;
      const copy = sources.current.localSrc;
      if (copy && copy !== active.current && !failed.current.has(copy)) {
        reload(copy);
        return;
      }
      const current = active.current ?? sources.current.src;
      if (!isNetworkUrl(current) || !sources.current.resign) {
        reload(current);
        return;
      }
      recovering = true;
      const asked = generation;
      const fresh = await sources.current.resign().catch(() => null);
      recovering = false;
      if (disposed || asked !== generation) return;
      if (fresh) resignMisses = 0;
      else if (afterError) {
        resignMisses++;
        if (resignMissAction({ online: navigator.onLine, misses: resignMisses }) === 'fail') {
          reloading = false;
          sync({ error: FAIL_MESSAGE });
          return;
        }
      }
      reload(fresh ?? current);
    };
    const scheduleRecover = () => {
      if (recoverTimer !== undefined) return;
      // The spinner every stall shows: the song is waiting for its data.
      if (usePlayer.getState().playing) sync({ buffering: true });
      const delay = errorRetryDelayMs(errorAttempts);
      errorAttempts++;
      recoverTimer = setTimeout(() => {
        recoverTimer = undefined;
        resumeIfDropped();
        void recover(true);
      }, delay);
    };

    const engine: PlayerEngine = {
      ...base,
      pause: () => {
        askedPauseAt = performance.now();
        userPausedAt = askedPauseAt;
        // The element's own «pause» is ignored while it reloads: say it here (a loop's gap, a tap).
        if (reloading) sync({ playing: false, buffering: false });
        base.pause();
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
        errorAttempts = 0;
        resignMisses = 0;
        // Some browsers miss «playing» after a «waiting» on a jump: the spinner must not outlive the stall.
        if (s.buffering && !reloading) sync({ buffering: false });
        return;
      }
      const now = performance.now();
      stuckSince ??= now;
      // An error being recovered (or shown) is the error path's: one attempt at a time.
      if (recovering || recoverTimer !== undefined || el!.error) return;
      const action = stallAction({ stuckMs: now - stuckSince, retries, readyState: el!.readyState });
      if (action === 'none') return;
      retries++;
      if (action === 'play') void el!.play().catch(() => undefined);
      else if (action === 'reseek') {
        // Same spot again: the browser drops the stuck request and asks for the bytes anew.
        const at = el!.currentTime;
        el!.currentTime = at;
        void el!.play().catch(() => undefined);
      } else if (action === 'reload') reload(active.current ?? sources.current.src);
      else void recover();
    }

    const onMeta = () => {
      reloading = false;
      hadMetadata = true;
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
      // REQ-15 · Chrome pauses the element when its network fails: remember the song was playing, so the recovery
      // resumes it (a pause the player asked for is the dancer's and stays).
      const now = performance.now();
      const dropped = usePlayer.getState().playing && now - askedPauseAt > PAUSE_ASKED_MS;
      if (dropped) droppedPlayAt = now;
      reportingDrop = dropped;
      sync({ playing: false, buffering: false });
      reportingDrop = false;
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
      if (!restartOnEnded(engine)) sync({ playing: false });
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
      // REQ-15 · A cloud file that lost the network or whose token expired: a fresh way to it, on the same moment.
      const code = el.error?.code ?? 0;
      if (
        current &&
        errorAction({
          code,
          network: isNetworkUrl(current),
          attempts: errorAttempts,
          hadMetadata,
          expired: signatureExpired(current, Date.now()),
        }) === 'recover'
      ) {
        errorAt = performance.now();
        resumeIfDropped();
        scheduleRecover();
        return;
      }
      reloading = false;
      sync({ error: FAIL_MESSAGE });
    };
    // REQ-15 · The network is back: a waiting recovery, or a video stuck on it, tries now instead of at its turn.
    const onOnline = () => {
      if (recoverTimer !== undefined) {
        clearTimeout(recoverTimer);
        recoverTimer = undefined;
        resumeIfDropped();
        void recover(true);
      } else if (stuckSince != null && !recovering) {
        retries++;
        void recover();
      }
    };

    controls.current = {
      change(next) {
        stopWatch();
        clearTimeout(recoverTimer);
        recoverTimer = undefined;
        errorAttempts = 0;
        resignMisses = 0;
        hadMetadata = false;
        generation++;
        detach(engine);
        reloading = true;
        active.current = next;
        el.src = next;
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
    window.addEventListener('online', onOnline);
    if (el.readyState >= 1) onMeta();

    return () => {
      disposed = true;
      controls.current = null;
      stopWatch();
      clearTimeout(recoverTimer);
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
      window.removeEventListener('online', onOnline);
      offPauseWatch();
      el.pause();
      detach(engine);
    };
  }, [offset]);

  // The source: first load or another file. A downloaded copy arriving later waits for a reload or the next visit.
  useEffect(() => {
    sources.current = { src, localSrc, resign };
    const el = ref.current;
    if (!el) return;
    if (loadedSrc.current === src) return;
    const usable = localSrc && !failed.current.has(localSrc) ? localSrc : src;
    if (active.current == null) {
      active.current = usable;
      el.src = usable;
    } else {
      controls.current?.change(usable);
    }
    loadedSrc.current = src;
  }, [src, localSrc, resign]);

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
