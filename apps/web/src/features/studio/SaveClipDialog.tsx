import { Dialog } from '@/components/ui/Dialog';
import { ElasticToggle } from '@/components/ui/ElasticToggle';
import { useClips, useCreateClip } from '@/data/clips';
import { friendlyError } from '@/lib/supabase';
import { hasRange, usePlayer, useReview } from '@/player/store';
import { clipZoomColumns, isZoomed, type Zoom, zoomLabel } from '@/player/zoom';
import { useToast } from '@/providers/ToastProvider';
import {
  type Clip,
  CLIP_COLORS,
  type ClipColor,
  formatSpeed,
  formatTime,
  type Video,
} from '@coverscape/shared';
import { FlipHorizontal2 } from 'lucide-react';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { ColorRow, Footer, NameField, Notice, PinToggle, ToggleGroup } from './clipDialogParts';
import { findDuplicateClip } from './clipRules';

const HOLD: unique symbol = Symbol('hold');

/**
 * REQ-21 · A player value the dialog only follows while open: closed (most of the time, while A–B is dragged or the
 * speed changes) it keeps the last value it showed and never re-renders; the fade-out on close shows that value.
 */
function usePlayerWhileOpen<T>(open: boolean, select: (s: ReturnType<typeof usePlayer.getState>) => T): T {
  const value = usePlayer((s) => (open ? select(s) : HOLD));
  const [held, setHeld] = useState(() => select(usePlayer.getState()));
  // Kept from the last open render (React's «state from the previous render» pattern: re-renders before painting).
  if (value !== HOLD && !Object.is(value, held)) setHeld(value);
  return value !== HOLD ? value : held;
}

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

export function SaveClipDialog({
  open,
  onClose,
  video,
  clipCount,
  draft,
  zoomFrom,
  description,
  onSaved,
}: SaveClipDialogProps) {
  const formId = useId();
  const playerZoom = usePlayer((s) => (open && zoomFrom === 'player' ? s.zoom : null));
  const reviewZoom = useReview((s) => (open && zoomFrom === 'review-original' ? s.zoomOriginal : null));
  const zoom: Zoom | null = playerZoom ?? reviewZoom;
  const playerLoop = usePlayerWhileOpen(open, (s) => s.loop);
  const playerRate = usePlayerWhileOpen(open, (s) => s.rate);
  const playerMirrored = usePlayerWhileOpen(open, (s) => s.mirrored);
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
            <span className="tabular flex h-7 items-center rounded-[7px] border border-line px-2.5 font-mono">
              {formatSpeed(rate)}
            </span>
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
            <ElasticToggle
              checked={withZoom}
              onChange={setWithZoom}
              label={`Guardar con el zoom (${zoomLabel(offered)})`}
            />
          )}
        </ToggleGroup>

        {error && <Notice tone="error">{error}</Notice>}
        {duplicate && (
          <Notice>
            Ya tienes este tramo guardado como «{duplicate.name}» con la misma velocidad y espejo.
          </Notice>
        )}
      </form>
    </Dialog>
  );
}
