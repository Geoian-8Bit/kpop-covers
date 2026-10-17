import type { QueryClient } from '@tanstack/react-query';

/**
 * Lists of other features that show clips, songs or people. After something is archived (or a clip is created
 * or changed), they are marked stale so the next visit shows the truth instead of a five-minute-old copy:
 * Random Play Dance and bag pickers (all clips), bags and their items, saved tracks, events and repertoires,
 * wishes and votes. Only lists on screen refetch now; the rest wait until they are opened.
 */
const CROSS_FEATURE_LISTS = [
  ['all-clips'],
  ['bags'],
  ['bag-items'],
  ['tracks'],
  ['track-items'],
  ['events'],
  ['event-songs'],
  ['wishes'],
  ['wish-interest'],
  ['poll-votes'],
] as const;

export function invalidateClipPickers(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['all-clips'] });
}

export function invalidateAfterArchive(queryClient: QueryClient): void {
  for (const queryKey of CROSS_FEATURE_LISTS) void queryClient.invalidateQueries({ queryKey });
}
