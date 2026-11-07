import { clampLead, clampSongStart, songEndFor } from '@coverscape/shared';
import { useCallback, useEffect, useRef } from 'react';
import type { TakeReviewPatch } from '@/data/takes';
import { useReview } from '@/player/store';

/** The song's length as the original shows it (its file is `offset` ahead of the song); null when not known yet. */
function songLength(s: ReturnType<typeof useReview.getState>): number | null {
  const length = s.originalEngine?.getDuration() ?? 0;
  if (!(length > 0) || !Number.isFinite(length)) return null;
  return Math.max(0, length - (s.timing.onFile ? s.timing.offset : 0));
}

/**
 * «Punto de sincronía»: the take's second (`lead`, a video from the gallery starts before the dance) and the song's
 * second (`songStart`, a take of only part of the song) where the same thing happens. Saved with the take. As with
 * the fine sync the live values live only in `useReview.timing`; the original is put in place once the taps stop
 * (a file or YouTube: `alignOriginal`), and every value goes to the saver. A new song second goes with its end in the
 * song (the database asks end ≥ start), and once it was edited a new lead recomputes that end too.
 */
export function useSyncPoint(save: (patch: TakeReviewPatch) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** The song second was set here: the saved end must follow the lead as well. */
  const songEdited = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);

  const settle = useCallback(() => {
    clearTimeout(timer.current);
    // One jump of the original once the taps stop (each would make YouTube load again).
    timer.current = setTimeout(() => useReview.getState().alignOriginal(), 300);
  }, []);

  const endPatch = (s: ReturnType<typeof useReview.getState>) => ({
    song_end_seconds: songEndFor({
      songStart: s.timing.songStart,
      lead: s.timing.lead,
      speed: s.timing.speed,
      duration: s.duration,
    }),
  });

  const onLead = useCallback(
    (value: number) => {
      const next = clampLead(value);
      const r = useReview.getState();
      if (next === r.timing.lead) return;
      useReview.setState({ timing: { ...r.timing, lead: next } });
      settle();
      save(
        songEdited.current
          ? { song_lead_seconds: next, ...endPatch(useReview.getState()) }
          : { song_lead_seconds: next },
      );
    },
    [save, settle],
  );

  const onSongStart = useCallback(
    (value: number) => {
      const r = useReview.getState();
      const next = clampSongStart(value, songLength(r));
      if (next === r.timing.songStart) return;
      useReview.setState({ timing: { ...r.timing, songStart: next } });
      songEdited.current = true;
      settle();
      save({ song_start_seconds: next, ...endPatch(useReview.getState()) });
    },
    [save, settle],
  );

  return { onLead, onSongStart };
}
