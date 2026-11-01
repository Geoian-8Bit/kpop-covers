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

/** REQ-19 · The playable columns of a song of a round (its own key: the studio's full row is not needed here). */
export const videoPlayKey = (id: string | undefined) => ['video-play', id] as const;
