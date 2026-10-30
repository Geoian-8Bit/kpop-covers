import type { Absence, AbsenceKind } from '@coverscape/shared';
import { motion } from 'motion/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { calendarError, useCreateAbsence, useUpdateAbsence, type CalendarMember } from '@/data/calendar';
import { currentMemberId, useMembers } from '@/data/members';
import { MemberSeal } from '@/features/members/MembersUI';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { useToast } from '@/providers/ToastProvider';
import { ABSENCE_NOTE_MAX, checkAbsenceDraft, hhmm, type AbsenceCheck, type AbsenceDraft } from './calendarRules';

const KINDS = [
  { value: 'all_day', label: 'No puede' },
  { value: 'arrives', label: 'Llega a las…' },
  { value: 'leaves', label: 'Se va a las…' },
] as const satisfies readonly { value: AbsenceKind; label: string }[];

type FieldName = Extract<AbsenceCheck, { ok: false }>['field'];

/**
 * REQ-03 · «Marcar ausencia» / «Editar ausencia»: who (this device's person by default, anyone can be picked), one
 * day or a run of days, all day or arriving / leaving at a time, and an optional note. A failed save keeps what was
 * written. Editing changes dates, kind, time and note; the person stays.
 */
export function AbsenceFormDialog({
  open,
  onClose,
  absence,
  day,
  people,
}: {
  open: boolean;
  onClose: () => void;
  /** Editing this one; marking a new one when absent. */
  absence?: Absence | null;
  /** The day it starts on when marking a new one. */
  day: string;
  /** Names for an absence of someone no longer in the group. */
  people: CalendarMember[];
}) {
  const members = useMembers();
  const create = useCreateAbsence();
  const update = useUpdateAbsence();
  const toast = useToast();
  const pending = create.isPending || update.isPending;
  const [draft, setDraft] = useState<AbsenceDraft>({ memberId: null, from: day, to: day, kind: 'all_day', time: '', note: '' });
  const [error, setError] = useState<{ field: FieldName; message: string } | null>(null);
  // Read when it opens only: a refetch of members must not wipe what is being written.
  const membersRef = useRef(members.data);
  membersRef.current = members.data;

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDraft(
      absence
        ? {
            memberId: absence.member_id,
            from: absence.starts_on,
            to: absence.ends_on,
            kind: absence.kind,
            time: hhmm(absence.at_time),
            note: absence.note ?? '',
          }
        : { memberId: currentMemberId(membersRef.current), from: day, to: day, kind: 'all_day', time: '', note: '' },
    );
  }, [open, absence, day]);

  // The group arrived after the form opened: fill in this device's person if nobody was picked yet.
  useEffect(() => {
    if (!open || absence || !members.data) return;
    const me = currentMemberId(members.data);
    if (me) setDraft((d) => (d.memberId ? d : { ...d, memberId: me }));
  }, [open, absence, members.data]);

  const set = (patch: Partial<AbsenceDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const setFrom = (from: string) =>
    // Moving the first day drags a one-day absence (or a last day now before it) along.
    setDraft((d) => ({ ...d, from, to: !d.to || d.to === d.from || d.to < from ? from : d.to }));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    const check = checkAbsenceDraft(draft);
    if (!check.ok) return setError({ field: check.field, message: check.message });
    setError(null);
    const done = () => {
      toast('Ausencia guardada', 'success');
      onClose();
    };
    const failed = (err: unknown) => toast(calendarError(err), 'error');
    if (absence) {
      const { member_id: _member, ...patch } = check.row;
      update.mutate({ id: absence.id, patch }, { onSuccess: done, onError: failed });
    } else {
      create.mutate(
        { ...check.row, created_by_member: currentMemberId(members.data) },
        { onSuccess: done, onError: failed },
      );
    }
  }

  const live = members.data ?? [];
  const editing = absence ? (people.find((p) => p.id === absence.member_id) ?? null) : null;

  return (
    <Dialog open={open} onClose={onClose} title={absence ? 'Editar ausencia' : 'Marcar ausencia'} busy={pending}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <fieldset>
          <legend className="mb-1.5 block text-[13px] font-medium text-washi-muted">Quién</legend>
          {absence ? (
            <p className="flex items-center gap-2.5 text-[15px] font-bold text-washi">
              <MemberSeal member={editing} size="sm" />
              <span className={cn(editing?.archived && 'text-washi-subtle')}>{editing?.name ?? 'Alguien que ya no está'}</span>
            </p>
          ) : live.length ? (
            <div role="radiogroup" aria-label="Quién falta" className="flex flex-wrap gap-1.5">
              {live.map((m) => {
                const on = draft.memberId === m.id;
                return (
                  <motion.button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set({ memberId: m.id })}
                    whileTap={{ scale: 0.92 }}
                    transition={jelly}
                    className={cn(
                      'flex h-11 max-w-full items-center gap-2 rounded-[10px] border pl-1.5 pr-3 text-[14px] font-bold transition-colors',
                      on ? 'border-kin-300 bg-washi/[0.1] text-washi' : 'border-line text-washi-muted hover:border-line-strong',
                    )}
                  >
                    <MemberSeal member={m} size="sm" />
                    <span className="truncate">{m.name}</span>
                  </motion.button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-washi-muted">
              {members.isPending ? 'Cargando el grupo…' : 'Aún no hay nadie en el grupo: añade a la gente en Ajustes.'}
            </p>
          )}
          {error?.field === 'member' && (
            <p role="alert" className="mt-1.5 text-[13px] text-enji-300">
              {error.message}
            </p>
          )}
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Desde"
            type="date"
            value={draft.from}
            onChange={(e) => setFrom(e.target.value)}
            error={error?.field === 'from' ? error.message : null}
            required
          />
          <Field
            label="Hasta"
            type="date"
            value={draft.to}
            min={draft.from || undefined}
            onChange={(e) => set({ to: e.target.value })}
            error={error?.field === 'to' ? error.message : null}
            required
          />
        </div>

        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-washi-muted">Cómo</span>
          <Segmented
            options={KINDS}
            value={draft.kind}
            onChange={(kind) => set({ kind })}
            layoutId="absence-kind"
            label="Cómo falta"
            size="sm"
            className="flex w-full [&>button]:flex-1"
          />
        </div>

        {draft.kind !== 'all_day' && (
          <Field
            label={draft.kind === 'arrives' ? 'Llega a las' : 'Se va a las'}
            type="time"
            value={draft.time}
            onChange={(e) => set({ time: e.target.value })}
            error={error?.field === 'time' ? error.message : null}
            required
          />
        )}

        <Field
          label="Nota (opcional)"
          value={draft.note}
          onChange={(e) => set({ note: e.target.value })}
          maxLength={ABSENCE_NOTE_MAX}
          placeholder="Médico, examen, viaje…"
          error={error?.field === 'note' ? error.message : null}
        />

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" loading={pending}>
            Guardar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
