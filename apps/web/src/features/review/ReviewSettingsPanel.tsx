import type { Clip, Take } from '@coverscape/shared';
import { useMemo } from 'react';
import { useStore } from 'zustand';
import { useReview } from '@/player/store';
import { ReviewSettings, type ReviewSettingsProps } from './ReviewSettings';
import { clipsInTake } from './reviewRules';
import type { StageStore } from './reviewStageStore';

type Live = 'split' | 'adjust' | 'fitStatus' | 'adjustStatus' | 'clips';

/**
 * The review's settings with their live values. REQ-25 · The hinge's share, the fine sync (in `useReview.timing`,
 * where the slider writes it) and the save statuses are read here, so dragging the slider or the hinge repaints the
 * settings, not the whole review. The song's clips are placed in the take with the live sync, as before.
 */
export function ReviewSettingsPanel({
  stage,
  allClips,
  take,
  ...props
}: Omit<ReviewSettingsProps, Live> & {
  stage: StageStore;
  allClips: Clip[];
  take: Pick<Take, 'song_start_seconds' | 'speed' | 'sync_adjust_seconds' | 'duration_seconds'>;
}) {
  const split = useStore(stage, (s) => s.split?.value ?? null);
  const fitStatus = useStore(stage, (s) => s.fitStatus);
  const adjustStatus = useStore(stage, (s) => s.adjustStatus);
  const adjust = useReview((s) => s.timing.adjust);
  const duration = useReview((s) => s.duration);
  const clips = useMemo(
    () => clipsInTake(allClips, { ...take, sync_adjust_seconds: adjust }, duration),
    [allClips, take, adjust, duration],
  );
  return (
    <ReviewSettings
      {...props}
      split={split}
      fitStatus={fitStatus}
      adjust={adjust}
      adjustStatus={adjustStatus}
      clips={clips}
    />
  );
}
