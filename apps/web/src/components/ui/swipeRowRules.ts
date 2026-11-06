// Swipe-to-reveal rows: the pure thresholds, so the gesture's feel is tested without a finger.

/** A mouse and hover: no swipe there, the row keeps its visible buttons. Same query as the `touch:` CSS variant. */
export const FINE_POINTER = '(hover: hover) and (pointer: fine)';

/** Width (px) of one revealed action button. */
export const SWIPE_ACTION_WIDTH = 76;
/** Past this share of the actions' width, letting go leaves the row open. */
const OPEN_SHARE = 0.4;
/** Past this share of the row's width, letting go runs the `primary` action (when there is one). */
const FULL_SHARE = 0.7;
/** A flick this fast (px/s) opens or closes whatever the distance. */
const FLICK_SPEED = 500;
/** How far (px) the first row peeks the first time, to show the gesture exists. */
export const HINT_PEEK = 24;
/** A click this soon (ms) after a drag ended belongs to the drag: swallow it. */
export const CLICK_AFTER_DRAG_MS = 350;

export const HINT_KEY = 'coverscape.swipeHint.v1';

export function actionsWidth(count: number): number {
  return Math.max(0, count) * SWIPE_ACTION_WIDTH;
}

export type SwipeSettle = 'open' | 'closed' | 'primary';

export interface SettleInput {
  /** Horizontal offset when let go (negative = dragged left). */
  offset: number;
  /** Horizontal speed when let go (px/s, negative = moving left). */
  velocity: number;
  actionsWidth: number;
  rowWidth: number;
  hasPrimary: boolean;
}

/** Where a released row goes: back closed, open on its actions, or all the way (runs the primary action). */
export function settleSwipe({
  offset,
  velocity,
  actionsWidth: width,
  rowWidth,
  hasPrimary,
}: SettleInput): SwipeSettle {
  const distance = -offset;
  if (width <= 0 || distance <= 0) return 'closed';
  if (hasPrimary && rowWidth > 0 && fullSwipeArmed(distance, rowWidth)) return 'primary';
  if (velocity <= -FLICK_SPEED) return 'open';
  if (velocity >= FLICK_SPEED) return 'closed';
  return distance >= width * OPEN_SHARE ? 'open' : 'closed';
}

/** Dragged far enough that letting go would run the primary action. */
export function fullSwipeArmed(distance: number, rowWidth: number): boolean {
  return rowWidth > 0 && distance >= rowWidth * FULL_SHARE;
}

/** How far left the row may be dragged: the actions, or the whole row when a full swipe runs the primary action. */
export function maxDrag(width: number, rowWidth: number, hasPrimary: boolean): number {
  return hasPrimary && rowWidth > width ? rowWidth : width;
}

/**
 * Whether the discovery peek still has to play on this device. Storage that throws can't remember it, so it never
 * plays there (better none than one on every visit).
 */
export function hintPending(read: () => string | null): boolean {
  try {
    return read() !== '1';
  } catch {
    return false;
  }
}
