-- Checks for 20261016070000_follow_paths.sql (F10 · seguir a un bailarín).
-- Run the whole file in one go as postgres (SQL editor / MCP execute_sql, or `pnpm db:test`). Acts as `anon`,
-- prints `PASS …`, raises `FAIL …` on the first problem, ends with ROLLBACK.

begin;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into public.videos (id, crew_id, title, source, youtube_id)
values ('f1010101-0000-4000-8000-0000000000a1', (select private.default_group()), 'Prueba seguir A', 'youtube', 'zzTestF10a1'),
       ('f1010101-0000-4000-8000-0000000000a2', (select private.default_group()), 'Prueba seguir B', 'youtube', 'zzTestF10a2');
insert into public.members (id, name) values ('f1010101-0000-4000-8000-0000000000b1', 'Prueba Minji');

-- A path belongs to its video's group; an unknown member becomes «nobody».
insert into public.follow_paths (id, crew_id, video_id, label, member_id, source, model, keyframes)
values ('f1010101-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
        'f1010101-0000-4000-8000-0000000000a1', 'Minji', 'f1010101-0000-4000-8000-0000000000b1', 'auto',
        'movenet-multipose-lightning', '[[0, 0.4, 0.2, 0.1, 0.5], [1.5, 0.45, 0.2, 0.1, 0.5]]'),
       ('f1010101-0000-4000-8000-000000000002', null, 'f1010101-0000-4000-8000-0000000000a1', 'Centro',
        'f1010101-0000-4000-8000-0000000000ff', 'manual', null, '[[2, 0.5, 0.3, 0.2, 0.5]]');
do $$
begin
  if (select crew_id from public.follow_paths where id = 'f1010101-0000-4000-8000-000000000001') <> private.default_group() then
    raise exception 'FAIL path not in the video''s group';
  end if;
  if (select member_id from public.follow_paths where id = 'f1010101-0000-4000-8000-000000000002') is not null then
    raise exception 'FAIL an unknown member was kept';
  end if;
  if (select jsonb_array_length(keyframes) from public.follow_paths where id = 'f1010101-0000-4000-8000-000000000001') <> 2 then
    raise exception 'FAIL keyframes not stored';
  end if;
  raise notice 'PASS paths are shared in the video''s group; unknown members become nobody';
end $$;

-- Shape: label 1–40, source auto|manual, keyframes an array under 600 KB.
do $$
declare bad int := 0;
begin
  begin
    insert into public.follow_paths (video_id, label) values ('f1010101-0000-4000-8000-0000000000a1', '  ');
  exception when check_violation then bad := bad + 1;
  end;
  begin
    insert into public.follow_paths (video_id, label, source) values ('f1010101-0000-4000-8000-0000000000a1', 'X', 'robot');
  exception when check_violation then bad := bad + 1;
  end;
  begin
    insert into public.follow_paths (video_id, label, keyframes) values ('f1010101-0000-4000-8000-0000000000a1', 'X', '{}');
  exception when check_violation then bad := bad + 1;
  end;
  begin
    insert into public.follow_paths (video_id, label, keyframes)
    select 'f1010101-0000-4000-8000-0000000000a1', 'Enorme',
           jsonb_agg(jsonb_build_array(g * 0.1, random(), random(), random(), random()))
    from generate_series(1, 20000) g;
  exception when check_violation then bad := bad + 1;
  end;
  if bad <> 4 then raise exception 'FAIL % of 4 bad paths were refused', bad; end if;
  raise notice 'PASS labels, source and keyframes are checked (600 KB at most)';
end $$;

-- Only the granted columns change.
update public.follow_paths
set keyframes = '[[0, 0.1, 0.2, 0.1, 0.5]]', label = 'Minji (corregido)', model = 'movenet-multipose-lightning', source = 'auto'
where id = 'f1010101-0000-4000-8000-000000000001';
do $$
declare ok boolean := false;
begin
  begin
    update public.follow_paths set video_id = 'f1010101-0000-4000-8000-0000000000a2' where id = 'f1010101-0000-4000-8000-000000000001';
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL a path moved to another video'; end if;
  if (select label from public.follow_paths where id = 'f1010101-0000-4000-8000-000000000001') <> 'Minji (corregido)' then
    raise exception 'FAIL a correction was not saved';
  end if;
  raise notice 'PASS corrections rewrite the keyframes; nothing else moves';
end $$;

-- A clip follows a path of its own song only.
insert into public.clips (id, video_id, crew_id, name, start_seconds, end_seconds, follow_path_id)
values ('f1010101-0000-4000-8000-000000000031', 'f1010101-0000-4000-8000-0000000000a1', (select private.default_group()),
        'Estribillo', 10, 20, 'f1010101-0000-4000-8000-000000000001'),
       ('f1010101-0000-4000-8000-000000000032', 'f1010101-0000-4000-8000-0000000000a2', (select private.default_group()),
        'Otra', 10, 20, 'f1010101-0000-4000-8000-000000000001');
update public.clips set follow_path_id = 'f1010101-0000-4000-8000-000000000002' where id = 'f1010101-0000-4000-8000-000000000031';
do $$
begin
  if (select follow_path_id from public.clips where id = 'f1010101-0000-4000-8000-000000000031') <> 'f1010101-0000-4000-8000-000000000002' then
    raise exception 'FAIL a clip lost the dancer it follows';
  end if;
  if (select follow_path_id from public.clips where id = 'f1010101-0000-4000-8000-000000000032') is not null then
    raise exception 'FAIL a clip follows a path of another song';
  end if;
  raise notice 'PASS clips follow paths of their own song';
end $$;

-- Deleting archives; archiving the song archives its paths.
delete from public.follow_paths where id = 'f1010101-0000-4000-8000-000000000002';
do $$
begin
  if exists (select 1 from public.follow_paths where id = 'f1010101-0000-4000-8000-000000000002') then
    raise exception 'FAIL a deleted path still shows';
  end if;
  raise notice 'PASS deleting a path archives it';
end $$;
delete from public.videos where id = 'f1010101-0000-4000-8000-0000000000a1';
do $$
begin
  if exists (select 1 from public.follow_paths where video_id = 'f1010101-0000-4000-8000-0000000000a1') then
    raise exception 'FAIL paths of an archived song still show';
  end if;
  raise notice 'PASS archiving the song archives its paths';
end $$;

rollback;
