-- Archive instead of delete + hardening of the open (no-login) single group.
--
-- Owner's decision: "archivar, no borrar". Anyone with the URL can still press «Borrar» in the app, but for client
-- roles (anon / authenticated) the row is only archived: it disappears from the app and stays in the database, where
-- the admin can bring it back. Real deletes stay possible for postgres / service_role (dashboard, SQL editor).
--
--  1) archived_at on videos, clips and notes.
--  2) BEFORE DELETE triggers: for anon/authenticated a DELETE becomes `archived_at = now()` and the delete is cancelled
--     (the request still answers 204, so the current client code keeps working). Archiving a video also archives its
--     clips and notes with the same timestamp. More than 3 rows in one statement → `bulk_delete_blocked` (the code the
--     client already maps). The old AFTER DELETE guard now only applies to client roles, so the admin can bulk-delete.
--     Restore by hand, e.g.:
--       update public.videos set archived_at = null where id = '<video>';
--       update public.clips  set archived_at = null where video_id = '<video>' and archived_at = '<same timestamp>';
--       update public.notes  set archived_at = null where video_id = '<video>' and archived_at = '<same timestamp>';
--  3) RLS: the open `for all` policies are split per command and hide archived rows; clips and notes of an archived
--     video are hidden too. The legacy per-member policies (`videos_all`, `clips_all`, old storage policies) are
--     dropped: they OR-ed with the open ones and would have shown archived rows (and allowed unshaped uploads/deletes)
--     to old signed-in sessions. Everybody now works through the open policies of the single group.
--  4) Unique constraints become partial unique indexes `where archived_at is null`, with the SAME names, so an
--     archived YouTube video / clip / note can be added again and `friendlyError` (apps/web/src/lib/supabase.ts)
--     still recognises `videos_crew_youtube_key`, `clips_video_range_key`, `notes_video_at_body_key`.
--  5) Storage (bucket `videos`): clients can no longer delete objects (no DELETE policy, no UPDATE policy → no
--     overwrite either). Upload needs a live `source = 'upload'` video row of the default group whose id is the file
--     name (`<group>/<video id>.<ext>`), whose storage_path is still empty or equal to that name, and no other file
--     for that video yet. Read (and so createSignedUrl / list) needs the same live video row. Archived videos' files
--     stay in the bucket but are no longer readable from the client.
--     ⚠ The client must therefore insert the video row BEFORE uploading, then set storage_path (review item 3.6).
--  6) Row caps (review 3.5): the crew is taken from the parent video for clips/notes (the client-sent crew_id is no
--     longer trusted, and `*_row_cap` fires before `*_set_crew` alphabetically), counting is serialised per
--     table+crew with pg_advisory_xact_lock, and the cap counts live rows only (500 / 5000 / 5000) plus a hard cap of
--     4× on all rows including archived ones, so delete/re-add loops can't grow the table forever.
--  7) Client-settable columns on insert: created_by := auth.uid() (null for anon), created_at/updated_at := now(),
--     archived_at := null. storage_path must be `<crew>/<this video id>.<ext>` (no pointing at another video's file)
--     and, for clients, can only be set once (null → value).
--  8) Function privileges: new functions in schema `private` are not executable by visitors by default, and every
--     existing function in schema `private` is re-revoked, then only the helpers that RLS needs are granted again.
--  9) crews: deleting the creator's auth user no longer cascades to the whole library (created_by → on delete set
--     null). Hiding invite_code / created_by from anon needs a client change first (see the commented block).
-- 10) private.default_group(): deterministic tiebreak (created_at, id). Also re-assert the bucket settings.

-- ─────────────────────────────────────────────────────────────
-- 1) archived_at
-- ─────────────────────────────────────────────────────────────

alter table public.videos add column if not exists archived_at timestamptz;
alter table public.clips  add column if not exists archived_at timestamptz;
alter table public.notes  add column if not exists archived_at timestamptz;

-- ─────────────────────────────────────────────────────────────
-- 10) Default group: oldest crew, ties broken by id
-- ─────────────────────────────────────────────────────────────

create or replace function private.default_group()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.crews order by created_at, id limit 1;
$$;

-- ─────────────────────────────────────────────────────────────
-- 2) Delete → archive
-- ─────────────────────────────────────────────────────────────

-- Does the archiving with the owner's rights (clients have no UPDATE on archived_at). Only callable from a trigger.
create or replace function private.archive_row(p_table text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() < 1 then
    raise exception 'archive_row only runs from the delete trigger';
  end if;
  if p_table = 'videos' then
    update public.videos set archived_at = now() where id = p_id and archived_at is null;
    update public.clips  set archived_at = now() where video_id = p_id and archived_at is null;
    update public.notes  set archived_at = now() where video_id = p_id and archived_at is null;
  elsif p_table = 'clips' then
    update public.clips set archived_at = now() where id = p_id and archived_at is null;
  elsif p_table = 'notes' then
    update public.notes set archived_at = now() where id = p_id and archived_at is null;
  else
    raise exception 'archive_row: unexpected table %', p_table;
  end if;
end;
$$;

-- SECURITY INVOKER on purpose: current_user is the role that ran the DELETE (anon / authenticated from the API;
-- postgres / service_role for the admin; RI cascades run as the table owner, so they really delete).
create or replace function private.archive_instead_of_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_stmt  text := statement_timestamp()::text;
  v_state text := current_setting('app.archive_burst', true);
  v_count int := 1;
begin
  if current_user::text not in ('anon', 'authenticated') then
    return old;
  end if;
  -- The app archives one row per request: more than 3 in the same statement is a script.
  if v_state is not null and split_part(v_state, '|', 1) = v_stmt then
    v_count := split_part(v_state, '|', 2)::int + 1;
  end if;
  if v_count > 3 then
    raise exception 'bulk_delete_blocked' using errcode = 'P0001';
  end if;
  perform set_config('app.archive_burst', v_stmt || '|' || v_count, true);
  perform private.archive_row(tg_table_name, old.id);
  return null; -- cancel the real delete
end;
$$;

drop trigger if exists videos_archive_on_delete on public.videos;
create trigger videos_archive_on_delete before delete on public.videos
  for each row execute function private.archive_instead_of_delete();
drop trigger if exists clips_archive_on_delete on public.clips;
create trigger clips_archive_on_delete before delete on public.clips
  for each row execute function private.archive_instead_of_delete();
drop trigger if exists notes_archive_on_delete on public.notes;
create trigger notes_archive_on_delete before delete on public.notes
  for each row execute function private.archive_instead_of_delete();

-- Defence in depth if the archive triggers are ever disabled: client roles still can't wipe in bulk. The admin can.
create or replace function private.guard_bulk_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user::text in ('anon', 'authenticated')
     and pg_trigger_depth() = 1
     and (select count(*) from gone) > 3 then
    raise exception 'bulk_delete_blocked' using errcode = 'P0001';
  end if;
  return null;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3) RLS: hide archived rows (and children of archived videos)
-- ─────────────────────────────────────────────────────────────

-- Legacy per-member policies from the login era (they would OR in archived rows).
drop policy if exists videos_all on public.videos;
drop policy if exists clips_all on public.clips;

drop policy if exists videos_open_all on public.videos;
drop policy if exists videos_open_select on public.videos;
drop policy if exists videos_open_insert on public.videos;
drop policy if exists videos_open_update on public.videos;
drop policy if exists videos_open_delete on public.videos;
create policy videos_open_select on public.videos for select to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);
create policy videos_open_insert on public.videos for insert to anon, authenticated
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy videos_open_update on public.videos for update to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null)
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy videos_open_delete on public.videos for delete to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);

drop policy if exists clips_open_all on public.clips;
drop policy if exists clips_open_select on public.clips;
drop policy if exists clips_open_insert on public.clips;
drop policy if exists clips_open_update on public.clips;
drop policy if exists clips_open_delete on public.clips;
create policy clips_open_select on public.clips for select to anon, authenticated
  using (
    crew_id = (select private.default_group()) and archived_at is null
    and exists (select 1 from public.videos v where v.id = clips.video_id and v.archived_at is null)
  );
create policy clips_open_insert on public.clips for insert to anon, authenticated
  with check (
    crew_id = (select private.default_group()) and archived_at is null
    and exists (select 1 from public.videos v where v.id = clips.video_id and v.archived_at is null)
  );
create policy clips_open_update on public.clips for update to anon, authenticated
  using (
    crew_id = (select private.default_group()) and archived_at is null
    and exists (select 1 from public.videos v where v.id = clips.video_id and v.archived_at is null)
  )
  with check (
    crew_id = (select private.default_group()) and archived_at is null
    and exists (select 1 from public.videos v where v.id = clips.video_id and v.archived_at is null)
  );
create policy clips_open_delete on public.clips for delete to anon, authenticated
  using (
    crew_id = (select private.default_group()) and archived_at is null
    and exists (select 1 from public.videos v where v.id = clips.video_id and v.archived_at is null)
  );

drop policy if exists notes_open_all on public.notes;
drop policy if exists notes_open_select on public.notes;
drop policy if exists notes_open_insert on public.notes;
drop policy if exists notes_open_update on public.notes;
drop policy if exists notes_open_delete on public.notes;
create policy notes_open_select on public.notes for select to anon, authenticated
  using (
    crew_id = (select private.default_group()) and archived_at is null
    and exists (select 1 from public.videos v where v.id = notes.video_id and v.archived_at is null)
  );
create policy notes_open_insert on public.notes for insert to anon, authenticated
  with check (
    crew_id = (select private.default_group()) and archived_at is null
    and exists (select 1 from public.videos v where v.id = notes.video_id and v.archived_at is null)
  );
create policy notes_open_update on public.notes for update to anon, authenticated
  using (
    crew_id = (select private.default_group()) and archived_at is null
    and exists (select 1 from public.videos v where v.id = notes.video_id and v.archived_at is null)
  )
  with check (
    crew_id = (select private.default_group()) and archived_at is null
    and exists (select 1 from public.videos v where v.id = notes.video_id and v.archived_at is null)
  );
create policy notes_open_delete on public.notes for delete to anon, authenticated
  using (
    crew_id = (select private.default_group()) and archived_at is null
    and exists (select 1 from public.videos v where v.id = notes.video_id and v.archived_at is null)
  );

-- archived_at is not in the column UPDATE grants (migration 400 / notes), so clients can't archive or restore by
-- UPDATE; only the delete trigger (as owner) writes it.

-- ─────────────────────────────────────────────────────────────
-- 4) Uniqueness only among live rows (same names: friendlyError matches them)
-- ─────────────────────────────────────────────────────────────

alter table public.videos drop constraint if exists videos_crew_youtube_key;
create unique index if not exists videos_crew_youtube_key
  on public.videos (crew_id, youtube_id) where archived_at is null;

alter table public.clips drop constraint if exists clips_video_range_key;
create unique index if not exists clips_video_range_key
  on public.clips (video_id, start_seconds, end_seconds, speed, mirrored) where archived_at is null;

alter table public.notes drop constraint if exists notes_video_at_body_key;
create unique index if not exists notes_video_at_body_key
  on public.notes (video_id, at_seconds, body) where archived_at is null;

-- ─────────────────────────────────────────────────────────────
-- 5) Storage: no client deletes, uploads/reads tied to a live video row
-- ─────────────────────────────────────────────────────────────

update storage.buckets
set public = false, file_size_limit = 52428800, allowed_mime_types = array['video/*', 'audio/*']
where id = 'videos';

-- p_action = 'read' | 'insert'. plpgsql so the uuid cast only happens after the shape check.
create or replace function private.video_object_allowed(p_name text, p_action text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_group uuid := private.default_group();
  v_parts text[];
  v_path  text;
begin
  v_parts := regexp_match(
    p_name,
    '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.[A-Za-z0-9]{1,10}$'
  );
  if v_parts is null or v_group is null or v_parts[1] <> v_group::text then
    return false;
  end if;

  select v.storage_path into v_path
  from public.videos v
  where v.id = v_parts[2]::uuid
    and v.crew_id = v_group
    and v.archived_at is null
    and v.source = 'upload';
  if not found then
    return false;
  end if;
  -- Once the video points at a file, only that file is its file.
  if v_path is not null and v_path <> p_name then
    return false;
  end if;

  if p_action = 'insert' then
    -- One cloud file per video: no second copy under another extension.
    return not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'videos'
        and o.name like v_parts[1] || '/' || v_parts[2] || '.%'
        and o.name <> p_name
    );
  end if;
  return p_action = 'read';
end;
$$;

-- Legacy member policies (no name-shape check, delete allowed) and the open ones.
drop policy if exists videos_bucket_select on storage.objects;
drop policy if exists videos_bucket_insert on storage.objects;
drop policy if exists videos_bucket_delete on storage.objects;
drop policy if exists videos_bucket_open_select on storage.objects;
drop policy if exists videos_bucket_open_insert on storage.objects;
drop policy if exists videos_bucket_open_delete on storage.objects;

create policy videos_bucket_open_select on storage.objects for select to anon, authenticated
  using (bucket_id = 'videos' and private.video_object_allowed(name, 'read'));
create policy videos_bucket_open_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'videos' and private.video_object_allowed(name, 'insert'));
-- Deliberately no UPDATE (no overwrite / upsert onto an existing file) and no DELETE policy.

-- ─────────────────────────────────────────────────────────────
-- 6) Row caps: crew from the parent video, serialised, live rows (+ hard cap incl. archived)
-- ─────────────────────────────────────────────────────────────

create or replace function private.guard_row_caps()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_crew  uuid;
  v_cap   int;
  v_live  bigint;
  v_total bigint;
begin
  if tg_table_name = 'videos' then
    v_crew := new.crew_id;
    v_cap := 500;
  else
    -- Never trust the client's crew_id: this trigger runs before *_set_crew (alphabetical order).
    select v.crew_id into v_crew from public.videos v where v.id = new.video_id;
    v_cap := 5000;
  end if;
  if v_crew is null then
    return new; -- unknown video: *_set_crew / the FK reject it
  end if;

  -- Two concurrent inserts must not both see "cap - 1".
  perform pg_advisory_xact_lock(hashtext(tg_table_name), hashtext(v_crew::text));

  if tg_table_name = 'videos' then
    select count(*) filter (where archived_at is null), count(*) into v_live, v_total
    from public.videos where crew_id = v_crew;
  elsif tg_table_name = 'clips' then
    select count(*) filter (where archived_at is null), count(*) into v_live, v_total
    from public.clips where crew_id = v_crew;
  else
    select count(*) filter (where archived_at is null), count(*) into v_live, v_total
    from public.notes where crew_id = v_crew;
  end if;

  if v_live >= v_cap or v_total >= v_cap * 4 then
    raise exception '%_cap_reached', tg_table_name using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 7) Server-owned columns on insert; storage_path tied to its own video
-- ─────────────────────────────────────────────────────────────

create or replace function private.stamp_client_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user::text not in ('anon', 'authenticated') then
    return new;
  end if;
  new.created_by := (select auth.uid());
  new.created_at := now();
  new.archived_at := null;
  if tg_table_name in ('videos', 'notes') then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists videos_client_stamp on public.videos;
create trigger videos_client_stamp before insert on public.videos
  for each row execute function private.stamp_client_insert();
drop trigger if exists clips_client_stamp on public.clips;
create trigger clips_client_stamp before insert on public.clips
  for each row execute function private.stamp_client_insert();
drop trigger if exists notes_client_stamp on public.notes;
create trigger notes_client_stamp before insert on public.notes
  for each row execute function private.stamp_client_insert();

-- storage_path = '<crew>/<this video id>.<ext>' (was: any uuid in the crew folder → could point at another video's
-- file). NOT VALID first so a legacy bad row can't block the migration; validated right after when possible.
alter table public.videos drop constraint if exists videos_storage_path_own;
alter table public.videos add constraint videos_storage_path_own check (
  storage_path is null
  or storage_path ~ ('^' || crew_id::text || '/' || id::text || '\.[A-Za-z0-9]{1,10}$')
) not valid;
do $$
begin
  alter table public.videos validate constraint videos_storage_path_own;
  alter table public.videos drop constraint if exists videos_storage_path_shape;
exception when check_violation then
  raise notice 'videos_storage_path_own left NOT VALID: some existing rows point at another video''s file';
end;
$$;

-- Clients may attach the cloud file once (null → path), never repoint or change it afterwards.
create or replace function private.guard_storage_path()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user::text in ('anon', 'authenticated')
     and old.storage_path is not null
     and new.storage_path is distinct from old.storage_path then
    raise exception 'storage_path_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists videos_storage_path_once on public.videos;
create trigger videos_storage_path_once before update of storage_path on public.videos
  for each row execute function private.guard_storage_path();

-- ─────────────────────────────────────────────────────────────
-- 9) crews: the creator's account is not the library's lifeline
-- ─────────────────────────────────────────────────────────────

alter table public.crews alter column created_by drop not null;
alter table public.crews drop constraint if exists crews_created_by_fkey;
alter table public.crews
  add constraint crews_created_by_fkey foreign key (created_by) references auth.users (id) on delete set null;

-- Hide the (now useless) invite code and the creator id from visitors. NOT enabled yet: the client still reads the
-- group with `select('*')` (apps/web/src/lib/backend.ts → joinGroup), which column grants would turn into
-- "permission denied". Enable once joinGroup selects explicit columns (e.g. 'id, name, created_at').
--
-- revoke select on public.crews from anon, authenticated;
-- grant select (id, name, created_at) on public.crews to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 8) Function privileges
-- ─────────────────────────────────────────────────────────────

-- New functions created by postgres in schema private are not executable by visitors by default.
alter default privileges for role postgres in schema private revoke execute on functions from anon, authenticated;

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;

-- Only what RLS policies / the delete trigger call as the requesting role.
grant execute on function private.default_group() to anon, authenticated;
grant execute on function private.video_object_allowed(text, text) to anon, authenticated;
grant execute on function private.archive_row(text, uuid) to anon, authenticated;
-- Legacy policies still in place (crews_select, crew_members_select, profiles_select) use these.
grant execute on function private.is_crew_member(uuid) to authenticated;
grant execute on function private.shares_crew_with(uuid) to authenticated;
