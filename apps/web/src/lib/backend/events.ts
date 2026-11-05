import { demoEvents } from './events.demo';
import { supabaseEvents } from './events.supabase';
import { IS_DEMO } from './mode';
import type { EventsBackend } from './types';

// REQ-08 · `IS_DEMO` is a build-time constant (false in production), so the demo branch and its module drop out.
export const eventsBackend: EventsBackend = IS_DEMO ? demoEvents : supabaseEvents;

export type { EventPatch, EventsBackend, EventSongView, EventWithCount, NewEvent } from './types';
