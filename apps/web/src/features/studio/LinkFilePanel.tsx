import {
  durationMismatch,
  fileTime,
  formatTime,
  hasLinkedFile,
  nudgeOffset,
  offsetFromMarks,
  type Video,
} from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Check, FileVideo, Flag, Pause, Play, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Spinner';
import {
  signedVideoUrl,
  uploadFailureMessage,
  useLinkVideoFile,
  useUnlinkVideoFile,
  useUpdateVideo,
} from '@/data/videos';
import { cn } from '@/lib/cn';
import { loadLocalVideo, probeMediaFile } from '@/lib/localVideos';
import { jelly, soft } from '@/lib/motion';
import { friendlyError } from '@/lib/supabase';
import { usePlayer } from '@/player/store';
import { useToast } from '@/providers/ToastProvider';
import { rememberStage } from '@/lib/stagePref';

type Step =
  | { kind: 'start' }
  | { kind: 'check'; file: File; duration: number | null }
  | { kind: 'linking' }
  | { kind: 'sync'; url: string; revoke: boolean };

const fmtSigned = (s: number) => `${s >= 0 ? '+' : '−'}${Math.abs(s).toFixed(2).replace('.', ',')} s`;

/**
 * F1 · The file of this YouTube video: link it (same entry, same clips, notes and takes), sync it once by marking
 * the same moment in both players, remove or replace it. The YouTube player is the studio's own; the file plays
 * in a small player here.
 */
export function LinkFilePanel({
  open,
  onClose,
  video,
  initialFile,
}: {
  open: boolean;
  onClose: () => void;
  video: Video;
  /** A file chosen elsewhere (the add-video dialog's «¿Es el archivo de…?»): starts at its check. */
  initialFile?: File | null;
}) {
  const toast = useToast();
  const link = useLinkVideoFile();
  const unlink = useUnlinkVideoFile();
  const update = useUpdateVideo();
  const input = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>({ kind: 'start' });
  const [confirm, setConfirm] = useState<'remove' | 'replace' | null>(null);
  const linked = hasLinkedFile(video);
  const ytDuration = usePlayer((s) => s.duration) || Number(video.duration_seconds) || 0;

  // Fresh each time it opens; an object URL of the picked file is released when the panel goes.
  useEffect(() => {
    if (!open) return;
    setStep({ kind: 'start' });
    setConfirm(null);
    replacing.current = false;
    if (initialFile) void onPick(initialFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFile]);
  useEffect(() => {
    if (step.kind !== 'sync' || !step.revoke) return;
    return () => URL.revokeObjectURL(step.url);
  }, [step]);

  async function onPick(file: File | undefined) {
    if (!file) return;
    const { duration } = await probeMediaFile(file);
    setStep({ kind: 'check', file, duration });
  }

  async function doLink(file: File, duration: number | null) {
    setStep({ kind: 'linking' });
    try {
      let target = video;
      if (replacing.current && hasLinkedFile(video)) {
        target = await unlink.mutateAsync(video);
        rememberStage(video.id, 'youtube');
      }
      replacing.current = false;
      const result = await link.mutateAsync({ video: target, file, duration });
      if (!result.synced && result.uploadFailure) toast(uploadFailureMessage(result.uploadFailure), 'info');
      startSync(URL.createObjectURL(file), true);
    } catch (err) {
      toast(friendlyError(err), 'error');
      setStep({ kind: 'start' });
    }
  }

  /** Syncing marks a moment on YouTube: the studio's player must be the YouTube one, never the file. */
  function startSync(url: string, revoke: boolean) {
    usePlayer.getState().setStage('youtube');
    setStep({ kind: 'sync', url, revoke });
  }

  async function resync() {
    const blob = await loadLocalVideo(video.id);
    if (blob && (!video.file_size || blob.size === video.file_size)) return startSync(URL.createObjectURL(blob), true);
    const url = video.storage_path ? await signedVideoUrl(video.storage_path) : null;
    if (url) startSync(url, false);
    else toast('El archivo no está en este dispositivo ni en la nube. Vincula tu copia primero.', 'info');
  }

  async function removeFile() {
    setConfirm(null);
    try {
      await unlink.mutateAsync(video);
      usePlayer.getState().setStage('youtube');
      rememberStage(video.id, 'youtube');
      toast('Archivo quitado: el vídeo vuelve a ser solo de YouTube', 'success');
      onClose();
    } catch (err) {
      toast(friendlyError(err), 'error');
    }
  }

  /**
   * «Cambiar archivo»: the new file is chosen first (the picker must open right from the tap on iPhone) and the old
   * one is only removed when the new one is linked, so cancelling leaves everything as it was.
   */
  const replacing = useRef(false);
  function replaceFile() {
    setConfirm(null);
    replacing.current = true;
    input.current?.click();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={step.kind === 'sync' ? 'Sincronizar con YouTube' : 'Archivo de este vídeo'}
      description={
        step.kind === 'sync'
          ? 'Marca el mismo momento en los dos (por ejemplo, el primer golpe de la canción). Se hace una vez y vale para todo el grupo.'
          : 'El mismo vídeo descargado por tu cuenta: misma entrada, mismos clips, notas y tomas. Lo usan el superpuesto, el zoom y el seguimiento.'
      }
      busy={step.kind === 'linking' || unlink.isPending}
    >
      <input
        ref={input}
        type="file"
        accept="video/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          void onPick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <AnimatePresence mode="wait" initial={false}>
        {step.kind === 'start' && (
          <motion.div key="start" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={soft}>
            {linked ? (
              <div className="space-y-4">
                <div className="well flex items-center gap-3 rounded-[12px] p-3">
                  <FileVideo className="size-6 shrink-0 text-kin-300" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{video.file_name}</p>
                    <p className="text-[13px] text-washi-muted">
                      {video.storage_path ? 'En la nube del grupo' : 'Solo en el móvil de quien lo vinculó'} · desfase{' '}
                      {fmtSigned(Number(video.file_offset_seconds ?? 0))}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void resync()}>
                    <RefreshCw className="size-4" /> Volver a sincronizar
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirm('replace')}>
                    Cambiar archivo
                  </Button>
                  <Button variant="danger" onClick={() => setConfirm('remove')}>
                    <Trash2 className="size-4" /> Quitar el archivo
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-[14px] leading-relaxed text-washi-muted">
                <ul className="list-disc space-y-1 pl-5">
                  <li>La app no descarga nada de YouTube: consigue el archivo por tu cuenta.</li>
                  <li>Hasta 50 MB se sube a la nube y lo tiene todo el grupo; si pesa más, se queda en este móvil.</li>
                  <li>Después marcas el mismo momento en los dos para sincronizarlos.</li>
                </ul>
                <Button className="mt-2" onClick={() => input.current?.click()}>
                  <FileVideo className="size-4" /> Añadir el archivo de este vídeo
                </Button>
              </div>
            )}
          </motion.div>
        )}

        {step.kind === 'check' && (
          <motion.div key="check" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={soft} className="space-y-4">
            <div className="well flex items-center gap-3 rounded-[12px] p-3">
              <FileVideo className="size-6 shrink-0 text-kin-300" />
              <div className="min-w-0">
                <p className="truncate font-bold">{step.file.name}</p>
                <p className="tabular text-[13px] text-washi-muted">
                  {(step.file.size / 1_048_576).toFixed(1).replace('.', ',')} MB
                  {step.duration ? ` · ${formatTime(step.duration)}` : ''}
                </p>
              </div>
            </div>
            {durationMismatch(ytDuration, step.duration) ? (
              <div role="alert" className="flex gap-3 rounded-[12px] border border-shu-400/60 bg-enji-700/40 p-3 text-[14px] leading-snug">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-shu-400" />
                <p>
                  El archivo dura <b>{formatTime(step.duration ?? 0)}</b> y el vídeo de YouTube{' '}
                  <b>{formatTime(ytDuration)}</b>: puede que sea otra versión (otro corte, una fancam…). Los clips y
                  notas podrían no cuadrar.
                </p>
              </div>
            ) : !step.duration || !ytDuration ? (
              <p className="flex items-center gap-2 text-[14px] text-washi-muted">
                <AlertTriangle className="size-4 text-kin-300" /> No se ha podido leer la duración: compruébala al
                sincronizar.
              </p>
            ) : (
              <p className="flex items-center gap-2 text-[14px] text-washi-muted">
                <Check className="size-4 text-rokusho" /> La duración coincide con la del vídeo de YouTube.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => input.current?.click()}>
                Elegir otro
              </Button>
              <Button onClick={() => void doLink(step.file, step.duration)}>
                {durationMismatch(ytDuration, step.duration) ? 'Vincular igualmente' : 'Vincular'}
              </Button>
            </div>
          </motion.div>
        )}

        {step.kind === 'linking' && (
          <motion.div key="linking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid place-items-center gap-3 py-8 text-washi-muted">
            <Spinner className="size-7" />
            Guardando el archivo…
          </motion.div>
        )}

        {step.kind === 'sync' && (
          <motion.div key="sync" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={soft}>
            <SyncStep
              url={step.url}
              initialOffset={Number(video.file_offset_seconds ?? 0)}
              saving={update.isPending}
              onSave={(offset) =>
                update.mutate(
                  { id: video.id, patch: { file_offset_seconds: offset } },
                  {
                    onSuccess: () => {
                      toast('Archivo sincronizado', 'success');
                      onClose();
                    },
                    onError: (err) => toast(friendlyError(err), 'error'),
                  },
                )
              }
            />
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog
        open={confirm != null}
        onClose={() => setConfirm(null)}
        size="sm"
        hideClose
        title={confirm === 'remove' ? '¿Quitar el archivo?' : '¿Cambiar el archivo?'}
        description={
          confirm === 'remove'
            ? 'El vídeo vuelve a ser solo de YouTube. Los clips, notas y tomas no se tocan.'
            : 'Cambia el archivo y su sincronía para todo el grupo. Tendrás que volver a sincronizarlo.'
        }
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(null)}>
            Cancelar
          </Button>
          <Button variant={confirm === 'remove' ? 'danger' : 'primary'} onClick={() => void (confirm === 'remove' ? removeFile() : replaceFile())}>
            {confirm === 'remove' ? 'Quitar' : 'Elegir el nuevo'}
          </Button>
        </div>
      </Dialog>
    </Dialog>
  );
}

/**
 * Mark one moment in each player; the offset is the difference. «Probar juntos» plays both from just before the
 * marks so they can be heard together (they sound as one when in sync), and ± nudges fix the last hundredths.
 */
function SyncStep({
  url,
  initialOffset,
  saving,
  onSave,
}: {
  url: string;
  initialOffset: number;
  saving: boolean;
  onSave: (offset: number) => void;
}) {
  const fileRef = useRef<HTMLVideoElement>(null);
  const [ytMark, setYtMark] = useState<number | null>(null);
  const [fileMark, setFileMark] = useState<number | null>(null);
  const [offset, setOffset] = useState(initialOffset);
  const [fileTimeNow, setFileTimeNow] = useState(0);
  const [filePlaying, setFilePlaying] = useState(false);
  const [testing, setTesting] = useState(false);
  const ytTime = usePlayer((s) => Math.floor(s.time * 10) / 10);
  const rate = usePlayer((s) => s.rate);
  const ytPlaying = usePlayer((s) => s.playing);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const el = fileRef.current;
    if (!el) return;
    const tick = () => setFileTimeNow(el.currentTime);
    const playing = () => setFilePlaying(!el.paused);
    el.addEventListener('timeupdate', tick);
    el.addEventListener('seeked', tick);
    el.addEventListener('play', playing);
    el.addEventListener('pause', playing);
    return () => {
      el.removeEventListener('timeupdate', tick);
      el.removeEventListener('seeked', tick);
      el.removeEventListener('play', playing);
      el.removeEventListener('pause', playing);
      el.pause();
      clearTimeout(stopTimer.current);
    };
  }, [url]);

  // Both marks set: the offset follows them (nudges then fine-tune it).
  useEffect(() => {
    if (ytMark != null && fileMark != null) setOffset(offsetFromMarks(fileMark, ytMark));
  }, [ytMark, fileMark]);

  const nudgeFile = (d: number) => {
    const el = fileRef.current;
    if (el) el.currentTime = Math.max(0, el.currentTime + d);
  };

  function testTogether() {
    const el = fileRef.current;
    const p = usePlayer.getState();
    if (!el) return;
    const from = Math.max(0, (ytMark ?? p.time) - 2);
    clearTimeout(stopTimer.current);
    p.pause();
    p.seek(from);
    el.pause();
    el.playbackRate = rate;
    el.currentTime = Math.max(0, fileTime(from, offset));
    setTesting(true);
    // Give YouTube a moment to land on the seek, then start both.
    setTimeout(() => {
      usePlayer.getState().play();
      void el.play().catch(() => undefined);
    }, 400);
    stopTimer.current = setTimeout(() => {
      usePlayer.getState().pause();
      el.pause();
      setTesting(false);
    }, 6400);
  }

  const ready = ytMark != null && fileMark != null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {/* YouTube side: the studio's own player, above. */}
        <div className="well rounded-[12px] p-3">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-kin-300">YouTube</p>
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              aria-label={ytPlaying ? 'Pausar YouTube' : 'Reproducir YouTube'}
              onClick={() => usePlayer.getState().togglePlay()}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-shu-500 text-washi"
            >
              {ytPlaying ? <Pause className="size-5" /> : <Play className="size-5" />}
            </button>
            <p className="tabular font-mono text-[22px] font-bold">{formatTime(ytTime, { tenths: true })}</p>
          </div>
          <p className="mt-1 text-[13px] text-washi-muted">Se oye el vídeo del estudio: busca el golpe de oído.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <NudgeButton label="−1 s" onClick={() => usePlayer.getState().nudge(-1)} />
            <NudgeButton label="−0,1" onClick={() => usePlayer.getState().nudge(-0.1)} />
            <NudgeButton label="+0,1" onClick={() => usePlayer.getState().nudge(0.1)} />
            <NudgeButton label="+1 s" onClick={() => usePlayer.getState().nudge(1)} />
          </div>
          <Button className="mt-2 w-full" variant={ytMark != null ? 'secondary' : 'primary'} onClick={() => setYtMark(usePlayer.getState().time)}>
            <Flag className="size-4" /> {ytMark != null ? `Marcado en ${formatTime(ytMark, { tenths: true })}` : 'Marcar aquí'}
          </Button>
        </div>

        {/* File side */}
        <div className="well rounded-[12px] p-3">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-kin-300">Archivo</p>
          <div className="relative mt-1 aspect-video overflow-hidden rounded-[8px] bg-black">
            <video ref={fileRef} src={url} playsInline preload="auto" className="size-full object-contain" />
            <button
              type="button"
              aria-label={filePlaying ? 'Pausar el archivo' : 'Reproducir el archivo'}
              onClick={() => {
                const el = fileRef.current;
                if (!el) return;
                if (el.paused) void el.play().catch(() => undefined);
                else el.pause();
              }}
              className="absolute inset-0 grid place-items-center"
            >
              <span className="grid size-11 place-items-center rounded-full bg-black/55">
                {filePlaying ? <Pause className="size-5" /> : <Play className="size-5" />}
              </span>
            </button>
          </div>
          <p className="tabular mt-1 font-mono text-[15px] font-bold">{formatTime(fileTimeNow, { tenths: true })}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <NudgeButton label="−1 s" onClick={() => nudgeFile(-1)} />
            <NudgeButton label="−0,1" onClick={() => nudgeFile(-0.1)} />
            <NudgeButton label="+0,1" onClick={() => nudgeFile(0.1)} />
            <NudgeButton label="+1 s" onClick={() => nudgeFile(1)} />
          </div>
          <Button
            className="mt-2 w-full"
            variant={fileMark != null ? 'secondary' : 'primary'}
            onClick={() => setFileMark(fileRef.current?.currentTime ?? 0)}
          >
            <Flag className="size-4" /> {fileMark != null ? `Marcado en ${formatTime(fileMark, { tenths: true })}` : 'Marcar aquí'}
          </Button>
        </div>
      </div>

      <div className={cn('rounded-[12px] border p-3 transition-colors', ready ? 'border-kin-400/50' : 'border-line')}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-washi-muted">Desfase (el archivo va por delante si es positivo)</p>
            <motion.p key={offset} initial={{ scale: 1.08 }} animate={{ scale: 1 }} transition={jelly} className="tabular font-mono text-[22px] font-bold">
              {fmtSigned(offset)}
            </motion.p>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ajuste fino del desfase">
            <NudgeButton label="−0,05" onClick={() => setOffset((o) => nudgeOffset(o, -0.05))} />
            <NudgeButton label="−0,01" onClick={() => setOffset((o) => nudgeOffset(o, -0.01))} />
            <NudgeButton label="+0,01" onClick={() => setOffset((o) => nudgeOffset(o, 0.01))} />
            <NudgeButton label="+0,05" onClick={() => setOffset((o) => nudgeOffset(o, 0.05))} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={testTogether} loading={testing}>
            <Play className="size-4" /> Probar juntos
          </Button>
          <Button onClick={() => onSave(offset)} loading={saving}>
            <Check className="size-4" /> Guardar sincronía
          </Button>
        </div>
        <p className="mt-2 text-[12px] leading-snug text-washi-subtle">
          «Probar juntos» suena los dos a la vez durante unos segundos: si oyes eco, ajusta el desfase en centésimas.
        </p>
      </div>
    </div>
  );
}

function NudgeButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.88 }}
      transition={jelly}
      onClick={onClick}
      className="tabular min-h-11 min-w-11 rounded-[8px] border border-line-strong bg-sumi-800 px-2 font-mono text-[13px] font-bold text-washi hover:border-washi/40"
    >
      {label}
    </motion.button>
  );
}
