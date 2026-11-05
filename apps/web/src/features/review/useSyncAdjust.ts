import { clampAdjust } from '@coverscape/shared';
import { useCallback, useEffect, useRef } from 'react';
import type { TakeReviewPatch } from '@/data/takes';
import { useReview } from '@/player/store';

/**
 * Fine sync («Ajuste fino»), saved with the take. REQ-25 · The live value lives only in `useReview.timing.adjust`
 * (the clock and the settings read it there): moving the slider never repaints the review screen. The original is
 * put in place once, when the slider is let go (or after the ±0,01 taps stop); every value goes to the saver.
 */
export function useSyncAdjust(initial: number, save: (patch: TakeReviewPatch) => void) {
  const adjustTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** The adjustment the original was last put in place for (a let-go reported twice jumps once). */
  const alignedAdjust = useRef(initial);
  useEffect(() => () => clearTimeout(adjustTimer.current), []);

  return useCallback(
    (value: number, settled: boolean | 'soon' = true) => {
      const alignFor = (target: number) => {
        if (target === alignedAdjust.current) return;
        alignedAdjust.current = target;
        useReview.getState().alignOriginal();
      };
      const next = clampAdjust(value);
      clearTimeout(adjustTimer.current);
      if (settled === 'soon') {
        // ±0,01 taps: one jump of the original once they stop (each would make YouTube load again).
        useReview.setState({ timing: { ...useReview.getState().timing, adjust: next } });
        adjustTimer.current = setTimeout(() => alignFor(next), 300);
        save({ sync_adjust_seconds: next });
        return;
      }
      // While the slider moves only the timing changes (a jump per step would make YouTube load over and over); the
      // original is put in place once, when it is let go.
      const r = useReview.getState();
      useReview.setState({ timing: { ...r.timing, adjust: next } });
      if (settled) alignFor(next);
      save({ sync_adjust_seconds: next });
    },
    [save],
  );
}
