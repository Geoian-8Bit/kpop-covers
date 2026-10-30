import type { AbsenceKind } from '@coverscape/shared';
import { addDays, dayLabel, hhmm, isoWeekday, MONTHS_SHORT } from './calendarRules';

/**
 * REQ-05 · The texts of the calendar's change feed. The database composes them (migration
 * `20261030120000_calendar_push.sql`, `private.calendar_*_text`); this twin writes the same words for the local demo
 * and for the unseen-dot rules. Covered by `calendarFeedRules.test.ts`; keep both in step.
 */

const WEEKDAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const;
const WEEKDAY_PLURALS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'] as const;

const dayOf = (day: string) => Number(day.slice(8, 10));
const monthOf = (day: string) => MONTHS_SHORT[Number(day.slice(5, 7)) - 1];

/** «el sáb 8 nov» · «del 8 al 12 nov» · «del 30 oct al 2 nov». */
export function feedSpan(from: string, to: string): string {
  if (to <= from) return `el ${dayLabel(from)}`;
  if (from.slice(0, 7) === to.slice(0, 7)) return `del ${dayOf(from)} al ${dayOf(to)} ${monthOf(to)}`;
  return `del ${dayOf(from)} ${monthOf(from)} al ${dayOf(to)} ${monthOf(to)}`;
}

const who = (name: string | null | undefined) => name?.trim() || 'Alguien';

/** «Ana no puede el sáb 8 nov» · «Ana llega a las 19:00 …» · «Ana se va a las 20:00 …». */
export function absenceText(name: string | null | undefined, kind: AbsenceKind, atTime: string | null, from: string, to: string): string {
  const what = kind === 'arrives' ? `llega a las ${hhmm(atTime)}` : kind === 'leaves' ? `se va a las ${hhmm(atTime)}` : 'no puede';
  return `${who(name)} ${what} ${feedSpan(from, to)}`;
}

export function absenceEditedText(name: string | null | undefined, kind: AbsenceKind, atTime: string | null, from: string, to: string): string {
  return `Cambio: ${absenceText(name, kind, atTime, from, to)}`;
}

export function absenceRemovedText(name: string | null | undefined, from: string, to: string): string {
  return `${who(name)} ya puede ${feedSpan(from, to)}`;
}

/** First day on or after `from` that falls on that ISO weekday (1 = Monday). */
export function nextWeekday(from: string, weekday: number): string {
  return addDays(from, (weekday - isoWeekday(from) + 7) % 7);
}

/** «Desde el miércoles 5, ensayo los miércoles de 18:00 a 21:00» · «…, ya no hay ensayo los miércoles». */
export function ruleText(weekday: number, startsAt: string, endsAt: string, from: string, ended: boolean): string {
  const head = `Desde el ${WEEKDAY_NAMES[weekday - 1]} ${dayOf(from)}, `;
  const plural = WEEKDAY_PLURALS[weekday - 1];
  return ended ? `${head}ya no hay ensayo los ${plural}` : `${head}ensayo los ${plural} de ${hhmm(startsAt)} a ${hhmm(endsAt)}`;
}

export const cancelText = (day: string) => `Cancelado el ensayo del ${dayLabel(day)}`;
export const uncancelText = (day: string) => `Vuelve el ensayo del ${dayLabel(day)}`;
export const extraText = (day: string, startsAt: string, endsAt: string) =>
  `Ensayo extra el ${dayLabel(day)} de ${hhmm(startsAt)} a ${hhmm(endsAt)}`;
export const extraRemovedText = (day: string) => `Ya no hay ensayo extra el ${dayLabel(day)}`;
