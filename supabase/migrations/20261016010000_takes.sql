-- One Shoot · ideas, fase 2: F3 (tomas guardadas, compartidas) y F4 (mejor toma).
-- Additive: a new table and a new private bucket; nothing existing changes.
--
-- A take's video lives on the phone that recorded it (OPFS); this row is its shared description: which song,
-- from which second, at what speed, by whom, how long, and — only when shared with the group — a reduced 720p
-- copy in the private `takes` bucket. Notes on a take (F6) need the row even when the video stays on one phone.
--
-- «Borrar» archives the row like everything else (repo rule): the take disappears for everybody and its cloud copy
-- stops being readable; the file stays in the bucket until the admin purges it (clients never delete files).
-- «Solo puede borrarla quien la grabó o el dispositivo donde está» is a trust rule enforced by the app (no login).

create table if not exists public.takes (
  id                 uuid primary key,
  crew_id            uuid not null references public.crews (id) on delete cascade,
  video_id           uuid not null references public.videos (id) on delete cascade,
  member_id          uuid references public.members (id) on delete set null,
  clip_id            uuid references public.clips (id) on delete set null,
  song_start_seconds numeric(10, 3) not null check (song_start_seconds >= 0),
  song_end_seconds   numeric(10, 3) check (song_end_seconds is null or song_end_seconds >= song_start_seconds),
  speed              numeric(4, 2) not null default 1 check (speed between 0.25 and 2),
  mirrored           boolean not null default false,
  duration_seconds   numeric(10, 3) not null default 0 check (duration_seconds between 0 and 7200),
  width              int check (width is null or width between 1 and 8192),
  height             int check (height is null or height between 1 and 8192),
  mime_type          text check (mime_type is null or char_length(mime_type) <= 120),
  file_name          text check (file_name is null or char_length(file_name) <= 255),
  device_id          text check (device_id is null or device_id ~ '^[A-Za-z0-9-]{8,64}$'),
  recorded_at        timestamptz not null default now(),
  shared_path        text,
  shared_size        bigint check (shared_size is null or shared_size between 0 and 52428800),
  is_best            boolean not null default false,
  created_at         timestamptz not null default now(),
  archived_at        timestamptz,
  constraint takes_shared_path_own check (
    shared_path is null or shared_path ~ ('^' || crew_id::text || '/' || id::text || '\.[A-Za-z0-9]{1,10}$')
  )
);

create index if not exists takes_video_idx on public.takes (video_id, recorded_at desc);
create index if not exists takes_crew_idx on public.takes (crew_id);
create index if not exists takes_member_idx on public.takes (member_id);
create index if not exists takes_clip_idx on public.takes (clip_id);

alter table public.takes enable row level security;

-- The take's group is always its video's (never the client's).
create or replace function private.set_take_crew()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select v.crew_id into new.crew_id from public.videos v where v.id = new.video_id and v.archived_at is null;
  if new.crew_id is null then
    raise exception 'video % not found', new.video_id;
  end if;
  return new;
end;
$$;

drop trigger if exists takes_a_set_crew on public.takes;
create trigger takes_a_set_crew before insert on public.takes
  for each row execute function private.set_take_crew();
drop trigger if exists takes_b_client_stamp on public.takes;
create trigger takes_b_client_stamp before insert on public.takes
  for each row execute function private.stamp_new_row();
drop trigger if exists takes_c_row_cap on public.takes;
create trigger takes_c_row_cap before insert on public.takes
  for each row execute function private.guard_simple_cap('3000');
drop trigger if exists takes_archive_on_delete on public.takes;
create trigger takes_archive_on_delete before delete on public.takes
  for each row execute function private.archive_instead_of_delete();
drop trigger if exists takes_bulk_delete_guard on public.takes;
create trigger takes_bulk_delete_guard after delete on public.takes
  referencing old table as gone for each statement execute function private.guard_bulk_delete();

-- New takes are never born shared or starred by the client's say-so: sharing goes through the upload.
create or replace function private.take_insert_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user::text in ('anon', 'authenticated') then
    new.shared_path := null;
    new.shared_size := null;
    new.is_best := coalesce(new.is_best, false);
    -- A phone's clock may run a little ahead; a take from the future would stay first forever.
    if new.recorded_at is null or new.recorded_at > now() + interval '1 day' then
      new.recorded_at := now();
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists takes_d_insert_rules on public.takes;
create trigger takes_d_insert_rules before insert on public.takes
  for each row execute function private.take_insert_rules();

-- Size of a file in the takes bucket (null: there is no such file). Definer: clients can't list the bucket.
create or replace function private.shared_object_size(p_path text)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(o.metadata ->> 'size', '')::bigint, 0)
  from storage.objects o
  where o.bucket_id = 'takes' and o.name = p_path;
$$;

-- Shared once (null → path), only once the file really is in the bucket, never repointed by a client; the size
-- is the file's real one (the space meter trusts it). Invoker on purpose: current_user must be the client's role
-- for the checks to apply.
create or replace function private.guard_take_share()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_size bigint;
begin
  if current_user::text not in ('anon', 'authenticated') then
    return new;
  end if;
  if old.shared_path is not null then
    if new.shared_path is distinct from old.shared_path then
      raise exception 'shared_path_locked' using errcode = 'P0001';
    end if;
    new.shared_size := old.shared_size;
  elsif new.shared_path is not null then
    v_size := private.shared_object_size(new.shared_path);
    if v_size is null then
      raise exception 'shared_file_missing' using errcode = 'P0001';
    end if;
    new.shared_size := v_size;
  else
    new.shared_size := null;
  end if;
  return new;
end;
$$;
drop trigger if exists takes_share_once on public.takes;
create trigger takes_share_once before update of shared_path, shared_size on public.takes
  for each row execute function private.guard_take_share();

-- A take's section is a clip of its own song, and its person a live member of the group; anything else is
-- dropped quietly (a phone with a stale list must not lose the take over it).
create or replace function private.guard_take_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.clip_id is not null and not exists (
    select 1 from public.clips c
    where c.id = new.clip_id and c.video_id = new.video_id and c.archived_at is null
  ) then
    new.clip_id := null;
  end if;
  if new.member_id is not null and not exists (
    select 1 from public.members m
    where m.id = new.member_id and m.crew_id = new.crew_id and m.archived_at is null
  ) then
    new.member_id := null;
  end if;
  return new;
end;
$$;
drop trigger if exists takes_e_links on public.takes;
create trigger takes_e_links before insert or update of clip_id, member_id on public.takes
  for each row execute function private.guard_take_links();

-- F4 · One best take per song, section (clip) and person: starring one clears the others of that trio; moving a
-- starred take to a trio that already has one makes it lose its star. Runs last among the BEFORE triggers (by
-- name), with the final trio, and locks the trio so two phones starring at once can't leave two.
create or replace function private.one_best_take()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.is_best or new.archived_at is not null then
    return new;
  end if;
  perform pg_advisory_xact_lock(
    hashtext('takes_best'),
    hashtext(new.video_id::text || coalesce(new.member_id::text, '-') || coalesce(new.clip_id::text, '-'))
  );
  if tg_op = 'INSERT' or not old.is_best then
    update public.takes t
    set is_best = false
    where t.id <> new.id
      and t.video_id = new.video_id
      and t.member_id is not distinct from new.member_id
      and t.clip_id is not distinct from new.clip_id
      and t.is_best
      and t.archived_at is null;
  elsif old.member_id is distinct from new.member_id or old.clip_id is distinct from new.clip_id then
    if exists (
      select 1 from public.takes t
      where t.id <> new.id
        and t.video_id = new.video_id
        and t.member_id is not distinct from new.member_id
        and t.clip_id is not distinct from new.clip_id
        and t.is_best
        and t.archived_at is null
    ) then
      new.is_best := false;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists takes_one_best on public.takes;
drop trigger if exists takes_f_one_best on public.takes;
create trigger takes_f_one_best before insert or update of is_best, member_id, clip_id on public.takes
  for each row execute function private.one_best_take();
-- Backstop: two transactions crossing anyway get a unique violation (retryable), never two stars.
create unique index if not exists takes_one_best_key on public.takes (
  video_id,
  coalesce(member_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(clip_id, '00000000-0000-0000-0000-000000000000'::uuid)
) where is_best and archived_at is null;

drop policy if exists takes_open_select on public.takes;
drop policy if exists takes_open_insert on public.takes;
drop policy if exists takes_open_update on public.takes;
drop policy if exists takes_open_delete on public.takes;
create policy takes_open_select on public.takes for select to anon, authenticated
  using (
    crew_id = (select private.default_group()) and archived_at is null
    and exists (select 1 from public.videos v where v.id = takes.video_id and v.archived_at is null)
  );
create policy takes_open_insert on public.takes for insert to anon, authenticated
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy takes_open_update on public.takes for update to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null)
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy takes_open_delete on public.takes for delete to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);

revoke update on public.takes from anon, authenticated;
grant select, insert, delete on public.takes to anon, authenticated;
-- member_id: «asignarle las tomas sin nombre de este dispositivo» (F2); clip_id: re-file a take under a section.
grant update (is_best, shared_path, shared_size, member_id, clip_id) on public.takes to anon, authenticated;

-- archive_row knows takes too.
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
    update public.takes  set archived_at = now() where video_id = p_id and archived_at is null;
  elsif p_table in ('clips', 'notes', 'members', 'takes') then
    execute format('update public.%I set archived_at = now() where id = $1 and archived_at is null', p_table)
      using p_id;
  else
    raise exception 'archive_row: unexpected table %', p_table;
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Storage: private bucket `takes`, `<group>/<take id>.<ext>`, ≤ 50 MB, video only
-- ─────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('takes', 'takes', false, 52428800, array['video/*'])
on conflict (id) do update
set public = false, file_size_limit = 52428800, allowed_mime_types = array['video/*'];

-- Bytes used in the app's buckets (takes and videos), archived and replaced files included: what the plan counts.
create or replace function private.storage_bytes_used()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(coalesce(nullif(o.metadata ->> 'size', '')::bigint, 0)), 0)::bigint
  from storage.objects o
  where o.bucket_id in ('takes', 'videos');
$$;

-- For the «Tomas compartidas» meter: the real size of the takes bucket (deleted takes keep their file until the
-- admin purges it, so the meter must count them) and of everything the plan counts. Executable by anon on
-- purpose (advisor 0028 expected): it only returns three numbers.
create or replace function public.storage_usage()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'takes', coalesce(sum(coalesce(nullif(o.metadata ->> 'size', '')::bigint, 0)) filter (where o.bucket_id = 'takes'), 0),
    'total', coalesce(sum(coalesce(nullif(o.metadata ->> 'size', '')::bigint, 0)), 0),
    'limit', 1073741824
  )
  from storage.objects o
  where o.bucket_id in ('takes', 'videos');
$$;

create or replace function private.take_object_allowed(p_name text, p_action text)
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
  select t.shared_path into v_path
  from public.takes t
  join public.videos v on v.id = t.video_id and v.archived_at is null
  where t.id = v_parts[2]::uuid and t.crew_id = v_group and t.archived_at is null;
  if not found then
    return false;
  end if;
  if p_action = 'insert' then
    -- Only before it's shared, only one file per take, and only while the project's free storage (1 GiB, shared
    -- with the library's videos; archived and replaced files still count) has room for one more 50 MB file.
    return v_path is null
      and not exists (
        select 1 from storage.objects o
        where o.bucket_id = 'takes' and o.name like v_parts[1] || '/' || v_parts[2] || '.%'
      )
      and private.storage_bytes_used() < 1073741824 - 52428800;
  end if;
  return p_action = 'read' and v_path = p_name;
end;
$$;

drop policy if exists takes_bucket_open_select on storage.objects;
drop policy if exists takes_bucket_open_insert on storage.objects;
create policy takes_bucket_open_select on storage.objects for select to anon, authenticated
  using (bucket_id = 'takes' and private.take_object_allowed(name, 'read'));
create policy takes_bucket_open_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'takes' and private.take_object_allowed(name, 'insert'));
-- No UPDATE / DELETE policy: no overwrite, no client deletes.

revoke execute on function private.set_take_crew() from public, anon, authenticated;
revoke execute on function private.take_insert_rules() from public, anon, authenticated;
revoke execute on function private.guard_take_share() from public, anon, authenticated;
revoke execute on function private.one_best_take() from public, anon, authenticated;
revoke execute on function private.guard_take_links() from public, anon, authenticated;
revoke execute on function private.shared_object_size(text) from public;
grant execute on function private.shared_object_size(text) to anon, authenticated;
revoke execute on function private.storage_bytes_used() from public, anon, authenticated;
revoke execute on function public.storage_usage() from public;
grant execute on function public.storage_usage() to anon, authenticated;
grant execute on function private.take_object_allowed(text, text) to anon, authenticated;
grant execute on function private.archive_row(text, uuid) to anon, authenticated;
