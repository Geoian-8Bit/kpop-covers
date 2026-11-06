import type { Absence, AbsenceKind } from '@coverscape/shared';
import {
  CalendarPlus,
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock4,
  LogOut,
  MessageSquareText,
  Pencil,
  TriangleAlert,
  Undo2,
  UserX,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { guardNav } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { SectionTitle } from '@/components/ui/SectionTitle';
import {
  calendarError,
  useCreateRehearsalException,
  useDeleteRehearsalException,
  type CalendarMember,
} from '@/data/calendar';
import { MemberSeal } from '@/features/members/MembersUI';
import { cn } from '@/lib/cn';
import { snappy, soft } from '@/lib/motion';
import { useToast } from '@/providers/ToastProvider';
import { absenceKindLabel, addDays, dayLabel, dayLabelLong, rangeLabelLong } from './calendarRules';
import { timeRange, type Session } from './rehearsalRules';

export interface DayEvent {
  id: string;
  name: string;
  time: string;
}

/** A sideways swipe past this distance (px) or speed (px/s) changes day. */
const DAY_SWIPE_PX = 70;
const DAY_SWIPE_SPEED = 500;

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** «Lun 19»: the arrows' day (the month is in the title, written out). */
const shortDay = (day: string) => capitalize(dayLabel(day).split(' ').slice(0, 2).join(' '));

/** How each kind of absence reads at a glance: missing all of it, arriving late, leaving early. */
const KIND_LOOK: Record<AbsenceKind, { Icon: LucideIcon; badge: string }> = {
  all_day: { Icon: UserX, badge: 'bg-enji-600/40 text-enji-200' },
  arrives: { Icon: Clock4, badge: 'bg-kin-400/20 text-kin-200' },
  leaves: { Icon: LogOut, badge: 'bg-ai-600/45 text-ai-200' },
};

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
  onShiftDay,
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
  /** Go to the day before (-1) or after (+1): the arrows, or a sideways swipe over the detail. */
  onShiftDay: (by: -1 | 1) => void;
}) {
  const swiped = useRef(false);
  const [direction, setDirection] = useState<-1 | 1>(1);
  const shift = (by: -1 | 1) => {
    setDirection(by);
    onShiftDay(by);
  };
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
      <nav aria-label="Otros días" className="-mt-2 mb-3 flex items-center justify-between gap-2">
        <Button size="sm" variant="ghost" className="-ml-2" aria-label={`Día anterior: ${dayLabelLong(addDays(day, -1))}`} onClick={() => shift(-1)}>
          <ChevronLeft aria-hidden className="size-4" /> {shortDay(addDays(day, -1))}
        </Button>
        <Button size="sm" variant="ghost" className="-mr-2" aria-label={`Día siguiente: ${dayLabelLong(addDays(day, 1))}`} onClick={() => shift(1)}>
          {shortDay(addDays(day, 1))} <ChevronRight aria-hidden className="size-4" />
        </Button>
      </nav>
      <AnimatePresence mode="popLayout" initial={false} custom={direction}>
        <motion.div
          key={day}
          className="space-y-6 touch-pan-y"
          initial={{ opacity: 0, x: direction * 40 }}
          animate={{ opacity: 1, x: 0, transition: soft }}
          exit={{ opacity: 0, x: direction * -40, transition: snappy }}
          // Swipe left for the next day, right for the day before.
          drag="x"
          dragDirectionLock
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.3}
          dragSnapToOrigin
          onDragEnd={(_, info) => {
            if (Math.abs(info.offset.x) > 8) swiped.current = true;
            if (info.offset.x < -DAY_SWIPE_PX || info.velocity.x < -DAY_SWIPE_SPEED) shift(1);
            else if (info.offset.x > DAY_SWIPE_PX || info.velocity.x > DAY_SWIPE_SPEED) shift(-1);
          }}
          onPointerDownCapture={() => (swiped.current = false)}
          onClickCapture={(e) => {
            if (!swiped.current) return;
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <section aria-labelledby="day-rehearsals">
            <SectionTitle id="day-rehearsals" as="h3" glyph="稽" className="mb-3">
              Ensayos
            </SectionTitle>
            {sessions.length ? (
              <ul className="space-y-2">
                {sessions.map((s) => (
                  <li
                    key={s.key}
                    className={cn(
                      'rounded-[12px] border px-3 py-2.5',
                      s.cancelled ? 'border-line bg-sumi-900/40' : 'border-line-strong bg-sumi-900/70',
                    )}
                  >
                    <div className="flex flex-col gap-2 min-[420px]:flex-row min-[420px]:items-center min-[420px]:gap-3">
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'tabular whitespace-nowrap font-display text-[18px] font-bold',
                            s.cancelled ? 'text-washi-subtle line-through' : 'text-washi',
                          )}
                        >
                          {timeRange(s.starts, s.ends)}
                        </span>
                        <span className="ml-2 text-[12px] text-washi-subtle">
                          {s.ruleId ? 'Semanal' : 'Suelto'}
                        </span>
                        {s.cancelled && (
                          <span className="ml-2 rounded-[4px] bg-sumi-700 px-1.5 py-0.5 text-[11px] font-bold text-washi-muted">
                            Cancelado
                          </span>
                        )}
                      </span>
                      {s.ruleId && !s.cancelled && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="shrink-0 self-start"
                          disabled={busy}
                          onClick={() => cancelSession(s)}
                        >
                          <X aria-hidden className="size-4" /> Cancelar ensayo
                        </Button>
                      )}
                      {s.ruleId && s.cancelled && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => removeException(s, 'Ensayo recuperado')}
                        >
                          <Undo2 aria-hidden className="size-4" /> Deshacer
                        </Button>
                      )}
                      {!s.ruleId && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => removeException(s, 'Ensayo suelto quitado')}
                        >
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
                  const kind = KIND_LOOK[a.kind];
                  return (
                    <li
                      key={a.id}
                      className="rounded-[12px] border border-line bg-sumi-900/60 px-3 pb-2 pt-3"
                    >
                      <div className="flex items-start gap-3">
                        <MemberSeal member={p && !p.archived ? p : null} size="md" />
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              'break-words font-bold leading-snug',
                              p && !p.archived ? 'text-washi' : 'text-washi-subtle',
                            )}
                          >
                            {p?.name ?? 'Alguien que ya no está'}
                          </p>
                          <p
                            className={cn(
                              'mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[13px] font-bold',
                              kind.badge,
                            )}
                          >
                            <kind.Icon aria-hidden className="size-3.5 shrink-0" />
                            {absenceKindLabel(a.kind, a.at_time)}
                          </p>
                          {a.starts_on !== a.ends_on && (
                            <p className="mt-1.5 flex items-start gap-1.5 text-[13px] text-washi-muted">
                              <CalendarRange aria-hidden className="mt-px size-3.5 shrink-0" />
                              <span>{capitalize(rangeLabelLong(a.starts_on, a.ends_on))}</span>
                            </p>
                          )}
                        </div>
                      </div>
                      {a.note && (
                        <p className="mt-2.5 flex gap-2 whitespace-pre-wrap break-words rounded-[10px] bg-sumi-800/80 px-3 py-2 text-[14px] leading-snug text-washi">
                          <MessageSquareText
                            aria-hidden
                            className="mt-0.5 size-4 shrink-0 text-washi-subtle"
                          />
                          <span className="min-w-0">
                            <span className="sr-only">Comentario: </span>
                            {a.note}
                          </span>
                        </p>
                      )}
                      <div className="mt-2 flex justify-end gap-1 border-t border-line pt-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Editar la ausencia de ${p?.name ?? 'esta persona'}`}
                          onClick={() => onEditAbsence(a)}
                        >
                          <Pencil aria-hidden className="size-4" /> Editar
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => onRemoveAbsence(a)}>
                          <Check aria-hidden className="size-4" /> Ya puede
                        </Button>
                      </div>
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
        </motion.div>
      </AnimatePresence>
    </Dialog>
  );
}
