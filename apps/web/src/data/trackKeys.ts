import type { TrackOptionsRow } from '@/lib/backend/bags';
import type { RoundOptions } from '@/features/rpd/roundRules';

// REQ-08 · The query keys and the options mapper the shell needs, apart from `tracks.ts` (its hooks and mutations
// are only used by lazy screens), so the entry chunk doesn't carry them.

/** F14 · Pistas guardadas: Random Play Dance rounds kept by the group, in order. */
export const trackKeys = {
  all: ['tracks'] as const,
  detail: (id: string | undefined) => ['track', id] as const,
  items: (id: string | undefined) => ['track-items', id] as const,
};

export function optionsRow(options: RoundOptions): TrackOptionsRow {
  return {
    pause_seconds: options.pauseSeconds,
    countdown: options.countdown,
    use_clip_settings: options.useClipSettings,
    title_mode: options.titleMode,
  };
}

/**
 * The takes' query keys, here so that whatever puts files in the cloud (a video upload, the voice separation) can
 * refresh the cloud space used (`sharedBytes`, from storage_usage) without pulling in the takes data layer.
 */
export const takeKeys = {
  all: ['takes'] as const,
  forVideo: (videoId: string | undefined) => ['takes', 'video', videoId] as const,
  sharedBytes: ['takes', 'shared-bytes'] as const,
};

/** REQ-19 · The playable columns of a song of a round (its own key: the studio's full row is not needed here). */
export const videoPlayKey = (id: string | undefined) => ['video-play', id] as const;
