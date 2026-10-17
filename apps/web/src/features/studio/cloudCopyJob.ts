import type { Video } from '@coverscape/shared';
import type { QueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { beginHeavyWork } from '@/lib/heavyWork';
import type { CopyPhase } from './cloudCopy';
import type { CopyHold } from './cloudCopyRules';

/**
 * 13 · The «copy for the group» jobs of this device, one per video. They live outside React: closing the panel or
 * leaving the song doesn't stop them (closing the app does, and the browser asks first). The UI reads them with
 * `useCopyJob`.
 *
 * Only the jobs' state lives here (small: it is in the studio's chunk). The work itself (`cloudCopyRun.ts`, with
 * the encoder and the MP4 writer) is loaded when a copy starts.
 */

export type CopyJobPhase = 'preparing' | CopyPhase | 'uploading';

export type CopyJob =
  | {
      status: 'working';
      phase: CopyJobPhase;
      /** 0–1 */
      progress: number;
      /** Seconds left, when known. */
      etaSeconds: number | null;
      /** Size of the copy being made (unknown until the plan is made, none when the original is sent). */
      height?: number;
      attempt: number;
      /** 'original': it fits as it is, only the upload is left. */
      mode: 'copy' | 'original';
      /** Waiting for the rest of the device (the recorder open, the voice being separated). */
      held?: CopyHold | null;
    }
  | { status: 'done'; mode: 'copy' | 'original'; bytes: number; height?: number }
  /** 'too-long' / 'too-heavy' / 'unsupported': trying again here gives the same answer (no «Reintentar»). */
  | { status: 'error'; message: string; kind: 'space' | 'unsupported' | 'too-long' | 'too-heavy' | 'other' };

interface JobsState {
  jobs: Record<string, CopyJob>;
}

const LOAD_FAILED = 'No se pudo empezar la copia. Revisa la conexión y vuelve a intentarlo.';

const useJobs = create<JobsState>(() => ({ jobs: {} }));
const controllers = new Map<string, AbortController>();

/** For the copy's own work (`cloudCopyRun.ts`): the job's new state, or none. */
export function setCopyJob(videoId: string, job: CopyJob | null): void {
  useJobs.setState((s) => {
    const jobs = { ...s.jobs };
    if (job) jobs[videoId] = job;
    else delete jobs[videoId];
    return { jobs };
  });
}

export function copyJob(videoId: string): CopyJob | undefined {
  return useJobs.getState().jobs[videoId];
}

export function useCopyJob(videoId: string): CopyJob | undefined {
  return useJobs((s) => s.jobs[videoId]);
}

export function isCopyRunning(videoId: string): boolean {
  return controllers.has(videoId);
}

/** Stops a job (its copy is thrown away; nothing reaches the cloud). */
export function cancelCloudCopy(videoId: string): void {
  controllers.get(videoId)?.abort();
}

/** Forgets a finished or failed job (the offer shows again). */
export function clearCloudCopy(videoId: string): void {
  if (!controllers.has(videoId)) setCopyJob(videoId, null);
}

export interface StartCopyInput {
  video: Video;
  /** This device's original (the file as linked or uploaded). */
  source: Blob;
  queryClient: QueryClient;
}

/**
 * Makes the group's file of `video` from this device's original and sends it: a reduced copy when the original
 * doesn't fit (over 50 MB, or over what's left of the group's 1 GiB), else the original itself.
 */
export function startCloudCopy(input: StartCopyInput): void {
  const id = input.video.id;
  if (controllers.has(id)) return;
  const controller = new AbortController();
  controllers.set(id, controller);
  // Heavy work for as long as the job lasts (busy while it encodes, idle while it waits or uploads): the follow
  // analysis and the separation wait for it, the recorder doesn't learn from its load, an update doesn't cut it.
  const work = beginHeavyWork('copy');
  setCopyJob(id, { status: 'working', phase: 'preparing', progress: 0, etaSeconds: null, attempt: 1, mode: 'copy' });
  void import('./cloudCopyRun')
    .then((m) => m.runCloudCopy(input, controller.signal, work))
    .catch((error: unknown) => {
      // Only when the work itself couldn't be loaded (offline, a new version replaced it): it reports its own errors.
      console.error('[cloudCopy] load', error);
      if (controller.signal.aborted) setCopyJob(id, null);
      else setCopyJob(id, { status: 'error', kind: 'other', message: LOAD_FAILED });
    })
    .finally(() => {
      controllers.delete(id);
      work();
    });
}
