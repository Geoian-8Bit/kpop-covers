import type { Crew, Profile } from '@coverscape/shared';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { backend, IS_DEMO } from '@/lib/backend';
import { crewSnapshot, parseCrew, readSnapshot, writeSnapshot } from '@/lib/snapshot';
import { useAuth } from './AuthProvider';

const GROUP_SNAPSHOT = IS_DEMO ? 'group.demo' : 'group';

/**
 * The app has a single shared group and no login: everyone reads and writes inside it
 * (RLS scopes anonymous access to `private.default_group()`).
 */
interface GroupContextValue {
  activeCrew: Crew | null;
  profile: Profile | null;
  loading: boolean;
  /** Group failed to load – show a retry screen, never an empty library. */
  error: boolean;
  retry: () => void;
}

const GroupContext = createContext<GroupContextValue | null>(null);

export function CrewProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  // P2 · A repeat visit paints the shell at once from the group kept on this device (no Splash), and still asks the
  // server right away: the kept copy counts as already stale (updated at 0), a fresh answer never goes stale.
  const groupQuery = useQuery({
    queryKey: ['group'],
    staleTime: (query) => (query.state.dataUpdatedAt === 0 ? 0 : Infinity),
    initialData: () => readSnapshot(GROUP_SNAPSHOT, parseCrew),
    initialDataUpdatedAt: 0,
    queryFn: async (): Promise<Crew> => {
      const crew = await backend.joinGroup();
      writeSnapshot(GROUP_SNAPSHOT, crewSnapshot(crew));
      return crew;
    },
  });

  const profileQuery = useQuery({
    queryKey: ['profile', user?.id],
    enabled: Boolean(user),
    queryFn: () => backend.getProfile(user!.id),
  });

  const { refetch } = groupQuery;
  const value = useMemo<GroupContextValue>(
    () => ({
      activeCrew: groupQuery.data ?? null,
      profile: profileQuery.data ?? null,
      loading: groupQuery.isPending,
      // With the kept group on screen, a failed refresh isn't a dead end: the app goes on with it.
      error: groupQuery.isError && !groupQuery.data,
      retry: () => void refetch(),
    }),
    [groupQuery.data, groupQuery.isPending, groupQuery.isError, profileQuery.data, user, refetch],
  );

  return <GroupContext.Provider value={value}>{children}</GroupContext.Provider>;
}

export function useCrew(): GroupContextValue {
  const ctx = useContext(GroupContext);
  if (!ctx) throw new Error('useCrew must be used inside <CrewProvider>');
  return ctx;
}
