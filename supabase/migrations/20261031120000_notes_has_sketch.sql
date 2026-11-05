-- One Shoot · Notas sin dibujos en la lista (REQ-17).
-- A take note may carry a sketch (base64, up to 60 000 chars). The studio list only needs the timeline dots, so it
-- stops selecting `sketch` and reads this flag instead; the sketches come in a separate query for the notes that
-- have one.
--
-- Additive and data-free: Postgres fills the generated column for every existing row. Generated columns cannot be
-- written, so the update grant on notes stays as it is; RLS / delete = archive unchanged.
-- Apply it BEFORE deploying the client that selects `has_sketch`.
-- Checks: supabase/tests/notes_has_sketch_checks.sql.

alter table public.notes
  add column if not exists has_sketch boolean generated always as (sketch is not null) stored;

comment on column public.notes.has_sketch is 'REQ-17: true when the note carries a sketch (fetched apart from the list).';
