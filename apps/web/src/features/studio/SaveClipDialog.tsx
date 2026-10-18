import {
  CLIP_COLORS,
  formatSpeed,
  formatTime,
  normalizeRange,
  stepSpeed,
  type Clip,
  type ClipColor,
  type TablesUpdate,
  type Video,
} from '@coverscape/shared';
import { motion } from 'motion/react';
import { FlipHorizontal2, Minus, Plus } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { ElasticToggle } from '@/components/ui/ElasticToggle';
import { CLIP_SWATCH, useClips, useCreateClip, useUpdateClip } from '@/data/clips';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { friendlyError } from '@/lib/supabase';
import { hasRange, usePlayer, useReview } from '@/player/store';
import { clipZoomColumns, isZoomed, zoomLabel, type Zoom } from '@/player/zoom';
import { useToast } from '@/providers/ToastProvider';
import {
  CLIP_NAME_SUGGESTIONS,
  CLIP_NUDGES,
  clipEditError,
  clipEditLimit,
  clipEditOf,
  clipEditPatch,
  clipRangeError,
  findDuplicateClip,
  markAt,
  nudgeTime,
  patchChangesPlayback,
  type ClipEdit,
} from './clipRules';

/** Same words everywhere the pin appears (dialog, clip list): what it does, not how it's stored. */
export const PIN_LABEL = 'Fijar en la portada';
export const PIN_HINT = 'Sale el primero en Acceso rápido para repetirlo con un toque.';

/* ───────────────────────────── Shared pieces ───────────────────────────── */

/** The name, with the quick names in one row that slides sideways under it. */
function NameField({ value, onChange, invalid }: { value: string; onChange: (name: string) => void; invalid?: boolean }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        Nombre del clip
      </label>
      <input
        id={id}
        // The name comes filled in: on phones don't pop the keyboard over the colours and Guardar.
        data-autofocus="desktop"
        required
        maxLength={80}
        autoComplete="off"
        placeholder="Nombre del clip"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        aria-invalid={invalid || undefined}
        className={cn(
          'well h-11 w-full rounded-[10px] px-4 text-[15px] text-washi outline-none transition-[border-color,box-shadow] duration-200',
          'focus:border-kin-300/70 focus:shadow-[0_0_0_3px_rgb(228_200_143/0.14)]',
          invalid && 'border-enji-400/80',
        )}
      />
      <div
        role="group"
        aria-label="Nombres rápidos"
        // Bleeds to the dialog's edges so a half-cut tag hints that the row slides.
        className="scrollbar-none -mx-6 mt-2 flex gap-1.5 overflow-x-auto overscroll-x-contain px-6 py-1 sm:-mx-7 sm:px-7"
      >
        {CLIP_NAME_SUGGESTIONS.map((s) => (
          <motion.button
            key={s}
            type="button"
            aria-pressed={value === s}
            onClick={() => onChange(s)}
            whileTap={{ scale: 0.9 }}
            transition={jelly}
            className={cn(
              // 36 px pill, 44 px tall hit area.
              'relative h-9 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-[13px] transition-colors before:absolute before:-inset-y-1 before:inset-x-0 before:content-[""]',
              value === s ? 'border-washi bg-washi text-sumi-900' : 'border-line text-washi-muted hover:text-washi',
            )}
          >
            {s}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

/** Six dye colours in one row, each a 44 px target. */
function ColorRow({ value, onChange, ringId }: { value: ClipColor; onChange: (c: ClipColor) => void; ringId: string }) {
  return (
    <div role="radiogroup" aria-label="Color del clip" className="flex justify-between gap-1 sm:justify-start sm:gap-2">
      {CLIP_COLORS.map((c) => (
        <motion.button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={CLIP_SWATCH[c].label}
          title={CLIP_SWATCH[c].label}
          onClick={() => onChange(c)}
          whileTap={{ scale: 0.85 }}
          transition={jelly}
          className="relative grid size-11 place-items-center rounded-[8px]"
        >
          {value === c && (
            <motion.span layoutId={ringId} transition={jelly} className="absolute inset-0 rounded-[8px] border-2 border-washi" />
          )}
          <span className={cn('size-7 rounded-[5px]', CLIP_SWATCH[c].dot)} />
        </motion.button>
      ))}
    </div>
  );
}

/** Switches live together in one well instead of loose lines. */
function ToggleGroup({ children }: { children: ReactNode }) {
  return <div className="flex flex-col rounded-[12px] bg-sumi-950/35 px-3 py-0.5 ring-1 ring-line">{children}</div>;
}

/** «Fijar en la portada» with the line that says what it is for. */
function PinToggle({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }) {
  const hintId = useId();
  return (
    <div>
      <ElasticToggle checked={checked} onChange={onChange} label={PIN_LABEL} describedBy={hintId} />
      {/* Lines up under the label (52 px track + 12 px gap). */}
      <p id={hintId} className="-mt-1.5 pb-2 pl-16 text-[12px] leading-snug text-washi-subtle">{PIN_HINT}</p>
    </div>
  );
}

function Footer({
  formId,
  onCancel,
  busy,
  disabled,
  children,
}: {
  formId: string;
  onCancel: () => void;
  busy: boolean;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="ghost" onClick={onCancel} disabled={busy}>
        Cancelar
      </Button>
      <Button type="submit" form={formId} loading={busy} disabled={disabled}>
        {children}
      </Button>
    </div>
  );
}

function Notice({ children, tone = 'gold' }: { children: ReactNode; tone?: 'gold' | 'error' }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-[10px] px-3.5 py-2.5 text-[13px] leading-snug',
        tone === 'error' ? 'bg-enji-500/15 text-enji-300' : 'bg-kin-300/10 text-kin-200',
      )}
    >
      {children}
    </p>
  );
}

/* ───────────────────────────── Save a new clip ───────────────────────────── */

/** A range of the song to save, when it doesn't come from the studio's own A–B (F8: a range marked on a take). */
export interface ClipDraft {
  start: number;
  end: number;
  speed: number;
  mirrored: boolean;
}

interface SaveClipDialogProps {
  open: boolean;
  onClose: () => void;
  video: Video;
  clipCount: number;
  /** F8 · The range to save instead of the studio's A–B (its speed and mirror come with it). */
  draft?: ClipDraft | null;
  /**
   * F9 · Where the zoom to offer lives: the studio's player, or the review's original (null: nothing to offer,
   * e.g. YouTube). Read here, only while open, so a gesture never re-renders the page that holds the dialog.
   */
  zoomFrom?: 'player' | 'review-original' | null;
  description?: string;
  /** Called with the new clip (the studio marks it as the clip being practised). */
  onSaved?: (clip: Clip) => void;
}

export function SaveClipDialog({ open, onClose, video, clipCount, draft, zoomFrom, description, onSaved }: SaveClipDialogProps) {
  const formId = useId();
  const playerZoom = usePlayer((s) => (open && zoomFrom === 'player' ? s.zoom : null));
  const reviewZoom = useReview((s) => (open && zoomFrom === 'review-original' ? s.zoomOriginal : null));
  const zoom: Zoom | null = playerZoom ?? reviewZoom;
  const playerLoop = usePlayer((s) => s.loop);
  const playerRate = usePlayer((s) => s.rate);
  const playerMirrored = usePlayer((s) => s.mirrored);
  const loop = draft ? { start: draft.start, end: draft.end, enabled: true } : playerLoop;
  const rate = draft ? draft.speed : playerRate;
  const mirrored = draft ? draft.mirrored : playerMirrored;
  const offered = zoom != null && isZoomed(zoom) ? zoom : null;
  const [withZoom, setWithZoom] = useState(true);
  const create = useCreateClip();
  // Always on (cached): dropping it on close would make the duplicate warning vanish mid fade-out.
  const clips = useClips(video.id);
  /** Synchronous lock: a fast double tap must not save the clip twice before React re-renders. */
  const submitting = useRef(false);
  const toast = useToast();
  const [name, setName] = useState('');
  const [color, setColor] = useState<ClipColor>('wine');
  const [pinned, setPinned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clipCountRef = useRef(clipCount);
  clipCountRef.current = clipCount;

  // Reset only when the dialog opens – a background refetch must not wipe what the user typed.
  useEffect(() => {
    if (!open) return;
    const n = clipCountRef.current;
    setName(`Clip ${n + 1}`);
    setColor(CLIP_COLORS[n % CLIP_COLORS.length]!);
    setPinned(false);
    setWithZoom(true);
    setError(null);
  }, [open]);

  // Same range, speed and mirror already saved: point at it instead of creating a copy.
  const duplicate = hasRange(loop)
    ? findDuplicateClip(clips.data, { start: loop.start, end: loop.end, speed: rate, mirrored })
    : undefined;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!hasRange(loop) || !name.trim() || duplicate || submitting.current) return;
    submitting.current = true;
    try {
      const clip = await create.mutateAsync({
        video_id: video.id,
        crew_id: video.crew_id,
        name: name.trim(),
        start_seconds: loop.start,
        end_seconds: loop.end,
        speed: rate,
        mirrored,
        color,
        is_pinned: pinned,
        // F9 · Opened later, the clip shows this zoom (only offered on a file; YouTube is never zoomed).
        ...(offered && withZoom ? clipZoomColumns(offered) : {}),
      });
      if (onSaved) onSaved(clip);
      else usePlayer.getState().setActiveClip(clip.id);
      toast(`“${clip.name}” guardado`, 'success');
      onClose();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      submitting.current = false;
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={create.isPending}
      title="Guardar clip"
      description={description}
      footer={
        <Footer
          formId={formId}
          onCancel={onClose}
          busy={create.isPending}
          disabled={!name.trim() || !hasRange(loop) || Boolean(duplicate)}
        >
          Guardar clip
        </Footer>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="space-y-2.5">
        {hasRange(loop) && (
          // What gets saved with it: the range, its speed and the mirror.
          <div className="flex flex-wrap gap-1.5 text-[13px]">
            <span className="tabular flex h-7 items-center rounded-[7px] bg-shu-500/15 px-2.5 font-mono text-shu-300">
              {formatTime(loop.start, { tenths: true })} → {formatTime(loop.end, { tenths: true })}
            </span>
            <span className="tabular flex h-7 items-center rounded-[7px] border border-line px-2.5 font-mono">{formatSpeed(rate)}</span>
            <span className="flex h-7 items-center gap-1.5 rounded-[7px] border border-line px-2.5">
              <FlipHorizontal2 className="size-3.5 text-ai-300" /> {mirrored ? 'Espejo' : 'Normal'}
            </span>
          </div>
        )}

        <NameField value={name} onChange={setName} invalid={Boolean(error)} />
        <ColorRow value={color} onChange={setColor} ringId="swatch-ring-new" />

        <ToggleGroup>
          <PinToggle checked={pinned} onChange={setPinned} />
          {offered && (
            <ElasticToggle checked={withZoom} onChange={setWithZoom} label={`Guardar con el zoom (${zoomLabel(offered)})`} />
          )}
        </ToggleGroup>

        {error && <Notice tone="error">{error}</Notice>}
        {duplicate && <Notice>Ya tienes este tramo guardado como «{duplicate.name}» con la misma velocidad y espejo.</Notice>}
      </form>
    </Dialog>
  );
}

/* ───────────────────────────── Edit a saved clip ───────────────────────────── */

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
    const undo = p.activeClipId === clip.id && patchChangesPlayback(patch) ? playClipEdit({ ...clip, ...patch } as Clip, patch) : null;
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
        <Footer formId={formId} onCancel={onClose} busy={false} disabled={Boolean(rangeError) || Boolean(duplicate)}>
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
            <output aria-live="polite" className="tabular w-14 text-center font-mono text-[15px] font-semibold text-washi">
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
        {duplicate && <Notice>Ya tienes este tramo guardado como «{duplicate.name}» con la misma velocidad y espejo.</Notice>}
      </form>
    </Dialog>
  );
}
