import type { Crew, Profile } from '@coverscape/shared';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { backend } from '@/lib/backend';
import { useAuth } from './AuthProvider';

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

  const groupQuery = useQuery({
    queryKey: ['group'],
    staleTime: Infinity,
    queryFn: (): Promise<Crew> => backend.joinGroup(),
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
      error: groupQuery.isError,
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
