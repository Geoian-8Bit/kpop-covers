import { useEffect, useRef } from 'react';
import { createMediaEngine, withOffset } from './engine';
import { hasRange, usePlayer } from './store';

/**
 * HTML5 <video> backed stage for uploaded files (any speed between 0.25× and 2×), and for the file linked to a
 * YouTube entry (F1), played on the YouTube timeline through its offset.
 */
export function FileStage({ src, offset = 0 }: { src: string; offset?: number }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const engine = withOffset(createMediaEngine(el), offset);
    const { sync, attach, detach } = usePlayer.getState();

    const onMeta = () => {
      attach(engine);
      sync({ duration: engine.getDuration() });
    };
    const onPlay = () => sync({ playing: true });
    const onPause = () => sync({ playing: false, buffering: false });
    const onWaiting = () => sync({ buffering: true });
    const onPlaying = () => sync({ buffering: false, playing: true });
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
    const onError = () => sync({ error: 'No se pudo reproducir este archivo en el navegador.' });

    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('playing', onPlaying);
    el.addEventListener('ended', onEnded);
    el.addEventListener('durationchange', onDuration);
    el.addEventListener('error', onError);
    if (el.readyState >= 1) onMeta();

    return () => {
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('waiting', onWaiting);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('durationchange', onDuration);
      el.removeEventListener('error', onError);
      el.pause();
      detach(engine);
    };
  }, [src, offset]);

  return (
    <video
      ref={ref}
      src={src}
      // Lets the recorder tap the song's audio (cloud copies are served with CORS headers).
      crossOrigin="anonymous"
      playsInline
      preload="auto"
      className="absolute inset-0 size-full bg-black object-contain"
    />
  );
}
