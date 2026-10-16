-- One Shoot · ideas, fase 1: F1 (archivo vinculado a un vídeo de YouTube) y F2 (quién es quién).
-- Additive and backwards compatible: the app deployed before this migration keeps working with it.
--
--  1) Generic helpers for the new group tables (this and later migrations):
--       private.set_group_crew()   new rows always belong to the default group (the client's crew_id is ignored);
--       private.stamp_new_row()    created_at / archived_at are the server's on client inserts;
--       private.guard_simple_cap() live-row cap (TG_ARGV[0]) and a hard cap of 4× including archived rows;
--       private.archive_row()      now also archives rows of the new tables (same delete → archive rule).
--  2) F1 · A YouTube entry can carry the file of that same video:
--       videos.file_offset_seconds: file time = YouTube time + offset (set once, by syncing both by hand);
--       videos.file_duration_seconds: the file's length, to warn when it may be another version.
--     The file uses the existing columns (file_name, file_size, storage_path) and the `videos` bucket. A linked
--     file can be removed (storage_path back to null, only for YouTube entries) and replaced by a new one under a
--     new name `<group>/<video>--<suffix>.<ext>`; old cloud files are never deleted from the client (admin only).
--  3) F2 · `members`: the group's member list (name + colour). Trust-based identity, not security: anyone with
--     the URL can add or rename members, like everything else in the open group. Notes get an author.

-- ─────────────────────────────────────────────────────────────
-- 1) Helpers
-- ─────────────────────────────────────────────────────────────

create or replace function private.set_group_crew()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.crew_id := private.default_group();
  if new.crew_id is null then
    raise exception 'no_group' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function private.stamp_new_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user::text in ('anon', 'authenticated') then
    new.created_at := now();
    new.archived_at := null;
  end if;
  return new;
end;
$$;

-- Live rows per group up to TG_ARGV[0]; 4× that including archived ones (delete/re-add loops can't grow forever).
create or replace function private.guard_simple_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cap   int := tg_argv[0]::int;
  v_live  bigint;
  v_total bigint;
begin
  perform pg_advisory_xact_lock(hashtext(tg_table_name), hashtext(coalesce(new.crew_id::text, '')));
  execute format(
    'select count(*) filter (where archived_at is null), count(*) from public.%I where crew_id = $1',
    tg_table_name
  ) into v_live, v_total using new.crew_id;
  if v_live >= v_cap or v_total >= v_cap * 4 then
    raise exception '%_cap_reached', tg_table_name using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Same as before for videos / clips / notes; new group tables are archived by id.
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
  elsif p_table in ('clips', 'notes', 'members') then
    execute format('update public.%I set archived_at = now() where id = $1 and archived_at is null', p_table)
      using p_id;
  else
    raise exception 'archive_row: unexpected table %', p_table;
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 2) F1 · linked file on a YouTube entry
-- ─────────────────────────────────────────────────────────────

alter table public.videos
  add column if not exists file_offset_seconds numeric(10, 3),
  add column if not exists file_duration_seconds numeric(10, 3);

alter table public.videos drop constraint if exists videos_file_offset_range;
alter table public.videos add constraint videos_file_offset_range
  check (file_offset_seconds is null or file_offset_seconds between -3600 and 3600);
alter table public.videos drop constraint if exists videos_file_duration_range;
alter table public.videos add constraint videos_file_duration_range
  check (file_duration_seconds is null or file_duration_seconds between 0 and 86400);

-- The file name may now carry a suffix (a replaced file gets a new name). Looser than before: existing rows fit.
alter table public.videos drop constraint if exists videos_storage_path_file;
alter table public.videos add constraint videos_storage_path_file check (
  storage_path is null
  or storage_path ~ ('^' || crew_id::text || '/' || id::text || '(--[0-9a-z]{1,12})?\.[A-Za-z0-9]{1,10}$')
) not valid;
do $$
begin
  alter table public.videos validate constraint videos_storage_path_file;
exception when check_violation then
  raise notice 'videos_storage_path_file left NOT VALID: legacy rows point at another video''s file';
end;
$$;
alter table public.videos drop constraint if exists videos_storage_path_own;
alter table public.videos drop constraint if exists videos_storage_path_shape;

grant update (file_name, file_size, file_offset_seconds, file_duration_seconds) on public.videos to anon, authenticated;

-- Clients attach a cloud file once (null → path). A YouTube entry may also drop its linked file (path → null);
-- an uploaded video's file is the video itself and stays.
create or replace function private.guard_storage_path()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user::text in ('anon', 'authenticated')
     and old.storage_path is not null
     and new.storage_path is distinct from old.storage_path then
    if old.source = 'youtube' and new.storage_path is null then
      return new;
    end if;
    raise exception 'storage_path_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Storage: `<group>/<video>.<ext>` as before, or `<group>/<video>--<suffix>.<ext>` for a YouTube entry's
-- replacement file. Reading needs a live video row whose file it is (or no file yet); uploading needs a live row
-- with no file attached. Uploaded videos keep "one cloud file per video, ever".
create or replace function private.video_object_allowed(p_name text, p_action text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_group  uuid := private.default_group();
  v_parts  text[];
  v_path   text;
  v_source text;
begin
  v_parts := regexp_match(
    p_name,
    '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(--[0-9a-z]{1,12})?\.[A-Za-z0-9]{1,10}$'
  );
  if v_parts is null or v_group is null or v_parts[1] <> v_group::text then
    return false;
  end if;

  select v.storage_path, v.source into v_path, v_source
  from public.videos v
  where v.id = v_parts[2]::uuid
    and v.crew_id = v_group
    and v.archived_at is null
    and v.source in ('upload', 'youtube');
  if not found then
    return false;
  end if;
  -- Once the video points at a file, only that file is its file.
  if v_path is not null and v_path <> p_name then
    return false;
  end if;

  if p_action = 'insert' then
    if v_source = 'upload' then
      -- One cloud file per uploaded video, plain name, no second copy under another extension.
      return v_parts[3] is null and not exists (
        select 1 from storage.objects o
        where o.bucket_id = 'videos'
          and o.name like v_parts[1] || '/' || v_parts[2] || '.%'
          and o.name <> p_name
      );
    end if;
    -- A YouTube entry: a new file only while none is attached (replace = remove, then link a new one).
    return v_path is null;
  end if;
  -- A YouTube entry's files are readable only while linked (a removed or replaced file is no longer its file).
  if v_source = 'youtube' and v_path is null then
    return false;
  end if;
  return p_action = 'read';
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3) F2 · members
-- ─────────────────────────────────────────────────────────────

create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  crew_id     uuid not null references public.crews (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  color       text not null default 'ai'
              check (color in ('shu', 'ai', 'kin', 'enji', 'murasaki', 'fuji', 'sakura', 'rokusho', 'kiji', 'washi')),
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists members_crew_idx on public.members (crew_id);
-- Two live members can't share a name (case and spaces ignored); an archived one can be re-added.
create unique index if not exists members_crew_name_key
  on public.members (crew_id, lower(btrim(name))) where archived_at is null;

alter table public.members enable row level security;

drop trigger if exists members_set_crew on public.members;
create trigger members_set_crew before insert on public.members
  for each row execute function private.set_group_crew();
drop trigger if exists members_client_stamp on public.members;
create trigger members_client_stamp before insert on public.members
  for each row execute function private.stamp_new_row();
drop trigger if exists members_zz_row_cap on public.members;
create trigger members_zz_row_cap before insert on public.members
  for each row execute function private.guard_simple_cap('100');
drop trigger if exists members_archive_on_delete on public.members;
create trigger members_archive_on_delete before delete on public.members
  for each row execute function private.archive_instead_of_delete();
drop trigger if exists members_bulk_delete_guard on public.members;
create trigger members_bulk_delete_guard after delete on public.members
  referencing old table as gone for each statement execute function private.guard_bulk_delete();
-- Note: BEFORE triggers fire in name order; `members_set_crew` < `members_zz_row_cap`, so the cap counts in the
-- group the row was given, never one the client sent.

drop policy if exists members_open_select on public.members;
drop policy if exists members_open_insert on public.members;
drop policy if exists members_open_update on public.members;
drop policy if exists members_open_delete on public.members;
create policy members_open_select on public.members for select to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);
create policy members_open_insert on public.members for insert to anon, authenticated
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy members_open_update on public.members for update to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null)
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy members_open_delete on public.members for delete to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);

revoke update on public.members from anon, authenticated;
grant select, insert, delete on public.members to anon, authenticated;
grant update (name, color) on public.members to anon, authenticated;

-- Who wrote a note (F2). Optional: «Sin nombre» when nobody chose a name on that device.
alter table public.notes
  add column if not exists author_member_id uuid references public.members (id) on delete set null;
create index if not exists notes_author_idx on public.notes (author_member_id);

-- ─────────────────────────────────────────────────────────────
-- Function privileges (default privileges already revoke execute on new private functions)
-- ─────────────────────────────────────────────────────────────

revoke execute on function private.set_group_crew() from public, anon, authenticated;
revoke execute on function private.stamp_new_row() from public, anon, authenticated;
revoke execute on function private.guard_simple_cap() from public, anon, authenticated;
grant execute on function private.archive_row(text, uuid) to anon, authenticated;
grant execute on function private.video_object_allowed(text, text) to anon, authenticated;
