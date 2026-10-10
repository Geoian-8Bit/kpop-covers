import type { Crew, Profile } from '@coverscape/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthProvider';

export type CrewWithRole = Crew & { role: 'owner' | 'member' };

interface CrewContextValue {
  crews: CrewWithRole[];
  activeCrew: CrewWithRole | null;
  profile: Profile | null;
  loading: boolean;
  /** Crews failed to load – never treat this as "no crews" (would push users to onboarding). */
  error: boolean;
  retry: () => void;
  setActiveCrewId: (id: string) => void;
  createCrew: (name: string) => Promise<Crew>;
  joinCrew: (code: string) => Promise<Crew>;
}

const ACTIVE_KEY = 'coverscape.activeCrew';
const CrewContext = createContext<CrewContextValue | null>(null);

function readActive(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function CrewProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(readActive);

  const crewsQuery = useQuery({
    queryKey: ['crews', user?.id],
    enabled: Boolean(user),
    queryFn: async (): Promise<CrewWithRole[]> => {
      const { data, error } = await supabase
        .from('crew_members')
        .select('role, crew:crews(*)')
        .eq('user_id', user!.id)
        .order('joined_at', { ascending: true });
      if (error) throw error;
      return data.flatMap((row) => (row.crew ? [{ ...row.crew, role: row.role as CrewWithRole['role'] }] : []));
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

  const crews = useMemo(() => crewsQuery.data ?? [], [crewsQuery.data]);
  const activeCrew = crews.find((c) => c.id === activeId) ?? crews[0] ?? null;

  const setActiveCrewId = useCallback((id: string) => {
    setActiveId(id);
    try {
      localStorage.setItem(ACTIVE_KEY, id);
    } catch {
      /* private mode – keep in memory only */
    }
  }, []);

  useEffect(() => {
    if (activeCrew && activeCrew.id !== activeId) setActiveCrewId(activeCrew.id);
  }, [activeCrew, activeId, setActiveCrewId]);

  const afterMembershipChange = useCallback(
    async (crew: Crew) => {
      await queryClient.invalidateQueries({ queryKey: ['crews', user?.id] });
      setActiveCrewId(crew.id);
      return crew;
    },
    [queryClient, setActiveCrewId, user?.id],
  );

  const create = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.rpc('create_crew', { p_name: name.trim() });
      if (error) throw error;
      return afterMembershipChange(data);
    },
  });

  const join = useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await supabase.rpc('join_crew', { p_code: code.trim().toUpperCase() });
      if (error) throw error;
      return afterMembershipChange(data);
    },
  });

  const value = useMemo<CrewContextValue>(
    () => ({
      crews,
      activeCrew,
      profile: profileQuery.data ?? null,
      loading: crewsQuery.isPending && Boolean(user),
      error: crewsQuery.isError,
      retry: () => void crewsQuery.refetch(),
      setActiveCrewId,
      createCrew: create.mutateAsync,
      joinCrew: join.mutateAsync,
    }),
    // crewsQuery.refetch is stable across renders.
    [crews, activeCrew, profileQuery.data, crewsQuery.isPending, crewsQuery.isError, user, setActiveCrewId, create.mutateAsync, join.mutateAsync],
  );

  return <CrewContext.Provider value={value}>{children}</CrewContext.Provider>;
}

export function useCrew(): CrewContextValue {
  const ctx = useContext(CrewContext);
  if (!ctx) throw new Error('useCrew must be used inside <CrewProvider>');
  return ctx;
}
