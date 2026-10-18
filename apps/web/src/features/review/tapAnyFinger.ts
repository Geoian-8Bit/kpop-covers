import { useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';

/**
 * A button of the review that answers to any finger. Phones don't send `click` for a tap made while another finger
 * rests on the screen (Chrome on Android, Safari on iOS): with the phone held on its side and a thumb on the video,
 * the other thumb's tap on «Ajustes» or ▶ would do nothing. So a clean tap of a finger that isn't the first one
 * (same button, ≤ 10 px, not cancelled) acts on `pointerup`, and the `click` that may follow is ignored. Keyboard,
 * screen readers and the first finger keep the ordinary `click`.
 */

/** Furthest a finger may slide (px) and still be a tap. */
export const TAP_SLOP = 10;
/** A `click` this soon after acting on `pointerup` is the same tap: ignored. */
export const TAP_CLICK_GUARD_MS = 700;

export interface TapStart {
  id: number;
  x: number;
  y: number;
}

/** Whether a finger lifted at `end` makes a tap that started at `start` (same finger, ≤ `TAP_SLOP` px). */
export function isCleanTap(start: TapStart | null, end: TapStart): boolean {
  if (!start || start.id !== end.id) return false;
  return Math.hypot(end.x - start.x, end.y - start.y) <= TAP_SLOP;
}

/** Only touches that aren't the first finger need the help (the first one gets its `click`). */
export function needsTapHelp(e: { pointerType: string; isPrimary: boolean }): boolean {
  return e.pointerType === 'touch' && !e.isPrimary;
}

type Handlers<T extends Element> = {
  onPointerDown: (e: ReactPointerEvent<T>) => void;
  onPointerUp: (e: ReactPointerEvent<T>) => void;
  onPointerCancel: () => void;
  onClick: (e: ReactMouseEvent<T>) => void;
};

/** Spread on a review button instead of `onClick`: `<button {...useTapAnyFinger(open)} />`. */
export function useTapAnyFinger<T extends Element = HTMLButtonElement>(onActivate: () => void, disabled = false): Handlers<T> {
  const start = useRef<TapStart | null>(null);
  const actedAt = useRef(Number.NEGATIVE_INFINITY);
  const act = useRef(onActivate);
  act.current = onActivate;
  return {
    onPointerDown: (e) => {
      start.current = needsTapHelp(e) ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
    },
    onPointerUp: (e) => {
      const s = start.current;
      start.current = null;
      if (disabled || !needsTapHelp(e) || !isCleanTap(s, { id: e.pointerId, x: e.clientX, y: e.clientY })) return;
      actedAt.current = performance.now();
      act.current();
    },
    onPointerCancel: () => {
      start.current = null;
    },
    onClick: () => {
      if (disabled) return;
      if (performance.now() - actedAt.current < TAP_CLICK_GUARD_MS) return; // the same tap, already done
      act.current();
    },
  };
}
