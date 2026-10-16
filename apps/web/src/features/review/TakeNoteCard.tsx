import { formatTime, type Member, type Note } from '@coverscape/shared';
import { motion } from 'motion/react';
import { CheckCircle2, Circle, Eye, EyeOff, Pencil, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { MemberSeal } from '@/features/members/MembersUI';
import { cn } from '@/lib/cn';
import { jelly, soft } from '@/lib/motion';
import { categoryLabel, isValidSketch, noteStatus } from './reviewRules';

/**
 * F6 · A note of the take, opened from its dot: text, category, who wrote it and for whom, «pendiente / resuelta»,
 * edit, delete (archives) and its drawing shown over the take's frame.
 */
export function TakeNoteCard({
  note,
  members,
  sketchShown,
  onToggleSketch,
  onClose,
  onEdit,
  onDelete,
  onStatus,
}: {
  note: Note;
  members: Member[];
  sketchShown: boolean;
  onToggleSketch: () => void;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatus: (status: 'open' | 'done') => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const armedAt = useRef(0);
  useEffect(() => {
    setConfirming(false);
  }, [note.id]);
  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 2600);
    return () => clearTimeout(timer);
  }, [confirming]);

  const member = (id: string | null) => (id ? (members.find((m) => m.id === id) ?? null) : null);
  const author = member(note.author_member_id);
  const recipient = member(note.for_member_id);
  const done = noteStatus(note) === 'done';
  const category = categoryLabel(note.category);
  const hasSketch = isValidSketch(note.sketch);

  return (
    <motion.section
      role="region"
      aria-label={`Nota en ${formatTime(Number(note.take_seconds ?? 0), { tenths: true })}`}
      initial={{ opacity: 0, y: -14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, transition: { duration: 0.15 } }}
      transition={soft}
      className="paper-raised absolute inset-x-2 top-2 z-20 mx-auto max-h-[calc(100%-16px)] max-w-md overflow-y-auto rounded-[14px] p-3.5 sm:p-4"
    >
      <div className="flex items-start gap-2">
        <span className="tabular mt-1 shrink-0 rounded-[6px] bg-sumi-950 px-1.5 py-0.5 font-mono text-[12px] text-kin-300">
          {formatTime(Number(note.take_seconds ?? 0), { tenths: true })}
        </span>
        <div className="min-w-0 flex-1">
          {category && <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-shu-400">{category}</p>}
          <p className="whitespace-pre-wrap break-words text-[15px] leading-snug text-washi">{note.body}</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Cerrar la nota" onClick={onClose} className="-mr-1.5 -mt-1.5">
          <X className="size-5" />
        </Button>
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-washi-muted">
        <MemberSeal member={author} size="sm" />
        <span>{author?.name ?? 'Sin nombre'}</span>
        <span aria-hidden>→</span>
        {recipient ? <MemberSeal member={recipient} size="sm" /> : null}
        <span>{recipient ? `para ${recipient.name}` : note.for_member_id ? 'para un antiguo miembro' : 'para todo el grupo'}</span>
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <motion.button
          type="button"
          aria-pressed={done}
          onClick={() => onStatus(done ? 'open' : 'done')}
          whileTap={{ scale: 0.9 }}
          transition={jelly}
          className={cn(
            'flex min-h-11 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-bold',
            done ? 'bg-rokusho/20 text-rokusho' : 'well text-kin-300',
          )}
        >
          {done ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />}
          {done ? 'Resuelta' : 'Pendiente'}
          <span className="sr-only">. Pulsa para marcarla como {done ? 'pendiente' : 'resuelta'}.</span>
        </motion.button>
        {hasSketch && (
          <Button variant="ghost" size="sm" className="min-h-11" aria-pressed={sketchShown} onClick={onToggleSketch}>
            {sketchShown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {sketchShown ? 'Ocultar dibujo' : 'Ver dibujo'}
          </Button>
        )}
        <Button variant="ghost" size="sm" className="min-h-11" onClick={onEdit}>
          <Pencil className="size-4" /> Editar
        </Button>
        <Button
          variant="danger"
          size="sm"
          className="ml-auto min-h-11"
          aria-label={confirming ? 'Confirmar borrar la nota' : 'Borrar la nota'}
          onClick={() => {
            if (!confirming) {
              armedAt.current = performance.now();
              setConfirming(true);
              return;
            }
            if (performance.now() - armedAt.current < 400) return;
            onDelete();
          }}
        >
          <Trash2 className="size-4" /> {confirming ? '¿Borrar?' : 'Borrar'}
        </Button>
      </div>
    </motion.section>
  );
}

/** While the take plays, each note pops up for a few seconds as the take reaches it. */
export function NoteAlert({ note, onOpen }: { note: Note; onOpen: () => void }) {
  const category = categoryLabel(note.category);
  return (
    <motion.div
      role="status"
      initial={{ opacity: 0, y: 12, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      transition={jelly}
      className="absolute bottom-3 left-1/2 z-20 flex w-max max-w-[min(420px,calc(100%-24px))] -translate-x-1/2 items-center gap-2 rounded-[12px] bg-washi py-1 pl-3 pr-1 text-sumi-900 shadow-[0_12px_28px_-12px_var(--color-sumi-950)]"
    >
      <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug">
        {category && <span className="mr-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-shu-500">{category}</span>}
        <span className="line-clamp-2">{note.body}</span>
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="min-h-11 shrink-0 rounded-[9px] px-3 text-[13px] font-bold text-ai-700 hover:bg-sumi-900/10"
      >
        Ver
      </button>
    </motion.div>
  );
}
