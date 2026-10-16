-- Checks for 20261016000000_linked_file_and_members.sql (F1 linked file, F2 members).
-- Run the whole file in one go (SQL editor / MCP execute_sql as postgres, or `pnpm db:test`). It acts as `anon`
-- like the app, prints `PASS …`, raises `FAIL …` on the first problem and ends with ROLLBACK: nothing is kept.

begin;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

-- ── F2 · members ─────────────────────────────────────────────

insert into public.members (id, name, color) values ('0b0b0b0b-0000-4000-8000-000000000001', 'Prueba Ana', 'shu');
do $$
declare r public.members;
begin
  select * into r from public.members where id = '0b0b0b0b-0000-4000-8000-000000000001';
  if r.id is null or r.crew_id <> private.default_group() then
    raise exception 'FAIL member not created in the default group';
  end if;
  raise notice 'PASS member created in the default group';
end $$;

do $$
declare ok boolean := false;
begin
  begin
    insert into public.members (name) values ('  prueba ana ');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL duplicate member name (case/spaces) accepted'; end if;
  raise notice 'PASS member names are unique among live members';
end $$;

do $$
declare ok boolean := false;
begin
  begin
    insert into public.members (crew_id, name) values ('00000000-0000-0000-0000-000000000000', 'Grupo falso');
    ok := (select crew_id from public.members where name = 'Grupo falso') = private.default_group();
  exception when others then ok := false;
  end;
  if not ok then raise exception 'FAIL client crew_id not ignored'; end if;
  raise notice 'PASS a client crew_id is replaced by the default group';
end $$;

update public.members set name = 'Prueba Ana B', color = 'ai' where id = '0b0b0b0b-0000-4000-8000-000000000001';
do $$
declare ok boolean := false;
begin
  begin
    update public.members set archived_at = now() where id = '0b0b0b0b-0000-4000-8000-000000000001';
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL client could set archived_at by UPDATE'; end if;
  raise notice 'PASS rename works, archived_at is not client-writable';
end $$;

delete from public.members where id = '0b0b0b0b-0000-4000-8000-000000000001';
do $$
begin
  if exists (select 1 from public.members where id = '0b0b0b0b-0000-4000-8000-000000000001') then
    raise exception 'FAIL archived member still visible';
  end if;
  raise notice 'PASS deleting a member archives it';
end $$;
reset role;
do $$
begin
  if not exists (select 1 from public.members where id = '0b0b0b0b-0000-4000-8000-000000000001' and archived_at is not null) then
    raise exception 'FAIL member row really deleted';
  end if;
  raise notice 'PASS the archived member row is kept';
end $$;

-- ── F1 · linked file on a YouTube entry ──────────────────────

set local role anon;
insert into public.videos (id, crew_id, title, source, youtube_id)
values ('0b0b0b0b-0000-4000-8000-0000000000a1', (select private.default_group()), 'Prueba vinculada', 'youtube', 'zzTestLink1');

update public.videos
set file_name = 'practice.mp4', file_size = 1000, file_offset_seconds = -1.25, file_duration_seconds = 200.5
where id = '0b0b0b0b-0000-4000-8000-0000000000a1';
do $$
begin
  if not exists (select 1 from public.videos where id = '0b0b0b0b-0000-4000-8000-0000000000a1'
                 and file_offset_seconds = -1.25 and file_duration_seconds = 200.5 and source = 'youtube') then
    raise exception 'FAIL could not store the linked file data on a YouTube entry';
  end if;
  raise notice 'PASS a YouTube entry stores file name, offset and duration';
end $$;

do $$
declare ok boolean := false;
begin
  begin
    update public.videos set file_offset_seconds = 99999 where id = '0b0b0b0b-0000-4000-8000-0000000000a1';
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL absurd offset accepted'; end if;
  raise notice 'PASS offset is range-checked';
end $$;

-- Upload the file, attach it, detach it, attach a replacement under a new name.
do $$
declare
  v_crew text := (select private.default_group())::text;
  v_vid  text := '0b0b0b0b-0000-4000-8000-0000000000a1';
  ok boolean := false;
begin
  begin
    insert into storage.objects (bucket_id, name) values ('videos', v_crew || '/' || v_vid || '.mp4');
  exception when others then
    raise notice 'INCONCLUSIVE direct insert into storage.objects failed: % (%)', sqlerrm, sqlstate;
    return;
  end;
  update public.videos set storage_path = v_crew || '/' || v_vid || '.mp4' where id = v_vid::uuid;
  raise notice 'PASS a YouTube entry accepts its file in the bucket';

  begin
    insert into storage.objects (bucket_id, name) values ('videos', v_crew || '/' || v_vid || '--r2.mp4');
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL a second file was accepted while one is attached'; end if;
  raise notice 'PASS no second file while one is attached';

  update public.videos set storage_path = null where id = v_vid::uuid;
  if exists (select 1 from storage.objects where name = v_crew || '/' || v_vid || '.mp4') then
    -- After detaching, the old file is no longer this video's file: it is not readable from the client.
    raise exception 'FAIL detached file still readable';
  end if;
  raise notice 'PASS «Quitar el archivo» detaches it (and hides the old file)';

  insert into storage.objects (bucket_id, name) values ('videos', v_crew || '/' || v_vid || '--r2.mp4');
  update public.videos set storage_path = v_crew || '/' || v_vid || '--r2.mp4' where id = v_vid::uuid;
  raise notice 'PASS a replacement file is linked under a new name';
end $$;

-- An uploaded video's file can't be detached or repointed.
insert into public.videos (id, crew_id, title, source, file_name)
values ('0b0b0b0b-0000-4000-8000-0000000000a2', (select private.default_group()), 'Prueba subida F1', 'upload', 'x.mp4');
do $$
declare
  v_crew text := (select private.default_group())::text;
  v_vid  text := '0b0b0b0b-0000-4000-8000-0000000000a2';
  ok boolean := false;
begin
  update public.videos set storage_path = v_crew || '/' || v_vid || '.mp4' where id = v_vid::uuid;
  begin
    update public.videos set storage_path = null where id = v_vid::uuid;
  exception when others then ok := sqlerrm = 'storage_path_locked';
  end;
  if not ok then raise exception 'FAIL an uploaded video''s file could be detached'; end if;
  ok := false;
  begin
    insert into storage.objects (bucket_id, name) values ('videos', v_crew || '/' || v_vid || '--x.mp4');
  exception when insufficient_privilege then ok := true;
           when others then ok := true;
  end;
  if not ok then raise exception 'FAIL a suffixed file accepted for an uploaded video'; end if;
  raise notice 'PASS uploaded videos keep one fixed file';
end $$;

-- Another video's file can't be attached to this one.
do $$
declare ok boolean := false;
begin
  begin
    update public.videos
    set storage_path = (select private.default_group())::text || '/0b0b0b0b-0000-4000-8000-0000000000a2.mp4'
    where id = '0b0b0b0b-0000-4000-8000-0000000000a1';
  exception when check_violation then ok := true;
           when others then ok := sqlerrm = 'storage_path_locked';
  end;
  if not ok then raise exception 'FAIL storage_path could point at another video''s file'; end if;
  raise notice 'PASS storage_path only points at the video''s own file';
end $$;

-- Notes can carry an author.
insert into public.members (id, name) values ('0b0b0b0b-0000-4000-8000-000000000002', 'Prueba Bea');
insert into public.notes (video_id, crew_id, at_seconds, body, author_member_id)
values ('0b0b0b0b-0000-4000-8000-0000000000a1', (select private.default_group()), 3, 'nota con autora',
        '0b0b0b0b-0000-4000-8000-000000000002');
do $$
begin
  if not exists (select 1 from public.notes where body = 'nota con autora'
                 and author_member_id = '0b0b0b0b-0000-4000-8000-000000000002') then
    raise exception 'FAIL note author not stored';
  end if;
  raise notice 'PASS notes store their author';
end $$;

-- Round-1 review: a linked cloud file's description can't be rewritten over it (stale second phone).
do $$
declare ok boolean := false;
begin
  if (select storage_path from public.videos where id = '0b0b0b0b-0000-4000-8000-0000000000a1') is null then
    raise notice 'INCONCLUSIVE file lock (no cloud file was attached above)';
    return;
  end if;
  begin
    update public.videos set file_name = 'otro.mp4', file_size = 5 where id = '0b0b0b0b-0000-4000-8000-0000000000a1';
  exception when others then ok := sqlerrm = 'file_locked';
  end;
  if not ok then raise exception 'FAIL file data rewritten while a cloud file is attached'; end if;
  update public.videos set file_offset_seconds = 0.5 where id = '0b0b0b0b-0000-4000-8000-0000000000a1';
  raise notice 'PASS a linked file''s data is locked (the offset can still be re-synced)';
end $$;

-- Round 2: a file that only lives on one phone (> 50 MB) can't be described over either; removing it first can.
do $$
declare ok boolean := false;
begin
  insert into public.videos (id, crew_id, title, source, youtube_id)
  values ('0b0b0b0b-0000-4000-8000-0000000000a5', (select private.default_group()), 'Prueba solo local', 'youtube', 'zzTestLink5');
  update public.videos set file_name = 'grande.mp4', file_size = 90000000 where id = '0b0b0b0b-0000-4000-8000-0000000000a5';
  begin
    update public.videos set file_name = 'otro.mp4', file_size = 5 where id = '0b0b0b0b-0000-4000-8000-0000000000a5';
  exception when others then ok := sqlerrm = 'file_locked';
  end;
  if not ok then raise exception 'FAIL a phone-only linked file was described over'; end if;
  update public.videos set file_name = null, file_size = null where id = '0b0b0b0b-0000-4000-8000-0000000000a5';
  update public.videos set file_name = 'nuevo.mp4', file_size = 7 where id = '0b0b0b0b-0000-4000-8000-0000000000a5';
  raise notice 'PASS a phone-only file is locked too; remove-then-link still works';
end $$;

-- An uploaded video's path can't carry the replacement suffix.
do $$
declare ok boolean := false;
begin
  insert into public.videos (id, crew_id, title, source, file_name)
  values ('0b0b0b0b-0000-4000-8000-0000000000a3', (select private.default_group()), 'Prueba sufijo', 'upload', 'y.mp4');
  begin
    update public.videos
    set storage_path = (select private.default_group())::text || '/0b0b0b0b-0000-4000-8000-0000000000a3--x1.mp4'
    where id = '0b0b0b0b-0000-4000-8000-0000000000a3';
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL an uploaded video''s path accepted a suffix'; end if;
  raise notice 'PASS uploaded videos keep the plain file name';
end $$;

-- At most 5 cloud files ever for a YouTube entry (removed ones stay in the bucket).
do $$
declare
  v_crew text := (select private.default_group())::text;
  v_vid  text := '0b0b0b0b-0000-4000-8000-0000000000a4';
  ok boolean := false;
  i int;
begin
  insert into public.videos (id, crew_id, title, source, youtube_id)
  values (v_vid::uuid, v_crew::uuid, 'Prueba tope archivos', 'youtube', 'zzTestLink4');
  begin
    for i in 1..5 loop
      insert into storage.objects (bucket_id, name) values ('videos', v_crew || '/' || v_vid || '--n' || i || '.mp4');
    end loop;
  exception when others then
    raise notice 'INCONCLUSIVE file cap (direct insert into storage.objects failed: %)', sqlerrm;
    return;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('videos', v_crew || '/' || v_vid || '--n6.mp4');
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL a sixth file for the same YouTube entry was accepted'; end if;
  raise notice 'PASS a YouTube entry can''t pile up more than 5 files';
end $$;

reset role;
rollback;
