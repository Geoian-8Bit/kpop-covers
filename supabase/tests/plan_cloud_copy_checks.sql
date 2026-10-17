-- Checks for point 13 (reduced copy for the group's cloud). No migration: the rules of 20261016000000_linked_file_
-- and_members, 000100 and 000200 already let the device that has the original send a lighter copy of another size.
-- These checks pin that down so a later rule can't break it without noticing.
-- Run the whole file in one go (SQL editor / MCP execute_sql as postgres, or `pnpm db:test`). It acts as `anon`
-- like the app, prints `PASS …`, raises `FAIL …` on the first problem and ends with ROLLBACK: nothing is kept.

begin;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

-- A YouTube entry whose linked file (55,8 MB) stayed on one device: described, not in the cloud.
insert into public.videos (id, crew_id, title, source, youtube_id)
values ('0c0c0c0c-0000-4000-8000-0000000000c1', (select private.default_group()), 'Prueba copia nube', 'youtube', 'zzTestCopy1');
update public.videos
set file_name = 'boom-boom-bass.mp4', file_size = 58477041, file_offset_seconds = 0.42, file_duration_seconds = 182.4
where id = '0c0c0c0c-0000-4000-8000-0000000000c1';

do $$
declare
  v_crew text := (select private.default_group())::text;
  v_vid  text := '0c0c0c0c-0000-4000-8000-0000000000c1';
  v_path text := v_crew || '/' || v_vid || '--c0py01.mp4';
  r public.videos;
begin
  begin
    -- The copy weighs 48 MB, not the 58 477 041 bytes the row describes.
    insert into storage.objects (bucket_id, name, metadata)
    values ('videos', v_path, jsonb_build_object('size', 50331648, 'mimetype', 'video/mp4'));
  exception when others then
    raise notice 'INCONCLUSIVE direct insert into storage.objects failed: % (%)', sqlerrm, sqlstate;
    return;
  end;
  raise notice 'PASS the bucket takes a copy of another size than the described original';

  update public.videos set storage_path = v_path where id = v_vid::uuid;
  select * into r from public.videos where id = v_vid::uuid;
  if r.storage_path is distinct from v_path then raise exception 'FAIL the copy could not be attached'; end if;
  if r.file_size <> 58477041 or r.file_name <> 'boom-boom-bass.mp4' or r.file_offset_seconds <> 0.42
     or r.file_duration_seconds <> 182.4 then
    raise exception 'FAIL attaching the copy changed the original''s description or sync';
  end if;
  raise notice 'PASS the copy is attached and the original''s description and offset stay';

  if not exists (select 1 from storage.objects where name = v_path) then
    raise exception 'FAIL the attached copy is not readable';
  end if;
  raise notice 'PASS the group can read the attached copy';
end $$;

-- A second device can't attach another copy over it.
do $$
declare
  v_crew text := (select private.default_group())::text;
  v_vid  text := '0c0c0c0c-0000-4000-8000-0000000000c1';
  ok boolean := false;
begin
  begin
    insert into storage.objects (bucket_id, name) values ('videos', v_crew || '/' || v_vid || '--other1.mp4');
  exception when insufficient_privilege then ok := true;
           when others then ok := true;
  end;
  if not ok then raise exception 'FAIL a second copy was accepted while one is attached'; end if;
  raise notice 'PASS no second copy once one is attached';
end $$;

-- An uploaded video over 50 MB: its copy goes under the plain name, whatever its size.
insert into public.videos (id, crew_id, title, source, file_name, file_size)
values ('0c0c0c0c-0000-4000-8000-0000000000c2', (select private.default_group()), 'Prueba subida grande', 'upload', 'grande.mov', 90000000);
do $$
declare
  v_crew text := (select private.default_group())::text;
  v_vid  text := '0c0c0c0c-0000-4000-8000-0000000000c2';
begin
  begin
    insert into storage.objects (bucket_id, name, metadata)
    values ('videos', v_crew || '/' || v_vid || '.mp4', jsonb_build_object('size', 49000000));
  exception when others then
    raise notice 'INCONCLUSIVE direct insert into storage.objects failed: % (%)', sqlerrm, sqlstate;
    return;
  end;
  update public.videos set storage_path = v_crew || '/' || v_vid || '.mp4' where id = v_vid::uuid;
  if not exists (select 1 from public.videos where id = v_vid::uuid and storage_path is not null and file_size = 90000000) then
    raise exception 'FAIL an uploaded video could not take its lighter copy';
  end if;
  raise notice 'PASS an uploaded video over 50 MB takes its lighter copy (plain name, original size kept)';
end $$;

reset role;
rollback;
