/**
 * REQ-08 / REQ-27 · Data access behind one interface per domain (Supabase normally, browser storage in the local
 * demo). This barrel keeps `@/lib/backend` working for every importer; the data layer imports each domain module
 * directly (`@/lib/backend/bags`…) so the entry chunk only carries what the library and the shell use.
 */
export * from './types';
