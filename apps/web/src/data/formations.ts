import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formationsBackend, type FormationPlanPatch, type NewFormationPlan } from '@/lib/backend';
import { friendlyError, FriendlyError } from '@/lib/supabase';

export type {
  FormationInput,
  FormationMember,
  FormationPlanFull,
  FormationPlanPatch,
  FormationPlanSummary,
  RevisionResult,
} from '@/lib/backend';

/** REQ-06 · Formation plans of a song, shared by the group. */
export const formationKeys = {
  members: ['formation-members'] as const,
  plans: (videoId: string) => ['formation-plans', videoId] as const,
  plan: (planId: string) => ['formation-plan', planId] as const,
};

/** The message when another device wrote the plan first. */
export const CONFLICT_MESSAGE = 'Alguien ha cambiado este plan';

/** Formation errors in the group's words (falls back to the app's general mapping). */
export function formationErrorMessage(error: unknown): string {
  if (error instanceof FriendlyError) return error.message;
  const message =
    typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : '';
  if (/formation_plans_name_check/.test(message)) return 'El nombre del plan admite de 1 a 60 letras.';
  if (/formation_plans_stage_(width|depth)_check/.test(message)) return 'El escenario mide entre 2 y 30 m por lado.';
  if (/formation_plans_bpm_check/.test(message)) return 'El ritmo va de 40 a 240 BPM.';
  if (/formation_plan_not_found/.test(message)) return 'Este plan ya no existe: puede que alguien lo haya borrado.';
  if (/formation_video_not_found/.test(message)) return 'Esta canción ya no está en la biblioteca.';
  if (/formation_member_invalid/.test(message)) return 'Alguien del plan ya no está en el grupo.';
  if (/formation_time_taken/.test(message)) return 'Ya hay una formación en ese momento.';
  if (/formation_out_of_stage/.test(message)) return 'Hay alguien fuera del escenario.';
  if (/formation_not_found/.test(message)) return 'Esa formación ya no existe.';
  if (/formation_invalid|formations_note_check|formations_(at|transition)_check/.test(message)) {
    return 'No se pudo guardar la formación: revisa los datos.';
  }
  if (/(formation_plans|formations|formation_plan_members)_cap_reached/.test(message)) {
    return 'Se ha llegado al máximo. Borra algo antes.';
  }
  return friendlyError(error);
}

export function useFormationMembers() {
  return useQuery({ queryKey: formationKeys.members, queryFn: () => formationsBackend.listFormationMembers() });
}

export function useFormationPlans(videoId: string | undefined) {
  return useQuery({
    queryKey: formationKeys.plans(videoId ?? ''),
    queryFn: () => formationsBackend.listPlans(videoId!),
    enabled: Boolean(videoId),
  });
}

/** The plan the editor opens. Loaded once per visit: the editor keeps its own copy and writes formation by formation. */
export function useFormationPlan(planId: string | undefined) {
  return useQuery({
    queryKey: formationKeys.plan(planId ?? ''),
    queryFn: () => formationsBackend.getPlan(planId!),
    enabled: Boolean(planId),
    staleTime: Infinity,
    // Gone when the editor closes: reopening the plan always starts from the current revision.
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}

export function useCreateFormationPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (row: NewFormationPlan) => formationsBackend.createPlan(row),
    onSuccess: (plan) => void queryClient.invalidateQueries({ queryKey: formationKeys.plans(plan.video_id) }),
  });
}

export function useDuplicateFormationPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, name }: { planId: string; name: string }) => formationsBackend.duplicatePlan(planId, name),
    onSuccess: (plan) => void queryClient.invalidateQueries({ queryKey: formationKeys.plans(plan.video_id) }),
  });
}

export function useDeleteFormationPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId }: { planId: string; videoId: string }) => formationsBackend.deletePlan(planId),
    onSuccess: (_, { planId, videoId }) => {
      void queryClient.invalidateQueries({ queryKey: formationKeys.plans(videoId) });
      queryClient.removeQueries({ queryKey: formationKeys.plan(planId) });
    },
  });
}

/** Plan edits from the list (rename): against the revision the list shows; a conflict throws the shared message. */
export function useUpdateFormationPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ planId, revision, patch }: { planId: string; revision: number; videoId: string; patch: FormationPlanPatch }) => {
      const result = await formationsBackend.updatePlan(planId, revision, patch);
      if (!result.ok) throw new FriendlyError(`${CONFLICT_MESSAGE}. Vuelve a intentarlo.`);
      return result.plan;
    },
    onSettled: (_, __, { planId, videoId }) => {
      void queryClient.invalidateQueries({ queryKey: formationKeys.plans(videoId) });
      void queryClient.invalidateQueries({ queryKey: formationKeys.plan(planId) });
    },
  });
}
