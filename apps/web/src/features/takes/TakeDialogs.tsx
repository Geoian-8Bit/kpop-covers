import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import type { TakeItem } from '@/data/takes';
import { friendlyError } from '@/lib/supabase';
import { useToast } from '@/providers/ToastProvider';
import { Trash2 } from 'lucide-react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { takesCount } from './takeRules';

// ───────────── Delete ─────────────

export function DeleteDialog({
  take,
  onClose,
  onConfirm,
  pending,
}: {
  take: TakeItem | null;
  onClose: () => void;
  onConfirm: (take: TakeItem) => void;
  pending: boolean;
}) {
  // Keep the text while the dialog fades out.
  const last = useRef(take);
  if (take) last.current = take;
  const shown = take ?? last.current;
  const parts = [
    shown?.where === 'here'
      ? 'Se borra de este móvil y deja de verse en el grupo.'
      : 'Deja de verse en el grupo.',
    shown?.shared_path
      ? 'La copia de la nube deja de verse (sigue ocupando espacio hasta que se vacíe la nube).'
      : null,
    shown?.is_best ? 'Es una mejor toma (tiene estrella).' : null,
  ].filter(Boolean);
  return (
    <Dialog
      open={take != null}
      onClose={onClose}
      title="¿Borrar esta toma?"
      description={parts.join(' ')}
      size="sm"
      hideClose
      busy={pending}
    >
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button variant="danger" loading={pending} onClick={() => take && onConfirm(take)}>
          <Trash2 className="size-4" /> Borrar
        </Button>
      </div>
    </Dialog>
  );
}

export function CleanupDialog({
  open,
  onClose,
  candidates,
  keptBack,
  remove,
}: {
  open: boolean;
  onClose: () => void;
  candidates: TakeItem[];
  keptBack: number;
  remove: (take: TakeItem) => Promise<unknown>;
}) {
  const toast = useToast();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  /** The list when the dialog opened: deleting must not chase a list that changes underneath. */
  const [snapshot, setSnapshot] = useState<TakeItem[]>([]);
  const stop = useRef(false);

  // Only when it opens (REQ-30 · the list is read at that moment, not followed).
  const onOpen = useEffectEvent(() => {
    setSnapshot(candidates);
    setProgress(null);
    stop.current = false;
  });
  useEffect(() => {
    if (open) onOpen();
  }, [open]);

  async function run() {
    const list = snapshot;
    setProgress({ done: 0, total: list.length });
    let done = 0;
    for (const take of list) {
      if (stop.current) break;
      try {
        // One by one: the database refuses bulk deletes.
        await remove(take);
        done++;
        setProgress({ done, total: list.length });
      } catch (err) {
        toast(`${friendlyError(err)} Se borraron ${done} de ${list.length}.`, 'error');
        setProgress(null);
        onClose();
        return;
      }
    }
    setProgress(null);
    if (done)
      toast(done === 1 ? 'Borrada 1 toma sin estrella' : `Borradas ${done} tomas sin estrella`, 'success');
    onClose();
  }

  const n = snapshot.length;
  const running = progress != null;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={n === 1 ? '¿Borrar 1 toma sin estrella?' : `¿Borrar ${n} tomas sin estrella?`}
      description={
        <>
          Se borran de una en una las de la lista que no tienen estrella. Las que tienen estrella se quedan.
          {keptBack > 0 &&
            ` ${takesCount(keptBack)} sin estrella no ${keptBack === 1 ? 'es tuya ni está' : 'son tuyas ni están'} en este móvil: se ${keptBack === 1 ? 'queda' : 'quedan'}.`}
        </>
      }
      size="sm"
      hideClose
      busy={running}
    >
      {running && (
        <div className="mb-4" role="status">
          <p className="tabular text-[13px] text-washi-muted">
            Borrando {Math.min(progress.done + 1, progress.total)} de {progress.total}…
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-sumi-800">
            <div
              className="h-full rounded-full bg-shu-500 transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}
      <div className="flex justify-end gap-2">
        {running ? (
          <Button variant="ghost" onClick={() => (stop.current = true)}>
            Parar
          </Button>
        ) : (
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
        )}
        <Button variant="danger" loading={running} disabled={!n} onClick={() => void run()}>
          <Trash2 className="size-4" /> Borrar {n}
        </Button>
      </div>
    </Dialog>
  );
}
