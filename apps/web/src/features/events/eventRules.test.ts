import { afterEach, describe, expect, it } from 'vitest';
import {
  appendPositions,
  calendarDaysBetween,
  checkEventDraft,
  chorusClips,
  countdown,
  countdownDetail,
  countdownHeadline,
  defaultEventStart,
  fromLocalInput,
  isChorusName,
  litLanterns,
  nearestEvent,
  splitEvents,
  toLocalInput,
  uniqueName,
} from './eventRules';

/** Local wall time on this machine's zone (the tests below pin the zone where it matters). */
const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi);
const iso = (date: Date) => date.toISOString();

const originalTz = process.env.TZ;
function inZone(tz: string) {
  process.env.TZ = tz;
}
afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe('countdown', () => {
  it('counts calendar days to a later day: «Faltan 12 días»', () => {
    const c = countdown(at(2026, 12, 12, 20), at(2026, 11, 30, 9));
    expect(c).toMatchObject({ kind: 'days', days: 12 });
    expect(countdownHeadline(c)).toBe('Faltan 12 días');
    expect(countdownDetail(c)).toBeNull();
  });

  it('says «Falta 1 día» and «Es mañana» for tomorrow with more than a day left', () => {
    const c = countdown(at(2026, 12, 12, 20), at(2026, 12, 11, 8));
    expect(countdownHeadline(c)).toBe('Falta 1 día');
    expect(countdownDetail(c)).toBe('Es mañana');
  });

  it('switches to hours and minutes the last day (less than 24 h, still tomorrow)', () => {
    const c = countdown(at(2026, 12, 12, 10, 30), at(2026, 12, 11, 22, 10));
    expect(c).toMatchObject({ kind: 'hours', hours: 12, minutes: 20 });
    expect(countdownHeadline(c)).toBe('Faltan 12 h 20 min');
  });

  it('rounds up to the minute (never «0 min» before it starts)', () => {
    const start = at(2026, 12, 12, 0, 0);
    const now = new Date(start.getTime() - 20_000);
    expect(countdown(start, now)).toMatchObject({ kind: 'hours', hours: 0, minutes: 1 });
  });

  it('says «Hoy» the day of the event, before and after it starts', () => {
    const before = countdown(at(2026, 12, 12, 20), at(2026, 12, 12, 0, 5));
    expect(before).toMatchObject({ kind: 'today', started: false, hours: 19, minutes: 55 });
    expect(countdownHeadline(before)).toBe('Hoy');
    expect(countdownDetail(before)).toBe('Empieza en 19 h 55 min');
    const after = countdown(at(2026, 12, 12, 20), at(2026, 12, 12, 23, 50));
    expect(after).toMatchObject({ kind: 'today', started: true });
    expect(countdownDetail(after)).toBe('Ya ha empezado');
  });

  it('keeps showing for a day after it starts, then it is past', () => {
    const start = at(2026, 12, 12, 20);
    expect(countdown(start, at(2026, 12, 13, 10)).kind).toBe('recent');
    expect(countdownHeadline(countdown(start, at(2026, 12, 13, 10)))).toBe('Ayer');
    expect(countdown(start, at(2026, 12, 13, 20, 1)).kind).toBe('past');
    expect(countdown(start, at(2027, 1, 20)).kind).toBe('past');
  });

  it('takes ISO strings too', () => {
    expect(countdown(iso(at(2026, 12, 14, 12)), at(2026, 12, 12, 12)).kind).toBe('days');
  });
});

describe('the lanterns (chōchin)', () => {
  const start = at(2026, 12, 12, 20);
  it('one lantern per day of the last week, all on the day and the day after, none when over', () => {
    expect(litLanterns(countdown(start, at(2026, 11, 20)))).toBe(0);
    expect(litLanterns(countdown(start, at(2026, 12, 9, 12)))).toBe(4);
    expect(litLanterns(countdown(start, at(2026, 12, 11, 22)))).toBe(6);
    expect(litLanterns(countdown(start, at(2026, 12, 12, 10)))).toBe(7);
    expect(litLanterns(countdown(start, at(2026, 12, 13, 10)))).toBe(7);
    expect(litLanterns(countdown(start, at(2026, 12, 14, 21)))).toBe(0);
  });

  it('more than a week away: all dark, and the words still say how many days', () => {
    const c = countdown(start, at(2026, 11, 30, 9));
    expect(litLanterns(c)).toBe(0);
    expect(countdownHeadline(c)).toBe('Faltan 12 días');
    const week = countdown(start, at(2026, 12, 5, 12));
    expect(litLanterns(week)).toBe(0);
    expect(countdownHeadline(week)).toBe('Faltan 7 días');
    expect(litLanterns(countdown(start, at(2026, 12, 6, 12)))).toBe(1);
  });

  it('started less than 3 h ago: still «Hoy», all lit; yesterday: «Ayer», all lit; over: «Ya pasó», all dark', () => {
    const live = countdown(start, at(2026, 12, 12, 22));
    expect(live).toMatchObject({ kind: 'today', started: true });
    expect(litLanterns(live)).toBe(7);
    expect(countdownDetail(live)).toBe('Ya ha empezado');
    const yesterday = countdown(start, at(2026, 12, 13, 10));
    expect(countdownHeadline(yesterday)).toBe('Ayer');
    expect(litLanterns(yesterday)).toBe(7);
    const over = countdown(start, at(2026, 12, 14, 21));
    expect(countdownHeadline(over)).toBe('Ya pasó');
    expect(litLanterns(over)).toBe(0);
  });
});

describe('local time zone', () => {
  it('«Hoy» depends on the phone’s calendar, not on UTC', () => {
    const start = '2026-12-12T03:00:00Z';
    const now = new Date('2026-12-11T14:00:00Z');
    inZone('Asia/Tokyo'); // now 23:00 on the 11th, start 12:00 on the 12th
    expect(countdown(start, now)).toMatchObject({ kind: 'hours', hours: 13, minutes: 0 });
    inZone('America/Los_Angeles'); // now 06:00 on the 11th, start 19:00 the same day
    expect(countdown(start, now)).toMatchObject({ kind: 'today', started: false, hours: 13 });
  });

  it('a daylight-saving change never adds or loses a day', () => {
    inZone('Europe/Madrid'); // clocks go back on 25 October 2026
    expect(calendarDaysBetween(new Date(2026, 9, 24, 12), new Date(2026, 9, 26, 12))).toBe(2);
    expect(calendarDaysBetween(new Date(2026, 2, 28, 23), new Date(2026, 2, 29, 23))).toBe(1); // forward in March
    expect(countdown(new Date(2026, 9, 26, 0, 30), new Date(2026, 9, 24, 23, 0))).toMatchObject({ kind: 'days', days: 2 });
  });

  it('round-trips the form’s datetime-local value', () => {
    inZone('Europe/Madrid');
    const value = '2026-12-12T20:00';
    const stored = fromLocalInput(value)!;
    expect(stored).toBe('2026-12-12T19:00:00.000Z');
    expect(toLocalInput(stored)).toBe(value);
  });
});

describe('form', () => {
  it('refuses dates that do not exist or are malformed', () => {
    expect(fromLocalInput('2026-02-31T10:00')).toBeNull();
    expect(fromLocalInput('mañana')).toBeNull();
    expect(fromLocalInput('')).toBeNull();
    expect(toLocalInput('nope')).toBe('');
  });

  it('checks the draft and trims it', () => {
    expect(checkEventDraft({ name: '  ', when: '2026-12-12T20:00', place: '' })).toMatchObject({ ok: false, field: 'name' });
    expect(checkEventDraft({ name: 'x'.repeat(81), when: '2026-12-12T20:00', place: '' })).toMatchObject({ ok: false, field: 'name' });
    expect(checkEventDraft({ name: 'Showcase', when: '', place: '' })).toMatchObject({ ok: false, field: 'when' });
    expect(checkEventDraft({ name: 'Showcase', when: '2026-12-12T20:00', place: 'y'.repeat(121) })).toMatchObject({
      ok: false,
      field: 'place',
    });
    const ok = checkEventDraft({ name: ' Showcase de diciembre ', when: '2026-12-12T20:00', place: '  ' });
    expect(ok).toMatchObject({ ok: true, row: { name: 'Showcase de diciembre', place: null } });
  });

  it('suggests next Saturday at 19:00', () => {
    expect(defaultEventStart(at(2026, 10, 16, 12))).toBe('2026-10-17T19:00'); // a Friday
    expect(defaultEventStart(at(2026, 10, 17, 12))).toBe('2026-10-24T19:00'); // a Saturday: the next one
  });
});

describe('which event the home page shows', () => {
  const now = at(2026, 12, 1, 12);
  const ev = (id: string, date: Date) => ({ id, starts_at: iso(date) });

  it('picks the nearest one still to come', () => {
    const events = [ev('far', at(2027, 2, 1)), ev('near', at(2026, 12, 12, 20)), ev('mid', at(2026, 12, 20))];
    expect(nearestEvent(events, now)?.id).toBe('near');
  });

  it('keeps one that has started ahead of the next for 3 h only, then counts down to the next', () => {
    const events = [ev('morning', at(2026, 12, 1, 10)), ev('evening', at(2026, 12, 1, 20)), ev('later', at(2026, 12, 5))];
    expect(nearestEvent(events, at(2026, 12, 1, 9))?.id).toBe('morning'); // to come, the nearest
    expect(nearestEvent(events, at(2026, 12, 1, 12))?.id).toBe('morning'); // on now (2 h in)
    expect(nearestEvent(events, at(2026, 12, 1, 13, 1))?.id).toBe('evening'); // 3 h later: the next one
    expect(nearestEvent(events, at(2026, 12, 1, 21))?.id).toBe('evening'); // the evening one is on now
    expect(nearestEvent(events, at(2026, 12, 1, 23, 30))?.id).toBe('later'); // over 3 h: the next one
  });

  it('with nothing to come, shows the latest one that started today', () => {
    const events = [ev('morning', at(2026, 12, 1, 10)), ev('evening', at(2026, 12, 1, 20))];
    expect(nearestEvent(events, at(2026, 12, 1, 23, 30))?.id).toBe('evening');
  });

  it('shows yesterday’s one only while nothing else is coming, and drops older ones', () => {
    const events = [ev('yesterday', at(2026, 11, 30, 20)), ev('old', at(2026, 11, 20)), ev('next', at(2026, 12, 5))];
    expect(nearestEvent(events, now)?.id).toBe('next');
    expect(nearestEvent(events.slice(0, 2), now)?.id).toBe('yesterday');
    expect(nearestEvent(events.slice(0, 2), at(2026, 12, 1, 20, 1))).toBeNull();
  });

  it('is null with nothing to come (past events are kept, just not shown)', () => {
    expect(nearestEvent([ev('old', at(2026, 11, 1))], now)).toBeNull();
    expect(nearestEvent([], now)).toBeNull();
    expect(nearestEvent([{ id: 'bad', starts_at: 'nope' }], now)).toBeNull();
  });

  it('splits the list: upcoming soonest first, past latest first', () => {
    const events = [ev('a', at(2026, 11, 1)), ev('b', at(2026, 12, 20)), ev('c', at(2026, 11, 15)), ev('d', at(2026, 12, 3))];
    const { upcoming, past } = splitEvents(events, now);
    expect(upcoming.map((e) => e.id)).toEqual(['d', 'b']);
    expect(past.map((e) => e.id)).toEqual(['c', 'a']);
  });
});

describe('connections', () => {
  it('finds a free name within the length limit', () => {
    expect(uniqueName('Candidatas · Showcase', [], 60)).toBe('Candidatas · Showcase');
    expect(uniqueName('Candidatas · Showcase', ['candidatas · showcase'], 60)).toBe('Candidatas · Showcase (2)');
    expect(uniqueName('Bolsa', ['Bolsa', 'Bolsa (2)'], 60)).toBe('Bolsa (3)');
    const long = uniqueName('x'.repeat(70), ['x'.repeat(60)], 60);
    expect(long).toHaveLength(60);
    expect(long.endsWith(' (2)')).toBe(true);
  });

  it('takes the choruses of each song in the repertoire order, or all its clips', () => {
    const clips = [
      { id: 'a2', video_id: 'A', name: 'Estribillo 2', start_seconds: 90 },
      { id: 'a1', video_id: 'A', name: 'estribillo', start_seconds: 40 },
      { id: 'a0', video_id: 'A', name: 'Intro', start_seconds: 0 },
      { id: 'b1', video_id: 'B', name: 'Puente', start_seconds: 70 },
      { id: 'b0', video_id: 'B', name: 'Dance break', start_seconds: 10 },
      { id: 'c0', video_id: 'C', name: 'Chorus', start_seconds: 5 },
      { id: 'z', video_id: 'Z', name: 'Estribillo', start_seconds: 5 },
    ];
    expect(chorusClips(['B', 'A', 'C', 'D'], clips).map((c) => c.id)).toEqual(['b0', 'b1', 'a1', 'a2', 'c0']);
    expect(chorusClips([], clips)).toEqual([]);
  });

  it('knows a chorus by its whole word, never pre/post or inside another word', () => {
    for (const yes of ['Estribillo', 'Estribillo final', 'estribillo 2', 'Coro 2', 'Chorus', 'Final chorus', 'Hook', 'Estribillos'])
      expect(isChorusName(yes), yes).toBe(true);
    for (const no of ['Pre-estribillo', 'Pre estribillo', 'Post-chorus', 'pre_chorus', 'Hooked', 'Shook', 'Coreografía', 'Intro', 'Preestribillo'])
      expect(isChorusName(no), no).toBe(false);
    const clips = [
      { id: 'p', video_id: 'A', name: 'Pre-estribillo', start_seconds: 30 },
      { id: 'e', video_id: 'A', name: 'Estribillo', start_seconds: 40 },
    ];
    expect(chorusClips(['A'], clips).map((c) => c.id)).toEqual(['e']);
  });

  it('appends songs after the last position', () => {
    expect(appendPositions([], 2)).toEqual([0, 1]);
    expect(appendPositions([{ position: 0 }, { position: 4 }], 2)).toEqual([5, 6]);
  });
});
