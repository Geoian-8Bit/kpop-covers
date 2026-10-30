import type { AbsenceKind } from '@coverscape/shared';

/**
 * REQ-03 · Pure rules of the absence calendar (covered by `calendarRules.test.ts`). Days are wall-clock dates in
 * Europe/Madrid written as `YYYY-MM-DD` keys; the arithmetic runs in UTC so no time zone or DST shift moves a day.
 */

export const CALENDAR_ZONE = 'Europe/Madrid';
export const ABSENCE_NOTE_MAX = 140;
/** Longest range: 61 days (`ends_on - starts_on <= 60` in the database). */
export const ABSENCE_MAX_SPAN = 60;
/** More than this many absent people in a day cell: 3 dots and «+N». */
export const DOTS_MAX = 4;

const DAY_MS = 86_400_000;
const KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

export const WEEKDAYS_SHORT = ['lun', 'mar', 'miér', 'jue', 'vie', 'sáb', 'dom'] as const;
export const WEEKDAYS_LONG = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;
export const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'] as const;
export const MONTHS_LONG = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

export function isDayKey(value: string | null | undefined): value is string {
  const m = value ? KEY.exec(value) : null;
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return d.toISOString().slice(0, 10) === value;
}

const toUtc = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!);
};
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function dayKey(year: number, month0: number, date: number): string {
  return fromUtc(Date.UTC(year, month0, date));
}

/** Today in Madrid (a phone abroad still sees the group's calendar day). */
export function madridToday(now: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: CALENDAR_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDays(day: string, n: number): string {
  return fromUtc(toUtc(day) + n * DAY_MS);
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(day: string): number {
  const js = new Date(toUtc(day)).getUTCDay();
  return js === 0 ? 7 : js;
}

export interface MonthRef {
  year: number;
  /** 0 = January. */
  month: number;
}

export function monthOf(day: string): MonthRef {
  const [y, m] = day.split('-').map(Number);
  return { year: y!, month: m! - 1 };
}

export function shiftMonth({ year, month }: MonthRef, by: number): MonthRef {
  const total = year * 12 + month + by;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

export interface GridDay {
  day: string;
  inMonth: boolean;
}

/** The month as whole weeks starting on Monday (4 to 6 rows), with the spill-over days of the months around. */
export function monthGrid({ year, month }: MonthRef): GridDay[][] {
  const first = dayKey(year, month, 1);
  const start = addDays(first, 1 - isoWeekday(first));
  const last = dayKey(year, month + 1, 0);
  const end = addDays(last, 7 - isoWeekday(last));
  const weeks: GridDay[][] = [];
  for (let day = start; day <= end; day = addDays(day, 7)) {
    weeks.push(
      Array.from({ length: 7 }, (_, i) => {
        const d = addDays(day, i);
        return { day: d, inMonth: monthOf(d).month === month };
      }),
    );
  }
  return weeks;
}

/** First and last day shown by a month grid (what to fetch). */
export function gridRange(ref: MonthRef): { from: string; to: string } {
  const weeks = monthGrid(ref);
  return { from: weeks[0]![0]!.day, to: weeks[weeks.length - 1]![6]!.day };
}

export function monthLabel({ year, month }: MonthRef): string {
  return `${MONTHS_LONG[month]} ${year}`;
}

/** «miér 9 dic». */
export function dayLabel(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  return `${WEEKDAYS_SHORT[isoWeekday(day) - 1]} ${d} ${MONTHS_SHORT[m! - 1]}`;
}

/** «miércoles 9 de diciembre» (dialog titles, screen readers). */
export function dayLabelLong(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  return `${WEEKDAYS_LONG[isoWeekday(day) - 1]!.toLowerCase()} ${d} de ${MONTHS_LONG[m! - 1]}`;
}

/** «8–12 dic», «30 dic – 2 ene», or a single day. */
export function rangeLabel(from: string, to: string): string {
  if (from === to) return dayLabel(from);
  const [, fm, fd] = from.split('-').map(Number);
  const [, tm, td] = to.split('-').map(Number);
  return fm === tm ? `${fd}–${td} ${MONTHS_SHORT[tm! - 1]}` : `${fd} ${MONTHS_SHORT[fm! - 1]} – ${td} ${MONTHS_SHORT[tm! - 1]}`;
}

/** The database's `HH:MM:SS` as `HH:MM`; anything unreadable as ''. */
export function hhmm(time: string | null | undefined): string {
  const m = time ? HHMM.exec(time) : null;
  return m ? `${m[1]}:${m[2]}` : '';
}

export function isTime(value: string): boolean {
  return HHMM.test(value);
}

/** Minutes since midnight of an `HH:MM[:SS]`. */
export function minutes(time: string): number {
  const m = HHMM.exec(time);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

// ───────────── Absences ─────────────

export interface AbsenceLike {
  id: string;
  member_id: string;
  starts_on: string;
  ends_on: string;
  kind: AbsenceKind;
  at_time: string | null;
}

export function coversDay(absence: Pick<AbsenceLike, 'starts_on' | 'ends_on'>, day: string): boolean {
  return absence.starts_on <= day && day <= absence.ends_on;
}

/** Absences on a day, whole days first, then by time. */
export function absencesOn<T extends AbsenceLike>(absences: readonly T[], day: string): T[] {
  return absences
    .filter((a) => coversDay(a, day))
    .sort((a, b) => kindOrder(a) - kindOrder(b) || (a.at_time ?? '').localeCompare(b.at_time ?? ''));
}

const kindOrder = (a: AbsenceLike) => (a.kind === 'all_day' ? 0 : 1);

/** Distinct people absent on a day, in first-seen order. */
export function absentMembers(absences: readonly AbsenceLike[], day: string): string[] {
  return [...new Set(absencesOn(absences, day).map((a) => a.member_id))];
}

/** Dots of a day cell: up to 4 people, or 3 and «+N» beyond that. */
export function dayDots<T>(people: readonly T[]): { shown: T[]; extra: number } {
  if (people.length <= DOTS_MAX) return { shown: [...people], extra: 0 };
  return { shown: people.slice(0, DOTS_MAX - 1), extra: people.length - (DOTS_MAX - 1) };
}

/** «No puede», «Llega a las 19:00», «Se va a las 20:30». */
export function absenceKindLabel(kind: AbsenceKind, atTime: string | null): string {
  if (kind === 'arrives') return `Llega a las ${hhmm(atTime)}`;
  if (kind === 'leaves') return `Se va a las ${hhmm(atTime)}`;
  return 'No puede';
}

export interface AbsenceDraft {
  memberId: string | null;
  from: string;
  to: string;
  kind: AbsenceKind;
  time: string;
  note: string;
}

export interface AbsenceRow {
  member_id: string;
  starts_on: string;
  ends_on: string;
  kind: AbsenceKind;
  at_time: string | null;
  note: string | null;
}

export type AbsenceCheck =
  | { ok: true; row: AbsenceRow }
  | { ok: false; field: 'member' | 'from' | 'to' | 'time' | 'note'; message: string };

/** The form's rules (the same as the database's checks, in the group's words). */
export function checkAbsenceDraft(draft: AbsenceDraft): AbsenceCheck {
  if (!draft.memberId) return { ok: false, field: 'member', message: 'Elige quién falta.' };
  if (!isDayKey(draft.from)) return { ok: false, field: 'from', message: 'Elige el día.' };
  if (!isDayKey(draft.to)) return { ok: false, field: 'to', message: 'Elige hasta qué día.' };
  const span = daysBetween(draft.from, draft.to);
  if (span < 0) return { ok: false, field: 'to', message: 'El último día no puede ser antes del primero.' };
  if (span > ABSENCE_MAX_SPAN) return { ok: false, field: 'to', message: 'Como mucho 61 días seguidos.' };
  if (draft.kind !== 'all_day' && !isTime(draft.time)) return { ok: false, field: 'time', message: 'Pon la hora.' };
  const note = draft.note.trim();
  if (note.length > ABSENCE_NOTE_MAX) return { ok: false, field: 'note', message: `La nota admite hasta ${ABSENCE_NOTE_MAX} letras.` };
  return {
    ok: true,
    row: {
      member_id: draft.memberId,
      starts_on: draft.from,
      ends_on: draft.to,
      kind: draft.kind,
      at_time: draft.kind === 'all_day' ? null : hhmm(draft.time),
      note: note || null,
    },
  };
}

/** Day and `HH:MM` of an instant on Madrid's wall clock (where an event falls in the calendar). */
export function madridClock(instant: Date | string): { day: string; time: string } {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: CALENDAR_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
  return { day: madridToday(date), time };
}
