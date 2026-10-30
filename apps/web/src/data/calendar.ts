import type { Absence, RehearsalException, RehearsalRule } from '@coverscape/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  calendarBackend,
  type AbsencePatch,
  type NewAbsence,
  type NewRehearsalException,
  type NewRehearsalRule,
} from '@/lib/backend';
import { friendlyError, FriendlyError } from '@/lib/supabase';

export type { CalendarMember } from '@/lib/backend';

/** REQ-03 / REQ-04 · the calendar: absences, weekly rehearsals and their exceptions. Shared by the group. */
export const calendarKeys = {
  members: ['calendar-members'] as const,
  absences: ['absences'] as const,
  absencesIn: (from: string, to: string) => ['absences', from, to] as const,
  rules: ['rehearsal-rules'] as const,
  exceptions: ['rehearsal-exceptions'] as const,
  exceptionsIn: (from: string, to: string) => ['rehearsal-exceptions', from, to] as const,
};

/** Calendar errors in the group's words (falls back to the app's general mapping). */
export function calendarError(error: unknown): string {
  if (error instanceof FriendlyError) return error.message;
  const message =
    typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : '';
  if (/absences_range_check/.test(message)) return 'Revisa las fechas: como mucho 61 días seguidos.';
  if (/absences_time_check/.test(message)) return 'Pon la hora a la que llega o se va.';
  if (/absences_note_check/.test(message)) return 'La nota admite hasta 140 letras.';
  if (/absence_member_invalid/.test(message)) return 'Esa persona ya no está en el grupo.';
  if (/rehearsal_rules_times_check|rehearsal_exceptions_shape_check|rehearsal_exceptions_times_check/.test(message)) {
    return 'La hora de fin tiene que ser después de la de inicio.';
  }
  if (/rehearsal_rule_not_found/.test(message)) return 'Ese horario ya no existe: otro móvil lo ha cambiado.';
  if (/rehearsal_cancel_invalid/.test(message)) return 'Ese día ya no hay ensayo que cancelar.';
  if (/rehearsal_exceptions_cancel_once_key/.test(message)) return 'Ese ensayo ya estaba cancelado.';
  if (/(absences|rehearsal_rules|rehearsal_exceptions)_cap_reached/.test(message)) {
    return 'Se ha llegado al máximo. Borra algo antes.';
  }
  return friendlyError(error);
}

export function useCalendarMembers() {
  return useQuery({ queryKey: calendarKeys.members, queryFn: () => calendarBackend.listCalendarMembers() });
}

export function useAbsences(from: string, to: string) {
  return useQuery({
    queryKey: calendarKeys.absencesIn(from, to),
    queryFn: () => calendarBackend.listAbsences(from, to),
    // Moving between months keeps the old month on screen until the new one arrives (no flash of empty days).
    placeholderData: (previous) => previous,
  });
}

export function useRehearsalRules() {
  return useQuery({ queryKey: calendarKeys.rules, queryFn: () => calendarBackend.listRehearsalRules() });
}

export function useRehearsalExceptions(from: string, to: string) {
  return useQuery({
    queryKey: calendarKeys.exceptionsIn(from, to),
    queryFn: () => calendarBackend.listRehearsalExceptions(from, to),
    placeholderData: (previous) => previous,
  });
}

/** Every cached month sees the change at once; then the lists are fetched again. */
function patchAbsences(queryClient: QueryClient, fn: (list: Absence[]) => Absence[]) {
  queryClient.setQueriesData<Absence[]>({ queryKey: calendarKeys.absences }, (current) => (current ? fn(current) : current));
  void queryClient.invalidateQueries({ queryKey: calendarKeys.absences });
}

function patchExceptions(queryClient: QueryClient, fn: (list: RehearsalException[]) => RehearsalException[]) {
  queryClient.setQueriesData<RehearsalException[]>({ queryKey: calendarKeys.exceptions }, (current) =>
    current ? fn(current) : current,
  );
  void queryClient.invalidateQueries({ queryKey: calendarKeys.exceptions });
}

export function useCreateAbsence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (row: NewAbsence) => calendarBackend.insertAbsence(row),
    onSuccess: (absence) => patchAbsences(queryClient, (list) => [...list, absence]),
  });
}

export function useUpdateAbsence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: AbsencePatch }) => calendarBackend.updateAbsence(id, patch),
    onSuccess: (absence) => patchAbsences(queryClient, (list) => list.map((a) => (a.id === absence.id ? absence : a))),
  });
}

export function useDeleteAbsence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (absence: Pick<Absence, 'id'>) => {
      await calendarBackend.deleteAbsence(absence.id);
      return absence;
    },
    onSuccess: (absence) => {
      patchAbsences(queryClient, (list) => list.filter((a) => a.id !== absence.id));
      // An archived member drops out of the names once their last absence goes.
      void queryClient.invalidateQueries({ queryKey: calendarKeys.members });
    },
  });
}

function settleRules(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: calendarKeys.rules });
  // An edit carries the cancellations still to come over to the new rule.
  void queryClient.invalidateQueries({ queryKey: calendarKeys.exceptions });
}

export function useCreateRehearsalRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (row: NewRehearsalRule) => calendarBackend.insertRehearsalRule(row),
    onSuccess: (rule) => {
      queryClient.setQueryData<RehearsalRule[]>(calendarKeys.rules, (current) => (current ? [...current, rule] : current));
      settleRules(queryClient);
    },
  });
}

export function useEditRehearsalRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, row }: { id: string; row: NewRehearsalRule }) => calendarBackend.editRehearsalRule(id, row),
    onSettled: () => settleRules(queryClient),
  });
}

export function useEndRehearsalRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => calendarBackend.endRehearsalRule(id),
    onSettled: () => settleRules(queryClient),
  });
}

export function useCreateRehearsalException() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (row: NewRehearsalException) => calendarBackend.insertRehearsalException(row),
    onSuccess: (exception) => patchExceptions(queryClient, (list) => [...list, exception]),
    onError: () => void queryClient.invalidateQueries({ queryKey: calendarKeys.exceptions }),
  });
}

export function useDeleteRehearsalException() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (exception: Pick<RehearsalException, 'id'>) => {
      await calendarBackend.deleteRehearsalException(exception.id);
      return exception;
    },
    onSuccess: (exception) => patchExceptions(queryClient, (list) => list.filter((e) => e.id !== exception.id)),
  });
}
