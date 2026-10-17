-- One Shoot · 18 · Separar voz y música con IA (vía A).
-- Additive: a new table, its storage rules in the existing `videos` bucket, and archive_row learning the table.
--
-- A powerful device (the computer) separates a song's file once with an AI model (HTDemucs, in the browser) and
-- uploads two compressed audio tracks: the instrumental and the voice. Every phone then plays «Sin voz» / «Voz»
-- with those tracks, in sync with the video of the same file. The row says which file the tracks were made from
-- (name + size, like the linked file's identity), so a replaced file never plays with the old tracks.
--
--   video_stems  one separation of a video's file. Born without files (insert), then both tracks are uploaded to
--                `videos/<group>/stems/<row id>/vocals.<ext>` and `.../instrumental.<ext>`, and both paths are set
--                in one update: only once, only when both files really are in the bucket, and with the files' real
--                sizes (each ≤ 16 MiB). The group's 1 GiB counts them (storage_usage already sums the bucket).
--   Deleting archives (repo rule): the tracks stop being readable; the files stay until the admin purges them.

create table if not exists public.video_stems (
  id                uuid primary key,
  crew_id           uuid not null references public.crews (id) on delete cascade,
  video_id          uuid not null references public.videos (id) on delete cascade,
  member_id         uuid references public.members (id) on delete set null,
  source_file_name  text not null check (char_length(source_file_name) between 1 and 255),
  source_file_size  bigint not null check (source_file_size > 0),
  model             text not null check (char_length(model) between 1 and 80),
  duration_seconds  numeric(10, 3) not null check (duration_seconds > 0 and duration_seconds <= 1800),
  -- Measured encoder delay: the tracks' sound starts this much later than the file's (the player compensates).
  delay_seconds     numeric(7, 4) not null default 0 check (delay_seconds between -1 and 1),
  mime_type         text not null default 'audio/mp4' check (mime_type in ('audio/mp4', 'audio/webm', 'audio/ogg')),
  vocals_path       text,
  instrumental_path text,
  vocals_size       bigint check (vocals_size is null or vocals_size between 1 and 16777216),
  instrumental_size bigint check (instrumental_size is null or instrumental_size between 1 and 16777216),
  created_at        timestamptz not null default now(),
  archived_at       timestamptz,
  constraint video_stems_vocals_path_own check (
    vocals_path is null
    or vocals_path ~ ('^' || crew_id::text || '/stems/' || id::text || '/vocals\.(m4a|mp4|webm|ogg)$')
  ),
  constraint video_stems_instrumental_path_own check (
    instrumental_path is null
    or instrumental_path ~ ('^' || crew_id::text || '/stems/' || id::text || '/instrumental\.(m4a|mp4|webm|ogg)$')
  ),
  -- Both tracks or none: a half-uploaded separation never plays.
  constraint video_stems_both_or_none check (
    (vocals_path is null) = (instrumental_path is null)
    and (vocals_path is null) = (vocals_size is null)
    and (instrumental_path is null) = (instrumental_size is null)
  )
);

create index if not exists video_stems_video_idx on public.video_stems (video_id, created_at desc);
create index if not exists video_stems_crew_idx on public.video_stems (crew_id);
create index if not exists video_stems_member_idx on public.video_stems (member_id);

alter table public.video_stems enable row level security;

-- The row belongs to its video's group (never the client's), only for a live video with a file; who made it is a
-- live member of the group or nobody.
create or replace function private.set_stems_crew()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select v.crew_id into new.crew_id
  from public.videos v
  where v.id = new.video_id and v.archived_at is null and v.source in ('upload', 'youtube');
  if new.crew_id is null then
    raise exception 'video % not found', new.video_id;
  end if;
  if new.member_id is not null and not exists (
    select 1 from public.members m where m.id = new.member_id and m.crew_id = new.crew_id and m.archived_at is null
  ) then
    new.member_id := null;
  end if;
  return new;
end;
$$;

-- Never born with files: the paths are set by the update below, once the tracks are in the bucket.
create or replace function private.stems_insert_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user::text in ('anon', 'authenticated') then
    new.vocals_path := null;
    new.instrumental_path := null;
    new.vocals_size := null;
    new.instrumental_size := null;
  end if;
  return new;
end;
$$;

drop trigger if exists video_stems_a_set_crew on public.video_stems;
create trigger video_stems_a_set_crew before insert on public.video_stems
  for each row execute function private.set_stems_crew();
drop trigger if exists video_stems_b_client_stamp on public.video_stems;
create trigger video_stems_b_client_stamp before insert on public.video_stems
  for each row execute function private.stamp_new_row();
drop trigger if exists video_stems_c_row_cap on public.video_stems;
create trigger video_stems_c_row_cap before insert on public.video_stems
  for each row execute function private.guard_simple_cap('300');
drop trigger if exists video_stems_d_insert_rules on public.video_stems;
create trigger video_stems_d_insert_rules before insert on public.video_stems
  for each row execute function private.stems_insert_rules();
drop trigger if exists video_stems_archive_on_delete on public.video_stems;
create trigger video_stems_archive_on_delete before delete on public.video_stems
  for each row execute function private.archive_instead_of_delete();
drop trigger if exists video_stems_bulk_delete_guard on public.video_stems;
create trigger video_stems_bulk_delete_guard after delete on public.video_stems
  referencing old table as gone for each statement execute function private.guard_bulk_delete();

-- Size of a separated track in the videos bucket (null: there is no such file). Definer: clients can't list the
-- bucket. Only for track names of the group's own `stems/` folder: it tells nothing about any other file.
create or replace function private.video_object_size(p_path text)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(o.metadata ->> 'size', '')::bigint, 0)
  from storage.objects o
  where o.bucket_id = 'videos' and o.name = p_path
    and p_path ~ '^[0-9a-f-]{36}/stems/[0-9a-f-]{36}/(vocals|instrumental)\.(m4a|mp4|webm|ogg)$'
    and split_part(p_path, '/', 1) = (select private.default_group())::text;
$$;

-- Both paths set together, once, only when both files exist; sizes are the files' real ones (the space meter and
-- the 16 MiB cap trust them). Invoker on purpose: current_user must be the client's role for the checks to apply.
create or replace function private.guard_stems_files()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_vocals bigint;
  v_instr  bigint;
begin
  if current_user::text not in ('anon', 'authenticated') then
    return new;
  end if;
  if old.vocals_path is not null or old.instrumental_path is not null then
    if new.vocals_path is distinct from old.vocals_path or new.instrumental_path is distinct from old.instrumental_path then
      raise exception 'stems_locked' using errcode = 'P0001';
    end if;
    new.vocals_size := old.vocals_size;
    new.instrumental_size := old.instrumental_size;
    return new;
  end if;
  if new.vocals_path is null and new.instrumental_path is null then
    new.vocals_size := null;
    new.instrumental_size := null;
    return new;
  end if;
  if new.vocals_path is null or new.instrumental_path is null then
    raise exception 'stems_incomplete' using errcode = 'P0001';
  end if;
  v_vocals := private.video_object_size(new.vocals_path);
  v_instr := private.video_object_size(new.instrumental_path);
  if v_vocals is null or v_instr is null then
    raise exception 'stems_file_missing' using errcode = 'P0001';
  end if;
  if v_vocals > 16777216 or v_instr > 16777216 then
    raise exception 'stems_too_big' using errcode = 'P0001';
  end if;
  -- A size of 0 means the storage metadata isn't filled yet: keep the cap check meaningful by storing at least 1.
  new.vocals_size := greatest(v_vocals, 1);
  new.instrumental_size := greatest(v_instr, 1);
  return new;
end;
$$;
drop trigger if exists video_stems_files_once on public.video_stems;
create trigger video_stems_files_once
  before update of vocals_path, instrumental_path, vocals_size, instrumental_size on public.video_stems
  for each row execute function private.guard_stems_files();

drop policy if exists video_stems_open_select on public.video_stems;
drop policy if exists video_stems_open_insert on public.video_stems;
drop policy if exists video_stems_open_update on public.video_stems;
drop policy if exists video_stems_open_delete on public.video_stems;
create policy video_stems_open_select on public.video_stems for select to anon, authenticated
  using (
    crew_id = (select private.default_group()) and archived_at is null
    and exists (select 1 from public.videos v where v.id = video_stems.video_id and v.archived_at is null)
  );
create policy video_stems_open_insert on public.video_stems for insert to anon, authenticated
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy video_stems_open_update on public.video_stems for update to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null)
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy video_stems_open_delete on public.video_stems for delete to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);

revoke update on public.video_stems from anon, authenticated;
grant select, insert, delete on public.video_stems to anon, authenticated;
grant update (vocals_path, instrumental_path, vocals_size, instrumental_size) on public.video_stems to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Storage: `videos/<group>/stems/<row id>/(vocals|instrumental).<ext>`
-- ─────────────────────────────────────────────────────────────

-- Uploading needs a live row of the group, on a live video, with no tracks attached yet, one file per kind and
-- row (no second copy under another extension), and room in the project's 1 GiB for the tracks still missing,
-- leaving 50 MB for one take. Reading needs the row to point at exactly that file. The existing video rules don't
-- match these names (no overlap).
create or replace function private.stem_object_allowed(p_name text, p_action text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_group  uuid := private.default_group();
  v_parts  text[];
  v_vocals text;
  v_instr  text;
begin
  v_parts := regexp_match(
    p_name,
    '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/stems/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/(vocals|instrumental)\.(m4a|mp4|webm|ogg)$'
  );
  if v_parts is null or v_group is null or v_parts[1] <> v_group::text then
    return false;
  end if;
  select s.vocals_path, s.instrumental_path into v_vocals, v_instr
  from public.video_stems s
  join public.videos v on v.id = s.video_id and v.archived_at is null
  where s.id = v_parts[2]::uuid and s.crew_id = v_group and s.archived_at is null;
  if not found then
    return false;
  end if;
  if p_action = 'insert' then
    -- No second copy of this kind under another extension. The same name again is let through on purpose: the
    -- unique index refuses it (409 → the client's «already there», a retry carries on) instead of a 403 that
    -- would make every retry of a half-uploaded separation fail forever.
    if v_vocals is not null or v_instr is not null or exists (
      select 1 from storage.objects o
      where o.bucket_id = 'videos'
        and o.name like v_parts[1] || '/stems/' || v_parts[2] || '/' || v_parts[3] || '.%'
        and o.name <> p_name
    ) then
      return false;
    end if;
    -- Already stored under this very name: nothing new would be stored (and it already counts in the used bytes),
    -- so no room check either: the unique index answers.
    if exists (select 1 from storage.objects o where o.bucket_id = 'videos' and o.name = p_name) then
      return true;
    end if;
    -- Room for the tracks still missing (this one, and the other one unless it is already up; 16 MiB each), and
    -- still 50 MB free for one shared take (the takes bucket's own rule): never half a separation for lack of space.
    return private.storage_bytes_used()
      + 16777216 * (1 + case when exists (
          select 1 from storage.objects o
          where o.bucket_id = 'videos'
            and o.name like v_parts[1] || '/stems/' || v_parts[2] || '/'
              || case v_parts[3] when 'vocals' then 'instrumental' else 'vocals' end || '.%'
        ) then 0 else 1 end)
      < 1073741824 - 52428800;
  end if;
  return p_action = 'read' and (p_name = v_vocals or p_name = v_instr);
end;
$$;

drop policy if exists videos_bucket_stems_select on storage.objects;
drop policy if exists videos_bucket_stems_insert on storage.objects;
create policy videos_bucket_stems_select on storage.objects for select to anon, authenticated
  using (bucket_id = 'videos' and private.stem_object_allowed(name, 'read'));
create policy videos_bucket_stems_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'videos' and private.stem_object_allowed(name, 'insert'));
-- No UPDATE / DELETE policy: no overwrite, no client deletes.

-- ─────────────────────────────────────────────────────────────
-- archive_row knows video_stems (same as 20261016070000 plus the new table)
-- ─────────────────────────────────────────────────────────────

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
    update public.videos       set archived_at = now() where id = p_id and archived_at is null;
    update public.clips        set archived_at = now() where video_id = p_id and archived_at is null;
    update public.notes        set archived_at = now() where video_id = p_id and archived_at is null;
    update public.takes        set archived_at = now() where video_id = p_id and archived_at is null;
    update public.follow_paths set archived_at = now() where video_id = p_id and archived_at is null;
    update public.video_stems  set archived_at = now() where video_id = p_id and archived_at is null;
  elsif p_table = 'bags' then
    update public.bags      set archived_at = now() where id = p_id and archived_at is null;
    update public.bag_items set archived_at = now() where bag_id = p_id and archived_at is null;
  elsif p_table = 'tracks' then
    update public.tracks      set archived_at = now() where id = p_id and archived_at is null;
    update public.track_items set archived_at = now() where track_id = p_id and archived_at is null;
  elsif p_table = 'polls' then
    update public.polls        set archived_at = now() where id = p_id and archived_at is null;
    update public.poll_options set archived_at = now() where poll_id = p_id and archived_at is null;
  elsif p_table = 'events' then
    update public.events      set archived_at = now() where id = p_id and archived_at is null;
    update public.event_songs set archived_at = now() where event_id = p_id and archived_at is null;
  elsif p_table in ('clips', 'notes', 'members', 'takes', 'bag_items', 'track_items', 'wishes', 'wish_interest',
                    'poll_options', 'event_songs', 'take_reactions', 'follow_paths', 'video_stems') then
    execute format('update public.%I set archived_at = now() where id = $1 and archived_at is null', p_table)
      using p_id;
  else
    raise exception 'archive_row: unexpected table %', p_table;
  end if;
end;
$$;

revoke execute on function private.set_stems_crew() from public, anon, authenticated;
revoke execute on function private.stems_insert_rules() from public, anon, authenticated;
revoke execute on function private.guard_stems_files() from public, anon, authenticated;
revoke execute on function private.video_object_size(text) from public;
grant execute on function private.video_object_size(text) to anon, authenticated;
grant execute on function private.stem_object_allowed(text, text) to anon, authenticated;
grant execute on function private.archive_row(text, uuid) to anon, authenticated;
