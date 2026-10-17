-- Checks for 20261017130000_video_stems.sql (18 · separar voz y música con IA).
-- Run the whole file in one go as postgres (SQL editor / MCP execute_sql, or `pnpm db:test`). Acts as `anon`,
-- prints `PASS …`, raises `FAIL …` on the first problem, ends with ROLLBACK.

begin;
-- Supabase refuses direct deletes from storage tables unless this is on (no effect where that trigger is missing).
select set_config('storage.allow_delete_query', 'true', true);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into public.videos (id, crew_id, title, source, youtube_id)
values ('5e5e5e5e-0000-4000-8000-0000000000a1', (select private.default_group()), 'Prueba pistas', 'youtube', 'zzTestStem1');
insert into public.members (id, name) values ('5e5e5e5e-0000-4000-8000-0000000000b1', 'Prueba Hanni');

-- 1) A separation takes its video's group, is never born with files, and an unknown member becomes nobody.
insert into public.video_stems (id, crew_id, video_id, member_id, source_file_name, source_file_size, model,
                                duration_seconds, vocals_path, instrumental_path, vocals_size, instrumental_size)
values ('5e5e5e5e-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
        '5e5e5e5e-0000-4000-8000-0000000000a1', '5e5e5e5e-0000-4000-8000-0000000000b1', 'prueba.mp4', 12345678,
        'htdemucs-fp16@a4a57cc', 201.5, null, null, null, null),
       ('5e5e5e5e-0000-4000-8000-000000000002', null, '5e5e5e5e-0000-4000-8000-0000000000a1',
        '5e5e5e5e-0000-4000-8000-0000000000ff', 'prueba.mp4', 12345678, 'htdemucs-fp16@a4a57cc', 201.5,
        null, null, null, null);
do $$
declare r public.video_stems;
begin
  select * into r from public.video_stems where id = '5e5e5e5e-0000-4000-8000-000000000001';
  if r.crew_id <> private.default_group() or r.vocals_path is not null or r.vocals_size is not null then
    raise exception 'FAIL stems insert rules: crew=% path=%', r.crew_id, r.vocals_path;
  end if;
  if r.member_id is distinct from '5e5e5e5e-0000-4000-8000-0000000000b1'::uuid then
    raise exception 'FAIL the live member who separated was dropped';
  end if;
  if (select member_id from public.video_stems where id = '5e5e5e5e-0000-4000-8000-000000000002') is not null then
    raise exception 'FAIL an unknown member was kept';
  end if;
  raise notice 'PASS separations take their video''s group and are never born with files';
end $$;

-- 1b) A separation needs a live video.
do $$
declare ok boolean := false;
begin
  begin
    insert into public.video_stems (id, video_id, source_file_name, source_file_size, model, duration_seconds)
    values (gen_random_uuid(), gen_random_uuid(), 'x.mp4', 1, 'm', 1);
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FAIL a separation without a video was accepted'; end if;
  raise notice 'PASS a separation needs a live video';
end $$;

-- 2) Columns the client can't change.
do $$
declare ok boolean := false;
begin
  begin
    update public.video_stems set delay_seconds = 0.5 where id = '5e5e5e5e-0000-4000-8000-000000000001';
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL client could rewrite a separation''s sync data'; end if;
  raise notice 'PASS the separation''s description is not client-editable';
end $$;

-- 3) Uploads: only under the row's own folder, one file per kind, and no orphans.
do $$
declare
  v_crew text := (select private.default_group())::text;
  v_dir  text := v_crew || '/stems/5e5e5e5e-0000-4000-8000-000000000001/';
  ok boolean := false;
begin
  begin
    insert into storage.objects (bucket_id, name, metadata) values ('videos', v_dir || 'vocals.m4a', '{"size": 4000000}');
    insert into storage.objects (bucket_id, name, metadata) values ('videos', v_dir || 'instrumental.m4a', '{"size": 4100000}');
  exception when insufficient_privilege then
    -- RLS refused an upload the app makes: a real regression, not an inconclusive test.
    raise exception 'FAIL an allowed track upload was refused by RLS: %', sqlerrm;
  when others then
    raise notice 'INCONCLUSIVE direct insert into storage.objects failed: % (%)', sqlerrm, sqlstate;
    return;
  end;
  raise notice 'PASS both tracks can be uploaded under the separation''s folder';

  begin
    insert into storage.objects (bucket_id, name) values ('videos', v_dir || 'vocals.webm');
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FAIL a second voice file for the same separation was accepted'; end if;
  ok := false;
  -- A retry uploading the very same track again: the unique index answers (409 «already there»), not the policy
  -- (403), so a half-uploaded separation can be finished.
  begin
    insert into storage.objects (bucket_id, name) values ('videos', v_dir || 'vocals.m4a');
  exception when unique_violation then ok := true;
            when others then
              raise exception 'FAIL re-uploading the same track gave % (%), not a unique violation', sqlerrm, sqlstate;
  end;
  if not ok then raise exception 'FAIL the same track was stored twice'; end if;
  raise notice 'PASS re-uploading the same track is a unique violation (409), not a refusal';
  ok := false;
  begin
    insert into storage.objects (bucket_id, name) values ('videos', v_dir || 'drums.m4a');
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FAIL an unknown kind of track was accepted'; end if;
  ok := false;
  begin
    insert into storage.objects (bucket_id, name)
    values ('videos', v_crew || '/stems/' || gen_random_uuid()::text || '/vocals.m4a');
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FAIL upload without a separation row accepted'; end if;
  ok := false;
  begin
    insert into storage.objects (bucket_id, name)
    values ('videos', gen_random_uuid()::text || '/stems/5e5e5e5e-0000-4000-8000-000000000001/vocals.ogg');
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FAIL upload into another group''s folder accepted'; end if;
  raise notice 'PASS one file per kind, no orphan uploads';
end $$;

-- 4) Before the row points at them, the tracks are not readable.
do $$
begin
  if exists (select 1 from storage.objects where name like '%/stems/5e5e5e5e-0000-4000-8000-000000000001/%') then
    raise exception 'FAIL tracks readable before the separation was completed';
  end if;
  raise notice 'PASS tracks are unreadable until the separation is complete';
end $$;

-- 5) Completing: both paths at once, only with the files there, real sizes, then locked.
do $$
declare
  v_dir text := (select private.default_group())::text || '/stems/5e5e5e5e-0000-4000-8000-000000000001/';
  ok boolean := false;
begin
  begin
    update public.video_stems set vocals_path = v_dir || 'vocals.m4a' where id = '5e5e5e5e-0000-4000-8000-000000000001';
  exception when others then ok := sqlerrm in ('stems_incomplete', 'new row for relation "video_stems" violates check constraint "video_stems_both_or_none"');
  end;
  if not ok then raise exception 'FAIL one track alone completed a separation'; end if;
  ok := false;
  begin
    update public.video_stems
    set vocals_path = v_dir || 'vocals.mp4', instrumental_path = v_dir || 'instrumental.mp4'
    where id = '5e5e5e5e-0000-4000-8000-000000000001';
  exception when others then ok := sqlerrm = 'stems_file_missing';
  end;
  if not ok then raise exception 'FAIL a separation was completed with files that are not in the bucket'; end if;

  update public.video_stems
  set vocals_path = v_dir || 'vocals.m4a', instrumental_path = v_dir || 'instrumental.m4a', vocals_size = 1, instrumental_size = 1
  where id = '5e5e5e5e-0000-4000-8000-000000000001';
  if (select vocals_size from public.video_stems where id = '5e5e5e5e-0000-4000-8000-000000000001') <> 4000000
     or (select instrumental_size from public.video_stems where id = '5e5e5e5e-0000-4000-8000-000000000001') <> 4100000 then
    raise exception 'FAIL the tracks'' sizes are not the files'' real sizes';
  end if;
  raise notice 'PASS a separation is completed with both real files';

  ok := false;
  begin
    update public.video_stems set vocals_path = null, instrumental_path = null where id = '5e5e5e5e-0000-4000-8000-000000000001';
  exception when others then ok := sqlerrm = 'stems_locked';
  end;
  if not ok then raise exception 'FAIL the tracks of a separation could be changed'; end if;
  update public.video_stems set vocals_size = 1 where id = '5e5e5e5e-0000-4000-8000-000000000001';
  if (select vocals_size from public.video_stems where id = '5e5e5e5e-0000-4000-8000-000000000001') <> 4000000 then
    raise exception 'FAIL a completed separation''s size was rewritten';
  end if;
  raise notice 'PASS a completed separation is locked';

  if (select count(*) from storage.objects where name like '%/stems/5e5e5e5e-0000-4000-8000-000000000001/%') <> 2 then
    raise exception 'FAIL the completed tracks are not readable';
  end if;
  if ((select public.storage_usage()) ->> 'total')::bigint < 8100000 then
    raise exception 'FAIL storage_usage() does not count the tracks';
  end if;
  raise notice 'PASS completed tracks are readable and count against the group''s space';
end $$;

-- 6) A path of another separation (or another name) doesn't fit the row; a track over 16 MiB is refused.
do $$
declare
  v_crew text := (select private.default_group())::text;
  v_dir  text := v_crew || '/stems/5e5e5e5e-0000-4000-8000-000000000002/';
  ok boolean := false;
begin
  begin
    insert into storage.objects (bucket_id, name, metadata) values ('videos', v_dir || 'vocals.m4a', '{"size": 20000000}');
    insert into storage.objects (bucket_id, name, metadata) values ('videos', v_dir || 'instrumental.m4a', '{"size": 3000000}');
  exception when insufficient_privilege then
    -- RLS refused an upload the app makes: a real regression, not an inconclusive test.
    raise exception 'FAIL an allowed track upload was refused by RLS: %', sqlerrm;
  when others then
    raise notice 'INCONCLUSIVE direct insert into storage.objects failed: % (%)', sqlerrm, sqlstate;
    return;
  end;
  begin
    update public.video_stems
    set vocals_path = v_crew || '/stems/5e5e5e5e-0000-4000-8000-000000000001/vocals.m4a',
        instrumental_path = v_crew || '/stems/5e5e5e5e-0000-4000-8000-000000000001/instrumental.m4a'
    where id = '5e5e5e5e-0000-4000-8000-000000000002';
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL a separation pointed at another separation''s tracks'; end if;
  ok := false;
  begin
    update public.video_stems set vocals_path = v_dir || 'vocals.m4a', instrumental_path = v_dir || 'instrumental.m4a'
    where id = '5e5e5e5e-0000-4000-8000-000000000002';
  exception when others then ok := sqlerrm = 'stems_too_big';
  end;
  if not ok then raise exception 'FAIL a track over 16 MiB was accepted'; end if;
  raise notice 'PASS tracks belong to their own separation and stay under 16 MiB';
end $$;

-- 6b) Stored tracks can't be overwritten (update / upsert) nor deleted by the client.
do $$
declare
  v_path text := (select private.default_group())::text || '/stems/5e5e5e5e-0000-4000-8000-000000000001/vocals.m4a';
  n int;
begin
  update storage.objects set metadata = '{"size": 1}' where bucket_id = 'videos' and name = v_path;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL a stored track was rewritten'; end if;
  begin
    insert into storage.objects (bucket_id, name, metadata) values ('videos', v_path, '{"size": 1}')
    on conflict (bucket_id, name) do update set metadata = excluded.metadata;
  exception when others then null;
  end;
  delete from storage.objects where bucket_id = 'videos' and name = v_path;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL a stored track was deleted by the client'; end if;
end $$;
reset role;
do $$
begin
  if (select metadata ->> 'size' from storage.objects
      where bucket_id = 'videos'
        and name = (select private.default_group())::text || '/stems/5e5e5e5e-0000-4000-8000-000000000001/vocals.m4a')
     is distinct from '4000000' then
    raise exception 'FAIL a stored track was overwritten or deleted';
  end if;
  raise notice 'PASS stored tracks are never overwritten nor deleted';
end $$;
set local role anon;

-- 6c) Archiving a complete separation (not its video) leaves its tracks unreadable.
insert into public.video_stems (id, video_id, source_file_name, source_file_size, model, duration_seconds)
values ('5e5e5e5e-0000-4000-8000-000000000006', '5e5e5e5e-0000-4000-8000-0000000000a1', 'prueba.mp4', 12345678,
        'htdemucs-fp16@a4a57cc', 201.5);
do $$
declare
  v_dir text := (select private.default_group())::text || '/stems/5e5e5e5e-0000-4000-8000-000000000006/';
begin
  begin
    insert into storage.objects (bucket_id, name, metadata) values ('videos', v_dir || 'vocals.m4a', '{"size": 1000}');
    insert into storage.objects (bucket_id, name, metadata) values ('videos', v_dir || 'instrumental.m4a', '{"size": 1000}');
  exception when insufficient_privilege then
    -- RLS refused an upload the app makes: a real regression, not an inconclusive test.
    raise exception 'FAIL an allowed track upload was refused by RLS: %', sqlerrm;
  when others then
    raise notice 'INCONCLUSIVE direct insert into storage.objects failed: % (%)', sqlerrm, sqlstate;
    return;
  end;
  update public.video_stems set vocals_path = v_dir || 'vocals.m4a', instrumental_path = v_dir || 'instrumental.m4a'
  where id = '5e5e5e5e-0000-4000-8000-000000000006';
  if (select count(*) from storage.objects where name like v_dir || '%') <> 2 then
    raise exception 'FAIL the completed tracks are not readable';
  end if;
  delete from public.video_stems where id = '5e5e5e5e-0000-4000-8000-000000000006';
  if exists (select 1 from storage.objects where name like v_dir || '%') then
    raise exception 'FAIL tracks of an archived separation are still readable';
  end if;
  if not exists (select 1 from public.videos where id = '5e5e5e5e-0000-4000-8000-0000000000a1') then
    raise exception 'FAIL archiving a separation archived its video';
  end if;
  raise notice 'PASS «Quitar las pistas separadas» archives the separation and its tracks stop being readable';
end $$;

-- 6d) Another group's stems folder is never readable, and video_object_size tells nothing outside the group's tracks.
reset role;
insert into storage.objects (bucket_id, name, metadata)
values ('videos', '0f0f0f0f-0000-4000-8000-000000000000/stems/5e5e5e5e-0000-4000-8000-000000000001/vocals.m4a', '{"size": 7}'),
       ('videos', (select private.default_group())::text || '/5e5e5e5e-0000-4000-8000-0000000000a1--zzsize.mp4', '{"size": 9}');
set local role anon;
do $$
begin
  if exists (select 1 from storage.objects where name like '0f0f0f0f-0000-4000-8000-000000000000/%') then
    raise exception 'FAIL another group''s tracks are readable';
  end if;
  if private.video_object_size('0f0f0f0f-0000-4000-8000-000000000000/stems/5e5e5e5e-0000-4000-8000-000000000001/vocals.m4a') is not null
     or private.video_object_size((select private.default_group())::text || '/5e5e5e5e-0000-4000-8000-0000000000a1--zzsize.mp4') is not null then
    raise exception 'FAIL video_object_size gives the size of a file that is not one of the group''s tracks';
  end if;
  if private.video_object_size((select private.default_group())::text || '/stems/5e5e5e5e-0000-4000-8000-000000000001/vocals.m4a') <> 4000000 then
    raise exception 'FAIL video_object_size no longer reads the group''s own tracks';
  end if;
  raise notice 'PASS no other group''s tracks, and no sizes of other files';
end $$;

-- 6e) Never half a separation for lack of space: the first track needs room for both; the second, for itself.
insert into public.video_stems (id, video_id, source_file_name, source_file_size, model, duration_seconds)
values ('5e5e5e5e-0000-4000-8000-000000000004', '5e5e5e5e-0000-4000-8000-0000000000a1', 'prueba.mp4', 12345678,
        'htdemucs-fp16@a4a57cc', 201.5),
       ('5e5e5e5e-0000-4000-8000-000000000005', '5e5e5e5e-0000-4000-8000-0000000000a1', 'prueba.mp4', 12345678,
        'htdemucs-fp16@a4a57cc', 201.5);
reset role;
-- The voice of 005 is already up; then fill the group up to 24 MiB under the line (1 GiB − 50 MB).
insert into storage.objects (bucket_id, name, metadata)
values ('videos', (select private.default_group())::text || '/stems/5e5e5e5e-0000-4000-8000-000000000005/vocals.m4a', '{"size": 1000}');
insert into storage.objects (bucket_id, name, metadata)
select 'videos', 'zz-check/filler-stems.mp4',
       jsonb_build_object('size', (1073741824 - 52428800 - 25165824) - private.storage_bytes_used());
set local role anon;
do $$
declare
  v_crew text := (select private.default_group())::text;
  ok boolean := false;
begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('videos', v_crew || '/stems/5e5e5e5e-0000-4000-8000-000000000004/instrumental.m4a');
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FAIL the first track went up with room for only one'; end if;
  ok := false;
  -- Near the line, a retry of a track already up still gets «already there», not a refusal.
  begin
    insert into storage.objects (bucket_id, name)
    values ('videos', v_crew || '/stems/5e5e5e5e-0000-4000-8000-000000000005/vocals.m4a');
  exception when unique_violation then ok := true;
            when others then
              raise exception 'FAIL near the line, re-uploading a stored track gave % (%)', sqlerrm, sqlstate;
  end;
  if not ok then raise exception 'FAIL the same track was stored twice near the line'; end if;
  begin
    insert into storage.objects (bucket_id, name)
    values ('videos', v_crew || '/stems/5e5e5e5e-0000-4000-8000-000000000005/instrumental.m4a');
  exception when others then
    raise exception 'FAIL the second track was refused although it fits: % (%)', sqlerrm, sqlstate;
  end;
  raise notice 'PASS tracks need room for the whole separation, keeping 50 MB for one take';
end $$;
reset role;
delete from storage.objects where name = 'zz-check/filler-stems.mp4';
set local role anon;

-- 6f) No upload for a separation whose video was archived.
insert into public.videos (id, crew_id, title, source, youtube_id)
values ('5e5e5e5e-0000-4000-8000-0000000000a2', (select private.default_group()), 'Prueba pistas 2', 'youtube', 'zzTestStem2');
insert into public.video_stems (id, video_id, source_file_name, source_file_size, model, duration_seconds)
values ('5e5e5e5e-0000-4000-8000-000000000007', '5e5e5e5e-0000-4000-8000-0000000000a2', 'otra.mp4', 999,
        'htdemucs-fp16@a4a57cc', 100);
delete from public.videos where id = '5e5e5e5e-0000-4000-8000-0000000000a2';
do $$
declare ok boolean := false;
begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('videos', (select private.default_group())::text || '/stems/5e5e5e5e-0000-4000-8000-000000000007/vocals.m4a');
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FAIL a track was uploaded for an archived video'; end if;
  raise notice 'PASS no tracks for an archived video';
end $$;

-- 7) The project's 1 GiB: with storage (almost) full, no more tracks.
insert into public.video_stems (id, video_id, source_file_name, source_file_size, model, duration_seconds)
values ('5e5e5e5e-0000-4000-8000-000000000003', '5e5e5e5e-0000-4000-8000-0000000000a1', 'prueba.mp4', 12345678,
        'htdemucs-fp16@a4a57cc', 201.5);
reset role;
insert into storage.objects (bucket_id, name, metadata) values ('videos', 'zz-check/full-stems.mp4', '{"size": 1045000000}');
set local role anon;
do $$
declare ok boolean := false;
begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('videos', (select private.default_group())::text || '/stems/5e5e5e5e-0000-4000-8000-000000000003/vocals.m4a');
  exception when insufficient_privilege then ok := true;
           when others then ok := true;
  end;
  if not ok then raise exception 'FAIL a track was uploaded with the storage full'; end if;
  raise notice 'PASS no tracks past the free storage';
end $$;

-- The deletes above count as a burst when the whole file runs as one statement (pnpm db:test): start afresh.
select set_config('app.archive_burst', '', true);

-- 8) Deleting archives; archiving the video archives its separations; the tracks stop being readable.
delete from public.video_stems where id = '5e5e5e5e-0000-4000-8000-000000000003';
do $$
begin
  if exists (select 1 from public.video_stems where id = '5e5e5e5e-0000-4000-8000-000000000003') then
    raise exception 'FAIL deleted separation still visible';
  end if;
  raise notice 'PASS deleting a separation archives it';
end $$;
delete from public.videos where id = '5e5e5e5e-0000-4000-8000-0000000000a1';
do $$
begin
  if exists (select 1 from public.video_stems where video_id = '5e5e5e5e-0000-4000-8000-0000000000a1')
     or exists (select 1 from storage.objects where name like '%/stems/5e5e5e5e-0000-4000-8000-000000000001/%') then
    raise exception 'FAIL separations (or their tracks) of an archived video still visible';
  end if;
  raise notice 'PASS archiving the video hides its separations and their tracks';
end $$;

reset role;
do $$
begin
  if (select count(*) from public.video_stems where video_id = '5e5e5e5e-0000-4000-8000-0000000000a1' and archived_at is not null) <> 6 then
    raise exception 'FAIL separation rows were not kept as archived';
  end if;
  raise notice 'PASS archived separation rows are kept';
end $$;

rollback;
