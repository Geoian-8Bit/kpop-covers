import type { QueryClient } from '@tanstack/react-query';
import { matchPath } from 'react-router';
import type { Crew } from '@coverscape/shared';
import { prefetchClips, prefetchQuickClips } from '@/data/clips';
import { prefetchLibrary, prefetchVideoAndFile } from '@/data/videos/queries';
import { groupQueryOptions } from '@/lib/groupQuery';
import { loadYouTubeApi } from '@/lib/youtubeIframe';

// REQ-06 · One map of route chunk loaders. `React.lazy` (App.tsx), the idle prefetch and card taps (prefetch.ts) and
// the cold-start preload (main.tsx) all call the same functions, so a chunk is never described twice and the
// browser's module cache de-duplicates the requests.
export const routeLoaders = {
  studio: () => import('@/features/studio/StudioPage'),
  privacy: () => import('@/features/legal/PrivacyPage'),
  settings: () => import('@/features/settings/SettingsPage'),
  bags: () => import('@/features/bags/BagsPage'),
  bag: () => import('@/features/bags/BagPage'),
  rpd: () => import('@/features/rpd/RpdPage'),
  track: () => import('@/features/rpd/TrackPage'),
  rpdPlay: () => import('@/features/rpd/RpdPlayPage'),
  wishes: () => import('@/features/wishes/WishesPage'),
  poll: () => import('@/features/wishes/PollPage'),
  events: () => import('@/features/events/EventsPage'),
  event: () => import('@/features/events/EventPage'),
  calendar: () => import('@/features/calendar/CalendarPage'),
} as const;

export type RouteLoaderKey = keyof typeof routeLoaders;

/** Same order as the <Routes> in App.tsx; `end` keeps `/rpd` from matching `/rpd/jugar`. */
const ROUTE_PATTERNS: ReadonlyArray<readonly [string, RouteLoaderKey]> = [
  ['/v/:videoId', 'studio'],
  ['/v/:videoId/formaciones/:planId', 'studio'],
  ['/ajustes', 'settings'],
  ['/bolsas', 'bags'],
  ['/bolsas/:bagId', 'bag'],
  ['/rpd', 'rpd'],
  ['/rpd/pista/:trackId', 'track'],
  ['/rpd/jugar', 'rpdPlay'],
  ['/deseos', 'wishes'],
  ['/deseos/votacion/:pollId', 'poll'],
  ['/eventos', 'events'],
  ['/eventos/:eventId', 'event'],
  ['/calendario', 'calendar'],
  ['/privacidad', 'privacy'],
];

/** The loader key for a pathname; null for the library and for unknown paths (nothing is preloaded). */
export function routeKeyFor(pathname: string): RouteLoaderKey | null {
  for (const [pattern, key] of ROUTE_PATTERNS) {
    if (matchPath({ path: pattern, end: true }, pathname)) return key;
  }
  return null;
}

/**
 * Cold start on a deep link: starts the route's chunk before React mounts, instead of after `RequireCrew` has the
 * group. On the studio it also starts the YouTube IFrame API and the group request. A failed early load is
 * ignored: `lazy()` asks again when the route renders, and `vite:preloadError` keeps working as before.
 */
export function preloadRoute(pathname: string, queryClient: QueryClient): void {
  // REQ-10 · The library: on a repeat visit the group is kept on this device, so its list (with posters) and its quick
  // access row start now instead of after the first commit; the group request starts with them (CrewProvider's query).
  if (pathname === '/') {
    void queryClient.prefetchQuery(groupQueryOptions).catch(() => undefined);
    const crewId = queryClient.getQueryData<Crew>(groupQueryOptions.queryKey)?.id;
    prefetchLibrary(queryClient, crewId);
    prefetchQuickClips(queryClient, crewId);
    return;
  }
  const key = routeKeyFor(pathname);
  if (!key) return;
  void routeLoaders[key]().catch(() => undefined);
  if (key === 'studio') {
    void loadYouTubeApi().catch(() => undefined);
    void queryClient.prefetchQuery(groupQueryOptions).catch(() => undefined);
    // REQ-10 · The song's row, clips and notes don't need the group: they start now, in parallel to the studio chunk,
    // with the same queries the studio uses (as a tap on its card warms them). A stale notes chunk is ignored.
    const videoId = matchPath({ path: '/v/:videoId/*' }, pathname)?.params.videoId;
    if (videoId) {
      prefetchVideoAndFile(queryClient, videoId);
      prefetchClips(queryClient, videoId);
      void import('@/data/notes').then((m) => m.prefetchNotes(queryClient, videoId)).catch(() => undefined);
    }
  }
}
