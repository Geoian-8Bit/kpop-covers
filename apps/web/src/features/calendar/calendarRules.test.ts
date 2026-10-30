import { describe, expect, it } from 'vitest';
import {
  absenceKindLabel,
  absencesOn,
  absentMembers,
  addDays,
  checkAbsenceDraft,
  dayDots,
  dayLabel,
  daysBetween,
  gridRange,
  hhmm,
  isDayKey,
  isoWeekday,
  madridClock,
  madridToday,
  monthGrid,
  monthLabel,
  rangeLabel,
  shiftMonth,
  type AbsenceDraft,
  type AbsenceLike,
} from './calendarRules';

describe('day keys', () => {
  it('adds days across months, years and the DST change', () => {
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-12-08', '2026-12-12')).toBe(4);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
  });

  it('gives the ISO weekday (Monday = 1)', () => {
    expect(isoWeekday('2026-10-26')).toBe(1);
    expect(isoWeekday('2026-10-28')).toBe(3);
    expect(isoWeekday('2026-11-01')).toBe(7);
  });

  it('validates keys', () => {
    expect(isDayKey('2026-02-28')).toBe(true);
    expect(isDayKey('2026-02-30')).toBe(false);
    expect(isDayKey('')).toBe(false);
    expect(isDayKey(null)).toBe(false);
  });

  it('reads today in Madrid, not in the phone’s zone', () => {
    // 23:30 UTC on 30 Oct is already 31 Oct at 00:30 in Madrid (winter time).
    expect(madridToday(new Date('2026-10-30T23:30:00Z'))).toBe('2026-10-31');
    expect(madridToday(new Date('2026-07-01T21:59:00Z'))).toBe('2026-07-01');
    expect(madridToday(new Date('2026-07-01T22:00:00Z'))).toBe('2026-07-02');
  });
});

describe('monthGrid', () => {
  it('starts on Monday and covers whole weeks', () => {
    const weeks = monthGrid({ year: 2026, month: 9 }); // October 2026 starts on a Thursday
    expect(weeks[0]![0]!.day).toBe('2026-09-28');
    expect(weeks[0]![3]).toEqual({ day: '2026-10-01', inMonth: true });
    expect(weeks[0]![0]!.inMonth).toBe(false);
    const last = weeks[weeks.length - 1]!;
    expect(last[6]!.day).toBe('2026-11-01');
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(gridRange({ year: 2026, month: 9 })).toEqual({ from: '2026-09-28', to: '2026-11-01' });
  });

  it('handles a month that starts on Monday and February', () => {
    const feb = monthGrid({ year: 2027, month: 1 }); // 1 Feb 2027 is a Monday
    expect(feb[0]![0]!.day).toBe('2027-02-01');
    expect(feb).toHaveLength(4);
  });

  it('moves between months and names them', () => {
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(monthLabel({ year: 2026, month: 8 })).toBe('septiembre 2026');
  });
});

describe('labels', () => {
  it('uses Spanish lowercase abbreviations', () => {
    expect(dayLabel('2026-12-09')).toBe('miér 9 dic');
    expect(dayLabel('2026-09-12')).toBe('sáb 12 sept');
    expect(rangeLabel('2026-12-08', '2026-12-12')).toBe('8–12 dic');
    expect(rangeLabel('2026-12-30', '2027-01-02')).toBe('30 dic – 2 ene');
    expect(rangeLabel('2026-12-08', '2026-12-08')).toBe('mar 8 dic');
  });

  it('formats times and absence kinds', () => {
    expect(hhmm('19:00:00')).toBe('19:00');
    expect(hhmm(null)).toBe('');
    expect(absenceKindLabel('all_day', null)).toBe('No puede');
    expect(absenceKindLabel('arrives', '19:00:00')).toBe('Llega a las 19:00');
    expect(absenceKindLabel('leaves', '20:30')).toBe('Se va a las 20:30');
  });
});

const absence = (over: Partial<AbsenceLike>): AbsenceLike => ({
  id: 'a',
  member_id: 'ana',
  starts_on: '2026-12-08',
  ends_on: '2026-12-12',
  kind: 'all_day',
  at_time: null,
  ...over,
});

describe('absences on a day', () => {
  const list = [
    absence({ id: '1' }),
    absence({ id: '2', member_id: 'bea', starts_on: '2026-12-09', ends_on: '2026-12-09', kind: 'arrives', at_time: '19:00:00' }),
    absence({ id: '3', member_id: 'ana', starts_on: '2026-12-09', ends_on: '2026-12-09', kind: 'leaves', at_time: '20:00:00' }),
  ];

  it('covers every day of a range and keeps overlaps', () => {
    for (const day of ['2026-12-08', '2026-12-10', '2026-12-12']) expect(absencesOn(list, day).map((a) => a.id)).toEqual(['1']);
    expect(absencesOn(list, '2026-12-13')).toEqual([]);
    expect(absencesOn(list, '2026-12-09').map((a) => a.id)).toEqual(['1', '2', '3']);
  });

  it('counts each person once', () => {
    expect(absentMembers(list, '2026-12-09')).toEqual(['ana', 'bea']);
  });

  it('shows up to 4 dots, then 3 and +N', () => {
    expect(dayDots(['a', 'b', 'c', 'd'])).toEqual({ shown: ['a', 'b', 'c', 'd'], extra: 0 });
    expect(dayDots(['a', 'b', 'c', 'd', 'e', 'f'])).toEqual({ shown: ['a', 'b', 'c'], extra: 3 });
  });
});

describe('checkAbsenceDraft', () => {
  const draft = (over: Partial<AbsenceDraft>): AbsenceDraft => ({
    memberId: 'ana',
    from: '2026-12-08',
    to: '2026-12-12',
    kind: 'all_day',
    time: '',
    note: '',
    ...over,
  });

  it('accepts a range as one row', () => {
    expect(checkAbsenceDraft(draft({}))).toEqual({
      ok: true,
      row: { member_id: 'ana', starts_on: '2026-12-08', ends_on: '2026-12-12', kind: 'all_day', at_time: null, note: null },
    });
  });

  it('keeps the time only with «llega» / «se va» and trims the note', () => {
    const check = checkAbsenceDraft(draft({ kind: 'arrives', time: '19:00', note: '  tarde  ' }));
    expect(check.ok && check.row).toMatchObject({ kind: 'arrives', at_time: '19:00', note: 'tarde' });
    const whole = checkAbsenceDraft(draft({ time: '19:00' }));
    expect(whole.ok && whole.row.at_time).toBeNull();
  });

  it('refuses what the database refuses', () => {
    expect(checkAbsenceDraft(draft({ memberId: null }))).toMatchObject({ ok: false, field: 'member' });
    expect(checkAbsenceDraft(draft({ to: '2026-12-01' }))).toMatchObject({ ok: false, field: 'to' });
    expect(checkAbsenceDraft(draft({ from: '2026-12-01', to: '2027-01-31' }))).toMatchObject({ ok: false, field: 'to' });
    expect(checkAbsenceDraft(draft({ from: '2026-12-01', to: '2027-01-30' })).ok).toBe(true);
    expect(checkAbsenceDraft(draft({ kind: 'leaves', time: '' }))).toMatchObject({ ok: false, field: 'time' });
    expect(checkAbsenceDraft(draft({ note: 'a'.repeat(141) }))).toMatchObject({ ok: false, field: 'note' });
  });
});

describe('madridClock', () => {
  it('places an instant on Madrid’s day and wall clock', () => {
    expect(madridClock('2026-12-31T23:15:00Z')).toEqual({ day: '2027-01-01', time: '00:15' });
    expect(madridClock('2026-07-10T16:00:00Z')).toEqual({ day: '2026-07-10', time: '18:00' });
  });
});
