/**
 * REQ-08 / REQ-27 · Data access behind one interface per domain (Supabase normally, browser storage in the local
 * demo). This barrel keeps `@/lib/backend` working for every importer; the data layer imports each domain module
 * directly (`@/lib/backend/bags`…) so the entry chunk only carries what the library and the shell use.
 */
export * from './types';
export { cloudLimitBytes, DEMO_USER_ID, IS_DEMO } from './mode';
export { NEW_POLL_RULES } from './shared';
export { backend } from './core';
export { bagsBackend } from './bags';
export { wishesBackend } from './wishes';
export { eventsBackend } from './events';
export { stemsBackend } from './stems';
export { calendarBackend } from './calendar';
export { pushBackend } from './push';
export { formationsBackend } from './formations';
