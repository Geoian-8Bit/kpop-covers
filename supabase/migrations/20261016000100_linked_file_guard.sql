-- One Shoot · F1 review fixes (round 1, database).
--
-- 1) A YouTube entry with a cloud file attached keeps that file's description: while storage_path is set, clients
--    can't rewrite file_name / file_size / file_duration_seconds (a second phone linking "its" file over a stale
--    view would otherwise describe a file that isn't the one in the cloud). The offset stays editable: re-syncing
--    is allowed. To change the file: remove it (storage_path → null, which clears nothing else here; the app clears
--    the rest in the same update), then link the new one.
-- 2) Uploads for a YouTube entry without a file are capped: at most 5 objects per video in the bucket (removed and
--    replaced files are never deleted from the client, so this bounds what repeated «Cambiar archivo» can leave).
-- 3) The suffixed name is only for YouTube entries: an uploaded video's file must be the plain `<group>/<video>.<ext>`.

create or replace function private.guard_linked_file()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user::text in ('anon', 'authenticated')
     and old.storage_path is not null
     and new.storage_path is not distinct from old.storage_path
     and (
       new.file_name is distinct from old.file_name
       or new.file_size is distinct from old.file_size
       or new.file_duration_seconds is distinct from old.file_duration_seconds
     ) then
    raise exception 'file_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists videos_file_lock on public.videos;
create trigger videos_file_lock before update of file_name, file_size, file_duration_seconds on public.videos
  for each row execute function private.guard_linked_file();

revoke execute on function private.guard_linked_file() from public, anon, authenticated;

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
  if v_path is not null and v_path <> p_name then
    return false;
  end if;

  if p_action = 'insert' then
    if v_source = 'upload' then
      return v_parts[3] is null and not exists (
        select 1 from storage.objects o
        where o.bucket_id = 'videos'
          and o.name like v_parts[1] || '/' || v_parts[2] || '.%'
          and o.name <> p_name
      );
    end if;
    -- YouTube entry: only while no file is attached, and at most 5 files ever for this video.
    return v_path is null and (
      select count(*) from storage.objects o
      where o.bucket_id = 'videos' and o.name like v_parts[1] || '/' || v_parts[2] || '%'
    ) < 5;
  end if;
  if v_source = 'youtube' and v_path is null then
    return false;
  end if;
  return p_action = 'read';
end;
$$;

grant execute on function private.video_object_allowed(text, text) to anon, authenticated;

-- An uploaded video's storage_path never carries the suffix (it's the plain name of its only file).
alter table public.videos drop constraint if exists videos_upload_path_plain;
alter table public.videos add constraint videos_upload_path_plain check (
  source <> 'upload' or storage_path is null or storage_path !~ '--[0-9a-z]{1,12}\.[A-Za-z0-9]{1,10}$'
) not valid;
do $$
begin
  alter table public.videos validate constraint videos_upload_path_plain;
exception when check_violation then
  raise notice 'videos_upload_path_plain left NOT VALID';
end;
$$;
