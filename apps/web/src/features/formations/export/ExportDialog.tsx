import type { Video } from '@coverscape/shared';
import { motion } from 'motion/react';
import { Clapperboard, FileText, Image as ImageIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Spinner';
import { useFileSource } from '@/features/studio/fileSource';
import { cn } from '@/lib/cn';
import { jelly, snappy } from '@/lib/motion';
import { FriendlyError } from '@/lib/supabase';
import { usePlayer } from '@/player/store';
import { useToast } from '@/providers/ToastProvider';
import { formatClock, VIDEO_MAX_SECONDS, videoRange } from './exportRules';
import type { PlanSnapshot } from './exportStill';

type Job = 'png' | 'pdf' | 'video' | null;
type Support = 'checking' | 'yes' | 'no';

/**
 * REQ-11 / REQ-12 · «Exportar»: the picture of this moment, the PDF of the whole plan or the video of its animation.
 * The heavy parts (canvas painter, `jspdf`, the encoder) are imported only when an export starts.
 */
export function ExportDialog({
  open,
  onClose,
  snapshot,
  video,
  playsFile,
}: {
  open: boolean;
  onClose: () => void;
  snapshot: () => PlanSnapshot;
  video: Video;
  playsFile: boolean;
}) {
  const toast = useToast();
  const [job, setJob] = useState<Job>(null);
  const [pages, setPages] = useState<{ done: number; total: number } | null>(null);
  const [percent, setPercent] = useState(0);
  const [support, setSupport] = useState<Support>('checking');
  const abort = useRef<AbortController | null>(null);
  // Whole seconds, and only while open: no render per frame of the player.
  const time = usePlayer((s) => (open ? Math.round(s.time) : 0));
  const mirrored = usePlayer((s) => s.mirrored);
  const loop = usePlayer((s) => s.loop);
  const duration = usePlayer((s) => s.duration);
  const file = useFileSource(video, 0, open && playsFile);
  const snap = open ? snapshot() : null;
  const count = snap?.list.length ?? 0;
  const range = snap ? videoRange(snap.list, loop, duration) : null;
  const usesLoop = loop.enabled && loop.start != null && loop.end != null;

  // REQ-12 · Whether this browser has WebCodecs (asked once per opening, loading the encoder module only then).
  const stageKey = snap ? `${snap.stage.width}x${snap.stage.depth}` : '';
  useEffect(() => {
    if (!open || !snap) return;
    let cancelled = false;
    setSupport('checking');
    if (typeof VideoEncoder === 'undefined') {
      setSupport('no');
      return;
    }
    void import('./exportVideo')
      .then((m) => m.canExportVideo(snap))
      .then((ok) => !cancelled && setSupport(ok ? 'yes' : 'no'))
      .catch(() => !cancelled && setSupport('no'));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening and stage size
  }, [open, stageKey]);

  // Leaving the editor mid-export stops the encoder.
  useEffect(() => () => abort.current?.abort(), []);

  async function run(kind: 'png' | 'pdf') {
    if (job) return;
    setJob(kind);
    setPages(null);
    try {
      const snap = snapshot();
      const [still, painter] = await Promise.all([import('./exportStill'), import('./stagePainter')]);
      const made =
        kind === 'png'
          ? await still.formationPng(snap, usePlayer.getState().time)
          : await still.formationsPdf(snap, (done, total) => setPages({ done, total }));
      const result = await painter.deliverFile(made, snap.planName);
      if (result !== 'cancelled') toast(kind === 'png' ? 'Imagen lista' : 'PDF listo', 'success');
      onClose();
    } catch (error) {
      console.error('[formations] export', error);
      toast(kind === 'png' ? 'No se pudo crear la imagen.' : 'No se pudo crear el PDF. Si el plan es muy largo, prueba desde un ordenador.', 'error');
    } finally {
      setJob(null);
      setPages(null);
    }
  }

  async function runVideo() {
    if (job || !range?.ok) return;
    const controller = new AbortController();
    abort.current = controller;
    setJob('video');
    setPercent(0);
    const p = usePlayer.getState();
    if (p.playing) p.pause();
    try {
      const snap = snapshot();
      const [mod, painter] = await Promise.all([import('./exportVideo'), import('./stagePainter')]);
      let sound: Blob | null = null;
      if (playsFile && file.status === 'ready') {
        try {
          sound = file.local ?? (await (await fetch(file.url)).blob());
        } catch {
          sound = null;
        }
      }
      const offset = video.source === 'youtube' ? Number(video.file_offset_seconds ?? 0) : 0;
      const result = await mod.formationsVideo({
        snap,
        start: range.start,
        end: range.end,
        sound,
        fileOffset: offset,
        signal: controller.signal,
        onProgress: setPercent,
      });
      if (controller.signal.aborted) return;
      const delivered = await painter.deliverFile(result.file, snap.planName);
      if (delivered !== 'cancelled') toast(sound && !result.withSound ? 'Vídeo listo, sin sonido: no se pudo leer el de la canción' : 'Vídeo listo', 'success');
      onClose();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        toast('Exportación cancelada', 'info');
      } else {
        console.error('[formations] video export', error);
        toast(error instanceof FriendlyError ? error.message : 'No se pudo crear el vídeo.', 'error');
      }
    } finally {
      abort.current = null;
      setJob(null);
      setPercent(0);
    }
  }

  const soundNote = !playsFile
    ? 'Con YouTube el vídeo va sin sonido (solo la animación del escenario).'
    : file.status === 'missing'
      ? 'El archivo de la canción no está en este dispositivo: el vídeo irá sin sonido.'
      : 'Lleva el sonido de la canción.';
  const videoDetail =
    support === 'no'
      ? 'Este navegador no puede crear vídeos (le falta WebCodecs). Prueba con Chrome o Edge.'
      : !range || !range.ok
        ? range?.ok === false && range.reason === 'too_long'
          ? `El tramo pasa de ${VIDEO_MAX_SECONDS / 60} minutos. Marca un bucle A–B más corto.`
          : 'Añade una formación para poder sacar el vídeo.'
        : `MP4 de ${formatClock(range.start)} a ${formatClock(range.end)}${usesLoop ? ' (el bucle A–B)' : ''}. ${soundNote}`;

  return (
    <Dialog open={open} onClose={onClose} title="Exportar" description={`Vista ${mirrored ? 'desde los bailarines' : 'desde el público'} (la del escenario).`} busy={job != null}>
      <div className="space-y-2.5">
        <ExportOption
          icon={<ImageIcon className="size-5" />}
          title="Exportar imagen"
          detail={`PNG de este momento (${formatClock(time)}) con los nombres y la nota.`}
          busy={job === 'png'}
          disabled={job != null}
          onClick={() => void run('png')}
        />
        <ExportOption
          icon={<FileText className="size-5" />}
          title="Exportar PDF"
          detail={
            count === 0
              ? 'Añade una formación para poder sacar el PDF.'
              : job === 'pdf' && pages
                ? `Página ${pages.done} de ${pages.total}…`
                : `Una página por formación (${count} ${count === 1 ? 'página' : 'páginas'}) con el tiempo, los nombres y las notas.`
          }
          busy={job === 'pdf'}
          disabled={job != null || count === 0}
          onClick={() => void run('pdf')}
        />
        <ExportOption
          icon={<Clapperboard className="size-5" />}
          title="Exportar vídeo"
          detail={support === 'checking' && range?.ok ? 'Comprobando si este navegador puede crear vídeos…' : videoDetail}
          busy={job === 'video'}
          disabled={job != null || support !== 'yes' || !range?.ok}
          onClick={() => void runVideo()}
        />
        {job === 'video' && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={snappy} className="space-y-2 pt-1">
            <div
              role="progressbar"
              aria-label="Progreso del vídeo"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="h-2.5 overflow-hidden rounded-full bg-sumi-700"
            >
              <motion.div className="h-full rounded-full bg-kin-400" animate={{ width: `${percent}%` }} transition={snappy} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="tabular text-[13px] font-bold text-washi" aria-live="polite">
                Creando el vídeo… {percent} %
              </span>
              <Button size="sm" variant="secondary" onClick={() => abort.current?.abort()}>
                Cancelar
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </Dialog>
  );
}


export function ExportOption({
  icon,
  title,
  detail,
  busy,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  detail: ReactNode;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={jelly}
      aria-busy={busy}
      className={cn(
        'flex min-h-16 w-full items-center gap-3 rounded-[12px] border border-line-strong bg-sumi-800 px-3.5 py-3 text-left transition-colors',
        'hover:border-kin-300/60 disabled:opacity-50 disabled:hover:border-line-strong',
        busy && 'border-kin-300/70 opacity-100 disabled:opacity-100',
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-ai-700/50 text-ai-200">
        {busy ? <Spinner decorative className="size-5" /> : icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-washi">{title}</span>
        <span className="block text-[13px] text-washi-muted">{detail}</span>
      </span>
    </motion.button>
  );
}
