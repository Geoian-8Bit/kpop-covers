import { describeYouTubeError, loadYouTubeApi, type YTPlayer, YTState } from '@/lib/youtubeIframe';
import {
  createMediaEngine,
  createYouTubeEngine,
  type PlayerEngine,
  releaseMediaAudio,
} from '@/player/engine';
import { originalWaitState, reviewOriginalRate, useReview } from '@/player/store';
import { useEffect, useRef, useState } from 'react';
import { mediaSlot, type OriginalProbe } from './reviewMediaSlot';
import { blendLatency, seekAhead } from './reviewRules';
import { MediaSpinner } from './TakeVideo';

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
    mediaSlot.probe = mine;
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
      if (mediaSlot.probe === mine) mediaSlot.probe = null;
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
      <video
        ref={ref}
        src={url}
        muted
        playsInline
        preload="auto"
        aria-label="Vídeo original"
        className="absolute inset-0 size-full object-contain"
      />
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
      if (s.playing === before.playing && s.audio === before.audio && s.solo === before.solo) return;
      clearTimeout(stuckTimer);
      if (!s.playing || s.audio !== 'original' || s.solo) return;
      const startedAt = performance.now();
      const check = () => {
        const r = review();
        if (disposed || !r.playing || r.audio !== 'original' || r.solo || !player) return;
        // Waiting for the take to reach the song's start: not stuck, asked again later.
        if (originalWaitState.waiting) {
          stuckTimer = setTimeout(check, YOUTUBE_STUCK_MS);
          return;
        }
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
              const base = createYouTubeEngine(yt, (actual, requested) =>
                onRateRef.current?.(actual, requested),
              );
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
                base.seek(
                  seekAhead(target, seekLatency ?? YOUTUBE_SEEK_MS, reviewOriginalRate(s.timing, s.rate)),
                );
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
                  base.seek(
                    seekAhead(seconds, seekLatency ?? YOUTUBE_SEEK_MS, reviewOriginalRate(s.timing, s.rate)),
                    opts,
                  );
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
              mediaSlot.probe = mine;
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
      if (mine && mediaSlot.probe === mine) mediaSlot.probe = null;
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
