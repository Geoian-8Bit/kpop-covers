import { clampLead } from '@coverscape/shared';
import { useCallback, useEffect, useRef } from 'react';
import type { TakeReviewPatch } from '@/data/takes';
import { useReview } from '@/player/store';

/**
 * «La canción empieza en…»: the take's second where the original song starts (a video from the gallery starts
 * before the dance), saved with the take. As with the fine sync, the live value lives only in
 * `useReview.timing.lead`; the original is put in place once the taps stop, and every value goes to the saver.
 */
export function useSongLead(save: (patch: TakeReviewPatch) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  return useCallback(
    (value: number) => {
      const next = clampLead(value);
      const r = useReview.getState();
      if (next === r.timing.lead) return;
      useReview.setState({ timing: { ...r.timing, lead: next } });
      clearTimeout(timer.current);
      // One jump of the original once the taps stop (each would make YouTube load again).
      timer.current = setTimeout(() => useReview.getState().alignOriginal(), 300);
      save({ song_lead_seconds: next });
    },
    [save],
  );
}
