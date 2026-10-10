-- Hardening for the open (no-login) single group. Keeps the UX — anyone with the link can add, pin and
-- delete — but closes what an anonymous script could do beyond normal use.

-- 1) No duplicates: the same YouTube video once per group; the same clip range/speed/mirror once per video.
alter table public.videos add constraint videos_crew_youtube_key unique (crew_id, youtube_id);
alter table public.clips
  add constraint clips_video_range_key unique (video_id, start_seconds, end_seconds, speed, mirrored);

-- 2) Shape limits on free-text columns the UI never lets users type freely.
alter table public.videos
  add constraint videos_thumbnail_shape check (
    thumbnail_url is null
    or (
      char_length(thumbnail_url) <= 150000
      and (
        thumbnail_url ~ '^https://i\.ytimg\.com/vi/[A-Za-z0-9_-]{11}/[a-z0-9_]+\.jpg$'
        or thumbnail_url ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'
      )
    )
  ),
  add constraint videos_file_name_len check (file_name is null or char_length(file_name) <= 255),
  add constraint videos_storage_path_shape check (
    storage_path is null
    or storage_path ~ ('^' || crew_id::text || '/[0-9a-f-]{36}\.[A-Za-z0-9]{1,10}$')
  );

-- 3) Only the columns the app edits can be updated by clients.
revoke update on public.videos, public.clips from anon, authenticated;
grant update (title, artist, duration_seconds, storage_path) on public.videos to anon, authenticated;
grant update (name, color, is_pinned, speed, mirrored, start_seconds, end_seconds) on public.clips to anon, authenticated;

-- 4) Caps so a script can't fill the free-tier database.
create or replace function private.guard_row_caps()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'videos'
     and (select count(*) from public.videos where crew_id = new.crew_id) >= 500 then
    raise exception 'videos_cap_reached' using errcode = 'P0001';
  elsif tg_table_name = 'clips'
     and (select count(*) from public.clips where crew_id = new.crew_id) >= 5000 then
    raise exception 'clips_cap_reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger videos_row_cap before insert on public.videos
  for each row execute function private.guard_row_caps();
create trigger clips_row_cap before insert on public.clips
  for each row execute function private.guard_row_caps();

-- 5) No bulk wipes: the app deletes one row at a time, so a statement removing many rows is refused.
--    Cascaded clip deletes (from deleting one video) run inside RI triggers and are allowed.
create or replace function private.guard_bulk_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_trigger_depth() = 1 and (select count(*) from gone) > 3 then
    raise exception 'bulk_delete_blocked' using errcode = 'P0001';
  end if;
  return null;
end;
$$;

create trigger videos_bulk_delete_guard after delete on public.videos
  referencing old table as gone for each statement execute function private.guard_bulk_delete();
create trigger clips_bulk_delete_guard after delete on public.clips
  referencing old table as gone for each statement execute function private.guard_bulk_delete();

revoke execute on function private.guard_row_caps() from public, anon, authenticated;
revoke execute on function private.guard_bulk_delete() from public, anon, authenticated;

-- 6) Group management from the old login flow is no longer part of the product: nobody may rename,
--    delete or create groups from the client.
drop policy if exists crews_update on public.crews;
drop policy if exists crews_delete on public.crews;
revoke insert, update, delete on public.crews, public.crew_members from anon, authenticated;
revoke execute on function public.create_crew(text) from authenticated;
revoke execute on function public.join_crew(text) from authenticated;
revoke execute on function public.join_group() from authenticated;

-- 7) Evaluate the default group once per statement instead of once per row.
drop policy crews_open_select on public.crews;
create policy crews_open_select on public.crews for select to anon, authenticated
  using (id = (select private.default_group()));

drop policy videos_open_all on public.videos;
create policy videos_open_all on public.videos for all to anon, authenticated
  using (crew_id = (select private.default_group())) with check (crew_id = (select private.default_group()));

drop policy clips_open_all on public.clips;
create policy clips_open_all on public.clips for all to anon, authenticated
  using (crew_id = (select private.default_group())) with check (crew_id = (select private.default_group()));

-- Storage: also pin the object name shape (<group>/<uuid>.<ext>).
drop policy videos_bucket_open_select on storage.objects;
drop policy videos_bucket_open_insert on storage.objects;
drop policy videos_bucket_open_delete on storage.objects;
create policy videos_bucket_open_select on storage.objects for select to anon, authenticated
  using (bucket_id = 'videos' and (storage.foldername(name))[1] = (select private.default_group())::text);
create policy videos_bucket_open_insert on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'videos'
    and (storage.foldername(name))[1] = (select private.default_group())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.[A-Za-z0-9]{1,10}$'
  );
create policy videos_bucket_open_delete on storage.objects for delete to anon, authenticated
  using (bucket_id = 'videos' and (storage.foldername(name))[1] = (select private.default_group())::text);
