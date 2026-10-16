import { formatTime, type Note, type Video } from '@coverscape/shared';
import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { currentMemberId, useMembers } from '@/data/members';
import { useCreateNote, useDeleteNote, useUpdateNote } from '@/data/notes';
import { categoryLabel, isValidSketch, noteStatus } from '@/features/review/reviewRules';
import { friendlyError } from '@/lib/supabase';
import { useToast } from '@/providers/ToastProvider';

const IDEAS = ['Limpiar este paso', 'Brazos más arriba', 'Ir a tempo', 'Cambio de formación', 'Mirar a cámara'];

export interface NoteTarget {
  /** Existing note to read or edit, or null for a new one. */
  note: Note | null;
  /** Moment of the song the note belongs to. */
  at: number;
}

/** Write, read, edit or delete a note pinned to a moment of the song. */
export function NoteDialog({ target, onClose, video }: { target: NoteTarget | null; onClose: () => void; video: Video }) {
  const create = useCreateNote();
  const update = useUpdateNote();
  const members = useMembers();
  const remove = useDeleteNote();
  const toast = useToast();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** Synchronous lock: a double tap must not save the note twice. */
  const submitting = useRef(false);
  // Keep showing the last note while the dialog fades out (target is already null by then).
  const lastTarget = useRef(target);
  if (target) lastTarget.current = target;
  const shown = target ?? lastTarget.current;
  const note = shown?.note ?? null;
  const busy = create.isPending || update.isPending || remove.isPending;

  /** Delete armed: a second tap within a few seconds confirms. */
  const [confirming, setConfirming] = useState(false);
  const armedAt = useRef(0);

  useEffect(() => {
    if (!target) return;
    setBody(target.note?.body ?? '');
    setError(null);
    setConfirming(false);
  }, [target]);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 2600);
    return () => clearTimeout(timer);
  }, [confirming]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!target || !text || submitting.current) return;
    submitting.current = true;
    try {
      if (note) {
        if (text !== note.body) {
          await update.mutateAsync({ note, patch: { body: text } });
          toast('Nota actualizada', 'success');
        }
      } else {
        await create.mutateAsync({
          video_id: video.id,
          crew_id: video.crew_id,
          at_seconds: target.at,
          body: text,
          // F2: signed by whoever this device says it is («Sin nombre» otherwise).
          author_member_id: currentMemberId(members.data),
        });
        toast(`Nota en ${formatTime(target.at)}`, 'success');
      }
      onClose();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      submitting.current = false;
    }
  }

  async function onDelete() {
    if (!note || submitting.current) return;
    // Two steps, like clips: the first tap arms «¿Borrar?», a second one (not a double tap) confirms.
    if (!confirming) {
      armedAt.current = performance.now();
      setConfirming(true);
      return;
    }
    if (performance.now() - armedAt.current < 400) return;
    setConfirming(false);
    submitting.current = true;
    try {
      await remove.mutateAsync(note);
      toast('Nota borrada', 'success');
      onClose();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      submitting.current = false;
    }
  }

  return (
    <Dialog
      open={target != null}
      onClose={onClose}
      busy={busy}
      title={note ? 'Nota' : 'Nueva nota'}
      description={shown ? `En el ${formatTime(shown.at, { tenths: true })} de la canción.` : undefined}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="note-body" className="mb-1.5 block text-[13px] font-medium text-washi-muted">
            Qué hay que mirar aquí
          </label>
          <textarea
            id="note-body"
            data-autofocus
            rows={3}
            maxLength={500}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Ej. Este paso hay que limpiarlo, brazos más arriba"
            className="well w-full resize-none rounded-[10px] px-3.5 py-3 text-[15px] leading-relaxed text-washi outline-none placeholder:text-washi-subtle focus:border-kin-300/70"
          />
          {!note && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {IDEAS.map((idea) => (
                <button
                  key={idea}
                  type="button"
                  onClick={() => setBody(idea)}
                  className="h-8 rounded-[8px] border border-line px-3 text-[13px] text-washi-muted transition-colors hover:text-washi"
                >
                  {idea}
                </button>
              ))}
            </div>
          )}
          {note?.take_id && (
            // F6 · a note left on a take, shown here to its recipient.
            <div className="mt-3 rounded-[10px] border border-line p-3 text-[13px] leading-snug text-washi-muted">
              <p>
                Nota sobre una toma
                {categoryLabel(note.category) ? ` · ${categoryLabel(note.category)}` : ''} ·{' '}
                <span className={noteStatus(note) === 'done' ? 'text-rokusho' : 'text-kin-300'}>
                  {noteStatus(note) === 'done' ? 'Resuelta' : 'Pendiente'}
                </span>
              </p>
              {isValidSketch(note.sketch) && (
                <img
                  src={note.sketch}
                  alt="Dibujo sobre el fotograma de la toma"
                  className="mt-2 w-full max-w-[320px] rounded-[8px] border border-line"
                />
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="mt-2 text-sm text-enji-300">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-line pt-4">
          {note && (
            <Button
              variant="danger"
              size="sm"
              aria-label={confirming ? 'Confirmar borrar la nota' : 'Borrar la nota'}
              onClick={() => void onDelete()}
              loading={remove.isPending}
            >
              <Trash2 className="size-4" /> {confirming ? '¿Borrar?' : 'Borrar'}
            </Button>
          )}
          <Button variant="ghost" className="ml-auto" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!body.trim()} loading={create.isPending || update.isPending}>
            Guardar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
