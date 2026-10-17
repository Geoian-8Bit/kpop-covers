import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { bagError, useAllClips } from '@/data/bags';
import { useCreateTrack } from '@/data/tracks';
import { useToast } from '@/providers/ToastProvider';
import { liveClipIds, type RoundOptions } from './roundRules';

interface SaveTrackDialogProps {
  open: boolean;
  onClose: () => void;
  clipIds: string[];
  options: RoundOptions;
  suggestedName?: string;
  onSaved?: (trackId: string) => void;
}

/** «Guardar como pista»: a name, and the round is the group's (order and options as they are now). */
export function SaveTrackDialog({
  open,
  onClose,
  clipIds,
  options,
  suggestedName = '',
  onSaved,
}: SaveTrackDialogProps) {
  const [name, setName] = useState(suggestedName);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateTrack();
  const toast = useToast();
  // The database refuses a clip archived since the round was made (and the whole track with it): leave those out.
  // Fresh on opening; without the list (offline) everything goes and the server has the last word.
  const clips = useAllClips(open);
  const { refetch } = clips;
  useEffect(() => {
    if (open) void refetch({ cancelRefetch: false });
  }, [open, refetch]);
  const { kept, dropped } = useMemo(
    () => (clips.data ? liveClipIds(clipIds, clips.data.map((c) => c.id)) : { kept: clipIds, dropped: 0 }),
    [clipIds, clips.data],
  );
  const checking = clips.isFetching;
  const nothingLeft = clipIds.length > 0 && kept.length === 0 && !checking;

  useEffect(() => {
    if (open) {
      setName(suggestedName);
      setError(null);
    }
  }, [open, suggestedName]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (checking) return;
    const clean = name.trim();
    if (!clean) {
      setError('Ponle un nombre, por ejemplo «Calentamiento martes».');
      return;
    }
    if (!kept.length) {
      setError(clipIds.length ? 'Ninguno de estos clips está disponible.' : 'La ronda no tiene clips.');
      return;
    }
    try {
      const track = await create.mutateAsync({ name: clean, options, clipIds: kept });
      toast(`Pista «${track.name}» guardada para el grupo${dropped ? `. ${droppedNote(dropped)}` : ''}`, 'success');
      onSaved?.(track.id);
      onClose();
    } catch (err) {
      setError(bagError(err));
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={create.isPending}
      title="Guardar como pista"
      description="La pista es de todo el grupo: cualquiera puede reproducirla, cambiar el orden o volver a mezclarla."
      size="sm"
    >
      <form onSubmit={submit} className="space-y-5">
        <Field
          label="Nombre de la pista"
          value={name}
          maxLength={80}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          placeholder="Calentamiento martes"
          error={error}
          data-autofocus="desktop"
        />
        {nothingLeft ? (
          <p className="text-[13px] text-enji-300">
            Ninguno de estos clips está disponible: no hay nada que guardar.
          </p>
        ) : dropped > 0 && !checking ? (
          <p className="text-[13px] text-washi-subtle">{droppedNote(dropped)}.</p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Cancelar
          </Button>
          <Button type="submit" loading={create.isPending || checking} disabled={nothingLeft}>
            Guardar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function droppedNote(n: number): string {
  return n === 1
    ? 'Se ha dejado fuera 1 clip no disponible'
    : `Se han dejado fuera ${n} clips no disponibles`;
}
