import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ChosenSplit } from './CompareStage';
import type { Fit } from './reviewRules';
import type { Rect } from './stageLayout';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * REQ-25 · What a gesture changes many times a second on the review: the overlay fit, the hinge's share, where the
 * take's panel is, and the save status of fit and sync. One store per open review, read only where it is painted
 * (the stage, the settings, the note area), like the zooms in `useReview`: a drag never repaints the whole screen.
 * The screen keeps only the settled values it saves.
 */
export interface StageLive {
  fit: Fit;
  /** «Separados»: the share the hinge was dragged to (this visit only); null: the best for these two pictures. */
  split: ChosenSplit | null;
  /** Where the take's panel is (px in the stage): notes over YouTube's layout sit there. */
  takeRect: Rect | null;
  fitStatus: SaveStatus;
  adjustStatus: SaveStatus;
}

export type StageStore = StoreApi<StageLive>;

export function createStageStore(fit: Fit): StageStore {
  return createStore<StageLive>(() => ({
    fit,
    split: null,
    takeRect: null,
    fitStatus: 'idle',
    adjustStatus: 'idle',
  }));
}
