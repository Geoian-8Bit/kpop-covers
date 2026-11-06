import { useRef } from 'react';

/** A finger that moves farther than this (px) is scrolling or swiping, not holding. */
const MOVE_TOLERANCE = 10;

/**
 * Tap = primary action; press-and-hold (or right click) = secondary, e.g. open the pause picker or mark an absence.
 * Moving the finger cancels the hold, so scrolling or swiping over the element never fires it.
 */
export function useLongPress(onLong: () => void, onTap: () => void, ms = 450) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fired = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const cancel = () => {
    clearTimeout(timer.current);
    start.current = null;
  };
  return {
    onPointerDown: (event: React.PointerEvent) => {
      fired.current = false;
      cancel();
      start.current = { x: event.clientX, y: event.clientY };
      timer.current = setTimeout(() => {
        fired.current = true;
        start.current = null;
        navigator.vibrate?.(12);
        onLong();
      }, ms);
    },
    onPointerMove: (event: React.PointerEvent) => {
      const s = start.current;
      if (s && Math.hypot(event.clientX - s.x, event.clientY - s.y) > MOVE_TOLERANCE) cancel();
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (event: React.MouseEvent) => {
      event.preventDefault();
      // A phone's own long-press menu arrives after the hold already fired: don't fire twice.
      const already = fired.current;
      cancel();
      fired.current = true;
      if (!already) onLong();
    },
    onClick: () => {
      if (fired.current) {
        fired.current = false;
        return;
      }
      onTap();
    },
  };
}
