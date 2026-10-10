import { CLIP_COLORS, formatSpeed, formatTime, type ClipColor, type Video } from '@coverscape/shared';
import { motion } from 'motion/react';
import { FlipHorizontal2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { ElasticToggle } from '@/components/ui/ElasticToggle';
import { Field } from '@/components/ui/Field';
import { CLIP_SWATCH, useClips, useCreateClip } from '@/data/clips';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { friendlyError } from '@/lib/supabase';
import { hasRange, usePlayer } from '@/player/store';
import { useToast } from '@/providers/ToastProvider';

const SUGGESTIONS = ['Intro', 'Verso', 'Pre-estribillo', 'Estribillo', 'Puente', 'Dance break', 'Final'];

interface SaveClipDialogProps {
  open: boolean;
  onClose: () => void;
  video: Video;
  clipCount: number;
}

export function SaveClipDialog({ open, onClose, video, clipCount }: SaveClipDialogProps) {
  const loop = usePlayer((s) => s.loop);
  const rate = usePlayer((s) => s.rate);
  const mirrored = usePlayer((s) => s.mirrored);
  const create = useCreateClip();
  const clips = useClips(open ? video.id : undefined);
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
    setError(null);
  }, [open]);

  // Same range, speed and mirror already saved: point at it instead of creating a copy.
  const same = (a: number, b: number) => Math.abs(a - b) < 0.0005;
  const duplicate = hasRange(loop)
    ? clips.data?.find(
        (c) =>
          same(c.start_seconds, loop.start) &&
          same(c.end_seconds, loop.end) &&
          same(c.speed, rate) &&
          c.mirrored === mirrored,
      )
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
      });
      usePlayer.getState().setActiveClip(clip.id);
      toast(`“${clip.name}” guardado`, 'success');
      onClose();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      submitting.current = false;
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Guardar clip" description="Se guarda con su velocidad y su modo espejo.">
      <form onSubmit={onSubmit} className="space-y-5">
        {hasRange(loop) && (
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="tabular flex h-9 items-center rounded-[8px] bg-shu-500/15 px-3 font-mono text-shu-400">
              {formatTime(loop.start, { tenths: true })} → {formatTime(loop.end, { tenths: true })}
            </span>
            <span className="tabular flex h-9 items-center rounded-[8px] border border-line px-3 font-mono">{formatSpeed(rate)}</span>
            <span className="flex h-9 items-center gap-1.5 rounded-[8px] border border-line px-3">
              <FlipHorizontal2 className="size-4 text-ai-300" /> {mirrored ? 'Espejo' : 'Normal'}
            </span>
          </div>
        )}

        <div>
          <Field
            data-autofocus
            label="Nombre"
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            error={error}
          />
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <motion.button
                key={s}
                type="button"
                onClick={() => setName(s)}
                whileTap={{ scale: 0.88 }}
                transition={jelly}
                className={cn(
                  'h-8 rounded-[8px] border px-3 text-[13px] transition-colors',
                  name === s ? 'border-washi bg-washi text-sumi-900' : 'border-line text-washi-muted hover:text-washi',
                )}
              >
                {s}
              </motion.button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-medium text-washi-muted">Color</p>
          <div role="radiogroup" aria-label="Color del clip" className="flex flex-wrap gap-2">
            {CLIP_COLORS.map((c) => (
              <motion.button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={CLIP_SWATCH[c].label}
                title={CLIP_SWATCH[c].label}
                onClick={() => setColor(c)}
                whileTap={{ scale: 0.85 }}
                transition={jelly}
                className="relative grid size-11 place-items-center rounded-[8px]"
              >
                {color === c && (
                  <motion.span layoutId="swatch-ring" transition={jelly} className="absolute inset-0 rounded-[8px] border-2 border-washi" />
                )}
                <span className={cn('size-7 rounded-[5px]', CLIP_SWATCH[c].dot)} />
              </motion.button>
            ))}
          </div>
        </div>

        <ElasticToggle checked={pinned} onChange={setPinned} label="Fijar en acceso rápido" />

        {duplicate && (
          <p role="status" className="rounded-[10px] bg-kin-300/10 px-3.5 py-3 text-[13px] leading-snug text-kin-200">
            Ya tienes este tramo guardado como «{duplicate.name}» con la misma velocidad y espejo.
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={create.isPending} disabled={!name.trim() || !hasRange(loop) || Boolean(duplicate)}>
            Guardar clip
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
