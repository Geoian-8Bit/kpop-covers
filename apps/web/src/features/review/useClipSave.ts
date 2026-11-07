import { MIN_LOOP_LENGTH, takeRangeToSong } from '@coverscape/shared';
import { useCallback, useState } from 'react';
import type { ClipDraft } from '@/features/studio/SaveClipDialog';
import { hasRange, useReview } from '@/player/store';
import type { useToast } from '@/providers/ToastProvider';

/**
 * F8 · A range marked on the take, saved as a clip of the song: it serves in every take and in practice. REQ-25 · The
 * sync point and the fine sync are read live from `useReview.timing` (the screen doesn't hold them).
 */
export function useClipSave(
  timing: { speed: number },
  mirrored: boolean,
  toast: ReturnType<typeof useToast>,
) {
  const [savingClip, setSavingClip] = useState(false);
  const [clipDraft, setClipDraft] = useState<ClipDraft | null>(null);
  const openSaveRange = useCallback(() => {
    const r = useReview.getState();
    if (!hasRange(r.loop)) {
      toast('Marca A y B en la toma primero', 'info');
      return;
    }
    const song = takeRangeToSong(
      { songStart: r.timing.songStart, speed: timing.speed, adjust: r.timing.adjust, lead: r.timing.lead },
      r.loop,
    );
    if (song.end - song.start < MIN_LOOP_LENGTH) {
      toast('El tramo es demasiado corto para un clip', 'info');
      return;
    }
    r.pause();
    // The take's speed and mirror: the range is practised as it was danced.
    setClipDraft({ start: song.start, end: song.end, speed: timing.speed, mirrored });
    setSavingClip(true);
  }, [mirrored, timing.speed, toast]);
  return { savingClip, setSavingClip, clipDraft, openSaveRange };
}
