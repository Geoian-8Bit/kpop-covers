import { addDays, hhmm, isoWeekday, isTime, minutes, WEEKDAYS_LONG } from './calendarRules';

/**
 * REQ-04 · Rehearsal sessions computed from weekly rules and per-date exceptions (covered by
 * `rehearsalRules.test.ts`). Only rules and exceptions are stored; the sessions of any range come from here.
 * Times are wall-clock (Europe/Madrid), so summer/winter time changes nothing.
 */

export interface RuleLike {
  id: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  valid_from: string;
  valid_until: string | null;
}

export interface ExceptionLike {
  id: string;
  on_date: string;
  kind: 'cancel' | 'extra';
  rule_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
}

export interface Session {
  /** Stable key: rule + day, or the one-off exception's id. */
  key: string;
  day: string;
  /** `HH:MM`. */
  starts: string;
  ends: string;
  /** The weekly rule it comes from (null: a one-off rehearsal). */
  ruleId: string | null;
  /** One-off: its own exception; cancelled: the cancellation (to undo it). */
  exceptionId: string | null;
  cancelled: boolean;
}

/** Whether a rule produces a session on that day (a rule with valid_until < valid_from never does). */
export function ruleRunsOn(rule: RuleLike, day: string): boolean {
  return (
    rule.weekday === isoWeekday(day) &&
    rule.valid_from <= day &&
    (rule.valid_until == null || day <= rule.valid_until)
  );
}

/** Every session from `from` to `to` (both included), by day then start time. Cancelled ones stay, marked. */
export function sessionsBetween(
  from: string,
  to: string,
  rules: readonly RuleLike[],
  exceptions: readonly ExceptionLike[],
): Session[] {
  const cancels = new Map<string, string>();
  for (const e of exceptions) {
    if (e.kind === 'cancel' && e.rule_id) cancels.set(`${e.rule_id}|${e.on_date}`, e.id);
  }
  const sessions: Session[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    for (const rule of rules) {
      if (!ruleRunsOn(rule, day)) continue;
      const cancel = cancels.get(`${rule.id}|${day}`) ?? null;
      sessions.push({
        key: `${rule.id}|${day}`,
        day,
        starts: hhmm(rule.starts_at),
        ends: hhmm(rule.ends_at),
        ruleId: rule.id,
        exceptionId: cancel,
        cancelled: cancel != null,
      });
    }
  }
  for (const e of exceptions) {
    if (e.kind !== 'extra' || e.on_date < from || e.on_date > to || !e.starts_at || !e.ends_at) continue;
    sessions.push({
      key: e.id,
      day: e.on_date,
      starts: hhmm(e.starts_at),
      ends: hhmm(e.ends_at),
      ruleId: null,
      exceptionId: e.id,
      cancelled: false,
    });
  }
  return sessions.sort((a, b) => a.day.localeCompare(b.day) || a.starts.localeCompare(b.starts) || a.key.localeCompare(b.key));
}

/** Sessions grouped by day. */
export function sessionsByDay(sessions: readonly Session[]): Map<string, Session[]> {
  const map = new Map<string, Session[]>();
  for (const s of sessions) {
    const list = map.get(s.day);
    if (list) list.push(s);
    else map.set(s.day, [s]);
  }
  return map;
}

/** The rules still running from today on (the «Horario de ensayos» list), by weekday and time. */
export function currentRules<T extends RuleLike>(rules: readonly T[], today: string): T[] {
  return rules
    .filter((r) => r.valid_until == null || r.valid_until >= today)
    .sort((a, b) => a.weekday - b.weekday || a.starts_at.localeCompare(b.starts_at));
}

/** «Miércoles · 18:00–20:00». */
export function ruleLabel(rule: Pick<RuleLike, 'weekday' | 'starts_at' | 'ends_at'>): string {
  return `${WEEKDAYS_LONG[rule.weekday - 1] ?? ''} · ${timeRange(rule.starts_at, rule.ends_at)}`;
}

export function timeRange(starts: string, ends: string): string {
  return `${hhmm(starts)}–${hhmm(ends)}`;
}

const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) =>
  minutes(aStart) < minutes(bEnd) && minutes(bStart) < minutes(aEnd);

/** Current rules on the same weekday whose times overlap the draft (allowed, but the form warns). */
export function overlappingRules<T extends RuleLike>(
  draft: { weekday: number; starts: string; ends: string },
  rules: readonly T[],
  today: string,
  exceptId?: string,
): T[] {
  if (!isTime(draft.starts) || !isTime(draft.ends)) return [];
  return currentRules(rules, today).filter(
    (r) => r.id !== exceptId && r.weekday === draft.weekday && overlaps(draft.starts, draft.ends, r.starts_at, r.ends_at),
  );
}

/** Live sessions of a day that overlap a one-off draft (both are shown; the form warns before saving). */
export function clashingSessions(day: string, starts: string, ends: string, sessions: readonly Session[]): Session[] {
  if (!isTime(starts) || !isTime(ends)) return [];
  return sessions.filter((s) => s.day === day && !s.cancelled && overlaps(starts, ends, s.starts, s.ends));
}

export type TimesCheck = { ok: true; starts: string; ends: string } | { ok: false; message: string };

/** Start and end of a rule or a one-off: both set, the end after the start. */
export function checkTimes(starts: string, ends: string): TimesCheck {
  if (!isTime(starts) || !isTime(ends)) return { ok: false, message: 'Pon la hora de inicio y la de fin.' };
  if (minutes(ends) <= minutes(starts)) return { ok: false, message: 'La hora de fin tiene que ser después de la de inicio.' };
  return { ok: true, starts: hhmm(starts), ends: hhmm(ends) };
}
