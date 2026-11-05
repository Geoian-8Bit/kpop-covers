import { demoCalendar } from './calendar.demo';
import { supabaseCalendar } from './calendar.supabase';
import { IS_DEMO } from './mode';
import type { CalendarBackend } from './types';

// REQ-08 · `IS_DEMO` is a build-time constant (false in production), so the demo branch and its module drop out.
export const calendarBackend: CalendarBackend = IS_DEMO ? demoCalendar : supabaseCalendar;

export type {
  AbsencePatch,
  CalendarBackend,
  CalendarMember,
  NewAbsence,
  NewRehearsalException,
  NewRehearsalRule,
} from './types';
