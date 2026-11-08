import { clampLead, clampSongStart, clampVideoSpeed, songEndFor, takeTimeAt } from '@coverscape/shared';
import { useCallback, useEffect, useRef } from 'react';
import type { TakeReviewPatch } from '@/data/takes';
import { useReview } from '@/player/store';

type Review = ReturnType<typeof useReview.getState>;

/** The song's length as the original shows it (its file is `offset` ahead of the song); null when not known yet. */
export function songLength(s: Review): number | null {
  const length = s.originalEngine?.getDuration() ?? 0;
  if (!(length > 0) || !Number.isFinite(length)) return null;
  return Math.max(0, length - (s.timing.onFile ? s.timing.offset : 0));
}

/** YouTube loads again at every jump: while a finger drags the song's start it jumps at most this often (ms). */
const YOUTUBE_LIVE_MS = 450;

/**
 * «Sincronía»: where each video starts — the take's second (`lead`, a video from the gallery starts before the dance)
 * and the song's second (`songStart`, a take of only part of the song) — and each one's own speed (the song's
 * `speed`, the take's `takeSpeed`). Saved with the take. As with the fine sync the live values live only in
 * `useReview.timing`; the original is put in place once the taps stop (`alignOriginal`), and every value goes to the
 * saver. While a video is being placed on its own (`syncEdit`) it shows its start at once: the take jumps to its
 * start; for the song the take is parked at the song's start so the original, aligned, shows it (YouTube at most
 * every 450 ms while dragging). A new song second or speed goes with the end in the song (the database asks
 * end ≥ start); once one was edited a new lead recomputes that end too.
 */
export function useSyncPoint(save: (patch: TakeReviewPatch) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const liveAt = useRef(0);
  /** The song second or a speed was set here: the saved end must follow the lead as well. */
  const endEdited = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);

  const settle = useCallback(() => {
    clearTimeout(timer.current);
    // One exact jump once the taps stop (each would make YouTube load again).
    timer.current = setTimeout(() => {
      const r = useReview.getState();
      if (r.syncEdit === 'take') r.seek(r.timing.lead);
      else if (r.syncEdit === 'original') parkTake(r);
      r.alignOriginal();
    }, 300);
  }, []);

  /** The song alone: the take to the song's start (hidden), the original after it at once (YouTube: now and then). */
  const showSongStart = useCallback(() => {
    const r = useReview.getState();
    if (r.syncEdit !== 'original') return;
    parkTake(r, true);
    const now = performance.now();
    if (r.originalKind === 'youtube' && now - liveAt.current < YOUTUBE_LIVE_MS) return;
    liveAt.current = now;
    r.alignOriginal({ preview: true });
  }, []);

  const endPatch = (s: Review) => ({
    song_end_seconds: songEndFor({ ...s.timing, duration: s.duration }),
  });

  const onLead = useCallback(
    (value: number) => {
      const next = clampLead(value);
      const r = useReview.getState();
      if (next === r.timing.lead) return;
      useReview.setState({ timing: { ...r.timing, lead: next } });
      if (r.syncEdit === 'take') r.seek(next, { preview: true });
      settle();
      save(
        endEdited.current
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
      endEdited.current = true;
      showSongStart();
      settle();
      save({ song_start_seconds: next, ...endPatch(useReview.getState()) });
    },
    [save, settle, showSongStart],
  );

  /** Each video's own speed: the take's (`take`) or the song's (`original`). */
  const onSpeed = useCallback(
    (which: 'take' | 'original', value: number) => {
      const next = clampVideoSpeed(value);
      const r = useReview.getState();
      if (next === (which === 'take' ? r.timing.takeSpeed : r.timing.speed)) return;
      useReview.setState({
        timing: { ...r.timing, ...(which === 'take' ? { takeSpeed: next } : { speed: next }) },
      });
      useReview.getState().setRate(r.rate); // both engines at their new speeds
      endEdited.current = true;
      settle();
      save({
        ...(which === 'take' ? { take_speed: next } : { speed: next }),
        ...endPatch(useReview.getState()),
      });
    },
    [save, settle],
  );

  /** «Los dos · Toma · Canción»: the chosen video alone (paused), showing where it starts. */
  const onEdit = useCallback((edit: 'take' | 'original' | null) => {
    const r = useReview.getState();
    r.setSyncEdit(edit);
    if (edit === 'take') r.seek(r.timing.lead);
    else if (edit === 'original') {
      parkTake(r);
      r.alignOriginal();
    }
  }, []);

  return { onLead, onSongStart, onSpeed, onEdit };
}

export type SyncPointControls = ReturnType<typeof useSyncPoint>;

/** The take where the song starts: the original, aligned, shows exactly the song's start. */
function parkTake(r: Review, preview = false): void {
  const top = r.duration > 0 ? r.duration : Number.POSITIVE_INFINITY;
  const at = Math.round(Math.min(top, Math.max(0, takeTimeAt(r.timing, r.timing.songStart))) * 1000) / 1000;
  r.takeEngine?.seek(at, preview ? { preview: true } : undefined);
  if (at !== r.time) useReview.setState({ time: at });
}
