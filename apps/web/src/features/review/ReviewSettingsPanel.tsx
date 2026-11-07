import type { Clip } from '@coverscape/shared';
import { useMemo } from 'react';
import { useStore } from 'zustand';
import { useReview } from '@/player/store';
import { ReviewSettings, type ReviewSettingsProps } from './ReviewSettings';
import { clipsInTake, type TakeTimingRow } from './reviewRules';
import type { StageStore } from './reviewStageStore';

type Live = 'split' | 'adjust' | 'fitStatus' | 'adjustStatus' | 'clips' | 'songClips';

/**
 * The review's settings with their live values. REQ-25 · The hinge's share, the fine sync and the song's start in the
 * take (in `useReview.timing`, where the controls write them) and the save statuses are read here, so moving them
 * repaints the settings, not the whole review. The song's clips are placed in the take with the live sync.
 */
export function ReviewSettingsPanel({
  stage,
  allClips,
  take,
  ...props
}: Omit<ReviewSettingsProps, Live> & {
  stage: StageStore;
  allClips: Clip[];
  take: TakeTimingRow;
}) {
  const split = useStore(stage, (s) => s.split?.value ?? null);
  const fitStatus = useStore(stage, (s) => s.fitStatus);
  const adjustStatus = useStore(stage, (s) => s.adjustStatus);
  const adjust = useReview((s) => s.timing.adjust);
  const lead = useReview((s) => s.timing.lead);
  const songStart = useReview((s) => s.timing.songStart);
  const duration = useReview((s) => s.duration);
  const clips = useMemo(
    () =>
      clipsInTake(
        allClips,
        { ...take, song_start_seconds: songStart, sync_adjust_seconds: adjust, song_lead_seconds: lead },
        duration,
      ),
    [allClips, take, songStart, adjust, lead, duration],
  );
  // The song's clips, by start: one tap puts the sync point's song second at a clip's start.
  const songClips = useMemo(
    () => [...allClips].sort((a, b) => a.start_seconds - b.start_seconds),
    [allClips],
  );
  return (
    <ReviewSettings
      {...props}
      split={split}
      fitStatus={fitStatus}
      adjust={adjust}
      adjustStatus={adjustStatus}
      clips={clips}
      songClips={songClips}
    />
  );
}
