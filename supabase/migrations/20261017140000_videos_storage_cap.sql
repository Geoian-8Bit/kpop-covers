-- One Shoot · H1 · Server cap on the bytes of the `videos` bucket.
-- Additive: only `private.video_object_allowed` (same rules plus the room check on insert) and a helper.
--
-- The group's free storage is 1 GiB for both buckets together (`private.storage_bytes_used()`, archived and
-- replaced files included). The `takes` bucket already refuses a take unless one more 50 MB file fits
-- (20261016010000: `used < 1 GiB − 50 MB`). Until now the `videos` bucket had no such check, so a video, a linked
-- file or a lighter copy (13) could fill the group and leave no room to share a single take, without a word.
--
-- Rule: a new file in `videos` (a video's file or a YouTube entry's file) is accepted only if, once it is stored,
-- 50 MB are still free for one shared take:  used + size < 1 GiB − 50 MB.  The reserve is exactly what the takes
-- bucket asks for, not an extra margin on top of it (counted once): right after a video fills the group up to the
-- line, one take still fits, and nothing else does.
--
-- The size: Storage checks the insert policy before the file arrives, when the object's `metadata` (and its size)
-- is still empty. Then the bucket's per-file limit (`storage.buckets.file_size_limit`, 50 MB today; 50 MB if
-- unset) is assumed, so in practice an upload needs about 100 MB
-- free (50 MB for itself + the 50 MB reserve). When the size is there (it is in the SQL checks), it is used.
-- The client mirrors exactly this (`CLOUD_SPACE` in apps/web/src/features/studio/cloudCopyRules.ts).
--
-- The separated tracks (`<group>/stems/...`, 20261017130000) keep their own rule in `private.stem_object_allowed`:
-- room for the tracks still missing (16 MiB each) with the same 50 MB reserve.
--
-- Effect on the app in production: nothing changes while the group uses less than ~924 MiB. Past that, uploading a
-- video or linking a file to the cloud is refused like any other refused upload (the app keeps the file on the
-- device and says it could not be uploaded); clips, notes, YouTube videos and sharing takes keep working.

-- Whether one more file of `p_size` bytes (null: unknown, the bucket's 50 MB limit is assumed) fits in the group's
-- 1 GiB leaving 50 MB for one shared take.
create or replace function private.videos_bucket_has_room(p_size bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.storage_bytes_used()
    + greatest(coalesce(
        p_size,
        (select b.file_size_limit from storage.buckets b where b.id = 'videos'),
        52428800
      ), 0)
    < 1073741824 - 52428800;
$$;

-- The object's size from its storage metadata, or null while Storage hasn't filled it in.
create or replace function private.object_size(p_metadata jsonb)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case when p_metadata ->> 'size' ~ '^[0-9]{1,15}$' then (p_metadata ->> 'size')::bigint end;
$$;

-- Same rules as 20261016000100 (shape, live video of the group, one plain file per uploaded video, a YouTube entry
-- only while no file is attached and at most 5 files ever), plus the room check on insert.
create or replace function private.video_object_allowed(p_name text, p_action text, p_size bigint)
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
    -- A file already stored under this very name adds nothing (and already counts in the used bytes): no room
    -- check, so a retry gets the unique index's 409 («already there») and not a 403 when the group is nearly full.
    if not exists (select 1 from storage.objects o where o.bucket_id = 'videos' and o.name = p_name)
       and not private.videos_bucket_has_room(p_size) then
      return false;
    end if;
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

-- The two-argument form (used by the read policy and by any older caller) keeps working: size unknown.
create or replace function private.video_object_allowed(p_name text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.video_object_allowed(p_name, p_action, null::bigint);
$$;

drop policy if exists videos_bucket_open_insert on storage.objects;
create policy videos_bucket_open_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'videos' and private.video_object_allowed(name, 'insert', private.object_size(metadata)));
-- Still no UPDATE (no overwrite / upsert onto an existing file) and no DELETE policy.

revoke execute on function private.videos_bucket_has_room(bigint) from public, anon, authenticated;
revoke execute on function private.object_size(jsonb) from public;
grant execute on function private.object_size(jsonb) to anon, authenticated;
revoke execute on function private.video_object_allowed(text, text, bigint) from public;
grant execute on function private.video_object_allowed(text, text, bigint) to anon, authenticated;
grant execute on function private.video_object_allowed(text, text) to anon, authenticated;
