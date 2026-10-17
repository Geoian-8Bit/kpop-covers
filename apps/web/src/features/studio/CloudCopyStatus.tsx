import { formatBytes, hasLinkedFile, type Video } from '@coverscape/shared';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Check, CloudUpload, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { isStaleCopy } from '@/data/videos';
import { cloudLimitBytes } from '@/lib/backend';
import { cn } from '@/lib/cn';
import { loadLocalVideo } from '@/lib/localVideos';
import { snappy } from '@/lib/motion';
import { canMakeCloudCopy, UNSUPPORTED_COPY } from './cloudCopy';
import { cancelCloudCopy, clearCloudCopy, startCloudCopy, useCopyJob, type CopyJob, type CopyJobPhase } from './cloudCopyJob';
import { estimateCopySeconds, formatEta } from './cloudCopyRules';

/**
 * 13 · The group's file of a video that only lives on this device: «Subir una copia para el grupo» on the device
 * that has the original, and the copy's progress (bar, time left, «Cancelar»). In the link panel and, as a row,
 * in the studio (only while there's something to say).
 */

type Original = { status: 'checking' | 'none' } | { status: 'here'; blob: Blob };

/** This device has the group's original of `video`, and the cloud doesn't have it yet. */
export function useLocalOriginal(video: Video): Original {
  const [state, setState] = useState<Original>({ status: 'checking' });
  const wanted = !video.storage_path && (video.source === 'upload' || hasLinkedFile(video));
  useEffect(() => {
    if (!wanted) {
      setState({ status: 'none' });
      return;
    }
    let cancelled = false;
    setState({ status: 'checking' });
    void loadLocalVideo(video.id).then((blob) => {
      if (cancelled) return;
      // A YouTube entry: only the very file that was linked (another version could start elsewhere).
      const same =
        blob != null && (video.source !== 'youtube' || (!isStaleCopy(video) && blob.size === Number(video.file_size)));
      setState(same && blob ? { status: 'here', blob } : { status: 'none' });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, video.id, video.source, video.file_name, video.file_size]);
  return state;
}

const PHASE: Record<CopyJobPhase, string> = {
  preparing: 'Preparando…',
  sound: 'Preparando el sonido…',
  picture: 'Haciendo la copia…',
  checking: 'Comprobando la copia…',
  uploading: 'Subiendo a la nube…',
};

function phaseLabel(job: Extract<CopyJob, { status: 'working' }>): string {
  if (job.phase === 'uploading') return job.mode === 'original' ? 'Subiendo a la nube…' : 'Subiendo la copia a la nube…';
  if (job.phase === 'picture' && job.height) {
    return `Haciendo la copia a ${job.height}p${job.attempt > 1 ? ` (intento ${job.attempt}, más ligera)` : ''}…`;
  }
  return PHASE[job.phase];
}

export function CloudCopyStatus({
  video,
  variant,
  className,
}: {
  video: Video;
  /** 'studio': a row of its own that only shows while there's something to say. 'panel': inside the link panel. */
  variant: 'studio' | 'panel';
  className?: string;
}) {
  const queryClient = useQueryClient();
  const job = useCopyJob(video.id);
  const original = useLocalOriginal(video);
  const blob = original.status === 'here' ? original.blob : null;
  const tooBig = blob != null && blob.size > cloudLimitBytes();
  /** The file's length (a YouTube entry's own is YouTube's). */
  const length = Number(video.source === 'youtube' ? video.file_duration_seconds : video.duration_seconds) || 0;
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    if (!tooBig || job) return;
    let cancelled = false;
    void canMakeCloudCopy()
      .catch(() => false)
      .then((ok) => !cancelled && setSupported(ok));
    return () => {
      cancelled = true;
    };
  }, [tooBig, job]);

  // A finished upload says so for a moment, then the row goes.
  useEffect(() => {
    if (job?.status !== 'done' || variant !== 'studio') return;
    const t = setTimeout(() => clearCloudCopy(video.id), 8000);
    return () => clearTimeout(t);
  }, [job?.status, variant, video.id]);

  // Uploaded videos that fit already have their own «Subir a la nube» over the picture.
  const offer = blob != null && !job && (video.source === 'youtube' || tooBig);
  if (!job && !offer) return null;

  const start = () => {
    if (blob) startCloudCopy({ video, source: blob, queryClient });
  };

  const body = (
    <AnimatePresence mode="wait" initial={false}>
      {job?.status === 'working' ? (
        <motion.div key="working" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={snappy}>
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <span role="status" aria-live="polite" className="min-w-0 text-washi-muted">
              {phaseLabel(job)}
            </span>
            {job.phase !== 'preparing' && (
              <span className="tabular shrink-0 font-mono text-washi">{Math.round(job.progress * 100)} %</span>
            )}
          </div>
          <div
            role="progressbar"
            aria-label="Copia para el grupo"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={job.phase === 'preparing' ? undefined : Math.round(job.progress * 100)}
            className="mt-2 h-2 overflow-hidden rounded-full bg-sumi-800"
          >
            {job.phase === 'preparing' ? (
              <div className="skeleton h-full w-full rounded-full bg-ai-700" />
            ) : (
              <div
                className="h-full origin-left rounded-full bg-ai-400 transition-transform duration-300 motion-reduce:transition-none"
                style={{ transform: `scaleX(${Math.max(0.01, job.progress)})` }}
              />
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="text-[12px] leading-snug text-washi-subtle">
              {job.etaSeconds != null ? `Quedan ${formatEta(job.etaSeconds)}. ` : ''}
              {job.phase === 'uploading' && job.etaSeconds == null ? 'Con datos móviles puede tardar unos minutos. ' : ''}
              Deja la app abierta y a la vista. Aquí sigues usando el original.
            </p>
            <Button variant="ghost" size="sm" className="min-h-11" onClick={() => cancelCloudCopy(video.id)}>
              Cancelar
            </Button>
          </div>
        </motion.div>
      ) : job?.status === 'done' ? (
        <motion.div
          key="done"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={snappy}
          role="status"
          className="flex items-start gap-2.5"
        >
          <Check className="mt-0.5 size-4 shrink-0 text-rokusho" aria-hidden />
          <p className="min-w-0 flex-1 text-[14px] leading-snug">
            {job.mode === 'copy'
              ? `Copia subida${job.height ? ` (${job.height}p · ${formatBytes(job.bytes)})` : ''}: ya la tiene todo el grupo. Aquí sigues usando el original.`
              : 'Subido a la nube: ya lo tiene todo el grupo.'}
          </p>
          <Button variant="ghost" size="icon" aria-label="Cerrar aviso" onClick={() => clearCloudCopy(video.id)}>
            <X className="size-4" />
          </Button>
        </motion.div>
      ) : job?.status === 'error' ? (
        <motion.div key="error" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={snappy}>
          <div role="alert" className="flex gap-2.5 text-[14px] leading-snug">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-enji-300" aria-hidden />
            <p className="min-w-0 flex-1">{job.message}</p>
          </div>
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" className="min-h-11" onClick={() => clearCloudCopy(video.id)}>
              Cerrar
            </Button>
            {blob && (job.kind === 'space' || job.kind === 'other') && (
              <Button variant="secondary" size="sm" className="min-h-11" onClick={start}>
                Reintentar
              </Button>
            )}
          </div>
        </motion.div>
      ) : (
        <motion.div key="offer" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={snappy}>
          <p className="text-[14px] leading-snug text-washi-muted">
            {tooBig ? (
              <>
                Solo está en este dispositivo: pesa {formatBytes(blob!.size)} y la nube admite {formatBytes(cloudLimitBytes())} por
                archivo. Haz una copia más ligera para que la vea todo el grupo; aquí seguirás usando el original.
              </>
            ) : (
              'Solo está en este dispositivo. Súbelo a la nube para que lo vea todo el grupo.'
            )}
          </p>
          {tooBig && supported === false ? (
            <p role="alert" className="mt-2 flex gap-2 text-[13px] leading-snug text-kin-300">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {UNSUPPORTED_COPY}
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <Button size="sm" className="min-h-11" onClick={start} disabled={tooBig && supported == null}>
                <CloudUpload className="size-4" /> {tooBig ? 'Subir una copia para el grupo' : 'Subir a la nube'}
              </Button>
              {tooBig && length > 0 && (
                <span className="text-[12px] text-washi-subtle">
                  Tarda {formatEta(estimateCopySeconds(length))}.
                </span>
              )}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (variant === 'panel') return <div className={cn('well rounded-[12px] p-3', className)}>{body}</div>;
  return (
    <div className={cn('sep-t px-4 py-3 sm:px-5', className)} role="group" aria-labelledby={`cloud-copy-${video.id}`}>
      <p id={`cloud-copy-${video.id}`} className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.12em] text-washi-subtle">
        Nube del grupo
      </p>
      {body}
    </div>
  );
}
