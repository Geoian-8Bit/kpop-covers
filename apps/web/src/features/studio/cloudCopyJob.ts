import { formatBytes, type Video } from '@coverscape/shared';
import type { QueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { takeKeys } from '@/data/takes';
import { fileIdentity, uploadGroupFile, videoKeys } from '@/data/videos';
import { backend, cloudLimitBytes } from '@/lib/backend';
import { friendlyError } from '@/lib/supabase';
import { canMakeCloudCopy, isAbort, makeCloudCopy, probeVideo, UNSUPPORTED_COPY, type CopyPhase } from './cloudCopy';
import {
  CLOUD_SPACE,
  cloudDecision,
  COPY,
  estimateCopySeconds,
  etaSeconds,
  formatMaxLength,
  maxOriginalBytes,
} from './cloudCopyRules';

/**
 * 13 · The «copy for the group» jobs of this device, one per video. They live outside React: closing the panel or
 * leaving the song doesn't stop them (closing the app does, and the browser asks first). The UI reads them with
 * `useCopyJob`.
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
    }
  | { status: 'done'; mode: 'copy' | 'original'; bytes: number; height?: number }
  /** 'too-long' / 'too-heavy' / 'unsupported': trying again here gives the same answer (no «Reintentar»). */
  | { status: 'error'; message: string; kind: 'space' | 'unsupported' | 'too-long' | 'too-heavy' | 'other' };

interface JobsState {
  jobs: Record<string, CopyJob>;
}

const useJobs = create<JobsState>(() => ({ jobs: {} }));
const controllers = new Map<string, AbortController>();
/** Files already in the cloud whose row update failed: a retry only writes the row. Key: video + file identity. */
const uploaded = new Map<string, string>();

function setJob(videoId: string, job: CopyJob | null) {
  useJobs.setState((s) => {
    const jobs = { ...s.jobs };
    if (job) jobs[videoId] = job;
    else delete jobs[videoId];
    return { jobs };
  });
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
  if (!controllers.has(videoId)) setJob(videoId, null);
}

// ── While a copy is being made: ask before leaving, and keep the screen on (a locked phone pauses it). ──

function onBeforeUnload(e: BeforeUnloadEvent) {
  e.preventDefault();
  e.returnValue = '';
}

type WakeLock = { release: () => Promise<void> };
let wakeLock: WakeLock | null = null;

async function keepAwake() {
  if (wakeLock || document.hidden || !controllers.size) return;
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLock> } };
    wakeLock = (await nav.wakeLock?.request('screen')) ?? null;
    (wakeLock as unknown as EventTarget | null)?.addEventListener?.('release', () => {
      wakeLock = null;
    });
  } catch {
    wakeLock = null;
  }
}

function onVisible() {
  if (!document.hidden) void keepAwake();
}

function guardsOn() {
  if (controllers.size !== 1) return;
  window.addEventListener('beforeunload', onBeforeUnload);
  document.addEventListener('visibilitychange', onVisible);
  void keepAwake();
}

function guardsOff() {
  if (controllers.size) return;
  window.removeEventListener('beforeunload', onBeforeUnload);
  document.removeEventListener('visibilitychange', onVisible);
  void wakeLock?.release().catch(() => undefined);
  wakeLock = null;
}

/** This device as far as memory goes (a phone reads less into memory before closing the tab). */
function deviceShape(): { mobile: boolean; memoryGb: number | null } {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return { mobile: coarse && Math.min(screen.width, screen.height) < 820, memoryGb: typeof memory === 'number' ? memory : null };
}

function extensionOf(name: string | null | undefined): string {
  return name?.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'mp4';
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
export function startCloudCopy({ video, source, queryClient }: StartCopyInput): void {
  if (controllers.has(video.id)) return;
  const controller = new AbortController();
  controllers.set(video.id, controller);
  guardsOn();
  setJob(video.id, { status: 'working', phase: 'preparing', progress: 0, etaSeconds: null, attempt: 1, mode: 'copy' });
  void run(video, source, queryClient, controller.signal).finally(() => {
    controllers.delete(video.id);
    guardsOff();
  });
}

async function run(video: Video, source: Blob, queryClient: QueryClient, signal: AbortSignal) {
  const identity = fileIdentity(video);
  const key = `${video.id}|${identity}`;
  try {
    let blob: Blob | null = null;
    let extension = 'mp4';
    let mode: 'copy' | 'original' = 'copy';
    let height: number | undefined;

    if (!uploaded.has(key)) {
      const usage = await backend.storageUsage().catch(() => null);
      const limit = cloudLimitBytes();
      // A YouTube entry's own length is YouTube's; the file's is the one that counts.
      let duration =
        Number(video.source === 'youtube' ? video.file_duration_seconds : (video.duration_seconds ?? video.file_duration_seconds)) || null;
      if (!duration) duration = (await probeVideo(source, signal).catch(() => null))?.duration ?? null;
      if (signal.aborted) throw new DOMException('Copia cancelada', 'AbortError');
      const device = deviceShape();
      const decision = cloudDecision({
        fileBytes: source.size,
        durationSeconds: duration,
        usedBytes: usage?.total ?? null,
        limitBytes: limit,
        maxOriginalBytes: maxOriginalBytes(device),
      });

      if (decision.kind === 'no-space') {
        setJob(video.id, {
          status: 'error',
          kind: 'space',
          message: `No cabe en la nube del grupo: para subir un archivo hacen falta ${formatBytes(decision.needBytes)} libres (${formatBytes(CLOUD_SPACE.takesReserveBytes)} se guardan para compartir tomas) y quedan ${formatBytes(decision.freeBytes)} de ${formatBytes(COPY.quotaBytes)}. Avisad a quien administra la app para hacer sitio.`,
        });
        return;
      }
      if (decision.kind === 'too-long') {
        setJob(video.id, {
          status: 'error',
          kind: 'too-long',
          message: `El vídeo dura demasiado para que su copia quepa en la nube (máximo: ${formatMaxLength(decision.maxSeconds)}). Recórtalo, o pásalo a 720p con HandBrake y vincula ese archivo.`,
        });
        return;
      }
      if (decision.kind === 'too-heavy') {
        setJob(video.id, {
          status: 'error',
          kind: 'too-heavy',
          message: `Este archivo pesa ${formatBytes(source.size)}: es demasiado para hacer la copia en ${device.mobile ? 'un móvil' : 'este dispositivo'} (hasta ${formatBytes(decision.maxBytes)}). Hazla desde el ordenador: abre allí esta canción y elige el mismo archivo.`,
        });
        return;
      }

      if (decision.kind === 'original') {
        mode = 'original';
        blob = source;
        extension = extensionOf(video.file_name);
      } else {
        if (!(await canMakeCloudCopy())) {
          setJob(video.id, { status: 'error', kind: 'unsupported', message: UNSUPPORTED_COPY });
          return;
        }
        const started = performance.now();
        const estimate = estimateCopySeconds(duration ?? 0);
        let lastPaint = 0;
        let lastPhase = '';
        const result = await makeCloudCopy(source, {
          targetBytes: decision.targetBytes,
          limitBytes: limit,
          signal,
          onProgress: (p) => {
            // A few repaints a second are plenty for a bar.
            const now = performance.now();
            if (p.phase === lastPhase && now - lastPaint < 400 && p.progress < 1) return;
            lastPaint = now;
            lastPhase = p.phase;
            height = p.height ?? height;
            setJob(video.id, {
              status: 'working',
              phase: p.phase,
              progress: p.progress,
              etaSeconds: etaSeconds({ elapsedSeconds: (now - started) / 1000, progress: p.progress, estimateSeconds: estimate }),
              height: p.height,
              attempt: p.attempt,
              mode: 'copy',
            });
          },
        });
        blob = result.blob;
        height = result.height;
        if (Math.abs(result.correctedShiftSeconds) > 0) {
          console.info('[cloudCopy] sound start corrected by', result.correctedShiftSeconds.toFixed(4), 's');
        }
      }
    }

    if (signal.aborted) throw new DOMException('Copia cancelada', 'AbortError');
    setJob(video.id, { status: 'working', phase: 'uploading', progress: 0, etaSeconds: null, height, attempt: 1, mode });
    const upStarted = performance.now();
    let upPaint = 0;
    const updated = await uploadGroupFile({
      video,
      blob: blob ?? new Blob(),
      extension,
      identity,
      uploadedPath: uploaded.get(key) ?? null,
      onUploaded: (path) => uploaded.set(key, path),
      signal,
      onProgress: (fraction) => {
        const now = performance.now();
        if (now - upPaint < 400 && fraction < 1) return;
        upPaint = now;
        const elapsed = (now - upStarted) / 1000;
        // Time left from the pace so far (no estimate before a few seconds: mobile data varies a lot).
        const eta = fraction > 0.03 && elapsed > 3 ? Math.round((elapsed * (1 - fraction)) / fraction) : null;
        setJob(video.id, { status: 'working', phase: 'uploading', progress: fraction, etaSeconds: eta, height, attempt: 1, mode });
      },
    });
    uploaded.delete(key);
    queryClient.setQueryData(videoKeys.detail(updated.id), updated);
    void queryClient.invalidateQueries({ queryKey: videoKeys.list(updated.crew_id) });
    void queryClient.invalidateQueries({ queryKey: takeKeys.sharedBytes });
    setJob(video.id, { status: 'done', mode, bytes: blob?.size ?? 0, height });
  } catch (error) {
    if (isAbort(error)) {
      setJob(video.id, null);
      return;
    }
    console.error('[cloudCopy]', error);
    setJob(video.id, { status: 'error', kind: 'other', message: friendlyError(error) });
  }
}
