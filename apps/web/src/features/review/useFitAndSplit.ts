import { useCallback, useMemo, useRef } from 'react';
import type { TakeReviewPatch } from '@/data/takes';
import type { ChosenSplit } from './CompareStage';
import { fitOf, NO_FIT, sameFit, type Fit } from './reviewRules';
import type { StageStore } from './reviewStageStore';
import type { Rect } from './stageLayout';

/**
 * Overlay fit (saved with the take) and the hinge's share (this visit only). REQ-25 · Every step of a gesture goes to
 * the review's stage store, read only by the stage and the settings; the screen keeps the last settled fit, saved
 * 500 ms after the gesture ends when it changed (the saver's debounce).
 */
export function useFitAndSplit(
  stage: StageStore,
  take: Parameters<typeof fitOf>[0],
  save: (patch: TakeReviewPatch, wait?: number) => void,
) {
  const savedFit = useRef(fitOf(take));
  const onFit = useCallback(
    (next: Fit, settled: boolean) => {
      stage.setState({ fit: next });
      if (settled && !sameFit(next, savedFit.current)) {
        savedFit.current = next;
        save({ fit_scale: next.scale, fit_x: next.x, fit_y: next.y }, 500);
      }
    },
    [save, stage],
  );
  return useMemo(
    () => ({
      onFit,
      onResetFit: () => onFit(NO_FIT, true),
      onSplit: (split: ChosenSplit) => stage.setState({ split }),
      onAutoSplit: () => stage.setState({ split: null }),
      onTakeRect: (takeRect: Rect | null) => stage.setState({ takeRect }),
    }),
    [onFit, stage],
  );
}
