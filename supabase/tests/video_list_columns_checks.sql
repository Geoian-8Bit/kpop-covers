-- Checks for 20261031110000_video_list_columns.sql (REQ-14: inline posters out of the lists).
-- Run the whole file in one go as postgres (SQL editor / MCP execute_sql, or `pnpm db:test`). Acts as `anon`,
-- prints `PASS …`, raises `FAIL …` on the first problem, ends with ROLLBACK.

begin;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

-- A YouTube video, an uploaded one with an inline poster and an uploaded one without poster.
insert into public.videos (id, crew_id, title, source, youtube_id, thumbnail_url)
values ('0d0d0d0d-0000-4000-8000-0000000000c1', (select private.default_group()), 'Prueba YouTube', 'youtube',
        'zzList00001', 'https://i.ytimg.com/vi/zzList00001/hqdefault.jpg');
insert into public.videos (id, crew_id, title, source, file_name, thumbnail_url)
values ('0d0d0d0d-0000-4000-8000-0000000000c2', (select private.default_group()), 'Prueba subido', 'upload',
        'prueba.mp4', 'data:image/jpeg;base64,QUJDRA=='),
       ('0d0d0d0d-0000-4000-8000-0000000000c3', (select private.default_group()), 'Prueba sin póster', 'upload',
        'prueba2.mp4', null);

do $$
declare v public.videos;
begin
  select * into v from public.videos where id = '0d0d0d0d-0000-4000-8000-0000000000c1';
  if v.poster_inline is distinct from false or v.poster_rev is not null
     or v.list_thumbnail_url is distinct from 'https://i.ytimg.com/vi/zzList00001/hqdefault.jpg' then
    raise exception 'FAIL YouTube row: inline %, rev %, list %', v.poster_inline, v.poster_rev, v.list_thumbnail_url;
  end if;
  select * into v from public.videos where id = '0d0d0d0d-0000-4000-8000-0000000000c2';
  if v.poster_inline is distinct from true or v.list_thumbnail_url is not null
     or v.poster_rev is distinct from md5('data:image/jpeg;base64,QUJDRA==') then
    raise exception 'FAIL uploaded row with poster: inline %, rev %, list %', v.poster_inline, v.poster_rev, v.list_thumbnail_url;
  end if;
  select * into v from public.videos where id = '0d0d0d0d-0000-4000-8000-0000000000c3';
  if v.poster_inline is distinct from false or v.list_thumbnail_url is not null or v.poster_rev is not null then
    raise exception 'FAIL uploaded row without poster: inline %, rev %, list %', v.poster_inline, v.poster_rev, v.list_thumbnail_url;
  end if;
  raise notice 'PASS generated columns for YouTube, uploaded with poster and uploaded without poster';
end $$;

-- The poster query of the client: only inline posters, id + rev + poster.
do $$
begin
  if (select count(*) from public.videos
      where poster_inline and id in ('0d0d0d0d-0000-4000-8000-0000000000c1', '0d0d0d0d-0000-4000-8000-0000000000c2',
                                     '0d0d0d0d-0000-4000-8000-0000000000c3')) <> 1 then
    raise exception 'FAIL poster_inline = true should pick only the uploaded video with a poster';
  end if;
  raise notice 'PASS anon reads the new columns and filters by poster_inline';
end $$;

-- anon cannot write them (neither on insert nor on update).
do $$
begin
  begin
    update public.videos set poster_inline = true where id = '0d0d0d0d-0000-4000-8000-0000000000c1';
    raise exception 'FAIL anon updated poster_inline';
  exception when insufficient_privilege or generated_always then null;
  end;
  begin
    update public.videos set list_thumbnail_url = null where id = '0d0d0d0d-0000-4000-8000-0000000000c1';
    raise exception 'FAIL anon updated list_thumbnail_url';
  exception when insufficient_privilege or generated_always then null;
  end;
  begin
    update public.videos set poster_rev = 'x' where id = '0d0d0d0d-0000-4000-8000-0000000000c2';
    raise exception 'FAIL anon updated poster_rev';
  exception when insufficient_privilege or generated_always then null;
  end;
  begin
    insert into public.videos (crew_id, title, source, youtube_id, poster_rev)
    values ((select private.default_group()), 'Prueba forzada', 'youtube', 'zzList00004', 'x');
    raise exception 'FAIL anon inserted poster_rev';
  exception when insufficient_privilege or generated_always then null;
  end;
  raise notice 'PASS anon cannot write the generated columns';
end $$;

-- Delete = archive: the archived video (and its poster row) disappears for anon.
delete from public.videos where id = '0d0d0d0d-0000-4000-8000-0000000000c2';
do $$
begin
  if exists (select 1 from public.videos where id = '0d0d0d0d-0000-4000-8000-0000000000c2') then
    raise exception 'FAIL archived video still visible';
  end if;
  if exists (select 1 from public.videos where poster_inline and id = '0d0d0d0d-0000-4000-8000-0000000000c2') then
    raise exception 'FAIL archived poster still listed';
  end if;
  raise notice 'PASS archived video hidden from the list and the poster query';
end $$;

reset role;
do $$
begin
  if (select poster_rev from public.videos where id = '0d0d0d0d-0000-4000-8000-0000000000c2' and archived_at is not null)
     is distinct from md5('data:image/jpeg;base64,QUJDRA==') then
    raise exception 'FAIL archived row lost (delete must archive, not remove)';
  end if;
  raise notice 'PASS the archived row is kept with its columns';
end $$;

rollback;
