import type { Crew } from '@coverscape/shared';
import { backend } from '@/lib/backend/core';
import { IS_DEMO } from '@/lib/backend/mode';
import { crewSnapshot, parseCrew, readSnapshot, writeSnapshot } from '@/lib/snapshot';

const GROUP_SNAPSHOT = IS_DEMO ? 'group.demo' : 'group';

/**
 * REQ-06 · The group query, declared once. CrewProvider (`useQuery`) and the cold-start preload (routeLoaders.ts,
 * `prefetchQuery`) share it, so the entry request and the provider's query are one query and one request.
 *
 * P2 · A repeat visit paints the shell at once from the group kept on this device (no Splash), and still asks the
 * server right away: the kept copy counts as already stale (updated at 0), a fresh answer never goes stale.
 */
export const groupQueryOptions = {
  queryKey: ['group'] as const,
  staleTime: (query: { state: { dataUpdatedAt: number } }) =>
    query.state.dataUpdatedAt === 0 ? 0 : Infinity,
  initialData: () => readSnapshot(GROUP_SNAPSHOT, parseCrew),
  initialDataUpdatedAt: 0,
  queryFn: async (): Promise<Crew> => {
    const crew = await backend.joinGroup();
    writeSnapshot(GROUP_SNAPSHOT, crewSnapshot(crew));
    return crew;
  },
};
