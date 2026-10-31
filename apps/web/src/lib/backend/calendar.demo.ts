import {
  absenceEditedText,
  absenceRemovedText,
  absenceText,
  cancelText,
  extraRemovedText,
  extraText,
  nextWeekday,
  ruleText,
  uncancelText,
} from '@/features/calendar/calendarFeedRules';
import {
  ABSENCE_MAX_SPAN,
  ABSENCE_NOTE_MAX,
  addDays,
  daysBetween,
  hhmm,
  isDayKey,
  isTime,
  madridToday,
  minutes,
} from '@/features/calendar/calendarRules';
import { ruleRunsOn } from '@/features/calendar/rehearsalRules';
import type { Absence, CalendarChange, RehearsalException, RehearsalRule } from '@coverscape/shared';
import { demoError, isLive, mutate, now, query } from './demoDb';
import type { DemoDb } from './demoDb';
import type { AbsencePatch, CalendarBackend } from './types';

// Demo twin: the same rules as the database (range of at most 61 days, time only with arrives / leaves, note up to
// 140, only live members, rules born today and edited from today, one cancellation per session on its weekday).

export type CalendarDemoDb = DemoDb & {
  absences?: Absence[];
  rehearsal_rules?: RehearsalRule[];
  rehearsal_exceptions?: RehearsalException[];
  calendar_changes?: CalendarChange[];
  push_subscriptions?: { endpoint: string; member_id: string | null }[];
};

/** REQ-05 · The demo twin of the database's feed triggers: a change that affects today or later gets its text. */
function postDemoChange(
  db: CalendarDemoDb,
  change: { author: string | null; subject?: string | null; date: string; body: string },
) {
  const known = (id: string | null | undefined) =>
    id && (db.members ?? []).some((m) => m.id === id) ? id : null;
  (db.calendar_changes ??= []).push({
    id: crypto.randomUUID(),
    crew_id: db.crews[0]!.id,
    author_member: known(change.author),
    subject_member: known(change.subject),
    target_date: change.date,
    body: change.body,
    created_at: now(),
  });
  // Bounded like the server (which keeps 120 days).
  if (db.calendar_changes.length > 200) db.calendar_changes.splice(0, db.calendar_changes.length - 200);
}

const demoMemberName = (db: CalendarDemoDb, id: string) =>
  (db.members ?? []).find((m) => m.id === id)?.name ?? null;
const laterOf = (a: string, b: string) => (a > b ? a : b);

export const checkViolation = (constraint: string, table: string) =>
  demoError(`new row for relation "${table}" violates check constraint "${constraint}"`, '23514');

function checkDemoAbsence(row: AbsencePatch) {
  if (!isDayKey(row.starts_on) || !isDayKey(row.ends_on))
    throw checkViolation('absences_range_check', 'absences');
  const span = daysBetween(row.starts_on, row.ends_on);
  if (span < 0 || span > ABSENCE_MAX_SPAN) throw checkViolation('absences_range_check', 'absences');
  if ((row.kind === 'all_day') !== (row.at_time == null))
    throw checkViolation('absences_time_check', 'absences');
  if (row.note != null && row.note.length > ABSENCE_NOTE_MAX)
    throw checkViolation('absences_note_check', 'absences');
}

const demoTime = (time: string) => `${hhmm(time)}:00`;

function checkDemoTimes(starts: string, ends: string, table: string) {
  if (!isTime(starts) || !isTime(ends) || minutes(ends) <= minutes(starts))
    throw checkViolation(`${table}_times_check`, table);
}

const liveDemoRule = (db: CalendarDemoDb, id: string, today: string) =>
  (db.rehearsal_rules ?? []).find(
    (r) => r.id === id && isLive(r) && (r.valid_until == null || r.valid_until >= today),
  );

export const demoCalendar: CalendarBackend = {
  // The demo removes members outright, so there are no archived ones to name.
  listCalendarMembers: () =>
    query((db) =>
      [...(db.members ?? [])]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((m) => ({ id: m.id, name: m.name, color: m.color, archived: false })),
    ),
  listAbsences: (from, to) =>
    query((raw) =>
      ((raw as CalendarDemoDb).absences ?? [])
        .filter((a) => isLive(a) && a.starts_on <= to && a.ends_on >= from)
        .sort((a, b) => a.starts_on.localeCompare(b.starts_on) || a.id.localeCompare(b.id)),
    ),
  insertAbsence: async (row) =>
    mutate((raw) => {
      const db = raw as CalendarDemoDb;
      checkDemoAbsence(row);
      if (!(db.members ?? []).some((m) => m.id === row.member_id)) throw demoError('absence_member_invalid');
      const absence: Absence = {
        id: crypto.randomUUID(),
        crew_id: db.crews[0]!.id,
        member_id: row.member_id,
        starts_on: row.starts_on,
        ends_on: row.ends_on,
        kind: row.kind,
        at_time: row.at_time ? demoTime(row.at_time) : null,
        note: row.note,
        created_by_member:
          row.created_by_member && (db.members ?? []).some((m) => m.id === row.created_by_member)
            ? row.created_by_member
            : null,
        changed_by_member: null,
        created_at: now(),
        archived_at: null,
      };
      (db.absences ??= []).push(absence);
      const today = madridToday(new Date());
      if (absence.ends_on >= today) {
        postDemoChange(db, {
          author: absence.created_by_member,
          subject: absence.member_id,
          date: laterOf(absence.starts_on, today),
          body: absenceText(
            demoMemberName(db, absence.member_id),
            absence.kind,
            absence.at_time,
            absence.starts_on,
            absence.ends_on,
          ),
        });
      }
      return absence;
    }),
  updateAbsence: async (id, patch, author) =>
    mutate((raw) => {
      const db = raw as CalendarDemoDb;
      const absence = (db.absences ?? []).find((a) => a.id === id && isLive(a));
      if (!absence) throw demoError('PGRST116 0 rows');
      checkDemoAbsence(patch);
      const before = { ...absence };
      Object.assign(absence, {
        ...patch,
        at_time: patch.at_time ? demoTime(patch.at_time) : null,
        changed_by_member: author,
      });
      const today = madridToday(new Date());
      const moved =
        before.starts_on !== absence.starts_on ||
        before.ends_on !== absence.ends_on ||
        before.kind !== absence.kind ||
        hhmm(before.at_time) !== hhmm(absence.at_time);
      if (moved && (absence.ends_on >= today || before.ends_on >= today)) {
        postDemoChange(db, {
          author,
          subject: absence.member_id,
          date:
            absence.ends_on >= today ? laterOf(absence.starts_on, today) : laterOf(before.starts_on, today),
          body: absenceEditedText(
            demoMemberName(db, absence.member_id),
            absence.kind,
            absence.at_time,
            absence.starts_on,
            absence.ends_on,
          ),
        });
      }
      return absence;
    }),
  deleteAbsence: async (id, author) =>
    mutate((raw) => {
      const db = raw as CalendarDemoDb;
      const absence = (db.absences ?? []).find((a) => a.id === id);
      if (!absence || !isLive(absence)) return;
      absence.archived_at = now();
      absence.changed_by_member = author;
      const today = madridToday(new Date());
      if (absence.ends_on >= today) {
        postDemoChange(db, {
          author,
          subject: absence.member_id,
          date: laterOf(absence.starts_on, today),
          body: absenceRemovedText(demoMemberName(db, absence.member_id), absence.starts_on, absence.ends_on),
        });
      }
    }),
  listRehearsalRules: () =>
    query((raw) =>
      ((raw as CalendarDemoDb).rehearsal_rules ?? [])
        .filter(isLive)
        .sort((a, b) => a.weekday - b.weekday || a.starts_at.localeCompare(b.starts_at)),
    ),
  insertRehearsalRule: async (row, author) =>
    mutate((raw) => {
      const db = raw as CalendarDemoDb;
      if (!Number.isInteger(row.weekday) || row.weekday < 1 || row.weekday > 7) {
        throw checkViolation('rehearsal_rules_weekday_check', 'rehearsal_rules');
      }
      checkDemoTimes(row.starts_at, row.ends_at, 'rehearsal_rules');
      const rule: RehearsalRule = {
        id: crypto.randomUUID(),
        crew_id: db.crews[0]!.id,
        weekday: row.weekday,
        starts_at: demoTime(row.starts_at),
        ends_at: demoTime(row.ends_at),
        valid_from: madridToday(new Date()),
        valid_until: null,
        changed_by_member: author,
        created_at: now(),
        archived_at: null,
      };
      (db.rehearsal_rules ??= []).push(rule);
      const from = nextWeekday(rule.valid_from, rule.weekday);
      postDemoChange(db, {
        author,
        date: from,
        body: ruleText(rule.weekday, rule.starts_at, rule.ends_at, from, false),
      });
      return rule;
    }),
  editRehearsalRule: async (id, row, author) =>
    mutate((raw) => {
      const db = raw as CalendarDemoDb;
      const today = madridToday(new Date());
      const old = liveDemoRule(db, id, today);
      if (!old) throw demoError('rehearsal_rule_not_found');
      checkDemoTimes(row.starts_at, row.ends_at, 'rehearsal_rules');
      old.valid_until = addDays(today, -1);
      const rule: RehearsalRule = {
        id: crypto.randomUUID(),
        crew_id: old.crew_id,
        weekday: row.weekday,
        starts_at: demoTime(row.starts_at),
        ends_at: demoTime(row.ends_at),
        valid_from: today,
        valid_until: null,
        changed_by_member: author,
        created_at: now(),
        archived_at: null,
      };
      db.rehearsal_rules!.push(rule);
      // Only the new rule speaks (as in edit_rehearsal_rule).
      const from = nextWeekday(today, rule.weekday);
      postDemoChange(db, {
        author,
        date: from,
        body: ruleText(rule.weekday, rule.starts_at, rule.ends_at, from, false),
      });
      if (row.weekday === old.weekday) {
        for (const e of db.rehearsal_exceptions ?? []) {
          if (e.rule_id === old.id && e.kind === 'cancel' && e.on_date >= today && isLive(e))
            e.rule_id = rule.id;
        }
      }
      return rule;
    }),
  endRehearsalRule: async (id, author) =>
    mutate((raw) => {
      const db = raw as CalendarDemoDb;
      const today = madridToday(new Date());
      const rule = liveDemoRule(db, id, today);
      if (!rule) throw demoError('rehearsal_rule_not_found');
      rule.valid_until = addDays(today, -1);
      rule.changed_by_member = author;
      const from = nextWeekday(laterOf(rule.valid_from, today), rule.weekday);
      postDemoChange(db, {
        author,
        date: from,
        body: ruleText(rule.weekday, rule.starts_at, rule.ends_at, from, true),
      });
    }),
  listRehearsalExceptions: (from, to) =>
    query((raw) => {
      const db = raw as CalendarDemoDb;
      const liveRules = new Set((db.rehearsal_rules ?? []).filter(isLive).map((r) => r.id));
      return (db.rehearsal_exceptions ?? [])
        .filter(
          (e) =>
            isLive(e) &&
            e.on_date >= from &&
            e.on_date <= to &&
            (e.rule_id == null || liveRules.has(e.rule_id)),
        )
        .sort((a, b) => a.on_date.localeCompare(b.on_date));
    }),
  insertRehearsalException: async (row, author) =>
    mutate((raw) => {
      const db = raw as CalendarDemoDb;
      if (!isDayKey(row.on_date)) throw demoError('invalid input syntax for type date', '22007');
      const list = (db.rehearsal_exceptions ??= []);
      const base = {
        id: crypto.randomUUID(),
        crew_id: db.crews[0]!.id,
        on_date: row.on_date,
        changed_by_member: author,
        created_at: now(),
        archived_at: null,
      };
      let exception: RehearsalException;
      if (row.kind === 'cancel') {
        const rule = (db.rehearsal_rules ?? []).find((r) => r.id === row.rule_id && isLive(r));
        if (!rule || !ruleRunsOn(rule, row.on_date)) throw demoError('rehearsal_cancel_invalid');
        if (
          list.some(
            (e) => isLive(e) && e.kind === 'cancel' && e.rule_id === row.rule_id && e.on_date === row.on_date,
          )
        ) {
          throw demoError(
            'duplicate key value violates unique constraint "rehearsal_exceptions_cancel_once_key"',
            '23505',
          );
        }
        exception = { ...base, kind: 'cancel', rule_id: row.rule_id, starts_at: null, ends_at: null };
      } else {
        checkDemoTimes(row.starts_at, row.ends_at, 'rehearsal_exceptions');
        exception = {
          ...base,
          kind: 'extra',
          rule_id: null,
          starts_at: demoTime(row.starts_at),
          ends_at: demoTime(row.ends_at),
        };
      }
      list.push(exception);
      if (exception.on_date >= madridToday(new Date())) {
        postDemoChange(db, {
          author,
          date: exception.on_date,
          body:
            exception.kind === 'cancel'
              ? cancelText(exception.on_date)
              : extraText(exception.on_date, exception.starts_at ?? '', exception.ends_at ?? ''),
        });
      }
      return exception;
    }),
  deleteRehearsalException: async (id, author) =>
    mutate((raw) => {
      const db = raw as CalendarDemoDb;
      const exception = (db.rehearsal_exceptions ?? []).find((e) => e.id === id);
      if (!exception || !isLive(exception)) return;
      exception.archived_at = now();
      exception.changed_by_member = author;
      if (exception.on_date < madridToday(new Date())) return;
      if (exception.kind === 'extra') {
        postDemoChange(db, { author, date: exception.on_date, body: extraRemovedText(exception.on_date) });
        return;
      }
      const rule = (db.rehearsal_rules ?? []).find((r) => r.id === exception.rule_id);
      if (rule && isLive(rule) && (rule.valid_until == null || rule.valid_until >= exception.on_date)) {
        postDemoChange(db, { author, date: exception.on_date, body: uncancelText(exception.on_date) });
      }
    }),
  listCalendarChanges: (since) =>
    query((raw) =>
      ((raw as CalendarDemoDb).calendar_changes ?? [])
        .filter((c) => c.created_at > since)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 50),
    ),
};
