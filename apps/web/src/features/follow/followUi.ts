import { create } from 'zustand';
import type { HoldReason } from './analyze';
import type { Box, FollowPick } from './followPath';
import { remainingPhrase } from './followPlan';

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
  /** 15 · The stretch being watched is done and followed; the rest of the song goes on in the background. */
  ready: boolean;
  /** 15 · Seconds left, in the steps the screen shows (followPlan.remainingStep); null: not known yet. */
  remaining: number | null;
  /** 15 · Waiting: a take is being recorded, or the voice is being separated. */
  held?: HoldReason | null;
}

interface FollowUiState {
  picking: PickMode | null;
  draft: FollowDraft | null;
  job: FollowJob | null;
  /** 14 · Fullscreen follow controls on screen: the name is asked there, not in a dialog under the fullscreen. */
  fsHosts: number;
}

export const useFollowUi = create<FollowUiState>()(() => ({
  picking: null,
  draft: null,
  job: null,
  fsHosts: 0,
}));

/** 7 · Why an analysis was stopped when another file (or offset) came on the stage: nothing of it is saved. */
export const FILE_CHANGED = 'file-changed';

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
  /** An analysis ended: its job goes, but never a newer one started meanwhile (after a change of song). */
  endJob(abort: AbortController) {
    if (useFollowUi.getState().job?.abort === abort) useFollowUi.setState({ job: null });
  },
  progress(patch: Partial<Pick<FollowJob, 'phase' | 'done' | 'total' | 'ready' | 'remaining' | 'held'>>) {
    const job = useFollowUi.getState().job;
    if (!job) return;
    const next = { ...job, ...patch };
    // Only what the screen shows: the analysis reports every frame, the screen repaints per percent at most.
    if (
      next.phase === job.phase &&
      next.ready === job.ready &&
      next.remaining === job.remaining &&
      (next.held ?? null) === (job.held ?? null) &&
      jobPercent(next) === jobPercent(job)
    )
      return;
    useFollowUi.setState({ job: next });
  },
  /** 14 · A fullscreen follow panel mounted or gone. */
  fsHost(delta: 1 | -1) {
    useFollowUi.setState((s) => ({ fsHosts: Math.max(0, s.fsHosts + delta) }));
  },
  /** Leaving the song (or, with FILE_CHANGED, its file or offset changing): nothing half-done carries over. */
  reset(reason?: typeof FILE_CHANGED) {
    useFollowUi.getState().job?.abort.abort(reason);
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

type JobView = Pick<FollowJob, 'phase' | 'done' | 'total' | 'label' | 'pathId'> &
  Partial<Pick<FollowJob, 'ready' | 'remaining' | 'held'>>;

/** 15 · «En pausa mientras grabas»: why the analysis waits. */
export function holdText(reason: HoldReason): string {
  return reason === 'recording' ? 'En pausa mientras grabas' : 'En pausa mientras se separa la voz';
}

/** What a screen reader hears about the analysis: each phase, and the progress only every 25 %. */
export function jobMilestone(job: JobView): string {
  if (job.phase === 'model') return 'Preparando el modelo…';
  if (job.phase === 'video') return 'Abriendo el vídeo…';
  if (job.phase === 'saving') return 'Guardando el recorrido…';
  if (job.held) return holdText(job.held);
  const step = Math.floor(jobPercent(job) / 25) * 25;
  // «Ya sigues a…» was already said once (the notice when the stretch got ready): only the progress now.
  if (job.ready) return `Resto de la canción: ${step} %`;
  return `${job.pathId ? 'Recalculando' : 'Analizando'} a «${job.label}»: ${step} %`;
}

/** The progress line under the follow row: what is going on, the percent and (15) the time left. */
export function jobLine(job: JobView): string {
  if (job.phase === 'model') return 'Preparando el modelo…';
  if (job.phase === 'video') return 'Abriendo el vídeo…';
  if (job.phase === 'saving') return 'Guardando el recorrido…';
  if (job.held) return `${holdText(job.held)} · ${jobPercent(job)} %`;
  const eta = remainingPhrase(job.remaining);
  const tail = `${jobPercent(job)} %${eta ? ` · ${eta}` : ''}`;
  if (job.ready) return `Ya sigues a «${job.label}» aquí. Resto de la canción: ${tail}`;
  return `${job.pathId ? 'Recalculando' : 'Analizando'} a «${job.label}»: ${tail}`;
}

/** The same, short, for over the video and fullscreen. */
export function jobShort(job: JobView): string {
  if (job.phase === 'frames') {
    if (job.held) return `En pausa ${jobPercent(job)} %`;
    const eta = remainingPhrase(job.remaining);
    return `${job.ready ? 'Resto' : 'Analizando'} ${jobPercent(job)} %${eta ? ` · ${eta}` : ''}`;
  }
  return job.phase === 'saving' ? 'Guardando…' : 'Preparando…';
}
