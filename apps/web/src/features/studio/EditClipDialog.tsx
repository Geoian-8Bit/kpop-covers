import { Dialog } from '@/components/ui/Dialog';
import { ElasticToggle } from '@/components/ui/ElasticToggle';
import { useUpdateClip } from '@/data/clips';
import { friendlyError } from '@/lib/supabase';
import { usePlayer } from '@/player/store';
import { useToast } from '@/providers/ToastProvider';
import {
  type Clip,
  formatSpeed,
  formatTime,
  normalizeRange,
  stepSpeed,
  type TablesUpdate,
} from '@coverscape/shared';
import { FlipHorizontal2, Minus, Plus } from 'lucide-react';
import { type FormEvent, useId, useRef, useState } from 'react';
import { ColorRow, Footer, NameField, Notice, PinToggle, ToggleGroup } from './clipDialogParts';
import {
  CLIP_NUDGES,
  type ClipEdit,
  clipEditError,
  clipEditLimit,
  clipEditOf,
  clipEditPatch,
  clipRangeError,
  findDuplicateClip,
  markAt,
  nudgeTime,
  patchChangesPlayback,
} from './clipRules';

/** One end of the clip: its time, fine steps and «Poner aquí» from the playhead. */
function TimeMark({
  label,
  which,
  value,
  onChange,
  duration,
}: {
  label: string;
  which: 'inicio' | 'final';
  value: number;
  onChange: (seconds: number) => void;
  duration: number;
}) {
  const labelId = useId();
  const ready = usePlayer((s) => s.ready);
  return (
    <div role="group" aria-labelledby={labelId}>
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="text-[13px] font-medium text-washi-muted">
          {label}
        </span>
        <output aria-live="polite" className="tabular font-mono text-[15px] font-semibold text-washi">
          {formatTime(value, { tenths: true })}
        </output>
      </div>
      <div className="mt-1 grid grid-cols-[repeat(4,minmax(0,1fr))_auto] gap-1">
        {CLIP_NUDGES.map((d) => {
          const amount = Math.abs(d) === 1 ? '1 s' : '0,1 s';
          return (
            <button
              key={d}
              type="button"
              aria-label={`Mover el ${which} ${amount} ${d < 0 ? 'antes' : 'después'}`}
              onClick={() => onChange(nudgeTime(value, d, duration))}
              className="tabular h-11 rounded-[8px] border border-line font-mono text-[13px] text-washi transition-colors hover:bg-washi/[0.07] active:bg-washi/[0.12]"
            >
              {d < 0 ? '−' : '+'}
              {Math.abs(d) === 1 ? '1 s' : '0,1'}
            </button>
          );
        })}
        <button
          type="button"
          disabled={!ready}
          aria-label={`Poner el ${which} en el momento actual del vídeo`}
          onClick={() => onChange(markAt(usePlayer.getState().time, duration))}
          className="h-11 rounded-[8px] bg-shu-700 px-3 text-[13px] font-bold text-washi transition-colors hover:bg-shu-600 disabled:opacity-40"
        >
          Poner aquí
        </button>
      </div>
    </div>
  );
}

/** Where «Poner aquí» would put a mark: the playhead, read only 10×/s (tenths are all it shows). */
function NowReadout() {
  const tenths = usePlayer((s) => Math.floor(s.time * 10));
  return <span className="font-mono">Ahora {formatTime(tenths / 10, { tenths: true })}</span>;
}

/**
 * An edit of the clip being practised, on the player: only what changed (a zoom moved by hand stays as it is;
 * only a new range goes back to its start). Returns how to put the player back.
 */
function playClipEdit(edited: Clip, patch: TablesUpdate<'clips'>): () => void {
  const p = usePlayer.getState();
  const before = { rate: p.rate, mirrored: p.mirrored, loop: p.loop };
  if (patch.speed !== undefined) p.setRate(edited.speed);
  // Session-only, as when a clip opens: the saved mirror preference stays.
  if (patch.mirrored !== undefined) usePlayer.setState({ mirrored: edited.mirrored });
  if (patch.start_seconds !== undefined || patch.end_seconds !== undefined) {
    const range = normalizeRange(edited.start_seconds, edited.end_seconds, p.duration || edited.end_seconds);
    if (range) {
      usePlayer.setState({ loop: { ...range, enabled: true }, countdownEndsAt: null });
      p.seek(range.start);
    }
  }
  return () => {
    const now = usePlayer.getState();
    if (now.activeClipId !== edited.id) return;
    if (now.rate !== before.rate) now.setRate(before.rate);
    usePlayer.setState({ mirrored: before.mirrored, loop: before.loop });
  };
}

interface EditClipDialogProps {
  /** The clip to edit; null closes the dialog. */
  clip: Clip | null;
  onClose: () => void;
  /** The song's other clips, to warn about a copy. */
  clips: readonly Clip[];
}

/** The save dialog in edit mode: everything the clip carries, changed in place (optimistic, undone on failure). */
export function EditClipDialog({ clip: target, onClose, clips }: EditClipDialogProps) {
  const formId = useId();
  const open = target != null;
  // Keep showing the clip while the dialog fades out.
  const last = useRef<Clip | null>(target);
  if (target) last.current = target;
  const clip = target ?? last.current;
  const duration = usePlayer((s) => s.duration);
  const update = useUpdateClip();
  const toast = useToast();
  const [edit, setEdit] = useState<ClipEdit | null>(clip ? clipEditOf(clip) : null);
  const [tried, setTried] = useState(false);

  // Reset each time a clip is opened (during render, so the previous clip's values never flash); a
  // background refetch of the same clip keeps the id and so never wipes the changes.
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  if (target && openedFor !== target.id) {
    setOpenedFor(target.id);
    setEdit(clipEditOf(target));
    setTried(false);
  } else if (!target && openedFor !== null) {
    setOpenedFor(null);
  }

  if (!clip || !edit) return null;
  const set = (patch: Partial<ClipEdit>) => setEdit((e) => (e ? { ...e, ...patch } : e));
  // A range left as saved is never blocked by this stage being a little shorter (see clipEditLimit).
  const limit = clipEditLimit(clip, duration);
  const error = clipEditError(edit, limit);
  const rangeError = clipRangeError(edit.start_seconds, edit.end_seconds, limit);
  const duplicate = findDuplicateClip(
    clips,
    { start: edit.start_seconds, end: edit.end_seconds, speed: edit.speed, mirrored: edit.mirrored },
    clip.id,
  );
  // A range error shows at once (the steps can cause it); a missing name waits for a save attempt.
  const nameMissing = !edit.name.trim();
  const shownError = rangeError ?? (tried && error ? error : null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!clip || !edit) return;
    setTried(true);
    if (error || duplicate) return;
    const patch = clipEditPatch(clip, edit);
    onClose();
    if (Object.keys(patch).length === 0) return;
    const name = patch.name ?? clip.name;
    const saving = update.mutateAsync({ clip, patch });
    // The clip being practised loops its new range, speed and mirror straight away (undone if the save fails).
    const p = usePlayer.getState();
    const undo =
      p.activeClipId === clip.id && patchChangesPlayback(patch)
        ? playClipEdit({ ...clip, ...patch } as Clip, patch)
        : null;
    saving
      .then(() => toast(`«${name}» actualizado`, 'success'))
      .catch((err) => {
        undo?.();
        toast(`No se han guardado los cambios de «${clip.name}»: ${friendlyError(err)}`, 'error');
      });
  }

  const length = edit.end_seconds - edit.start_seconds;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Editar clip"
      footer={
        <Footer
          formId={formId}
          onCancel={onClose}
          busy={false}
          disabled={Boolean(rangeError) || Boolean(duplicate)}
        >
          Guardar cambios
        </Footer>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="space-y-2.5">
        <NameField value={edit.name} onChange={(name) => set({ name })} invalid={tried && nameMissing} />
        <ColorRow value={edit.color} onChange={(color) => set({ color })} ringId="swatch-ring-edit" />

        <fieldset className="space-y-2.5 rounded-[12px] bg-sumi-950/35 p-3 ring-1 ring-line">
          <legend className="sr-only">Tramo del clip</legend>
          <TimeMark
            label="Inicio"
            which="inicio"
            value={edit.start_seconds}
            onChange={(start_seconds) => set({ start_seconds })}
            duration={limit}
          />
          <TimeMark
            label="Fin"
            which="final"
            value={edit.end_seconds}
            onChange={(end_seconds) => set({ end_seconds })}
            duration={limit}
          />
          <p className="tabular flex justify-between gap-3 text-[12px] text-washi-subtle">
            <span>
              Dura {length > 0 ? formatTime(length, { tenths: true }) : '—'}
              {duration > 0 && <> · canción de {formatTime(duration)}</>}
            </span>
            <NowReadout />
          </p>
        </fieldset>

        <div className="flex items-center justify-between gap-3 rounded-[12px] bg-sumi-950/35 px-3 py-1 ring-1 ring-line">
          <span id={`${formId}-speed`} className="text-sm font-medium text-washi-muted">
            Velocidad
          </span>
          <div role="group" aria-labelledby={`${formId}-speed`} className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Más lento"
              disabled={edit.speed <= 0.25}
              onClick={() => set({ speed: stepSpeed(edit.speed, -1) })}
              className="grid size-11 place-items-center rounded-[8px] text-washi hover:bg-washi/10 disabled:opacity-40"
            >
              <Minus className="size-4" />
            </button>
            <output
              aria-live="polite"
              className="tabular w-14 text-center font-mono text-[15px] font-semibold text-washi"
            >
              {formatSpeed(edit.speed)}
            </output>
            <button
              type="button"
              aria-label="Más rápido"
              disabled={edit.speed >= 2}
              onClick={() => set({ speed: stepSpeed(edit.speed, 1) })}
              className="grid size-11 place-items-center rounded-[8px] text-washi hover:bg-washi/10 disabled:opacity-40"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>

        <ToggleGroup>
          <ElasticToggle
            checked={edit.mirrored}
            onChange={(mirrored) => set({ mirrored })}
            label="Espejo"
            icon={<FlipHorizontal2 className="size-4 text-ai-300" />}
          />
          <PinToggle checked={edit.is_pinned} onChange={(is_pinned) => set({ is_pinned })} />
        </ToggleGroup>

        {shownError && <Notice tone="error">{shownError}</Notice>}
        {duplicate && (
          <Notice>
            Ya tienes este tramo guardado como «{duplicate.name}» con la misma velocidad y espejo.
          </Notice>
        )}
      </form>
    </Dialog>
  );
}
