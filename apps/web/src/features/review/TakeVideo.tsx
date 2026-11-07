import { Spinner } from '@/components/ui/Spinner';
import { perfMark } from '@/lib/perfProbe';
import { createMediaEngine, type PlayerEngine, releaseMediaAudio } from '@/player/engine';
import { hasRange, originalWaitState, useReview } from '@/player/store';
import { type Ref, useEffect, useRef, useState } from 'react';
import { wrapLoop } from './reviewMediaSlot';

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
      if (d > 0 && Number.isFinite(d) && Math.abs(d - review().duration) > 0.01)
        review().sync({ duration: d });
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
      // Not while the take is alone, nor while the original waits for the song's start in the take.
      if (s.playing && s.audio !== 'original' && !s.solo && !originalWaitState.waiting)
        s.originalEngine?.play();
    };
    let readyMarked = false;
    const onReady = () => {
      setLoading(false);
      // REQ-03 · The review is ready when the take has data to play.
      if (!readyMarked) {
        readyMarked = true;
        perfMark('review-ready');
      }
    };
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

export function MediaSpinner({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="pointer-events-none absolute inset-0 grid place-items-center"
    >
      <Spinner className="size-7 text-washi-muted" />
    </div>
  );
}
