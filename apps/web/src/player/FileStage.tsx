import { useEffect, useRef } from 'react';
import { createMediaEngine } from './engine';
import { hasRange, usePlayer } from './store';

/** HTML5 <video> backed stage for uploaded files (any speed between 0.25× and 2×). */
export function FileStage({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const engine = createMediaEngine(el);
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
      const { loop, gap } = usePlayer.getState();
      if (loop.enabled && hasRange(loop)) {
        engine.seek(loop.start);
        if (gap > 0) usePlayer.setState({ countdownEndsAt: performance.now() + gap * 1000, playing: false });
        else engine.play();
      } else if (usePlayer.getState().loopAll) {
        engine.seek(0);
        engine.play();
      } else {
        sync({ playing: false });
      }
    };
    const onError = () => sync({ error: 'No se pudo reproducir este archivo en el navegador.' });

    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('playing', onPlaying);
    el.addEventListener('ended', onEnded);
    el.addEventListener('error', onError);
    if (el.readyState >= 1) onMeta();

    return () => {
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('waiting', onWaiting);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('error', onError);
      el.pause();
      detach(engine);
    };
  }, [src]);

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
