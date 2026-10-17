-- Checks for 20261017140000_videos_storage_cap.sql (H1: server cap on the bytes of the `videos` bucket).
-- Run the whole file in one go as postgres (SQL editor / MCP execute_sql, or `pnpm db:test`). Acts as `anon`,
-- prints `PASS …`, raises `FAIL …` on the first problem, ends with ROLLBACK.

begin;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into public.videos (id, crew_id, title, source, file_name, file_size)
values ('ca9ca9ca-0000-4000-8000-0000000000a1', (select private.default_group()), 'Prueba tope subida', 'upload', 'tope.mp4', 20000000),
       ('ca9ca9ca-0000-4000-8000-0000000000a2', (select private.default_group()), 'Prueba tope pequeña', 'upload', 'mini.mp4', 5000000);
insert into public.videos (id, crew_id, title, source, youtube_id)
values ('ca9ca9ca-0000-4000-8000-0000000000a3', (select private.default_group()), 'Prueba tope YouTube', 'youtube', 'zzTestCap01');

-- 1) With plenty of room a video's file goes up as before (known size or not).
do $$
declare v_crew text := (select private.default_group())::text;
begin
  begin
    insert into storage.objects (bucket_id, name, metadata)
    values ('videos', v_crew || '/ca9ca9ca-0000-4000-8000-0000000000a1.mp4', '{"size": 20000000}');
  exception when others then
    raise exception 'FAIL a video was refused with plenty of room: % (%)', sqlerrm, sqlstate;
  end;
  raise notice 'PASS with room, a video''s file goes up';
end $$;

-- Fill the group up to 30 MB under the line (1 GiB − 50 MB kept for one take).
reset role;
insert into storage.objects (bucket_id, name, metadata)
select 'videos', 'zz-check/filler-cap.mp4',
       jsonb_build_object('size', (1073741824 - 52428800 - 31457280) - private.storage_bytes_used());
set local role anon;

-- 2) Near the line: a file that would eat the takes' reserve is refused; one that fits is accepted; an unknown size
--    counts as the bucket's 50 MB.
do $$
declare
  v_crew text := (select private.default_group())::text;
  ok boolean := false;
begin
  begin
    insert into storage.objects (bucket_id, name, metadata)
    values ('videos', v_crew || '/ca9ca9ca-0000-4000-8000-0000000000a3--big001.mp4', '{"size": 40000000}');
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FAIL a file that eats the takes'' reserve was accepted'; end if;
  ok := false;
  begin
    insert into storage.objects (bucket_id, name)
    values ('videos', v_crew || '/ca9ca9ca-0000-4000-8000-0000000000a3--nosize.mp4');
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FAIL a file of unknown size was accepted 30 MB from the line'; end if;
  raise notice 'PASS a file is refused when it would leave less than 50 MB for takes';
  begin
    insert into storage.objects (bucket_id, name, metadata)
    values ('videos', v_crew || '/ca9ca9ca-0000-4000-8000-0000000000a2.mp4', '{"size": 5000000}');
  exception when others then
    raise exception 'FAIL a small file that fits was refused: % (%)', sqlerrm, sqlstate;
  end;
  raise notice 'PASS a file that fits under the line is accepted';
end $$;

-- 2b) Near the line, uploading the same file again is the unique index's 409 («already there»), not a refusal.
do $$
declare ok boolean := false;
begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('videos', (select private.default_group())::text || '/ca9ca9ca-0000-4000-8000-0000000000a2.mp4');
  exception when unique_violation then ok := true;
            when others then
              raise exception 'FAIL near the line, re-uploading a stored file gave % (%)', sqlerrm, sqlstate;
  end;
  if not ok then raise exception 'FAIL the same file was stored twice'; end if;
  raise notice 'PASS re-uploading the same file near the line is a unique violation (409)';
end $$;

-- 2c) An unknown size counts as the bucket's own per-file limit (here lowered to 10 MiB, 25 MB from the line).
reset role;
update storage.buckets set file_size_limit = 10485760 where id = 'videos';
set local role anon;
do $$
begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('videos', (select private.default_group())::text || '/ca9ca9ca-0000-4000-8000-0000000000a3--limit1.mp4');
  exception when others then
    raise exception 'FAIL the bucket''s file_size_limit is not the assumed size: % (%)', sqlerrm, sqlstate;
  end;
  raise notice 'PASS an unknown size counts as the bucket''s file_size_limit';
end $$;
reset role;
update storage.buckets set file_size_limit = 52428800 where id = 'videos';
set local role anon;

-- 3) After it, one shared take still fits (the reserve is counted once, not twice).
reset role;
do $$
begin
  if not (private.storage_bytes_used() < 1073741824 - 52428800) then
    raise exception 'FAIL the videos left no room for one take';
  end if;
  raise notice 'PASS the 50 MB for one take are still there';
end $$;
set local role anon;

-- 4) The read rules are the same as before (an attached file is readable, the old two-argument form still works).
update public.videos set storage_path = (select private.default_group())::text || '/ca9ca9ca-0000-4000-8000-0000000000a1.mp4'
where id = 'ca9ca9ca-0000-4000-8000-0000000000a1';
do $$
begin
  if not exists (select 1 from storage.objects where name like '%/ca9ca9ca-0000-4000-8000-0000000000a1.mp4') then
    raise exception 'FAIL an attached video file is no longer readable';
  end if;
  if not private.video_object_allowed((select private.default_group())::text || '/ca9ca9ca-0000-4000-8000-0000000000a1.mp4', 'read') then
    raise exception 'FAIL the two-argument rule changed';
  end if;
  raise notice 'PASS reading is unchanged';
end $$;

rollback;
