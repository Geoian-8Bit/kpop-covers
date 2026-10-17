import { followCorrection } from '@coverscape/shared';
import { useEffect, useRef, type Ref } from 'react';
import { describeYouTubeError, loadYouTubeApi, type YTPlayer } from '@/lib/youtubeIframe';
import { createMediaEngine, createYouTubeEngine, releaseMediaAudio } from '@/player/engine';
import { hasRange, msSinceReviewAlign, reviewOriginalRate, useReview } from '@/player/store';

/**
 * F5 · The review's two media: the take (the clock) and the original (a file with its F1 offset, or YouTube's own
 * player). They only register their engines in the review store; every decision lives there and in the clock.
 */

/**
 * Buffering (review round 1): while one of the two is waiting for data, the other holds still so they don't drift
 * apart; both go on together when it can play again. `holdingTake` marks the take paused for the original's sake, so
 * its `pause` event isn't taken for the dancer pausing.
 */
let holdingTake = false;

/** The take: a `<video>` of this phone's copy (object URL) or the shared 720p copy (signed URL). */
export function TakeVideo({ url, videoRef }: { url: string; videoRef?: Ref<HTMLVideoElement> }) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const engine = createMediaEngine(el);
    const review = () => useReview.getState();

    const onMeta = () => review().attachTake(engine);
    // Recorded WebMs learn their length late (after playing through).
    const onDuration = () => {
      const d = engine.getDuration();
      if (d > 0 && Number.isFinite(d) && Math.abs(d - review().duration) > 0.01) review().sync({ duration: d });
    };
    const onEnded = () => {
      const s = review();
      if (s.loop.enabled && hasRange(s.loop)) {
        s.seek(s.loop.start);
        s.play();
      } else s.pause();
    };
    // Paused by the system (another app took the sound, a phone call): the original stops too.
    const onPause = () => {
      if (holdingTake) return;
      if (review().playing && !el.ended) review().pause();
    };
    // The take waits for data: the original holds still meanwhile.
    const onWaiting = () => {
      if (review().playing) review().originalEngine?.pause();
    };
    const onPlaying = () => {
      const s = review();
      if (!s.playing || holdingTake) return;
      s.originalEngine?.play();
      s.alignOriginal();
    };
    const onError = () => review().sync({ takeError: 'No se pudo reproducir la toma en este navegador.' });

    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('durationchange', onDuration);
    el.addEventListener('ended', onEnded);
    el.addEventListener('pause', onPause);
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('playing', onPlaying);
    el.addEventListener('error', onError);
    if (el.readyState >= 1) onMeta();
    return () => {
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('durationchange', onDuration);
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
  );
}

/** The original as a file (uploaded, or linked to the YouTube video, F1): muted until chosen. */
export function OriginalFile({ url }: { url: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const engine = createMediaEngine(el);
    const review = () => useReview.getState();
    const onMeta = () => review().attachOriginal(engine, 'file');
    const onError = () => review().sync({ originalError: 'No se pudo reproducir el archivo del vídeo.' });
    // The original waits for data: the take (the clock) holds still meanwhile, then both go on.
    const onWaiting = () => {
      const s = review();
      if (!s.playing || !s.takeEngine) return;
      holdingTake = true;
      s.takeEngine.pause();
    };
    const onCanPlay = () => {
      if (!holdingTake) return;
      holdingTake = false;
      const s = review();
      if (s.playing) {
        s.takeEngine?.play();
        s.alignOriginal();
      }
    };
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('error', onError);
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('canplay', onCanPlay);
    el.addEventListener('playing', onCanPlay);
    if (el.readyState >= 1) onMeta();
    return () => {
      holdingTake = false;
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('error', onError);
      el.removeEventListener('waiting', onWaiting);
      el.removeEventListener('canplay', onCanPlay);
      el.removeEventListener('playing', onCanPlay);
      el.pause();
      review().detachOriginal(engine);
      releaseMediaAudio(el);
    };
  }, [url]);

  return (
    <video
      ref={ref}
      src={url}
      muted
      playsInline
      preload="auto"
      aria-label="Vídeo original"
      className="absolute inset-0 size-full object-contain"
    />
  );
}

/**
 * The original from YouTube (no file): its own embedded player, never covered or altered beyond the mirror the
 * studio already uses, so «Superpuesto» is not offered with it.
 */
export function OriginalYouTube({ videoId }: { videoId: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let player: YTPlayer | null = null;
    let engine: ReturnType<typeof createYouTubeEngine> | null = null;
    const review = () => useReview.getState();
    const stalled = setTimeout(() => {
      if (!disposed && !engine) review().sync({ originalError: 'YouTube no responde. Revisa la conexión.' });
    }, 20000);

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
              // YouTube rounds odd speeds (0,375×…): the clock keeps it in step with jumps instead.
              engine = createYouTubeEngine(event.target, () => undefined);
              review().attachOriginal(engine, 'youtube');
            },
            onError: (event) => review().sync({ originalError: describeYouTubeError(event.data) }),
          },
        });
      })
      .catch((error: Error) => review().sync({ originalError: error.message }));

    return () => {
      disposed = true;
      clearTimeout(stalled);
      if (engine) {
        engine.dispose();
        review().detachOriginal(engine);
      }
      try {
        player?.destroy();
      } catch {
        /* iframe already gone */
      }
      host.replaceChildren();
    };
  }, [videoId]);

  // Same crop as the studio: YouTube's title and «more videos» strips fall outside the frame.
  return (
    <div
      ref={hostRef}
      className="pointer-events-none absolute inset-0 overflow-hidden [&_iframe]:absolute [&_iframe]:left-0 [&_iframe]:top-[-12%] [&_iframe]:h-[124%] [&_iframe]:w-full"
    />
  );
}

/**
 * The review's clock: every frame, the take's time goes to the store (unless a finger is scrubbing), the A–B
 * loop wraps, and the original follows the take: a big gap is a jump, a small one a brief change of speed
 * (`followCorrection`). YouTube can't take fine speeds, so it only jumps, and less often (its seeks are slow).
 */
export function useReviewClock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let busyAt = 0;
    let nudged = false;
    let lastYouTubeJump = 0;

    // P10 · Like the studio's loop (useLoopController): frames only while the take plays or a finger scrubs, plus a
    // short tail so a fresh pause or scrub settles on the video's clock; paused and idle, no rAF at all.
    const tick = () => {
      raf = 0;
      step();
      const now = performance.now();
      if (isReviewClockBusy(useReview.getState())) busyAt = now;
      if (useReview.getState().takeEngine && now - busyAt < REVIEW_CLOCK_TAIL_MS) raf = requestAnimationFrame(tick);
    };
    const wake = (s: ReviewSnapshot) => {
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
          s.seek(s.loop.start);
          return;
        }
        if (Math.abs(t - s.time) > 0.0005) useReview.setState({ time: t });
      }
      const original = s.originalEngine;
      if (!s.playing || !original || s.scrubbing) return;
      if (msSinceReviewAlign() < 400) return;
      const target = s.originalTarget(t);
      const length = original.getDuration();
      if (length > 0 && target > length) return; // the take runs past the end of the original
      const drift = original.getCurrentTime() - target;
      const base = reviewOriginalRate(s.timing, s.rate);
      if (s.originalKind === 'youtube') {
        const now = performance.now();
        if (Math.abs(drift) > 0.45 && now - lastYouTubeJump > 1500) {
          lastYouTubeJump = now;
          s.alignOriginal();
        }
        return;
      }
      const fix = followCorrection(drift, base);
      if (fix.kind === 'seek') {
        if (nudged) original.setRate(base);
        nudged = false;
        s.alignOriginal();
      } else if (fix.kind === 'rate') {
        original.setRate(fix.rate);
        nudged = true;
      } else if (nudged) {
        original.setRate(base);
        nudged = false;
      }
    };
    const unsubscribe = useReview.subscribe(wake);
    wake(useReview.getState());
    return () => {
      unsubscribe();
      cancelAnimationFrame(raf);
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
