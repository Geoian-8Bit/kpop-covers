import { formatBytes, type Video } from '@coverscape/shared';
import type { QueryClient } from '@tanstack/react-query';
import { takeKeys } from '@/data/takes';
import { fileIdentity, uploadGroupFile, videoKeys } from '@/data/videos';
import { backend, cloudLimitBytes } from '@/lib/backend';
import { heavyWorkBusy, type HeavyWork } from '@/lib/heavyWork';
import { friendlyError } from '@/lib/supabase';
import { usePlayer } from '@/player/store';
import { isAbort, makeCloudCopy, probeVideo, type CopyPaceNow } from './cloudCopy';
import { setCopyJob, type CopyJob, type StartCopyInput } from './cloudCopyJob';
import {
  CLOUD_SPACE,
  cloudDecision,
  COPY,
  copyPace,
  estimateCopySeconds,
  etaSeconds,
  formatMaxLength,
  maxOriginalBytes,
  workingSeconds,
  type CopyHold,
} from './cloudCopyRules';
import { canMakeCloudCopy, UNSUPPORTED_COPY } from './cloudCopySupport';

/**
 * 13 · The work of a «copy for the group» job (loaded with `import()` when one starts, see `cloudCopyJob.ts`):
 * decide, make the copy, upload it. While it makes the copy it shares the device: it waits while the recorder is
 * open or the voice is being separated, and goes no faster than 1× while the studio plays.
 */

/** Files already in the cloud whose row update failed: a retry only writes the row. Key: video + file identity. */
const uploaded = new Map<string, string>();
/** Jobs running now (the guards below are on while there is one). */
let active = 0;

// ── While a copy is being made: ask before leaving, and keep the screen on (a locked phone pauses it). ──

function onBeforeUnload(e: BeforeUnloadEvent) {
  e.preventDefault();
  e.returnValue = '';
}

type WakeLock = { release: () => Promise<void> };
let wakeLock: WakeLock | null = null;

async function keepAwake() {
  if (wakeLock || document.hidden || !active) return;
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
  active++;
  if (active !== 1) return;
  window.addEventListener('beforeunload', onBeforeUnload);
  document.addEventListener('visibilitychange', onVisible);
  void keepAwake();
}

function guardsOff() {
  active = Math.max(0, active - 1);
  if (active) return;
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

/**
 * What the rest of the device allows the copy now. Global review 2 [2] · The separation counts only while it loads
 * the device: while it downloads its model or uploads its tracks (network only) the copy goes on.
 */
function paceNow(): CopyPaceNow {
  const player = usePlayer.getState();
  return copyPace({ covered: player.covered, separating: heavyWorkBusy('voice'), studioPlaying: player.playing });
}

export async function runCloudCopy({ video, source, queryClient }: StartCopyInput, signal: AbortSignal, work: HeavyWork): Promise<void> {
  guardsOn();
  try {
    await run(video, source, queryClient, signal, work);
  } finally {
    guardsOff();
  }
}

async function run(video: Video, source: Blob, queryClient: QueryClient, signal: AbortSignal, work: HeavyWork) {
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
        setCopyJob(video.id, {
          status: 'error',
          kind: 'space',
          message: `No cabe en la nube del grupo: para subir un archivo hacen falta ${formatBytes(decision.needBytes)} libres (${formatBytes(CLOUD_SPACE.takesReserveBytes)} se guardan para compartir tomas) y quedan ${formatBytes(decision.freeBytes)} de ${formatBytes(COPY.quotaBytes)}. Avisad a quien administra la app para hacer sitio.`,
        });
        return;
      }
      if (decision.kind === 'too-long') {
        setCopyJob(video.id, {
          status: 'error',
          kind: 'too-long',
          message: `El vídeo dura demasiado para que su copia quepa en la nube (máximo: ${formatMaxLength(decision.maxSeconds)}). Recórtalo, o pásalo a 720p con HandBrake y vincula ese archivo.`,
        });
        return;
      }
      if (decision.kind === 'too-heavy') {
        setCopyJob(video.id, {
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
          setCopyJob(video.id, { status: 'error', kind: 'unsupported', message: UNSUPPORTED_COPY });
          return;
        }
        const started = performance.now();
        const estimate = estimateCopySeconds(duration ?? 0);
        let lastPaint = 0;
        let lastPhase = '';
        let last: Extract<CopyJob, { status: 'working' }> | null = null;
        let held: CopyHold | null = null;
        let heldSince = 0;
        let pausedMs = 0;
        const paint = (job: Extract<CopyJob, { status: 'working' }>) => {
          last = job;
          setCopyJob(video.id, { ...job, held });
        };
        const result = await makeCloudCopy(source, {
          targetBytes: decision.targetBytes,
          limitBytes: limit,
          signal,
          pace: paceNow,
          onHold: (hold) => {
            if (hold === held) return;
            const now = performance.now();
            if (held) pausedMs += now - heldSince;
            else heldSince = now;
            if (hold) heldSince = now;
            held = hold;
            // Paused: no load on the device (the recorder may measure itself meanwhile).
            work.idle(hold != null);
            if (last) paint({ ...last, etaSeconds: hold ? null : last.etaSeconds });
            else setCopyJob(video.id, { status: 'working', phase: 'preparing', progress: 0, etaSeconds: null, attempt: 1, mode: 'copy', held });
          },
          onProgress: (p) => {
            // A few repaints a second are plenty for a bar.
            const now = performance.now();
            if (p.phase === lastPhase && now - lastPaint < 400 && p.progress < 1) return;
            lastPaint = now;
            lastPhase = p.phase;
            height = p.height ?? height;
            const paused = pausedMs + (held ? now - heldSince : 0);
            paint({
              status: 'working',
              phase: p.phase,
              progress: p.progress,
              etaSeconds: etaSeconds({ elapsedSeconds: workingSeconds(now - started, paused), progress: p.progress, estimateSeconds: estimate }),
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
    // Uploading only waits on the network: no load on the device, but an update would still cut it short.
    work.idle(true);
    setCopyJob(video.id, { status: 'working', phase: 'uploading', progress: 0, etaSeconds: null, height, attempt: 1, mode });
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
        setCopyJob(video.id, { status: 'working', phase: 'uploading', progress: fraction, etaSeconds: eta, height, attempt: 1, mode });
      },
    });
    uploaded.delete(key);
    queryClient.setQueryData(videoKeys.detail(updated.id), updated);
    void queryClient.invalidateQueries({ queryKey: videoKeys.list(updated.crew_id) });
    void queryClient.invalidateQueries({ queryKey: takeKeys.sharedBytes });
    setCopyJob(video.id, { status: 'done', mode, bytes: blob?.size ?? 0, height });
  } catch (error) {
    if (isAbort(error)) {
      setCopyJob(video.id, null);
      return;
    }
    console.error('[cloudCopy]', error);
    setCopyJob(video.id, { status: 'error', kind: 'other', message: friendlyError(error) });
  }
}
