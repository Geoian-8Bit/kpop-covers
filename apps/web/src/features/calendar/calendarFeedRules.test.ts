import { describe, expect, it } from 'vitest';
import {
  absenceEditedText,
  absenceRemovedText,
  absenceText,
  cancelText,
  extraRemovedText,
  extraText,
  feedSpan,
  nextWeekday,
  ruleText,
  uncancelText,
} from './calendarFeedRules';

// Same cases as supabase/tests/calendar_push_checks.sql: 2031-11-07 is a Friday, 2031-11-08 a Saturday.
describe('calendar feed texts (twin of the database)', () => {
  it('spans one day, a range in one month and one across months', () => {
    expect(feedSpan('2031-11-08', '2031-11-08')).toBe('el sáb 8 nov');
    expect(feedSpan('2031-11-08', '2031-11-12')).toBe('del 8 al 12 nov');
    expect(feedSpan('2031-10-30', '2031-11-02')).toBe('del 30 oct al 2 nov');
  });

  it('absences: all day, arrives, leaves, edited and removed', () => {
    expect(absenceText('Ana', 'all_day', null, '2031-11-08', '2031-11-08')).toBe('Ana no puede el sáb 8 nov');
    expect(absenceText('Ana', 'arrives', '19:00:00', '2031-11-08', '2031-11-08')).toBe('Ana llega a las 19:00 el sáb 8 nov');
    expect(absenceText('Ana', 'leaves', '20:00', '2031-11-08', '2031-11-08')).toBe('Ana se va a las 20:00 el sáb 8 nov');
    expect(absenceText('Ana', 'all_day', null, '2031-11-08', '2031-11-12')).toBe('Ana no puede del 8 al 12 nov');
    expect(absenceEditedText('Ana', 'leaves', '20:00', '2031-11-08', '2031-11-08')).toBe('Cambio: Ana se va a las 20:00 el sáb 8 nov');
    expect(absenceRemovedText('Ana', '2031-11-08', '2031-11-12')).toBe('Ana ya puede del 8 al 12 nov');
    expect(absenceText('  ', 'all_day', null, '2031-11-08', '2031-11-08')).toBe('Alguien no puede el sáb 8 nov');
  });

  it('weekly rules start on the next day of that weekday', () => {
    expect(nextWeekday('2031-11-07', 3)).toBe('2031-11-12');
    expect(nextWeekday('2031-11-12', 3)).toBe('2031-11-12');
    expect(ruleText(3, '18:00:00', '21:00:00', '2031-11-12', false)).toBe('Desde el miércoles 12, ensayo los miércoles de 18:00 a 21:00');
    expect(ruleText(3, '18:00', '21:00', '2031-11-12', true)).toBe('Desde el miércoles 12, ya no hay ensayo los miércoles');
    expect(ruleText(6, '10:00', '12:00', '2031-11-08', false)).toBe('Desde el sábado 8, ensayo los sábados de 10:00 a 12:00');
  });

  it('exceptions', () => {
    expect(cancelText('2031-11-07')).toBe('Cancelado el ensayo del vie 7 nov');
    expect(uncancelText('2031-11-07')).toBe('Vuelve el ensayo del vie 7 nov');
    expect(extraText('2031-11-08', '18:00:00', '20:00:00')).toBe('Ensayo extra el sáb 8 nov de 18:00 a 20:00');
    expect(extraRemovedText('2031-11-08')).toBe('Ya no hay ensayo extra el sáb 8 nov');
  });
});
