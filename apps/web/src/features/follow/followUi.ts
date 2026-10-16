import { create } from 'zustand';
import type { Box, FollowPick } from './followPath';

/**
 * F10 · The follow feature's own screen state (choosing a dancer on the stage, the name dialog, the analysis in
 * progress). Which path is followed is the player's (player/store.ts → followPathId): it drives the zoom.
 */

/** What a tap or a drawn box on the paused stage is for. */
export type PickMode =
  | { kind: 'auto' } // «Seguir a alguien»: then the name, then the analysis
  | { kind: 'manual' } // «Modo manual»: then the name; the box is its first point
  | { kind: 'correct'; pathId: string } // «Corregir desde aquí»: recompute from this moment
  | { kind: 'point'; pathId: string }; // «Añadir punto aquí» on a manual path

export interface FollowDraft {
  mode: 'auto' | 'manual';
  /** Song second where the dancer was chosen. */
  at: number;
  pick: FollowPick;
  /** The box shown (the person tapped, or the one drawn). */
  box: Box;
}

export interface FollowJob {
  /** The path being corrected (null: a new one). */
  pathId: string | null;
  label: string;
  phase: 'model' | 'video' | 'frames' | 'saving';
  done: number;
  total: number;
  abort: AbortController;
}

interface FollowUiState {
  picking: PickMode | null;
  draft: FollowDraft | null;
  job: FollowJob | null;
}

export const useFollowUi = create<FollowUiState>()(() => ({ picking: null, draft: null, job: null }));

export const followUi = {
  pick(mode: PickMode | null) {
    useFollowUi.setState({ picking: mode });
  },
  draft(draft: FollowDraft | null) {
    useFollowUi.setState({ draft, picking: null });
  },
  job(job: FollowJob | null) {
    useFollowUi.setState({ job });
  },
  progress(patch: Partial<Pick<FollowJob, 'phase' | 'done' | 'total'>>) {
    const job = useFollowUi.getState().job;
    if (job) useFollowUi.setState({ job: { ...job, ...patch } });
  },
  reset() {
    useFollowUi.getState().job?.abort.abort();
    useFollowUi.setState({ picking: null, draft: null, job: null });
  },
};

/** «42 %» of the analysis (the model and the video opening count as the start). */
export function jobPercent(job: Pick<FollowJob, 'phase' | 'done' | 'total'>): number {
  if (job.phase === 'saving') return 100;
  if (job.phase !== 'frames' || job.total <= 0) return 0;
  return Math.min(99, Math.floor((job.done / job.total) * 100));
}

/** The button that opened the picker: focus goes back to it when the picker closes. */
let opener: HTMLElement | null = null;
export function rememberFollowOpener(el: Element | null): void {
  opener = el instanceof HTMLElement ? el : null;
}
export function takeFollowOpener(): HTMLElement | null {
  const el = opener;
  opener = null;
  return el;
}

/** What a screen reader hears about the analysis: each phase, and the progress only every 25 %. */
export function jobMilestone(job: Pick<FollowJob, 'phase' | 'done' | 'total' | 'label' | 'pathId'>): string {
  if (job.phase === 'model') return 'Preparando el modelo…';
  if (job.phase === 'video') return 'Abriendo el vídeo…';
  if (job.phase === 'saving') return 'Guardando el recorrido…';
  const step = Math.floor(jobPercent(job) / 25) * 25;
  return `${job.pathId ? 'Recalculando' : 'Analizando'} a «${job.label}»: ${step} %`;
}
