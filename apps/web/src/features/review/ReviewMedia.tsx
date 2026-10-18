import { useEffect, useRef, useState, type Ref } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { describeYouTubeError, loadYouTubeApi, YTState, type YTPlayer } from '@/lib/youtubeIframe';
import { createMediaEngine, createYouTubeEngine, releaseMediaAudio, type PlayerEngine } from '@/player/engine';
import { hasRange, msSinceReviewAlign, reviewOriginalRate, useReview } from '@/player/store';
import { blendLatency, FRESH_SYNC, seekAhead, syncStep, type OriginalKind, type SyncMemory } from './reviewRules';

/**
 * F5 · 51 · The review's two media: the take (the clock, with the sound) and the original (a file with its F1
 * offset, or YouTube's own player, shown whole). They register their engines in the review store; the clock below
 * keeps the original with the take (rules in `reviewRules.syncStep`). The take never waits for the original: a
 * dancer pressing play hears the take at once, and the original catches up.
 */

/**
 * What the clock needs to know about the original besides its engine: whether its clock can be judged now
 * (playing with data, not landing a jump), how long its jumps take, and a way to go on after a hold without the
 * start-up jump. One review at a time: a module slot.
 */
interface OriginalProbe {
  engine: PlayerEngine;
  kind: OriginalKind;
  ready(): boolean;
  /** How long a jump takes to show (ms, measured). */
  seekLatencyMs(): number;
  /** A jump was just sent: its landing is measured (only one that went through loading counts). */
  noteJump(): void;
  /** Play again after a hold, as it is (no jump ahead). */
  resume(): void;
  /** A jump that already counts its own delay (the follow's, an A–B wrap): sent as it is. */
  rawSeek(seconds: number, opts?: { preview?: boolean; loop?: boolean }): void;
}
let probe: OriginalProbe | null = null;
/** performance.now() of the last A–B wrap: the follow lets it land without counting it as a failed correction. */
let loopWrapAt = Number.NEGATIVE_INFINITY;

/**
 * The A–B section starts over: the take goes back to A and the original with it — a YouTube video ahead by what its
 * jumps take, so it lands in step — without restarting the follow's backoff (a short section wraps every few
 * seconds).
 */
function wrapLoop(): void {
  const s = useReview.getState();
  const take = s.takeEngine;
  if (!take || !hasRange(s.loop)) return;
  const start = s.loop.start;
  take.seek(start, { loop: true });
  useReview.setState({ time: start });
  const original = s.originalEngine;
  if (original) {
    const p = probe && probe.engine === original ? probe : null;
    const lead = s.playing && p?.kind === 'youtube' ? p.seekLatencyMs() : 0;
    p?.noteJump();
    const to = seekAhead(s.originalTarget(start), lead, reviewOriginalRate(s.timing, s.rate));
    if (p) p.rawSeek(to, { loop: true });
    else original.seek(to, { loop: true });
  }
  loopWrapAt = performance.now();
}

/** The take: a `<video>` of this phone's copy (object URL) or the shared 720p copy (signed URL). */
export function TakeVideo({
  url,
  videoRef,
  onBlocked,
}: {
  url: string;
  videoRef?: Ref<HTMLVideoElement>;
  /** The browser refused to play it (no tap behind the play): the review is paused again. */
  onBlocked?: () => void;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [loading, setLoading] = useState(true);
  const onBlockedRef = useRef(onBlocked);
  onBlockedRef.current = onBlocked;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const base = createMediaEngine(el);
    const review = () => useReview.getState();
    // The take's play is watched: if the browser refuses it, the screen must not say «playing» in silence.
    const engine: PlayerEngine = {
      ...base,
      play: () => {
        const started = el.play();
        started?.catch((err: unknown) => {
          // A pause that cuts the start short is not a refusal.
          if ((err as { name?: string } | null)?.name === 'AbortError') return;
          if (review().takeEngine !== engine || !review().playing) return;
          review().pause();
          onBlockedRef.current?.();
        });
      },
    };
    // At once, not on «loadedmetadata»: iPhone may not load a video until it's asked to play, and the play button
    // must work from the first tap (the tap is what lets it play with sound).
    review().attachTake(engine);

    const onDuration = () => {
      const d = engine.getDuration();
      // Recorded WebMs learn their length late (after playing through).
      if (d > 0 && Number.isFinite(d) && Math.abs(d - review().duration) > 0.01) review().sync({ duration: d });
    };
    const onEnded = () => {
      const s = review();
      if (s.playing && s.loop.enabled && hasRange(s.loop)) {
        // B at the very end: start over from A (an ended video needs its own play; the review never stopped).
        wrapLoop();
        engine.play();
      } else s.pause();
    };
    // Paused by the system (another app took the sound, a phone call): the original stops too.
    const onPause = () => {
      if (review().playing && !el.ended) review().pause();
    };
    // The take waits for data: the original holds still meanwhile, and goes on with it (the clock evens them out).
    // When the original is the one heard it goes on regardless: the take catches up on its own and the follow puts
    // it back in step (pausing the original here would cut the music at every correction).
    const onWaiting = () => {
      setLoading(true);
      const s = review();
      if (s.playing && s.audio !== 'original') s.originalEngine?.pause();
    };
    const onPlaying = () => {
      setLoading(false);
      const s = review();
      if (s.playing && s.audio !== 'original') s.originalEngine?.play();
    };
    const onReady = () => setLoading(false);
    const onError = () => {
      setLoading(false);
      review().sync({ takeError: 'No se pudo reproducir la toma en este navegador.' });
    };

    el.addEventListener('loadedmetadata', onDuration);
    el.addEventListener('durationchange', onDuration);
    el.addEventListener('loadeddata', onReady);
    el.addEventListener('canplay', onReady);
    el.addEventListener('ended', onEnded);
    el.addEventListener('pause', onPause);
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('playing', onPlaying);
    el.addEventListener('error', onError);
    if (el.readyState >= 1) onDuration();
    if (el.readyState >= 2) onReady();
    return () => {
      el.removeEventListener('loadedmetadata', onDuration);
      el.removeEventListener('durationchange', onDuration);
      el.removeEventListener('loadeddata', onReady);
      el.removeEventListener('canplay', onReady);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('waiting', onWaiting);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('error', onError);
      el.pause();
      review().detachTake(engine);
      releaseMediaAudio(el);
    };
  }, [url]);

  return (
    <>
      <video
        ref={(el) => {
          ref.current = el;
          if (typeof videoRef === 'function') videoRef(el);
          else if (videoRef) (videoRef as { current: HTMLVideoElement | null }).current = el;
        }}
        src={url}
        // The frame is drawn on a canvas for a note's sketch: cloud copies are served with CORS headers.
        crossOrigin="anonymous"
        playsInline
        preload="auto"
        aria-label="Tu toma"
        className="absolute inset-0 size-full object-contain"
      />
      {loading && <MediaSpinner label="Cargando la toma" />}
    </>
  );
}

function MediaSpinner({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="pointer-events-none absolute inset-0 grid place-items-center">
      <Spinner className="size-7 text-washi-muted" />
    </div>
  );
}

/** Default delays before any is measured (ms). */
const FILE_LATENCY_MS = 60;
const YOUTUBE_SEEK_MS = 350;
const YOUTUBE_START_MS = 300;
/** A start this recent is still under way (YouTube's state comes late). */
const YOUTUBE_STARTING_MS = 1500;
/** Heard and not playing after this long: YouTube didn't start (still loading: up to the second figure). */
const YOUTUBE_STUCK_MS = 3500;
const YOUTUBE_STUCK_LOADING_MS = 8000;
/** A jump or a start not seen landing within this long is forgotten (its measure would be stale). */
const MEASURE_STALE_MS = 3000;

/** The original as a file (uploaded, or linked to the YouTube video, F1): muted unless chosen. */
export function OriginalFile({ url }: { url: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const engine = createMediaEngine(el);
    const review = () => useReview.getState();
    let latency: number | null = null;
    let jumpAt: number | null = null;
    const mine: OriginalProbe = {
      engine,
      kind: 'file',
      ready: () => !el.paused && !el.seeking && el.readyState >= 3,
      seekLatencyMs: () => latency ?? FILE_LATENCY_MS,
      noteJump: () => {
        jumpAt = performance.now();
      },
      resume: () => engine.play(),
      rawSeek: (seconds, opts) => engine.seek(seconds, opts),
    };
    probe = mine;
    review().attachOriginal(engine, 'file');

    const onSeeked = () => {
      setLoading(false);
      if (jumpAt == null) return;
      const sample = performance.now() - jumpAt;
      jumpAt = null;
      if (sample < MEASURE_STALE_MS) latency = blendLatency(latency, sample);
    };
    const onWaiting = () => setLoading(true);
    const onReady = () => setLoading(false);
    const onError = () => {
      setLoading(false);
      review().sync({ originalError: 'No se pudo reproducir el archivo del vídeo.' });
    };
    el.addEventListener('seeked', onSeeked);
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('loadeddata', onReady);
    el.addEventListener('canplay', onReady);
    el.addEventListener('playing', onReady);
    el.addEventListener('error', onError);
    if (el.readyState >= 2) onReady();
    return () => {
      if (probe === mine) probe = null;
      el.removeEventListener('seeked', onSeeked);
      el.removeEventListener('waiting', onWaiting);
      el.removeEventListener('loadeddata', onReady);
      el.removeEventListener('canplay', onReady);
      el.removeEventListener('playing', onReady);
      el.removeEventListener('error', onError);
      el.pause();
      review().detachOriginal(engine);
      releaseMediaAudio(el);
    };
  }, [url]);

  return (
    <>
      <video ref={ref} src={url} muted playsInline preload="auto" aria-label="Vídeo original" className="absolute inset-0 size-full object-contain" />
      {loading && <MediaSpinner label="Cargando el original" />}
    </>
  );
}

/**
 * The original from YouTube (no file): its own embedded player, shown whole — never cropped, covered or made see
 * through (YouTube's terms), so «Superpuesto» is not offered with it. Its box keeps YouTube's 16:9 inside the panel.
 * Taps go to the review (play / pause both), not to the iframe, so the two never part ways.
 */
export function OriginalYouTube({
  videoId,
  onRateAdjusted,
  onStuck,
}: {
  videoId: string;
  onRateAdjusted?: (actual: number, requested: number) => void;
  /** It was asked to play, it is the one heard, and it didn't start: the review is paused again. */
  onStuck?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onRateRef = useRef(onRateAdjusted);
  onRateRef.current = onRateAdjusted;
  const onStuckRef = useRef(onStuck);
  onStuckRef.current = onStuck;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let player: YTPlayer | null = null;
    let inner: ReturnType<typeof createYouTubeEngine> | null = null;
    let engine: PlayerEngine | null = null;
    let mine: OriginalProbe | null = null;
    /** Measured separately: a jump within the video, and starting to play from a pause. */
    let seekLatency: number | null = null;
    let startLatency: number | null = null;
    let jump: { at: number; loading: boolean } | null = null;
    let startAt: number | null = null;
    let applyAfterStart = () => undefined as void;
    const review = () => useReview.getState();
    const stalled = setTimeout(() => {
      if (!disposed && !inner) review().sync({ originalError: 'YouTube no responde. Revisa la conexión.' });
    }, 20000);
    const fresh = (at: number | null | undefined) => at != null && performance.now() - at < MEASURE_STALE_MS;
    // Heard and asked to play, YouTube must really start: if it doesn't (blocked, stuck loading), say so and pause.
    let stuckTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useReview.subscribe((s, before) => {
      if (s.playing === before.playing && s.audio === before.audio) return;
      clearTimeout(stuckTimer);
      if (!s.playing || s.audio !== 'original') return;
      const startedAt = performance.now();
      const check = () => {
        const r = review();
        if (disposed || !r.playing || r.audio !== 'original' || !player) return;
        const state = player.getPlayerState();
        if (state === YTState.PLAYING) return;
        // Still loading on a slow connection: give it longer before saying it didn't start.
        if (state === YTState.BUFFERING && performance.now() - startedAt < YOUTUBE_STUCK_LOADING_MS) {
          stuckTimer = setTimeout(check, 1000);
          return;
        }
        r.pause();
        onStuckRef.current?.();
      };
      stuckTimer = setTimeout(check, YOUTUBE_STUCK_MS);
    });

    loadYouTubeApi()
      .then((YT) => {
        if (disposed) return;
        const mount = document.createElement('div');
        host.appendChild(mount);
        player = new YT.Player(mount, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              if (disposed) return;
              clearTimeout(stalled);
              const yt = event.target;
              const base = createYouTubeEngine(yt, (actual, requested) => onRateRef.current?.(actual, requested));
              inner = base;
              const playing = () => {
                const state = yt.getPlayerState();
                return state === YTState.PLAYING || state === YTState.BUFFERING;
              };
              /** Asked to play a moment ago: its state lags behind (postMessage), so it isn't asked again. */
              const starting = () => startAt != null && performance.now() - startAt < YOUTUBE_STARTING_MS;
              /** A jump from the store arrived while it wasn't playing yet: its next play puts it ahead itself. */
              let deferred = false;
              /** …or, when it arrived during a start, it is applied once YouTube really plays. */
              let pendingAfterStart = false;
              applyAfterStart = () => {
                if (!pendingAfterStart) return;
                pendingAfterStart = false;
                const s = review();
                if (!s.playing) return;
                const target = s.originalTarget();
                if (Math.abs(base.getCurrentTime() - target) <= 0.25) return;
                jump = { at: performance.now(), loading: false };
                base.seek(seekAhead(target, seekLatency ?? YOUTUBE_SEEK_MS, reviewOriginalRate(s.timing, s.rate)));
              };
              engine = {
                ...base,
                // Starting from a pause YouTube takes a moment: it starts that much ahead, so it starts in step and
                // needs no jump right after. One seekTo per start (the take's own «playing» comes a moment later).
                play: () => {
                  if (!playing() && !starting()) {
                    const s = review();
                    const lead = startLatency ?? YOUTUBE_START_MS;
                    base.seek(seekAhead(s.originalTarget(), lead, reviewOriginalRate(s.timing, s.rate)));
                    startAt = performance.now();
                    jump = null;
                  }
                  deferred = false;
                  base.play();
                },
                pause: () => {
                  startAt = null;
                  jump = null;
                  base.pause();
                },
                // The store's jumps while both play (a tap on the line, a section, a play from the settings) land
                // ahead by what YouTube's jumps take; while it is about to start, its start does the jump.
                seek: (seconds, opts) => {
                  const s = review();
                  if (!s.playing || opts?.preview) {
                    base.seek(seconds, opts);
                    return;
                  }
                  if (!playing() || starting()) {
                    deferred = true;
                    if (starting()) pendingAfterStart = true;
                    return;
                  }
                  jump = { at: performance.now(), loading: false };
                  base.seek(seekAhead(seconds, seekLatency ?? YOUTUBE_SEEK_MS, reviewOriginalRate(s.timing, s.rate)), opts);
                },
              };
              const e = engine;
              mine = {
                engine: e,
                kind: 'youtube',
                ready: () => yt.getPlayerState() === YTState.PLAYING,
                seekLatencyMs: () => seekLatency ?? YOUTUBE_SEEK_MS,
                noteJump: () => {
                  jump = { at: performance.now(), loading: false };
                },
                resume: () => (deferred ? e.play() : base.play()),
                rawSeek: (seconds, opts) => base.seek(seconds, opts),
              };
              probe = mine;
              review().attachOriginal(e, 'youtube');
            },
            onStateChange: (event) => {
              if (disposed) return;
              const now = performance.now();
              if (event.data === YTState.BUFFERING) {
                if (jump && fresh(jump.at)) jump.loading = true;
                return;
              }
              if (event.data === YTState.PAUSED || event.data === YTState.ENDED) {
                jump = null;
                startAt = null;
                return;
              }
              if (event.data !== YTState.PLAYING) return;
              if (startAt != null) {
                if (fresh(startAt)) startLatency = blendLatency(startLatency, now - startAt);
                startAt = null;
                jump = null;
                // A jump asked during the start (a tap on the line right after ▶) lands now.
                applyAfterStart();
                return;
              }
              // Only a jump that really went through loading says how long jumps take (one within what's loaded
              // may never change state, and the next PLAYING would belong to something else).
              if (jump?.loading && fresh(jump.at)) seekLatency = blendLatency(seekLatency, now - jump.at);
              jump = null;
            },
            onError: (event) => review().sync({ originalError: describeYouTubeError(event.data) }),
          },
        });
      })
      .catch((error: Error) => review().sync({ originalError: error.message }));

    return () => {
      disposed = true;
      clearTimeout(stalled);
      clearTimeout(stuckTimer);
      unsubscribe();
      if (mine && probe === mine) probe = null;
      if (inner) {
        inner.dispose();
        if (engine) review().detachOriginal(engine);
      }
      try {
        player?.destroy();
      } catch {
        /* iframe already gone */
      }
      host.replaceChildren();
    };
  }, [videoId]);

  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center [container-type:size]">
      <div
        ref={hostRef}
        className="relative bg-sumi-950 [&_iframe]:absolute [&_iframe]:inset-0 [&_iframe]:size-full"
        style={{ width: 'min(100cqw, calc(100cqh * 16 / 9))', aspectRatio: '16 / 9' }}
      />
    </div>
  );
}

/**
 * The review's clock: every frame while it plays (or a finger scrubs), the take's time goes to the store, the A–B
 * loop wraps, and the original follows the take (`syncStep`: small gaps nudged, big ones jumped, never in a loop).
 * While the original (a file) is the one heard, the muted take is nudged instead, so the heard tempo never wobbles.
 */
export function useReviewClock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let busyAt = 0;
    let memory: SyncMemory = FRESH_SYNC;
    /** The store's own last jump of the original (a seek, a pause, a play from elsewhere): a fresh start. */
    let storeAlignAt = Number.NEGATIVE_INFINITY;
    let wrapSeen = loopWrapAt;
    let hold: ReturnType<typeof setTimeout> | undefined;
    let holding = false;

    const endHold = () => {
      clearTimeout(hold);
      hold = undefined;
      holding = false;
    };
    /** Both back at their own speeds (a nudge must not outlive a pause or a change of what's heard). */
    const baseRates = (s: ReviewSnapshot) => {
      s.originalEngine?.setRate(reviewOriginalRate(s.timing, s.rate));
      s.takeEngine?.setRate(s.rate);
      memory = { ...memory, nudged: false };
    };

    // P10 · Frames only while the take plays or a finger scrubs, plus a short tail so a fresh pause or scrub settles
    // on the video's clock; paused and idle, no rAF at all.
    const tick = () => {
      raf = 0;
      step();
      const now = performance.now();
      if (isReviewClockBusy(useReview.getState())) busyAt = now;
      if (useReview.getState().takeEngine && now - busyAt < REVIEW_CLOCK_TAIL_MS) raf = requestAnimationFrame(tick);
    };
    const wake = (s: ReviewSnapshot, before?: ReviewSnapshot) => {
      if (before && before.playing && !s.playing) {
        // Paused: the store puts the original back exactly; the follow starts afresh next time.
        endHold();
        if (memory.nudged) baseRates(s);
        memory = { ...FRESH_SYNC, lastFixAt: memory.lastFixAt };
      }
      if (before && before.audio !== s.audio && memory.nudged) baseRates(s);
      if (raf || !isReviewClockBusy(s)) return;
      busyAt = performance.now();
      raf = requestAnimationFrame(tick);
    };

    const step = () => {
      const s = useReview.getState();
      const take = s.takeEngine;
      if (!take) return;
      let t = s.time;
      if (!s.scrubbing) {
        t = take.getCurrentTime();
        if (s.playing && s.loop.enabled && hasRange(s.loop) && t >= s.loop.end - 0.01) {
          wrapLoop();
          return;
        }
        if (Math.abs(t - s.time) > 0.0005) useReview.setState({ time: t });
      }
      const original = s.originalEngine;
      const p = probe;
      if (!s.playing || !original || s.scrubbing || holding || !p || p.engine !== original) return;
      const now = performance.now();
      const alignAt = now - msSinceReviewAlign();
      if (alignAt > storeAlignAt + 1) {
        // A seek or a play from the store: a fresh start.
        storeAlignAt = alignAt;
        if (memory.nudged) baseRates(s);
        memory = { ...FRESH_SYNC, lastFixAt: alignAt };
      }
      if (loopWrapAt > wrapSeen) {
        // An A–B wrap: let it land, keep the backoff as it was.
        wrapSeen = loopWrapAt;
        memory = { ...memory, lastFixAt: Math.max(memory.lastFixAt, loopWrapAt) };
      }
      const target = s.originalTarget(t);
      const length = original.getDuration();
      if (length > 0 && target > length) return; // the take runs past the end of the original
      const base = reviewOriginalRate(s.timing, s.rate);
      const result = syncStep(
        {
          kind: p.kind,
          drift: original.getCurrentTime() - target,
          target,
          baseRate: base,
          now,
          ready: p.ready(),
          seekLatencyMs: p.seekLatencyMs(),
          heard: s.audio,
          takeRate: s.rate,
          takeTime: t,
          songSpeed: s.timing.speed,
        },
        memory,
      );
      memory = result.memory;
      const action = result.action;
      switch (action.kind) {
        case 'rate':
          original.setRate(action.rate);
          break;
        case 'takeRate':
          take.setRate(action.rate);
          break;
        case 'base':
          original.setRate(base);
          take.setRate(s.rate);
          break;
        case 'seek':
          original.setRate(base);
          take.setRate(s.rate);
          p.noteJump();
          p.rawSeek(action.to);
          break;
        case 'takeSeek':
          original.setRate(base);
          take.setRate(s.rate);
          take.seek(action.to);
          useReview.setState({ time: action.to });
          break;
        case 'hold':
          holding = true;
          original.pause();
          hold = setTimeout(() => {
            endHold();
            const r = useReview.getState();
            if (r.playing && r.originalEngine === original) p.resume();
          }, action.ms);
          break;
        default:
          break;
      }
    };
    const unsubscribe = useReview.subscribe(wake);
    wake(useReview.getState());
    return () => {
      unsubscribe();
      cancelAnimationFrame(raf);
      endHold();
    };
  }, [active]);
}

type ReviewSnapshot = ReturnType<typeof useReview.getState>;
/** Keep ticking this long after the last busy frame (as the studio's loop does). */
const REVIEW_CLOCK_TAIL_MS = 700;
/** The clock only has work while the take moves or is being scrubbed. */
function isReviewClockBusy(s: Pick<ReviewSnapshot, 'takeEngine' | 'playing' | 'scrubbing'>): boolean {
  return s.takeEngine != null && (s.playing || s.scrubbing);
}
