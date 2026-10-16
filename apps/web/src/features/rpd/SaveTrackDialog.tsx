import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { bagError } from '@/data/bags';
import { useCreateTrack } from '@/data/tracks';
import { useToast } from '@/providers/ToastProvider';
import type { RoundOptions } from './roundRules';

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

  useEffect(() => {
    if (open) {
      setName(suggestedName);
      setError(null);
    }
  }, [open, suggestedName]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const clean = name.trim();
    if (!clean) {
      setError('Ponle un nombre, por ejemplo «Calentamiento martes».');
      return;
    }
    if (!clipIds.length) {
      setError('La ronda no tiene clips.');
      return;
    }
    try {
      const track = await create.mutateAsync({ name: clean, options, clipIds });
      toast(`Pista «${track.name}» guardada para el grupo`, 'success');
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
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Cancelar
          </Button>
          <Button type="submit" loading={create.isPending}>
            Guardar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
