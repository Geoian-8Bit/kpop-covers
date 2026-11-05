import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Spinner';
import { cloudLimitBytes } from '@/lib/backend/mode';
import { soft } from '@/lib/motion';
import { friendlyError } from '@/lib/supabase';
import { durationMismatch, formatBytes, formatTime, type Video } from '@coverscape/shared';
import { AlertTriangle, Check, CloudUpload, FileVideo, RefreshCw, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { estimateCopySeconds, formatEta } from './cloudCopyRules';
import { CloudCopyStatus } from './CloudCopyStatus';
import { SyncStep } from './LinkSyncStep';
import { fmtSigned, useLinkFlow } from './useLinkFlow';

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
  const {
    toast,
    unlink,
    update,
    input,
    step,
    confirm,
    setConfirm,
    linked,
    ytDuration,
    onPick,
    doLink,
    resync,
    removeFile,
    replaceFile,
  } = useLinkFlow({ open, onClose, video, initialFile });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={step.kind === 'sync' ? 'Sincronizar con YouTube' : 'Archivo de este vídeo'}
      description={
        step.kind === 'sync'
          ? 'Marca el mismo momento en los dos (por ejemplo, el primer golpe de la canción). Se hace una vez y vale para todo el grupo.'
          : 'El mismo vídeo descargado por tu cuenta: misma entrada, mismos clips, notas y tomas, sin anuncios ni esperas.'
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
          <motion.div
            key="start"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={soft}
          >
            {linked ? (
              <div className="space-y-4">
                <div className="well flex items-center gap-3 rounded-[12px] p-3">
                  <FileVideo className="size-6 shrink-0 text-kin-300" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{video.file_name}</p>
                    <p className="text-[13px] text-washi-muted">
                      {video.storage_path
                        ? // A copy is only ever made of a file over the per-file limit (without room in the
                          // group nothing is uploaded at all), so the original's size tells.
                          Number(video.file_size) > cloudLimitBytes()
                          ? 'En la nube del grupo (copia más ligera)'
                          : 'En la nube del grupo'
                        : 'Solo en el dispositivo de quien lo vinculó'}{' '}
                      · desfase {fmtSigned(Number(video.file_offset_seconds ?? 0))}
                    </p>
                  </div>
                </div>
                <CloudCopyStatus video={video} variant="panel" />
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
                  <li>
                    Se sube a la nube y lo tiene todo el grupo. Si pesa más de 50 MB, este dispositivo hace
                    una copia más ligera para el grupo y se queda con el original.
                  </li>
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
          <motion.div
            key="check"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={soft}
            className="space-y-4"
          >
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
              <div
                role="alert"
                className="flex gap-3 rounded-[12px] border border-shu-400/60 bg-enji-700/40 p-3 text-[14px] leading-snug"
              >
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-shu-400" />
                <p>
                  El archivo dura <b>{formatTime(step.duration ?? 0)}</b> y el vídeo de YouTube{' '}
                  <b>{formatTime(ytDuration)}</b>: puede que sea otra versión (otro corte, una fancam…). Los
                  clips y notas podrían no cuadrar.
                </p>
              </div>
            ) : !step.duration || !ytDuration ? (
              <p className="flex items-center gap-2 text-[14px] text-washi-muted">
                <AlertTriangle className="size-4 text-kin-300" /> No se ha podido leer la duración:
                compruébala al sincronizar.
              </p>
            ) : (
              <p className="flex items-center gap-2 text-[14px] text-washi-muted">
                <Check className="size-4 text-rokusho" /> La duración coincide con la del vídeo de YouTube.
              </p>
            )}
            {step.file.size > cloudLimitBytes() && (
              <p className="flex gap-2 text-[14px] leading-snug text-washi-muted">
                <CloudUpload className="mt-0.5 size-4 shrink-0 text-ai-400" aria-hidden />
                <span>
                  Pesa más de {formatBytes(cloudLimitBytes())}: al vincularlo, este dispositivo hará una copia
                  más ligera para el grupo
                  {step.duration ? ` (tarda ${formatEta(estimateCopySeconds(step.duration))})` : ''}. Aquí
                  seguirás usando el original.
                </span>
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
          <motion.div
            key="linking"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid place-items-center gap-3 py-8 text-washi-muted"
          >
            <Spinner className="size-7" />
            Guardando el archivo…
          </motion.div>
        )}

        {step.kind === 'sync' && (
          <motion.div
            key="sync"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={soft}
          >
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
          <Button
            variant={confirm === 'remove' ? 'danger' : 'primary'}
            onClick={() => void (confirm === 'remove' ? removeFile() : replaceFile())}
          >
            {confirm === 'remove' ? 'Quitar' : 'Elegir el nuevo'}
          </Button>
        </div>
      </Dialog>
    </Dialog>
  );
}
