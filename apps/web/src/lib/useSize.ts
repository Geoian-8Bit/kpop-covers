import { useLayoutEffect, useState } from 'react';

// REQ-28 · One measuring hook (the review's room and its stage used to carry a copy each).

/** The element's inner size (px), measured before paint and again whenever it changes; the same object until then. */
export function useSize(ref: React.RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setSize((s) =>
        s.width === el.clientWidth && s.height === el.clientHeight
          ? s
          : { width: el.clientWidth, height: el.clientHeight },
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}
