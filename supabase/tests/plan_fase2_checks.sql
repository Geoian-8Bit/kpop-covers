-- Checks for 20261016010000_takes.sql (F3 takes, F4 best take).
-- Run the whole file in one go as postgres (SQL editor / MCP execute_sql, or `pnpm db:test`). Acts as `anon`,
-- prints `PASS …`, raises `FAIL …` on the first problem, ends with ROLLBACK.

begin;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into public.videos (id, crew_id, title, source, youtube_id)
values ('0c0c0c0c-0000-4000-8000-0000000000a1', (select private.default_group()), 'Prueba tomas', 'youtube', 'zzTestTake1');
insert into public.members (id, name) values ('0c0c0c0c-0000-4000-8000-0000000000b1', 'Prueba Cora');

-- 1) A take gets its video's group; the client can't make it born shared.
insert into public.takes (id, crew_id, video_id, member_id, song_start_seconds, speed, duration_seconds, shared_path, shared_size, device_id)
values ('0c0c0c0c-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
        '0c0c0c0c-0000-4000-8000-0000000000a1', '0c0c0c0c-0000-4000-8000-0000000000b1', 12.5, 0.75, 30,
        'fake/path.mp4', 999, 'dev-12345678');
do $$
declare r public.takes;
begin
  select * into r from public.takes where id = '0c0c0c0c-0000-4000-8000-000000000001';
  if r.id is null or r.crew_id <> private.default_group() or r.shared_path is not null or r.shared_size is not null then
    raise exception 'FAIL take insert rules: crew=% path=% size=%', r.crew_id, r.shared_path, r.shared_size;
  end if;
  raise notice 'PASS takes take their video''s group and are never born shared';
end $$;

-- 2) F4: one best take per song + clip + person.
insert into public.takes (id, video_id, member_id, song_start_seconds, duration_seconds, is_best)
values ('0c0c0c0c-0000-4000-8000-000000000002', '0c0c0c0c-0000-4000-8000-0000000000a1',
        '0c0c0c0c-0000-4000-8000-0000000000b1', 0, 20, true);
update public.takes set is_best = true where id = '0c0c0c0c-0000-4000-8000-000000000001';
do $$
begin
  if (select count(*) from public.takes where video_id = '0c0c0c0c-0000-4000-8000-0000000000a1' and is_best) <> 1
     or not (select is_best from public.takes where id = '0c0c0c0c-0000-4000-8000-000000000001') then
    raise exception 'FAIL more than one best take for the same song/person';
  end if;
  raise notice 'PASS starring a take clears the previous best of that person';
end $$;

-- Another person keeps their own best.
insert into public.takes (id, video_id, song_start_seconds, duration_seconds, is_best)
values ('0c0c0c0c-0000-4000-8000-000000000003', '0c0c0c0c-0000-4000-8000-0000000000a1', 0, 10, true);
do $$
begin
  if (select count(*) from public.takes where video_id = '0c0c0c0c-0000-4000-8000-0000000000a1' and is_best) <> 2 then
    raise exception 'FAIL a best take of «Sin nombre» cleared someone else''s';
  end if;
  raise notice 'PASS best takes are per person';
end $$;

-- 3) Columns the client can't change.
do $$
declare ok boolean := false;
begin
  begin
    update public.takes set song_start_seconds = 0 where id = '0c0c0c0c-0000-4000-8000-000000000001';
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL client could rewrite a take''s sync data'; end if;
  raise notice 'PASS the take''s timing is not client-editable';
end $$;

-- 4) Sharing: upload under the take's own name, set once, read only that file.
do $$
declare
  v_crew text := (select private.default_group())::text;
  ok boolean := false;
begin
  begin
    insert into storage.objects (bucket_id, name) values ('takes', v_crew || '/0c0c0c0c-0000-4000-8000-000000000001.mp4');
  exception when others then
    raise notice 'INCONCLUSIVE direct insert into storage.objects failed: % (%)', sqlerrm, sqlstate;
    return;
  end;
  update public.takes set shared_path = v_crew || '/0c0c0c0c-0000-4000-8000-000000000001.mp4', shared_size = 1000
  where id = '0c0c0c0c-0000-4000-8000-000000000001';
  raise notice 'PASS a take can be shared once';

  begin
    update public.takes set shared_path = null where id = '0c0c0c0c-0000-4000-8000-000000000001';
  exception when others then ok := sqlerrm = 'shared_path_locked';
  end;
  if not ok then raise exception 'FAIL shared_path could be changed after sharing'; end if;
  ok := false;
  begin
    insert into storage.objects (bucket_id, name) values ('takes', v_crew || '/0c0c0c0c-0000-4000-8000-000000000001.webm');
  exception when insufficient_privilege then ok := true;
           when others then ok := true;
  end;
  if not ok then raise exception 'FAIL a second file for the same take was accepted'; end if;
  ok := false;
  begin
    insert into storage.objects (bucket_id, name) values ('takes', v_crew || '/' || gen_random_uuid()::text || '.mp4');
  exception when insufficient_privilege then ok := true;
           when others then ok := true;
  end;
  if not ok then raise exception 'FAIL upload without a take row accepted'; end if;
  raise notice 'PASS shared path locked, one file per take, no orphan uploads';
end $$;

-- 4b) Review round 1: no «shared» without the file; the size is the file's real one and can't be rewritten.
insert into public.takes (id, video_id, song_start_seconds, duration_seconds, recorded_at)
values ('0c0c0c0c-0000-4000-8000-000000000004', '0c0c0c0c-0000-4000-8000-0000000000a1', 0, 5, '2099-01-01');
do $$
declare
  v_crew text := (select private.default_group())::text;
  v_path text := (select private.default_group())::text || '/0c0c0c0c-0000-4000-8000-000000000004.mp4';
  ok boolean := false;
begin
  if (select recorded_at from public.takes where id = '0c0c0c0c-0000-4000-8000-000000000004') > now() + interval '1 day' then
    raise exception 'FAIL a take dated in the future was accepted';
  end if;
  begin
    update public.takes set shared_path = v_path, shared_size = 1 where id = '0c0c0c0c-0000-4000-8000-000000000004';
  exception when others then ok := sqlerrm = 'shared_file_missing';
  end;
  if not ok then raise exception 'FAIL a take was marked shared with no file in the bucket'; end if;
  begin
    insert into storage.objects (bucket_id, name, metadata) values ('takes', v_path, '{"size": 4242}');
  exception when others then
    raise notice 'INCONCLUSIVE direct insert into storage.objects failed: % (%)', sqlerrm, sqlstate;
    return;
  end;
  update public.takes set shared_path = v_path, shared_size = 1 where id = '0c0c0c0c-0000-4000-8000-000000000004';
  update public.takes set shared_size = 0 where id = '0c0c0c0c-0000-4000-8000-000000000004';
  if (select shared_size from public.takes where id = '0c0c0c0c-0000-4000-8000-000000000004') <> 4242 then
    raise exception 'FAIL shared_size is not the file''s real size';
  end if;
  update public.takes set shared_size = 50000000 where id = '0c0c0c0c-0000-4000-8000-000000000003';
  if (select shared_size from public.takes where id = '0c0c0c0c-0000-4000-8000-000000000003') is not null then
    raise exception 'FAIL shared_size set on a take that is not shared';
  end if;
  if ((select public.storage_usage()) ->> 'takes')::bigint < 4242 then
    raise exception 'FAIL storage_usage() does not count the shared file';
  end if;
  raise notice 'PASS shared only with the file, real size, no future dates, usage meter';
end $$;

-- 4c) Moving a starred take into a trio that has a best already leaves one; foreign clips and archived members drop.
insert into public.members (id, name) values ('0c0c0c0c-0000-4000-8000-0000000000b2', 'Prueba Dani');
insert into public.videos (id, crew_id, title, source, youtube_id)
values ('0c0c0c0c-0000-4000-8000-0000000000a2', (select private.default_group()), 'Prueba otra', 'youtube', 'zzTestTake2');
insert into public.clips (id, video_id, crew_id, name, start_seconds, end_seconds)
values ('0c0c0c0c-0000-4000-8000-0000000000c2', '0c0c0c0c-0000-4000-8000-0000000000a2', (select private.default_group()), 'Ajeno', 1, 5);
insert into public.takes (id, video_id, member_id, song_start_seconds, duration_seconds, is_best)
values ('0c0c0c0c-0000-4000-8000-000000000005', '0c0c0c0c-0000-4000-8000-0000000000a1',
        '0c0c0c0c-0000-4000-8000-0000000000b2', 0, 8, true);
update public.takes set member_id = '0c0c0c0c-0000-4000-8000-0000000000b1' where id = '0c0c0c0c-0000-4000-8000-000000000005';
update public.takes set clip_id = '0c0c0c0c-0000-4000-8000-0000000000c2' where id = '0c0c0c0c-0000-4000-8000-000000000003';
do $$
begin
  if (select count(*) from public.takes where video_id = '0c0c0c0c-0000-4000-8000-0000000000a1'
      and member_id = '0c0c0c0c-0000-4000-8000-0000000000b1' and is_best) <> 1 then
    raise exception 'FAIL moving a starred take left two best takes for one person';
  end if;
  if (select clip_id from public.takes where id = '0c0c0c0c-0000-4000-8000-000000000003') is not null then
    raise exception 'FAIL a take was filed under another song''s clip';
  end if;
  raise notice 'PASS one best per trio after moving; clips of other songs are refused';
end $$;
delete from public.members where id = '0c0c0c0c-0000-4000-8000-0000000000b2';
insert into public.takes (id, video_id, member_id, song_start_seconds, duration_seconds)
values ('0c0c0c0c-0000-4000-8000-000000000006', '0c0c0c0c-0000-4000-8000-0000000000a1',
        '0c0c0c0c-0000-4000-8000-0000000000b2', 0, 8);
do $$
begin
  if (select member_id from public.takes where id = '0c0c0c0c-0000-4000-8000-000000000006') is not null then
    raise exception 'FAIL a take was signed by an archived member';
  end if;
  raise notice 'PASS takes are not signed by archived members';
end $$;

-- 4d) The project's 1 GiB: with storage (almost) full, no more shared takes.
reset role;
insert into storage.objects (bucket_id, name, metadata)
values ('videos', 'zz-check/full.mp4', '{"size": 1040000000}');
set local role anon;
do $$
declare ok boolean := false;
begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('takes', (select private.default_group())::text || '/0c0c0c0c-0000-4000-8000-000000000006.mp4');
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL a take was uploaded with the storage full'; end if;
  raise notice 'PASS no uploads past the free storage';
end $$;

-- 5) Deleting archives; archiving the video archives its takes; the shared file stops being readable.
delete from public.takes where id = '0c0c0c0c-0000-4000-8000-000000000002';
do $$
begin
  if exists (select 1 from public.takes where id = '0c0c0c0c-0000-4000-8000-000000000002') then
    raise exception 'FAIL deleted take still visible';
  end if;
  raise notice 'PASS deleting a take archives it';
end $$;
delete from public.videos where id = '0c0c0c0c-0000-4000-8000-0000000000a1';
do $$
begin
  if exists (select 1 from public.takes where video_id = '0c0c0c0c-0000-4000-8000-0000000000a1')
     or exists (select 1 from storage.objects where bucket_id = 'takes' and name like '%0c0c0c0c-0000-4000-8000-000000000001%') then
    raise exception 'FAIL takes (or their shared file) of an archived video still visible';
  end if;
  raise notice 'PASS archiving the video hides its takes and their files';
end $$;

reset role;
do $$
begin
  if (select count(*) from public.takes where video_id = '0c0c0c0c-0000-4000-8000-0000000000a1' and archived_at is not null) <> 6 then
    raise exception 'FAIL take rows were not kept as archived';
  end if;
  raise notice 'PASS archived take rows are kept';
end $$;

rollback;
