import { formatSpeed } from '@coverscape/shared';
import { useEffect, useRef } from 'react';
import { describeYouTubeError, loadYouTubeApi, YTState, type YTPlayer } from '@/lib/youtubeIframe';
import { useToast } from '@/providers/ToastProvider';
import { createYouTubeEngine } from './engine';
import { hasRange, usePlayer } from './store';

/**
 * Streams the original YouTube video through the IFrame API (no download needed).
 * Native controls are hidden; our overlay drives play/seek/speed and the mirror is a CSS flip.
 */
export function YouTubeStage({ videoId }: { videoId: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let player: YTPlayer | null = null;
    let engine: ReturnType<typeof createYouTubeEngine> | null = null;
    const { sync, attach, detach } = usePlayer.getState();

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
              engine = createYouTubeEngine(event.target, (actual, requested) => {
                usePlayer.setState({ rate: actual });
                toastRef.current(
                  `YouTube no admite ${formatSpeed(requested)} en este vídeo: usando ${formatSpeed(actual)}.`,
                  'info',
                );
              });
              attach(engine);
              sync({ duration: event.target.getDuration() });
            },
            onStateChange: (event) => {
              const state = event.data;
              const duration = event.target.getDuration();
              if (state === YTState.PLAYING) sync({ playing: true, buffering: false, duration });
              else if (state === YTState.BUFFERING) sync({ buffering: true });
              else if (state === YTState.PAUSED || state === YTState.CUED) sync({ playing: false, buffering: false });
              else if (state === YTState.ENDED) {
                const { loop, gap } = usePlayer.getState();
                if (loop.enabled && hasRange(loop) && engine) {
                  engine.seek(loop.start);
                  if (gap > 0) usePlayer.setState({ countdownEndsAt: performance.now() + gap * 1000, playing: false });
                  else engine.play();
                } else if (usePlayer.getState().loopAll && engine) {
                  engine.seek(0);
                  engine.play();
                } else sync({ playing: false, buffering: false });
              }
            },
            onError: (event) => sync({ error: describeYouTubeError(event.data) }),
          },
        });
      })
      .catch((error: Error) => sync({ error: error.message }));

    return () => {
      disposed = true;
      if (engine) {
        engine.dispose();
        detach(engine);
      }
      try {
        player?.destroy();
      } catch {
        /* iframe already gone */
      }
      host.replaceChildren();
    };
  }, [videoId]);

  // The iframe is 24% taller than the 16:9 stage: the video still fits the width, while YouTube's
  // title bar and bottom "more videos" strip land in the letterbox that the stage crops away.
  return (
    <div
      ref={hostRef}
      className="absolute inset-0 overflow-hidden [&_iframe]:absolute [&_iframe]:left-0 [&_iframe]:top-[-12%] [&_iframe]:h-[124%] [&_iframe]:w-full"
    />
  );
}
