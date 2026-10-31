import type { Absence } from '@coverscape/shared';
import { CalendarPlus, ChevronRight, Pencil, TriangleAlert, Undo2, UserX, X } from 'lucide-react';
import { Link } from 'react-router';
import { guardNav } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { calendarError, useCreateRehearsalException, useDeleteRehearsalException, type CalendarMember } from '@/data/calendar';
import { MemberSeal } from '@/features/members/MembersUI';
import { cn } from '@/lib/cn';
import { useToast } from '@/providers/ToastProvider';
import { absenceKindLabel, dayLabelLong, rangeLabel } from './calendarRules';
import { timeRange, type Session } from './rehearsalRules';

export interface DayEvent {
  id: string;
  name: string;
  time: string;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * REQ-03 / REQ-04 · One day in detail: rehearsals (cancel one, undo it, remove a one-off; a warning with how many
 * are missing), who is missing and how (edit, «Ya puede»), and the group's events that day.
 */
export function DayDialog({
  day,
  open,
  onClose,
  sessions,
  absences,
  absentCount,
  events,
  people,
  onMarkAbsence,
  onEditAbsence,
  onRemoveAbsence,
  onAddExtra,
}: {
  day: string;
  open: boolean;
  onClose: () => void;
  sessions: Session[];
  absences: Absence[];
  /** Distinct people missing that day (the warning on a rehearsal). */
  absentCount: number;
  events: DayEvent[];
  people: CalendarMember[];
  onMarkAbsence: () => void;
  onEditAbsence: (absence: Absence) => void;
  onRemoveAbsence: (absence: Absence) => void;
  onAddExtra: () => void;
}) {
  const cancel = useCreateRehearsalException();
  const undo = useDeleteRehearsalException();
  const toast = useToast();
  const busy = cancel.isPending || undo.isPending;
  const person = (id: string) => people.find((p) => p.id === id) ?? null;

  const cancelSession = (session: Session) =>
    session.ruleId &&
    cancel.mutate(
      { kind: 'cancel', on_date: session.day, rule_id: session.ruleId },
      {
        onSuccess: () => toast('Ensayo cancelado', 'success'),
        onError: (err) => toast(calendarError(err), 'error'),
      },
    );
  const removeException = (session: Session, message: string) =>
    session.exceptionId &&
    undo.mutate(
      { id: session.exceptionId },
      { onSuccess: () => toast(message, 'success'), onError: (err) => toast(calendarError(err), 'error') },
    );

  return (
    <Dialog open={open} onClose={onClose} title={capitalize(dayLabelLong(day))}>
      <div className="space-y-6">
        <section aria-labelledby="day-rehearsals">
          <SectionTitle id="day-rehearsals" as="h3" glyph="稽" className="mb-3">
            Ensayos
          </SectionTitle>
          {sessions.length ? (
            <ul className="space-y-2">
              {sessions.map((s) => (
                <li
                  key={s.key}
                  className={cn('rounded-[12px] border px-3 py-2.5', s.cancelled ? 'border-line bg-sumi-900/40' : 'border-line-strong bg-sumi-900/70')}
                >
                  <div className="flex flex-col gap-2 min-[420px]:flex-row min-[420px]:items-center min-[420px]:gap-3">
                    <span className="min-w-0 flex-1">
                      <span className={cn('tabular whitespace-nowrap font-display text-[18px] font-bold', s.cancelled ? 'text-washi-subtle line-through' : 'text-washi')}>
                        {timeRange(s.starts, s.ends)}
                      </span>
                      <span className="ml-2 text-[12px] text-washi-subtle">{s.ruleId ? 'Semanal' : 'Suelto'}</span>
                      {s.cancelled && (
                        <span className="ml-2 rounded-[4px] bg-sumi-700 px-1.5 py-0.5 text-[11px] font-bold text-washi-muted">Cancelado</span>
                      )}
                    </span>
                    {s.ruleId && !s.cancelled && (
                      <Button size="sm" variant="ghost" className="shrink-0 self-start" disabled={busy} onClick={() => cancelSession(s)}>
                        <X aria-hidden className="size-4" /> Cancelar ensayo
                      </Button>
                    )}
                    {s.ruleId && s.cancelled && (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => removeException(s, 'Ensayo recuperado')}>
                        <Undo2 aria-hidden className="size-4" /> Deshacer
                      </Button>
                    )}
                    {!s.ruleId && (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => removeException(s, 'Ensayo suelto quitado')}>
                        <X aria-hidden className="size-4" /> Quitar
                      </Button>
                    )}
                  </div>
                  {!s.cancelled && absentCount > 0 && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-[13px] font-bold text-kin-300">
                      <TriangleAlert aria-hidden className="size-4 shrink-0" />
                      {absentCount === 1 ? 'Falta 1 persona' : `Faltan ${absentCount} personas`}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-washi-muted">No hay ensayo este día.</p>
          )}
          <Button size="sm" variant="secondary" className="mt-3" onClick={onAddExtra}>
            <CalendarPlus aria-hidden className="size-4" /> Añadir ensayo suelto
          </Button>
        </section>

        <section aria-labelledby="day-absences">
          <SectionTitle id="day-absences" as="h3" glyph="欠" className="mb-3">
            Quién falta
          </SectionTitle>
          {absences.length ? (
            <ul className="space-y-2">
              {absences.map((a) => {
                const p = person(a.member_id);
                return (
                  <li key={a.id} className="flex items-start gap-3 rounded-[12px] border border-line bg-sumi-900/60 px-3 py-2.5">
                    <MemberSeal member={p && !p.archived ? p : null} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate font-bold', p && !p.archived ? 'text-washi' : 'text-washi-subtle')}>
                        {p?.name ?? 'Alguien que ya no está'}
                      </span>
                      <span className="block text-[13px] text-washi-muted">
                        {absenceKindLabel(a.kind, a.at_time)}
                        {a.starts_on !== a.ends_on && <span className="text-washi-subtle"> · {rangeLabel(a.starts_on, a.ends_on)}</span>}
                      </span>
                      {a.note && <span className="mt-0.5 block break-words text-[13px] italic text-washi-subtle">{a.note}</span>}
                    </span>
                    <span className="flex shrink-0 gap-0.5">
                      <Button size="icon-sm" variant="ghost" aria-label={`Editar la ausencia de ${p?.name ?? 'esta persona'}`} onClick={() => onEditAbsence(a)}>
                        <Pencil aria-hidden className="size-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onRemoveAbsence(a)}>
                        Ya puede
                      </Button>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-washi-muted">Nadie ha dicho que falte.</p>
          )}
          <Button size="sm" className="mt-3" onClick={onMarkAbsence}>
            <UserX aria-hidden className="size-4" /> Marcar ausencia
          </Button>
        </section>

        {events.length > 0 && (
          <section aria-labelledby="day-events">
            <SectionTitle id="day-events" as="h3" glyph="祭" className="mb-3">
              Eventos
            </SectionTitle>
            <ul className="space-y-2">
              {events.map((e) => (
                <li key={e.id}>
                  <Link
                    to={`/eventos/${e.id}`}
                    onClick={guardNav}
                    className="group flex min-h-11 items-center gap-3 rounded-[12px] border border-line bg-sumi-900/60 px-3 py-2 transition-colors hover:border-line-strong"
                  >
                    <span className="tabular text-[13px] font-bold text-kin-300">{e.time}</span>
                    <span className="min-w-0 flex-1 truncate font-bold text-washi">{e.name}</span>
                    <ChevronRight aria-hidden className="size-4 shrink-0 text-washi-subtle" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Dialog>
  );
}
