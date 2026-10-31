import type { Absence, RehearsalRule } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Page } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { SectionTitle } from '@/components/ui/SectionTitle';
import {
  calendarError,
  useAbsences,
  useCalendarMembers,
  useDeleteAbsence,
  useRehearsalExceptions,
  useRehearsalRules,
  type CalendarMember,
} from '@/data/calendar';
import { askWho, MEMBER_SWATCH } from '@/data/members';
import { useMarkCalendarSeen } from '@/data/calendar';
import { useEvents } from '@/data/events';
import { useNow } from '@/features/events/useNow';
import { cn } from '@/lib/cn';
import { snappy, soft } from '@/lib/motion';
import { useToast } from '@/providers/ToastProvider';
import { AbsenceFormDialog } from './AbsenceFormDialog';
import {
  absencesOn,
  absentMembers,
  dayDots,
  dayKey,
  dayLabelLong,
  gridRange,
  isDayKey,
  madridClock,
  madridToday,
  monthGrid,
  monthLabel,
  monthOf,
  shiftMonth,
  WEEKDAYS_SHORT,
  type MonthRef,
} from './calendarRules';
import { DayDialog, type DayEvent } from './DayDialog';
import { EndRuleDialog, ExtraFormDialog, RuleFormDialog } from './RehearsalDialogs';
import { currentRules, ruleLabel, sessionsBetween, sessionsByDay, type Session } from './rehearsalRules';

/** Which layer is on top: the day's detail, or a form / confirmation opened from it (the detail waits behind). */
type Layer =
  | { kind: 'absence'; absence: Absence | null; day: string }
  | { kind: 'remove'; absence: Absence }
  | { kind: 'extra'; day: string }
  | { kind: 'rule'; rule: RehearsalRule | null }
  | { kind: 'end-rule'; rule: RehearsalRule };

/**
 * REQ-03 / REQ-04 · /calendario: the month (Monday first) with rehearsals, events and a dot per absent person; a
 * day's detail; marking absences; the weekly rehearsal timetable and its per-date exceptions. `?dia=AAAA-MM-DD`
 * opens that day (the notifications of REQ-05 land there).
 */
export function CalendarPage() {
  const now = useNow();
  const today = madridToday(now);
  const [params, setParams] = useSearchParams();
  const [month, setMonth] = useState<MonthRef>(() => monthOf(isDayKey(params.get('dia')) ? params.get('dia')! : today));
  const [direction, setDirection] = useState(0);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [layer, setLayer] = useState<Layer | null>(null);
  const toast = useToast();
  // REQ-05 · Looking at the calendar takes the dot away.
  useMarkCalendarSeen();

  // A link with ?dia= (a notification, a shared link) opens that day, once.
  const linkedDay = params.get('dia');
  useEffect(() => {
    if (!isDayKey(linkedDay)) return;
    setMonth(monthOf(linkedDay));
    setOpenDay(linkedDay);
    setParams(
      (p) => {
        p.delete('dia');
        return p;
      },
      { replace: true },
    );
  }, [linkedDay, setParams]);

  const { from, to } = gridRange(month);
  const absences = useAbsences(from, to);
  const rules = useRehearsalRules();
  const exceptions = useRehearsalExceptions(from, to);
  const people = useCalendarMembers();
  const events = useEvents();
  const removeAbsence = useDeleteAbsence();

  const sessions = useMemo(
    () => sessionsBetween(from, to, rules.data ?? [], exceptions.data ?? []),
    [from, to, rules.data, exceptions.data],
  );
  const byDay = useMemo(() => sessionsByDay(sessions), [sessions]);
  const eventsByDay = useMemo(() => {
    const map = new Map<string, DayEvent[]>();
    for (const e of events.data ?? []) {
      const { day, time } = madridClock(e.starts_at);
      const list = map.get(day) ?? [];
      list.push({ id: e.id, name: e.name, time });
      map.set(day, list);
    }
    return map;
  }, [events.data]);
  const peopleById = useMemo(() => new Map((people.data ?? []).map((p) => [p.id, p])), [people.data]);

  const absenceList = absences.data ?? [];
  const monthFirst = dayKey(month.year, month.month, 1);
  const monthLast = dayKey(month.year, month.month + 1, 0);
  const monthHasAbsences = absenceList.some((a) => a.starts_on <= monthLast && a.ends_on >= monthFirst);
  const loading = absences.isPending || rules.isPending;
  const failed = (absences.isError && !absences.data) || (rules.isError && !rules.data);

  const go = (by: number) => {
    setDirection(by);
    setMonth((m) => shiftMonth(m, by));
  };
  const goToday = () => {
    const target = monthOf(today);
    setDirection(target.year * 12 + target.month > month.year * 12 + month.month ? 1 : -1);
    setMonth(target);
  };

  const markAbsence = (day: string) => askWho('Así la ausencia sale con tu nombre.', () => setLayer({ kind: 'absence', absence: null, day }));
  const closeLayer = () => setLayer(null);
  const dayShown = openDay ?? today;

  return (
    <Page className="px-2.5 py-3 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
      <div className="paper mx-auto max-w-4xl rounded-[10px] sm:rounded-[12px]">
        <h1 className="sr-only">Calendario</h1>

        <section aria-labelledby="calendar-month" className="px-2 pb-3 pt-3 sm:px-6 sm:pb-6 sm:pt-5">
          <div className="mb-2 flex items-center gap-1 px-1">
            <h2 id="calendar-month" aria-live="polite" className="min-w-0 flex-1 truncate font-display text-[22px] font-bold capitalize text-washi">
              {monthLabel(month)}
            </h2>
            <Button size="sm" variant="ghost" onClick={goToday}>
              Hoy
            </Button>
            <Button size="icon" variant="ghost" aria-label="Mes anterior" onClick={() => go(-1)}>
              <ChevronLeft aria-hidden className="size-5" />
            </Button>
            <Button size="icon" variant="ghost" aria-label="Mes siguiente" onClick={() => go(1)}>
              <ChevronRight aria-hidden className="size-5" />
            </Button>
          </div>

          {failed ? (
            <div role="alert" className="px-4 py-12 text-center">
              <p className="font-display text-xl font-bold">No pudimos cargar el calendario</p>
              <Button
                variant="secondary"
                className="mt-4"
                loading={absences.isFetching || rules.isFetching}
                onClick={() => {
                  void absences.refetch();
                  void rules.refetch();
                  void exceptions.refetch();
                }}
              >
                Reintentar
              </Button>
            </div>
          ) : (
            <>
              <div aria-hidden className="grid grid-cols-7 gap-1 px-0.5 pb-1 text-center text-[11px] font-bold uppercase tracking-[0.06em] text-washi-subtle">
                {WEEKDAYS_SHORT.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              {loading ? (
                <div role="status" aria-label="Cargando el calendario" className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 35 }, (_, i) => (
                    <div key={i} className="skeleton h-[68px] rounded-[8px] sm:h-[84px] [@media(max-height:500px)]:h-[58px]" />
                  ))}
                </div>
              ) : (
                <AnimatePresence mode="popLayout" initial={false} custom={direction}>
                  <motion.div
                    key={`${month.year}-${month.month}`}
                    custom={direction}
                    initial={{ opacity: 0, x: direction * 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: direction * -24, transition: snappy }}
                    transition={soft}
                    role="grid"
                    aria-labelledby="calendar-month"
                    className="space-y-1"
                  >
                    {monthGrid(month).map((week) => (
                      <div key={week[0]!.day} role="row" className="grid grid-cols-7 gap-1">
                        {week.map(({ day, inMonth }) => (
                          <DayCell
                            key={day}
                            day={day}
                            inMonth={inMonth}
                            today={day === today}
                            past={day < today}
                            sessions={byDay.get(day) ?? []}
                            events={eventsByDay.get(day) ?? []}
                            absent={absentMembers(absenceList, day).map((id) => peopleById.get(id) ?? null)}
                            onOpen={() => setOpenDay(day)}
                          />
                        ))}
                      </div>
                    ))}
                  </motion.div>
                </AnimatePresence>
              )}
              {!loading && !monthHasAbsences && (
                <p className="mt-3 px-2 text-center text-[13px] text-washi-muted">Nadie ha marcado ausencias este mes. Toca un día para marcar una.</p>
              )}
            </>
          )}
        </section>

        <RehearsalSchedule
          rules={rules.data}
          loading={rules.isPending}
          error={rules.isError && !rules.data}
          retrying={rules.isFetching}
          onRetry={() => void rules.refetch()}
          today={today}
          onAdd={() => setLayer({ kind: 'rule', rule: null })}
          onEdit={(rule) => setLayer({ kind: 'rule', rule })}
          onEnd={(rule) => setLayer({ kind: 'end-rule', rule })}
        />
      </div>

      <DayDialog
        day={dayShown}
        open={openDay != null && layer == null}
        onClose={() => setOpenDay(null)}
        sessions={byDay.get(dayShown) ?? []}
        absences={absencesOn(absenceList, dayShown)}
        absentCount={absentMembers(absenceList, dayShown).length}
        events={eventsByDay.get(dayShown) ?? []}
        people={people.data ?? []}
        onMarkAbsence={() => markAbsence(dayShown)}
        onEditAbsence={(absence) => setLayer({ kind: 'absence', absence, day: dayShown })}
        onRemoveAbsence={(absence) => setLayer({ kind: 'remove', absence })}
        onAddExtra={() => setLayer({ kind: 'extra', day: dayShown })}
      />

      <AbsenceFormDialog
        open={layer?.kind === 'absence'}
        onClose={closeLayer}
        absence={layer?.kind === 'absence' ? layer.absence : null}
        day={layer?.kind === 'absence' ? layer.day : today}
        people={people.data ?? []}
      />
      <ExtraFormDialog open={layer?.kind === 'extra'} onClose={closeLayer} day={layer?.kind === 'extra' ? layer.day : today} sessions={sessions} />
      <RuleFormDialog
        open={layer?.kind === 'rule'}
        onClose={closeLayer}
        rule={layer?.kind === 'rule' ? layer.rule : null}
        rules={rules.data ?? []}
        today={today}
      />
      <EndRuleDialog rule={layer?.kind === 'end-rule' ? layer.rule : null} onClose={closeLayer} />
      <Dialog
        open={layer?.kind === 'remove'}
        onClose={closeLayer}
        title="¿Ya puede venir?"
        description="La ausencia se quita para todo el grupo. Si solo cambia un día, mejor edita las fechas."
        size="sm"
        hideClose
        busy={removeAbsence.isPending}
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={closeLayer} disabled={removeAbsence.isPending}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            loading={removeAbsence.isPending}
            onClick={() =>
              layer?.kind === 'remove' &&
              removeAbsence.mutate(layer.absence, {
                onSuccess: () => {
                  toast('Ausencia quitada', 'success');
                  closeLayer();
                },
                onError: (err) => toast(calendarError(err), 'error'),
              })
            }
          >
            Ya puede
          </Button>
        </div>
      </Dialog>
    </Page>
  );
}

const CHIPS_MAX = 2;

function DayCell({
  day,
  inMonth,
  today,
  past,
  sessions,
  events,
  absent,
  onOpen,
}: {
  day: string;
  inMonth: boolean;
  today: boolean;
  past: boolean;
  sessions: Session[];
  events: DayEvent[];
  absent: (CalendarMember | null)[];
  onOpen: () => void;
}) {
  const chips = [
    ...sessions.map((s) => ({ key: s.key, kind: 'rehearsal' as const, text: s.starts, cancelled: s.cancelled })),
    ...events.map((e) => ({ key: e.id, kind: 'event' as const, text: e.name, cancelled: false })),
  ];
  const shown = chips.slice(0, CHIPS_MAX);
  const more = chips.length - shown.length;
  const { shown: dots, extra } = dayDots(absent);
  const live = sessions.filter((s) => !s.cancelled).length;
  const summary = [
    dayLabelLong(day),
    today && 'hoy',
    live && (live === 1 ? '1 ensayo' : `${live} ensayos`),
    sessions.length > live && 'ensayo cancelado',
    events.length && (events.length === 1 ? `evento: ${events[0]!.name}` : `${events.length} eventos`),
    absent.length && (absent.length === 1 ? 'falta 1 persona' : `faltan ${absent.length} personas`),
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div role="gridcell" className="min-w-0">
      <motion.button
        type="button"
        onClick={onOpen}
        aria-label={summary}
        aria-current={today ? 'date' : undefined}
        whileTap={{ scale: 0.94 }}
        transition={snappy}
        className={cn(
          'flex h-[68px] w-full min-w-0 flex-col items-stretch overflow-hidden rounded-[8px] border p-1 text-left transition-colors sm:h-[84px] [@media(max-height:500px)]:h-[58px] sm:p-1.5',
          inMonth ? 'border-line bg-sumi-900/60 hover:border-line-strong' : 'border-transparent bg-sumi-900/20 opacity-55',
          today && 'border-kin-300 bg-washi/[0.06]',
          past && inMonth && !today && 'bg-sumi-900/35',
        )}
      >
        <span
          className={cn(
            'tabular grid size-5 shrink-0 place-items-center rounded-full text-[12px] font-bold leading-none',
            today ? 'bg-shu-500 text-washi' : inMonth ? 'text-washi' : 'text-washi-subtle',
          )}
        >
          {Number(day.slice(8))}
        </span>
        <span className="mt-0.5 flex min-w-0 flex-col gap-px">
          {shown.map((c) => (
            <span
              key={c.key}
              className={cn(
                'truncate rounded-[3px] px-0.5 text-[10px] font-bold leading-[14px] sm:text-[11px] sm:leading-4',
                c.kind === 'rehearsal'
                  ? c.cancelled
                    ? 'text-washi-subtle line-through'
                    : 'bg-rokusho/25 text-washi'
                  : 'bg-ai-600/45 text-ai-200',
              )}
            >
              {c.text}
            </span>
          ))}
          {more > 0 && <span className="px-0.5 text-[10px] leading-3 text-washi-subtle">+{more}</span>}
        </span>
        {absent.length > 0 && (
          <span className="mt-auto flex min-w-0 items-center gap-0.5">
            {dots.map((p, i) => (
              <span
                key={p?.id ?? `gone-${i}`}
                className={cn('size-1.5 shrink-0 rounded-full sm:size-2', p && !p.archived ? MEMBER_SWATCH[p.color].dot : 'bg-sumi-600')}
              />
            ))}
            {extra > 0 && <span className="text-[9px] font-bold leading-none text-washi-muted sm:text-[10px]">+{extra}</span>}
          </span>
        )}
      </motion.button>
    </div>
  );
}

function RehearsalSchedule({
  rules,
  loading,
  error,
  retrying,
  onRetry,
  today,
  onAdd,
  onEdit,
  onEnd,
}: {
  rules: RehearsalRule[] | undefined;
  loading: boolean;
  error: boolean;
  retrying: boolean;
  onRetry: () => void;
  today: string;
  onAdd: () => void;
  onEdit: (rule: RehearsalRule) => void;
  onEnd: (rule: RehearsalRule) => void;
}) {
  const current = currentRules(rules ?? [], today);
  return (
    <section aria-labelledby="calendar-schedule" className="sep-t px-4 pb-6 pt-4 sm:px-9 sm:pt-6">
      <SectionTitle
        id="calendar-schedule"
        glyph="稽"
        className="mb-3"
        aside={
          <Button size="sm" variant="secondary" onClick={onAdd}>
            <Plus aria-hidden className="size-4" /> Añadir
          </Button>
        }
      >
        Horario de ensayos
      </SectionTitle>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="skeleton h-14 rounded-[12px]" />
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="py-6 text-center">
          <p className="font-bold">No pudimos cargar el horario</p>
          <Button variant="secondary" size="sm" className="mt-3" loading={retrying} onClick={onRetry}>
            Reintentar
          </Button>
        </div>
      ) : current.length ? (
        <ul className="space-y-2">
          {current.map((rule) => (
            <li key={rule.id} className="flex min-h-14 items-center gap-2 rounded-[12px] border border-line bg-sumi-900/60 py-1.5 pl-4 pr-1.5">
              <span className="min-w-0 flex-1">
                <span className="tabular block truncate font-bold text-washi">{ruleLabel(rule)}</span>
                {rule.valid_from > today && <span className="block text-[12px] text-washi-subtle">Empieza el {dayLabelLong(rule.valid_from)}</span>}
              </span>
              <Button size="icon" variant="ghost" aria-label={`Editar ${ruleLabel(rule)}`} onClick={() => onEdit(rule)}>
                <Pencil aria-hidden className="size-4.5" />
              </Button>
              <Button size="icon" variant="ghost" aria-label={`Quitar ${ruleLabel(rule)}`} onClick={() => onEnd(rule)}>
                <Trash2 aria-hidden className="size-4.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-washi-muted">Todavía no hay horario. Añade el primer ensayo semanal.</p>
      )}
    </section>
  );
}
