import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { type TakeItem, useSharedTakesBytes, useShareTake } from '@/data/takes';
import { loadKeptTake } from '@/features/record/takeStore';
import { formatMaxLength } from '@/features/studio/cloudCopyRules';
import { snappy } from '@/lib/motion';
import { useToast } from '@/providers/ToastProvider';
import { formatBytes } from '@coverscape/shared';
import { CloudUpload, TriangleAlert } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { SHARE_PRIVACY_NOTICE } from './shareTake';
import { maxShareSeconds, quotaState, shareBytes, shareVideoBitrate, wouldOverflow } from './takeRules';

// ───────────── Share ─────────────

export function ShareDialog({ take, onClose }: { take: TakeItem | null; onClose: () => void }) {
  const share = useShareTake();
  const bytes = useSharedTakesBytes();
  const toast = useToast();
  const last = useRef(take);
  if (take) last.current = take;
  const shown = take ?? last.current;
  /** The take's video, loaded when the dialog opens so the tap on «Compartir» starts playing it at once (iPhone). */
  const [source, setSource] = useState<Blob | null | 'missing'>(null);

  const { reset } = share;
  useEffect(() => {
    if (!take) return;
    reset();
    setSource(null);
    let alive = true;
    void loadKeptTake(take.id).then((blob) => alive && setSource(blob ?? 'missing'));
    return () => {
      alive = false;
    };
  }, [take, reset]);

  function start() {
    if (!shown || !(source instanceof Blob)) return;
    // Straight from the tap, with the video already loaded: iPhone only lets a video with sound play so.
    void share.start(shown, source).then((row) => {
      if (!row) return;
      toast('Toma compartida con el grupo', 'success');
      onClose();
    });
  }

  const seconds = Number(shown?.duration_seconds) || 0;
  const bitrate = shareVideoBitrate(seconds);
  const estimate = shareBytes(seconds, bitrate ?? undefined);
  const tooLong = bitrate == null;
  const noRoom = !tooLong && bytes.data != null && wouldOverflow(bytes.data.total, estimate || 16_000_000);
  const working = share.busy;

  return (
    <Dialog open={take != null} onClose={onClose} title="Compartir con el grupo" busy={working}>
      <div className="space-y-4">
        <p className="flex items-start gap-2.5 rounded-[10px] border border-shu-400/50 p-3 text-[14px] leading-relaxed text-washi">
          <TriangleAlert className="mt-0.5 size-4.5 shrink-0 text-shu-400" />
          {SHARE_PRIVACY_NOTICE}
        </p>
        <p className="text-[14px] leading-relaxed text-washi-muted">
          Se sube una copia reducida a 720p
          {estimate > 0 ? (
            <>
              {' '}
              de unos <span className="tabular font-mono text-washi">{formatBytes(estimate)}</span>
            </>
          ) : null}
          . La original sigue en este móvil. Prepararla tarda lo mismo que dura la toma: deja la app abierta.
        </p>

        {bytes.data && (
          <p className="tabular text-[12px] text-washi-subtle">
            Nube del grupo: {formatBytes(quotaState(bytes.data.total).used)} de 1 GB.
          </p>
        )}

        {tooLong && (
          <p role="alert" className="text-[14px] text-enji-300">
            Esta toma dura demasiado para compartirla (máximo: {formatMaxLength(maxShareSeconds())}).
          </p>
        )}
        {noRoom && (
          <p role="alert" className="text-[14px] text-enji-300">
            No queda sitio en la nube del grupo (1 GB). Avisad a quien administra la app para vaciarla.
          </p>
        )}
        {source === 'missing' && (
          <p role="alert" className="text-[14px] text-enji-300">
            Esta toma ya no está en este móvil.
          </p>
        )}

        <AnimatePresence initial={false}>
          {working && (
            <motion.div
              key="progress"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={snappy}
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center justify-between text-[13px] text-washi-muted">
                <span>
                  {share.phase === 'reducing'
                    ? 'Reduciendo a 720p…'
                    : share.phase === 'uploading'
                      ? 'Subiendo a la nube…'
                      : 'Guardando…'}
                </span>
                {share.phase === 'reducing' && (
                  <span className="tabular font-mono text-washi">{Math.round(share.progress * 100)} %</span>
                )}
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-sumi-800">
                {share.phase === 'reducing' ? (
                  <div
                    className="h-full rounded-full bg-ai-400 transition-[width] duration-300 motion-reduce:transition-none"
                    style={{ width: `${Math.round(share.progress * 100)}%` }}
                  />
                ) : (
                  <div className="skeleton h-full w-full rounded-full bg-ai-700" />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {share.phase === 'error' && share.error && (
          <p role="alert" className="text-[14px] text-enji-300">
            {share.error}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          {share.phase === 'reducing' ? (
            <Button variant="ghost" onClick={share.cancel}>
              Cancelar
            </Button>
          ) : (
            <Button variant="ghost" onClick={onClose} disabled={working}>
              {share.phase === 'error' ? 'Cerrar' : 'Ahora no'}
            </Button>
          )}
          <Button
            loading={working || source === null}
            disabled={!(source instanceof Blob) || tooLong || noRoom || working}
            onClick={start}
          >
            <CloudUpload className="size-4" /> {share.phase === 'error' ? 'Reintentar' : 'Compartir'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
