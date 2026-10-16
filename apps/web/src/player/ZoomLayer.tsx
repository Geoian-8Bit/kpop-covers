import { motion } from 'motion/react';
import { useLayoutEffect, useState, type ReactNode } from 'react';
import { soft } from '@/lib/motion';
import { zoomOffsets, type Size, type Zoom } from './zoom';

/**
 * F9 · What a zoom needs from the page: the size of the box the video is shown in, and the video's own size (to
 * find the picture inside the box). Watches the box and whichever `<video>` is inside it (they come and go).
 */
export function useMediaBox<T extends HTMLElement>(): {
  /** Callback ref: the box may mount later than its component (and change). */
  ref: (el: T | null) => void;
  el: T | null;
  box: Size;
  media: Size | null;
} {
  const [el, setEl] = useState<T | null>(null);
  const [box, setBox] = useState<Size>({ width: 0, height: 0 });
  const [media, setMedia] = useState<Size | null>(null);

  useLayoutEffect(() => {
    if (!el) return;
    let video: HTMLVideoElement | null = null;
    const readMedia = () => {
      const w = video?.videoWidth ?? 0;
      const h = video?.videoHeight ?? 0;
      setMedia((current) =>
        w > 0 && h > 0
          ? current?.width === w && current.height === h
            ? current
            : { width: w, height: h }
          : null,
      );
    };
    const watchVideo = () => {
      const next = el.querySelector('video');
      if (next === video) return;
      video?.removeEventListener('loadedmetadata', readMedia);
      video?.removeEventListener('resize', readMedia);
      video = next;
      video?.addEventListener('loadedmetadata', readMedia);
      video?.addEventListener('resize', readMedia);
      readMedia();
    };
    const measure = () =>
      setBox((current) =>
        current.width === el.clientWidth && current.height === el.clientHeight
          ? current
          : { width: el.clientWidth, height: el.clientHeight },
      );
    measure();
    watchVideo();
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    const children = new MutationObserver(watchVideo);
    children.observe(el, { childList: true, subtree: true });
    return () => {
      resize.disconnect();
      children.disconnect();
      video?.removeEventListener('loadedmetadata', readMedia);
      video?.removeEventListener('resize', readMedia);
    };
  }, [el]);

  return { ref: setEl, el, box, media };
}

/**
 * The zoomed picture: goes inside the mirror, so the zoom follows the picture when it flips. Follows the fingers
 * at once while a gesture runs (`live`); a reset or a clip's zoom glides in.
 */
export function ZoomLayer({
  zoom,
  box,
  media,
  live,
  children,
}: {
  zoom: Zoom;
  box: Size;
  media: Size | null;
  live: boolean;
  children: ReactNode;
}) {
  const { x, y, scale } = zoomOffsets(zoom, box, media);
  return (
    <motion.div
      className="absolute inset-0"
      initial={false}
      animate={{ x, y, scale }}
      transition={live ? { duration: 0 } : soft}
      style={{ transformOrigin: '50% 50%' }}
    >
      {children}
    </motion.div>
  );
}
