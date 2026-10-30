import type { Absence, RehearsalException, RehearsalRule } from '@coverscape/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { create } from 'zustand';
import { nextSeenMark, readSeenMark, unseenChanges } from '@/features/calendar/pushRules';
import {
  calendarBackend,
  type AbsencePatch,
  type NewAbsence,
  type NewRehearsalException,
  type NewRehearsalRule,
} from '@/lib/backend';
import { friendlyError, FriendlyError } from '@/lib/supabase';
import { useIdentity } from './members';

export type { CalendarMember } from '@/lib/backend';

/** REQ-03 / REQ-04 · the calendar: absences, weekly rehearsals and their exceptions. Shared by the group. */
export const calendarKeys = {
  members: ['calendar-members'] as const,
  absences: ['absences'] as const,
  absencesIn: (from: string, to: string) => ['absences', from, to] as const,
  rules: ['rehearsal-rules'] as const,
  exceptions: ['rehearsal-exceptions'] as const,
  exceptionsIn: (from: string, to: string) => ['rehearsal-exceptions', from, to] as const,
  changes: ['calendar-changes'] as const,
  changesSince: (since: string) => ['calendar-changes', since] as const,
};

/** REQ-05 · Who makes a change from this device (its «¿Quién eres?»; the server drops an unknown one). */
const author = () => useIdentity.getState().memberId;

/** The feed gets a new row with every change: the dot and the notices read it. */
const touchFeed = (queryClient: QueryClient) => void queryClient.invalidateQueries({ queryKey: calendarKeys.changes });

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
  touchFeed(queryClient);
}

function patchExceptions(queryClient: QueryClient, fn: (list: RehearsalException[]) => RehearsalException[]) {
  queryClient.setQueriesData<RehearsalException[]>({ queryKey: calendarKeys.exceptions }, (current) =>
    current ? fn(current) : current,
  );
  void queryClient.invalidateQueries({ queryKey: calendarKeys.exceptions });
  touchFeed(queryClient);
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
    mutationFn: ({ id, patch }: { id: string; patch: AbsencePatch }) => calendarBackend.updateAbsence(id, patch, author()),
    onSuccess: (absence) => patchAbsences(queryClient, (list) => list.map((a) => (a.id === absence.id ? absence : a))),
  });
}

export function useDeleteAbsence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (absence: Pick<Absence, 'id'>) => {
      await calendarBackend.deleteAbsence(absence.id, author());
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
  touchFeed(queryClient);
}

export function useCreateRehearsalRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (row: NewRehearsalRule) => calendarBackend.insertRehearsalRule(row, author()),
    onSuccess: (rule) => {
      queryClient.setQueryData<RehearsalRule[]>(calendarKeys.rules, (current) => (current ? [...current, rule] : current));
      settleRules(queryClient);
    },
  });
}

export function useEditRehearsalRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, row }: { id: string; row: NewRehearsalRule }) => calendarBackend.editRehearsalRule(id, row, author()),
    onSettled: () => settleRules(queryClient),
  });
}

export function useEndRehearsalRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => calendarBackend.endRehearsalRule(id, author()),
    onSettled: () => settleRules(queryClient),
  });
}

export function useCreateRehearsalException() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (row: NewRehearsalException) => calendarBackend.insertRehearsalException(row, author()),
    onSuccess: (exception) => patchExceptions(queryClient, (list) => [...list, exception]),
    onError: () => void queryClient.invalidateQueries({ queryKey: calendarKeys.exceptions }),
  });
}

export function useDeleteRehearsalException() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (exception: Pick<RehearsalException, 'id'>) => {
      await calendarBackend.deleteRehearsalException(exception.id, author());
      return exception;
    },
    onSuccess: (exception) => patchExceptions(queryClient, (list) => list.filter((e) => e.id !== exception.id)),
  });
}

// ───────────── REQ-05 · Unseen changes (the dot on 暦) ─────────────

const SEEN_KEY = 'oneshoot.calendar.seen.v1';

interface SeenState {
  /** Changes after this moment (ISO) are «not seen» on this device. */
  seenAt: string;
  mark(next: string): void;
}

function readSeen(): string {
  let stored: string | null = null;
  try {
    stored = readSeenMark(localStorage.getItem(SEEN_KEY));
  } catch {
    /* blocked storage: this visit only */
  }
  if (stored) return stored;
  // First visit: what happened before this device came along isn't news.
  const first = new Date().toISOString();
  writeSeen(first);
  return first;
}

function writeSeen(value: string) {
  try {
    localStorage.setItem(SEEN_KEY, value);
  } catch {
    /* this visit only */
  }
}

export const useCalendarSeen = create<SeenState>()((set, get) => ({
  seenAt: typeof window === 'undefined' ? new Date(0).toISOString() : readSeen(),
  mark(next) {
    if (next <= get().seenAt) return;
    set({ seenAt: next });
    writeSeen(next);
  },
}));

/** The changes after this device's mark (read when the app opens or comes back; no Realtime). */
export function useCalendarChanges() {
  const seenAt = useCalendarSeen((s) => s.seenAt);
  return useQuery({
    queryKey: calendarKeys.changesSince(seenAt),
    queryFn: () => calendarBackend.listCalendarChanges(seenAt),
    staleTime: 30_000,
    // Before the migration is applied (or offline) the dot just stays off.
    retry: false,
  });
}

/** Whether someone else changed the calendar since this device last looked at it. */
export function useCalendarUnseen(): boolean {
  const changes = useCalendarChanges();
  const me = useIdentity((s) => s.memberId);
  const seenAt = useCalendarSeen((s) => s.seenAt);
  return unseenChanges(changes.data ?? [], seenAt, me).length > 0;
}

/** On /calendario: everything up to now counts as seen, and keeps counting while the page is open. */
export function useMarkCalendarSeen(): void {
  const changes = useCalendarChanges();
  const mark = useCalendarSeen((s) => s.mark);
  useEffect(() => {
    mark(new Date().toISOString());
  }, [mark]);
  // Only when something new came in: the mark keys the query, so marking on an empty list would loop.
  useEffect(() => {
    if (changes.data?.length) mark(nextSeenMark(changes.data, new Date().toISOString()));
  }, [changes.data, mark]);
}
