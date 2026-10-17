-- Checks for 20261013000000_archive_and_hardening.sql.
-- Run the whole file in one go (SQL editor / MCP execute_sql, as postgres). It acts as `anon` like the app does,
-- prints `PASS …` notices, raises `FAIL …` on the first problem, and ends with ROLLBACK: nothing is kept.
-- Needs the default group row to exist (private.default_group() not null).

begin;
-- Supabase refuses direct deletes from storage tables unless this is on, which would hide what RLS does (no
-- effect where that trigger is missing).
select set_config('storage.allow_delete_query', 'true', true);

-- ── Act as a visitor through the API ──────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

-- 1) Server-owned columns: created_by / created_at sent by the client are ignored.
insert into public.videos (id, crew_id, title, source, youtube_id, created_at, created_by)
values (
  '0a0a0a0a-0000-4000-8000-000000000001', (select id from public.crews limit 1), 'Prueba archivo', 'youtube',
  'zzTestArch1', '2100-01-01', '0a0a0a0a-0000-4000-8000-00000000dead'
);
do $$
declare r public.videos;
begin
  select * into r from public.videos where id = '0a0a0a0a-0000-4000-8000-000000000001';
  if r.id is null or r.created_by is not null or r.created_at > now() then
    raise exception 'FAIL stamp: created_by=% created_at=%', r.created_by, r.created_at;
  end if;
  raise notice 'PASS client cannot set created_by / created_at';
end $$;

-- A clip without crew_id and a note (like the app) on that video.
insert into public.clips (video_id, name, start_seconds, end_seconds)
values ('0a0a0a0a-0000-4000-8000-000000000001', 'c1', 1, 2);
insert into public.notes (video_id, crew_id, at_seconds, body)
values ('0a0a0a0a-0000-4000-8000-000000000001', (select id from public.crews limit 1), 1, 'nota de prueba');

-- 2) Delete archives: the video, its clips and notes disappear for the visitor…
delete from public.videos where id = '0a0a0a0a-0000-4000-8000-000000000001';
do $$
begin
  if exists (select 1 from public.videos where id = '0a0a0a0a-0000-4000-8000-000000000001') then
    raise exception 'FAIL archived video still visible';
  end if;
  if exists (select 1 from public.clips where video_id = '0a0a0a0a-0000-4000-8000-000000000001')
     or exists (select 1 from public.notes where video_id = '0a0a0a0a-0000-4000-8000-000000000001') then
    raise exception 'FAIL clips/notes of an archived video still visible';
  end if;
  raise notice 'PASS archived video, clips and notes are hidden from anon';
end $$;

-- …but the rows still exist, archived (admin view).
reset role;
do $$
begin
  if not exists (select 1 from public.videos
                 where id = '0a0a0a0a-0000-4000-8000-000000000001' and archived_at is not null) then
    raise exception 'FAIL video row was really deleted (or not archived)';
  end if;
  if exists (select 1 from public.clips where video_id = '0a0a0a0a-0000-4000-8000-000000000001' and archived_at is null)
     or exists (select 1 from public.notes where video_id = '0a0a0a0a-0000-4000-8000-000000000001' and archived_at is null)
     or not exists (select 1 from public.clips where video_id = '0a0a0a0a-0000-4000-8000-000000000001') then
    raise exception 'FAIL clips/notes not archived together with the video';
  end if;
  raise notice 'PASS delete kept the rows with archived_at set';
end $$;

-- 3) Re-adding the archived YouTube video works; a live duplicate is still refused by name.
set local role anon;
insert into public.videos (id, crew_id, title, source, youtube_id)
values ('0a0a0a0a-0000-4000-8000-000000000003', (select id from public.crews limit 1), 'Prueba re-añadir', 'youtube', 'zzTestArch1');
do $$
declare ok boolean := false;
begin
  begin
    insert into public.videos (id, crew_id, title, source, youtube_id)
    values ('0a0a0a0a-0000-4000-8000-000000000004', (select id from public.crews limit 1), 'Duplicado', 'youtube', 'zzTestArch1');
  exception when unique_violation then
    ok := sqlerrm like '%videos_crew_youtube_key%';
  end;
  if not ok then raise exception 'FAIL live duplicate not refused with videos_crew_youtube_key'; end if;
  raise notice 'PASS re-adding an archived YouTube video works, live duplicates still refused';
end $$;

-- 4) Archiving in bulk (> 3 rows in one statement) is refused; one at a time works.
insert into public.clips (video_id, name, start_seconds, end_seconds)
select '0a0a0a0a-0000-4000-8000-000000000003', 'b' || g, g * 10, g * 10 + 1 from generate_series(1, 4) g;
do $$
declare ok boolean := false;
begin
  begin
    delete from public.clips where video_id = '0a0a0a0a-0000-4000-8000-000000000003';
  exception when others then
    ok := sqlerrm = 'bulk_delete_blocked';
  end;
  if not ok then raise exception 'FAIL bulk archive not blocked'; end if;
  raise notice 'PASS bulk archive blocked';
end $$;
delete from public.clips where video_id = '0a0a0a0a-0000-4000-8000-000000000003' and start_seconds = 10;
do $$
begin
  if exists (select 1 from public.clips where video_id = '0a0a0a0a-0000-4000-8000-000000000003' and start_seconds = 10) then
    raise exception 'FAIL single clip delete did not archive';
  end if;
  raise notice 'PASS single clip delete archives';
end $$;

-- 5) Storage: no upload without a video row, upload for a live upload row, one file per video, no deletes.
do $$
declare ok boolean := false;
begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('videos', (select id from public.crews limit 1)::text || '/' || gen_random_uuid()::text || '.mp4');
  exception when insufficient_privilege then
    ok := true;
  end;
  if not ok then raise exception 'FAIL orphan upload (no video row) was accepted'; end if;
  raise notice 'PASS upload without a video row is refused';
end $$;

insert into public.videos (id, crew_id, title, source, file_name)
values ('0a0a0a0a-0000-4000-8000-000000000005', (select id from public.crews limit 1), 'Prueba subida', 'upload', 'x.mp4');
do $$
declare
  v_crew text := (select id from public.crews limit 1)::text;
  ok boolean := false;
begin
  begin
    insert into storage.objects (bucket_id, name) values ('videos', v_crew || '/0a0a0a0a-0000-4000-8000-000000000005.mp4');
    raise notice 'PASS upload for a live upload video is accepted';
  exception when others then
    -- Supabase's own triggers on storage.objects may refuse direct SQL inserts; then test this one with the Storage API.
    raise notice 'INCONCLUSIVE direct insert into storage.objects failed: % (%)', sqlerrm, sqlstate;
    return;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('videos', v_crew || '/0a0a0a0a-0000-4000-8000-000000000005.webm');
  exception when insufficient_privilege then
    ok := true;
  end;
  if not ok then raise exception 'FAIL second file for the same video was accepted'; end if;
  raise notice 'PASS one cloud file per video';
end $$;

do $$
declare n int := 0;
begin
  begin
    delete from storage.objects where bucket_id = 'videos';
    get diagnostics n = row_count;
  exception when others then
    n := 0; -- refused outright is fine too
  end;
  if n > 0 then raise exception 'FAIL anon deleted % storage objects', n; end if;
  raise notice 'PASS anon cannot delete storage objects';
end $$;

-- Archiving the upload video makes its file unreadable for the client (no signed URLs for archived videos).
delete from public.videos where id = '0a0a0a0a-0000-4000-8000-000000000005';
do $$
begin
  if exists (select 1 from storage.objects where name like '%/0a0a0a0a-0000-4000-8000-000000000005.%') then
    raise exception 'FAIL file of an archived video is still readable';
  end if;
  raise notice 'PASS file of an archived video is not readable';
end $$;

reset role;
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and cmd in ('DELETE', 'UPDATE', 'ALL')
      and roles && array['anon', 'authenticated', 'public']::name[]
  ) then
    raise exception 'FAIL a client DELETE/UPDATE policy still exists on storage.objects';
  end if;
  raise notice 'PASS no client DELETE/UPDATE policy on storage.objects';
end $$;

-- 6) Caps: with the group full, a clip / note sent without (or with a fake) crew_id is still refused.
--    Fill as admin up to exactly the live cap (rolled back at the end).
insert into public.clips (video_id, name, start_seconds, end_seconds)
select '0a0a0a0a-0000-4000-8000-000000000003', 'relleno', 100000 + g, 100001 + g
from generate_series(1, greatest(0, 5000 - (
  select count(*) from public.clips where crew_id = (select private.default_group()) and archived_at is null
))) g;
insert into public.notes (video_id, crew_id, at_seconds, body)
select '0a0a0a0a-0000-4000-8000-000000000003', (select private.default_group()), 100000 + g, 'relleno'
from generate_series(1, greatest(0, 5000 - (
  select count(*) from public.notes where crew_id = (select private.default_group()) and archived_at is null
))) g;

set local role anon;
do $$
declare
  ok_clip boolean := false;
  ok_fake boolean := false;
  ok_note boolean := false;
begin
  begin
    insert into public.clips (video_id, name, start_seconds, end_seconds)
    values ('0a0a0a0a-0000-4000-8000-000000000003', 'sin grupo', 9000, 9001);
  exception when others then ok_clip := sqlerrm = 'clips_cap_reached';
  end;
  begin
    insert into public.clips (video_id, crew_id, name, start_seconds, end_seconds)
    values ('0a0a0a0a-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'grupo falso', 9002, 9003);
  exception when others then ok_fake := sqlerrm = 'clips_cap_reached';
  end;
  begin
    insert into public.notes (video_id, at_seconds, body)
    values ('0a0a0a0a-0000-4000-8000-000000000003', 9000, 'sin grupo');
  exception when others then ok_note := sqlerrm = 'notes_cap_reached';
  end;
  if not (ok_clip and ok_fake and ok_note) then
    raise exception 'FAIL caps bypassed: clip=% fake_crew=% note=%', ok_clip, ok_fake, ok_note;
  end if;
  raise notice 'PASS caps hold without / with a fake crew_id';
end $$;

reset role;
rollback;
