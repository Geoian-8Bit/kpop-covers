-- Checks for 20261030100000_video_aspect_ratio.sql (REQ-02: vertical videos in fullscreen).
-- Run the whole file in one go as postgres (SQL editor / MCP execute_sql, or `pnpm db:test`). Acts as `anon`,
-- prints `PASS …`, raises `FAIL …` on the first problem, ends with ROLLBACK.

begin;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

-- A vertical Short and a horizontal video keep their proportion; one without it stays null.
insert into public.videos (id, crew_id, title, source, youtube_id, aspect_ratio)
values ('0f0f0f0f-0000-4000-8000-0000000000b1', (select private.default_group()), 'Prueba vertical', 'youtube', 'zzAspect001', 0.5625),
       ('0f0f0f0f-0000-4000-8000-0000000000b2', (select private.default_group()), 'Prueba horizontal', 'youtube', 'zzAspect002', 1.7778);
insert into public.videos (id, crew_id, title, source, youtube_id)
values ('0f0f0f0f-0000-4000-8000-0000000000b3', (select private.default_group()), 'Prueba sin proporción', 'youtube', 'zzAspect003');
do $$
begin
  if (select aspect_ratio from public.videos where id = '0f0f0f0f-0000-4000-8000-0000000000b1') is distinct from 0.5625 then
    raise exception 'FAIL aspect_ratio not stored';
  end if;
  if (select aspect_ratio from public.videos where id = '0f0f0f0f-0000-4000-8000-0000000000b3') is not null then
    raise exception 'FAIL aspect_ratio should default to null';
  end if;
  raise notice 'PASS aspect_ratio stored on insert and null by default';
end $$;

-- Absurd proportions are refused.
do $$
begin
  begin
    insert into public.videos (id, crew_id, title, source, youtube_id, aspect_ratio)
    values ('0f0f0f0f-0000-4000-8000-0000000000b4', (select private.default_group()), 'Prueba absurda', 'youtube', 'zzAspect004', 0);
    raise exception 'FAIL aspect_ratio 0 accepted';
  exception when check_violation then
    raise notice 'PASS aspect_ratio 0 refused';
  end;
  begin
    insert into public.videos (id, crew_id, title, source, youtube_id, aspect_ratio)
    values ('0f0f0f0f-0000-4000-8000-0000000000b5', (select private.default_group()), 'Prueba enorme', 'youtube', 'zzAspect005', 9);
    raise exception 'FAIL aspect_ratio 9 accepted';
  exception when check_violation then
    raise notice 'PASS aspect_ratio 9 refused';
  end;
end $$;

rollback;
