-- Checks for 20261031120000_notes_has_sketch.sql (REQ-17: notes list without sketches).
-- Run the whole file in one go as postgres (SQL editor / MCP execute_sql, or `pnpm db:test`). Acts as `anon`,
-- prints `PASS …`, raises `FAIL …` on the first problem, ends with ROLLBACK.

begin;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into public.videos (id, crew_id, title, source, youtube_id)
values ('0d0d0d0d-0000-4000-8000-0000000001a1', (select private.default_group()), 'Prueba notas', 'youtube', 'zzSketch001');
insert into public.notes (id, video_id, at_seconds, body, sketch) values
  ('0d0d0d0d-0000-4000-8000-0000000001b1', '0d0d0d0d-0000-4000-8000-0000000001a1', 1, 'con dibujo', 'data:image/png;base64,QUJDRA=='),
  ('0d0d0d0d-0000-4000-8000-0000000001b2', '0d0d0d0d-0000-4000-8000-0000000001a1', 2, 'sin dibujo', null);

do $$
begin
  if (select has_sketch from public.notes where id = '0d0d0d0d-0000-4000-8000-0000000001b1') is distinct from true then
    raise exception 'FAIL note with sketch: has_sketch should be true';
  end if;
  if (select has_sketch from public.notes where id = '0d0d0d0d-0000-4000-8000-0000000001b2') is distinct from false then
    raise exception 'FAIL note without sketch: has_sketch should be false';
  end if;
  raise notice 'PASS has_sketch follows the sketch on insert';
end $$;

-- Editing the sketch (allowed column) moves the flag; the flag itself cannot be written.
update public.notes set sketch = null where id = '0d0d0d0d-0000-4000-8000-0000000001b1';
update public.notes set sketch = 'data:image/png;base64,RUZHSA==' where id = '0d0d0d0d-0000-4000-8000-0000000001b2';
do $$
begin
  if (select has_sketch from public.notes where id = '0d0d0d0d-0000-4000-8000-0000000001b1') is distinct from false
     or (select has_sketch from public.notes where id = '0d0d0d0d-0000-4000-8000-0000000001b2') is distinct from true then
    raise exception 'FAIL has_sketch did not follow a sketch update';
  end if;
  begin
    update public.notes set has_sketch = true where id = '0d0d0d0d-0000-4000-8000-0000000001b1';
    raise exception 'FAIL anon updated has_sketch';
  exception when insufficient_privilege or generated_always then null;
  end;
  begin
    insert into public.notes (video_id, at_seconds, body, has_sketch)
    values ('0d0d0d0d-0000-4000-8000-0000000001a1', 3, 'forzada', true);
    raise exception 'FAIL anon inserted has_sketch';
  exception when insufficient_privilege or generated_always then null;
  end;
  raise notice 'PASS has_sketch follows sketch updates and cannot be written';
end $$;

-- The client's sketch query: only notes with a sketch; archived notes hidden.
delete from public.notes where id = '0d0d0d0d-0000-4000-8000-0000000001b2';
do $$
begin
  if exists (select 1 from public.notes where video_id = '0d0d0d0d-0000-4000-8000-0000000001a1' and has_sketch) then
    raise exception 'FAIL archived note with sketch still listed';
  end if;
  if (select count(*) from public.notes where video_id = '0d0d0d0d-0000-4000-8000-0000000001a1') <> 1 then
    raise exception 'FAIL archived note still visible';
  end if;
  raise notice 'PASS archived notes stay hidden from the list and the sketch query';
end $$;

rollback;
