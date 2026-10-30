import { describe, expect, it } from 'vitest';
import {
  checkTimes,
  clashingSessions,
  currentRules,
  overlappingRules,
  ruleLabel,
  ruleRunsOn,
  sessionsBetween,
  sessionsByDay,
  type ExceptionLike,
  type RuleLike,
} from './rehearsalRules';

const rule = (over: Partial<RuleLike>): RuleLike => ({
  id: 'wed',
  weekday: 3,
  starts_at: '18:00:00',
  ends_at: '20:00:00',
  valid_from: '2026-10-01',
  valid_until: null,
  ...over,
});

const WED = rule({});
const FRI = rule({ id: 'fri', weekday: 5, ends_at: '21:00:00' });

describe('sessionsBetween', () => {
  it('puts a session on every matching weekday while the rule is valid', () => {
    const sessions = sessionsBetween('2026-11-01', '2026-11-15', [WED, FRI], []);
    expect(sessions.map((s) => `${s.day} ${s.starts}-${s.ends}`)).toEqual([
      '2026-11-04 18:00-20:00',
      '2026-11-06 18:00-21:00',
      '2026-11-11 18:00-20:00',
      '2026-11-13 18:00-21:00',
    ]);
  });

  it('respects valid_from and valid_until (an edit keeps past weeks)', () => {
    const old = rule({ valid_until: '2026-11-09' });
    const edited = rule({ id: 'wed2', ends_at: '21:00:00', valid_from: '2026-11-10' });
    const sessions = sessionsBetween('2026-11-01', '2026-11-15', [old, edited], []);
    expect(sessions.map((s) => `${s.day} ${s.ends} ${s.ruleId}`)).toEqual(['2026-11-04 20:00 wed', '2026-11-11 21:00 wed2']);
  });

  it('tolerates a rule created and edited the same day (valid_until < valid_from)', () => {
    const empty = rule({ valid_from: '2026-11-04', valid_until: '2026-11-03' });
    expect(sessionsBetween('2026-10-01', '2026-12-31', [empty], [])).toEqual([]);
    expect(ruleRunsOn(empty, '2026-11-04')).toBe(false);
  });

  it('marks cancelled sessions and keeps them', () => {
    const cancel: ExceptionLike = { id: 'c1', on_date: '2026-11-06', kind: 'cancel', rule_id: 'fri', starts_at: null, ends_at: null };
    const sessions = sessionsBetween('2026-11-06', '2026-11-06', [WED, FRI], [cancel, { ...cancel, id: 'c2' }]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ day: '2026-11-06', cancelled: true, ruleId: 'fri' });
    expect(['c1', 'c2']).toContain(sessions[0]!.exceptionId);
  });

  it('adds one-off rehearsals, also on a rule’s day at the same time', () => {
    const extras: ExceptionLike[] = [
      { id: 'x1', on_date: '2026-11-07', kind: 'extra', rule_id: null, starts_at: '11:00:00', ends_at: '13:00:00' },
      { id: 'x2', on_date: '2026-11-04', kind: 'extra', rule_id: null, starts_at: '18:00:00', ends_at: '20:00:00' },
      { id: 'x3', on_date: '2026-12-01', kind: 'extra', rule_id: null, starts_at: '11:00:00', ends_at: '13:00:00' },
    ];
    const sessions = sessionsBetween('2026-11-02', '2026-11-08', [WED], extras);
    expect(sessions.map((s) => s.key)).toEqual(['wed|2026-11-04', 'x2', 'x1']);
    expect(sessions.find((s) => s.key === 'x1')).toMatchObject({ ruleId: null, exceptionId: 'x1', cancelled: false, starts: '11:00' });
    expect(sessionsByDay(sessions).get('2026-11-04')).toHaveLength(2);
  });
});

describe('rule list and labels', () => {
  it('lists the rules running from today on, by weekday', () => {
    const ended = rule({ id: 'old', valid_until: '2026-10-29' });
    const future = rule({ id: 'mon', weekday: 1, valid_from: '2026-10-30' });
    expect(currentRules([FRI, ended, WED, future], '2026-10-30').map((r) => r.id)).toEqual(['mon', 'wed', 'fri']);
  });

  it('labels a rule in Spanish', () => {
    expect(ruleLabel(WED)).toBe('Miércoles · 18:00–20:00');
  });

  it('warns about overlapping rules on the same weekday', () => {
    expect(overlappingRules({ weekday: 3, starts: '19:00', ends: '21:00' }, [WED, FRI], '2026-10-30').map((r) => r.id)).toEqual(['wed']);
    expect(overlappingRules({ weekday: 3, starts: '20:00', ends: '21:00' }, [WED], '2026-10-30')).toEqual([]);
    expect(overlappingRules({ weekday: 3, starts: '19:00', ends: '21:00' }, [WED], '2026-10-30', 'wed')).toEqual([]);
  });

  it('warns about one-offs clashing with a live session', () => {
    const sessions = sessionsBetween('2026-11-04', '2026-11-04', [WED], []);
    expect(clashingSessions('2026-11-04', '19:00', '20:30', sessions)).toHaveLength(1);
    expect(clashingSessions('2026-11-04', '20:00', '21:00', sessions)).toHaveLength(0);
  });

  it('checks start and end times', () => {
    expect(checkTimes('18:00', '20:00')).toEqual({ ok: true, starts: '18:00', ends: '20:00' });
    expect(checkTimes('20:00', '18:00').ok).toBe(false);
    expect(checkTimes('', '18:00').ok).toBe(false);
  });
});
