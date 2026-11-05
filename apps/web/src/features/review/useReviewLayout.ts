import { useLayoutEffect, useState, useSyncExternalStore } from 'react';

/** Below this height (a phone on its side) the review drops its header and keeps one row of controls. */
export const LOW_SCREEN = '(max-height: 520px)';
/** A computer or tablet: the settings sit beside the stage. */
export const WIDE_SCREEN = '(min-width: 1024px) and (min-height: 521px)';

/** The one-row bar's height (px, without the safe area). */
export const BAR_H = 56;

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

/** The safe areas (px), read from an element padded by them; read again whenever the room changes (a turn). */
export function useInsets(ref: React.RefObject<HTMLElement | null>, room: { width: number; height: number }) {
  const [insets, setInsets] = useState({ left: 0, right: 0, bottom: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const next = {
      left: parseFloat(cs.paddingLeft) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
    };
    setInsets((s) => (s.left === next.left && s.right === next.right && s.bottom === next.bottom ? s : next));
  }, [ref, room.width, room.height]);
  return insets;
}

/** REQ-25 · One MediaQueryList per query, reused (getSnapshot runs on every render and every store change). */
const mediaLists = new Map<string, MediaQueryList>();
function mediaList(query: string): MediaQueryList {
  let list = mediaLists.get(query);
  if (!list) {
    list = window.matchMedia(query);
    mediaLists.set(query, list);
  }
  return list;
}

export function useMatch(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = mediaList(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => mediaList(query).matches,
    () => false,
  );
}
