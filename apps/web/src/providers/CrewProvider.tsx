import type { Crew, Profile } from '@coverscape/shared';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthProvider';

/**
 * The app has a single shared group. Every signed-in user is joined to it automatically
 * (`join_group` RPC); the group still scopes all data through RLS.
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
    queryKey: ['group', user?.id],
    enabled: Boolean(user),
    staleTime: Infinity,
    queryFn: async (): Promise<Crew> => {
      const { data, error } = await supabase.rpc('join_group');
      if (error) throw error;
      return data;
    },
  });

  const profileQuery = useQuery({
    queryKey: ['profile', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { refetch } = groupQuery;
  const value = useMemo<GroupContextValue>(
    () => ({
      activeCrew: groupQuery.data ?? null,
      profile: profileQuery.data ?? null,
      loading: groupQuery.isPending && Boolean(user),
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
