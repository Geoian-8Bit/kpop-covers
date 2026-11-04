import { MIN_LOOP_LENGTH, normalizeRange, round3 } from '@coverscape/shared';

export interface LoopState {
  start: number | null;
  end: number | null;
  enabled: boolean;
}

export const emptyLoop: LoopState = { start: null, end: null, enabled: false };

export function hasRange(loop: LoopState): loop is LoopState & { start: number; end: number } {
  return loop.start != null && loop.end != null;
}

// REQ-28 · Q-05: the A–B arithmetic both stores (studio `usePlayer` and review `useReview`) used to copy. Pure: each
// store keeps what it clears on top (the studio also cancels its gap countdown), so both behave exactly as before.

/** A at `at` (now by default): the old B survives only when it still leaves a loop long enough after the new A. */
export function markStartLoop(loop: LoopState, at: number): LoopState {
  const t = round3(at);
  const end = loop.end != null && loop.end - t >= MIN_LOOP_LENGTH ? loop.end : null;
  return { start: t, end, enabled: end != null ? true : loop.enabled };
}

/** B at `at`, against the current A (or 0); null when no valid range comes out of it. */
export function markEndLoop(loop: LoopState, at: number, duration: number): LoopState | null {
  const t = round3(at);
  const range = normalizeRange(loop.start ?? 0, t, duration || t);
  return range ? { ...range, enabled: true } : null;
}

/** The loop switched on/off; null when there is no A–B range to loop. */
export function toggleLoopState(loop: LoopState): LoopState | null {
  return hasRange(loop) ? { ...loop, enabled: !loop.enabled } : null;
}
