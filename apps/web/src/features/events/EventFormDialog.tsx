import type { CrewEvent } from '@coverscape/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { eventError, useCreateEvent, useUpdateEvent } from '@/data/events';
import { useToast } from '@/providers/ToastProvider';
import { checkEventDraft, defaultEventStart, EVENT_NAME_MAX, EVENT_PLACE_MAX, toLocalInput, type EventDraft } from './eventRules';

/** F16 · «Nuevo evento» / «Editar evento»: name, day and time (this phone's time zone), place. */
export function EventFormDialog({
  open,
  onClose,
  event,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** Editing this one; creating when absent. */
  event?: CrewEvent | null;
  onCreated?: (event: CrewEvent) => void;
}) {
  const create = useCreateEvent();
  const update = useUpdateEvent();
  const toast = useToast();
  const [draft, setDraft] = useState<EventDraft>({ name: '', when: '', place: '' });
  const [error, setError] = useState<{ field: keyof EventDraft; message: string } | null>(null);
  const pending = create.isPending || update.isPending;

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDraft(
      event
        ? { name: event.name, when: toLocalInput(event.starts_at), place: event.place ?? '' }
        : { name: '', when: defaultEventStart(new Date()), place: '' },
    );
  }, [open, event]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    const check = checkEventDraft(draft);
    if (!check.ok) return setError({ field: check.field, message: check.message });
    setError(null);
    if (event) {
      update.mutate(
        { id: event.id, patch: check.row },
        {
          onSuccess: () => {
            toast('Evento guardado', 'success');
            onClose();
          },
          onError: (err) => toast(eventError(err), 'error'),
        },
      );
    } else {
      create.mutate(check.row, {
        onSuccess: (created) => {
          toast('Evento creado', 'success');
          onClose();
          onCreated?.(created);
        },
        onError: (err) => toast(eventError(err), 'error'),
      });
    }
  }

  const set = (patch: Partial<EventDraft>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <Dialog open={open} onClose={onClose} title={event ? 'Editar evento' : 'Nuevo evento'} busy={pending}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field
          label="Nombre"
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Showcase de diciembre"
          maxLength={EVENT_NAME_MAX}
          error={error?.field === 'name' ? error.message : null}
          data-autofocus="desktop"
          required
        />
        <Field
          label="Día y hora"
          type="datetime-local"
          value={draft.when}
          onChange={(e) => set({ when: e.target.value })}
          error={error?.field === 'when' ? error.message : null}
          hint="Hora de este móvil."
          required
        />
        <Field
          label="Lugar (opcional)"
          value={draft.place}
          onChange={(e) => set({ place: e.target.value })}
          placeholder="Sala, ciudad…"
          maxLength={EVENT_PLACE_MAX}
          error={error?.field === 'place' ? error.message : null}
        />
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" loading={pending}>
            {event ? 'Guardar' : 'Crear evento'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
