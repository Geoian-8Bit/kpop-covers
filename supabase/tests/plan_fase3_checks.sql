-- Checks for 20261016020000_review_and_take_notes.sql (F5 review data on takes, F6 notes on takes).
-- Run the whole file in one go as postgres (SQL editor / MCP execute_sql, or `pnpm db:test`). Acts as `anon`,
-- prints `PASS …`, raises `FAIL …` on the first problem, ends with ROLLBACK.

begin;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into public.videos (id, crew_id, title, source, youtube_id)
values ('0d0d0d0d-0000-4000-8000-0000000000a1', (select private.default_group()), 'Prueba repaso', 'youtube', 'zzTestRev01');
insert into public.videos (id, crew_id, title, source, youtube_id)
values ('0d0d0d0d-0000-4000-8000-0000000000a2', (select private.default_group()), 'Prueba repaso 2', 'youtube', 'zzTestRev02');
insert into public.members (id, name) values ('0d0d0d0d-0000-4000-8000-0000000000b1', 'Prueba Eva');
insert into public.takes (id, video_id, member_id, song_start_seconds, duration_seconds)
values ('0d0d0d0d-0000-4000-8000-000000000001', '0d0d0d0d-0000-4000-8000-0000000000a1',
        '0d0d0d0d-0000-4000-8000-0000000000b1', 10, 30);
insert into public.takes (id, video_id, song_start_seconds, duration_seconds)
values ('0d0d0d0d-0000-4000-8000-000000000002', '0d0d0d0d-0000-4000-8000-0000000000a2', 0, 30);

-- F5: the review's fine sync and overlay fit are saved with the take, within range.
update public.takes set sync_adjust_seconds = -0.12, fit_scale = 1.35, fit_x = 0.1, fit_y = -0.05
where id = '0d0d0d0d-0000-4000-8000-000000000001';
do $$
declare ok boolean := false;
begin
  if (select sync_adjust_seconds from public.takes where id = '0d0d0d0d-0000-4000-8000-000000000001') <> -0.12 then
    raise exception 'FAIL sync adjustment not saved';
  end if;
  begin
    update public.takes set sync_adjust_seconds = 2 where id = '0d0d0d0d-0000-4000-8000-000000000001';
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL sync adjustment beyond ±0.3 s accepted'; end if;
  ok := false;
  begin
    update public.takes set fit_scale = 50 where id = '0d0d0d0d-0000-4000-8000-000000000001';
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL absurd overlay scale accepted'; end if;
  raise notice 'PASS review sync and fit are saved with the take, range-checked';
end $$;

-- F6: a note on a take keeps the take, its moment, category, recipient and status.
insert into public.notes (id, video_id, crew_id, at_seconds, body, take_id, take_seconds, category, for_member_id)
values ('0d0d0d0d-0000-4000-8000-0000000000c1', '0d0d0d0d-0000-4000-8000-0000000000a1', (select private.default_group()),
        15.5, 'brazos tarde', '0d0d0d0d-0000-4000-8000-000000000001', 5.5, 'brazos', '0d0d0d0d-0000-4000-8000-0000000000b1');
do $$
declare r public.notes;
begin
  select * into r from public.notes where id = '0d0d0d0d-0000-4000-8000-0000000000c1';
  if r.take_id is distinct from '0d0d0d0d-0000-4000-8000-000000000001' or r.take_seconds <> 5.5
     or r.category <> 'brazos' or r.for_member_id is distinct from '0d0d0d0d-0000-4000-8000-0000000000b1'
     or r.status <> 'open' then
    raise exception 'FAIL take note not stored as written';
  end if;
  raise notice 'PASS a note on a take keeps its moment, category, recipient and status';
end $$;

update public.notes set status = 'done', category = 'tiempo' where id = '0d0d0d0d-0000-4000-8000-0000000000c1';
do $$
declare ok boolean := false;
begin
  if (select status from public.notes where id = '0d0d0d0d-0000-4000-8000-0000000000c1') <> 'done' then
    raise exception 'FAIL note status not updatable';
  end if;
  begin
    update public.notes set take_id = null where id = '0d0d0d0d-0000-4000-8000-0000000000c1';
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL a note''s take could be changed'; end if;
  ok := false;
  begin
    update public.notes set status = 'maybe' where id = '0d0d0d0d-0000-4000-8000-0000000000c1';
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL unknown note status accepted'; end if;
  raise notice 'PASS status and category change; the take does not; only known statuses';
end $$;

-- A take of another song, or an archived member, is dropped from the note (the note itself stays).
insert into public.notes (id, video_id, crew_id, at_seconds, body, take_id, take_seconds)
values ('0d0d0d0d-0000-4000-8000-0000000000c2', '0d0d0d0d-0000-4000-8000-0000000000a1', (select private.default_group()),
        3, 'toma ajena', '0d0d0d0d-0000-4000-8000-000000000002', 3);
delete from public.members where id = '0d0d0d0d-0000-4000-8000-0000000000b1';
insert into public.notes (id, video_id, crew_id, at_seconds, body, for_member_id)
values ('0d0d0d0d-0000-4000-8000-0000000000c3', '0d0d0d0d-0000-4000-8000-0000000000a1', (select private.default_group()),
        4, 'para alguien de baja', '0d0d0d0d-0000-4000-8000-0000000000b1');
do $$
begin
  if (select take_id from public.notes where id = '0d0d0d0d-0000-4000-8000-0000000000c2') is not null then
    raise exception 'FAIL a note was filed under another song''s take';
  end if;
  if (select for_member_id from public.notes where id = '0d0d0d0d-0000-4000-8000-0000000000c3') is not null then
    raise exception 'FAIL a note was addressed to an archived member';
  end if;
  raise notice 'PASS foreign takes and archived members are dropped from notes';
end $$;

-- Drawings: a small image only.
do $$
declare ok boolean := false;
begin
  update public.notes set sketch = 'data:image/webp;base64,UklGRg==' where id = '0d0d0d0d-0000-4000-8000-0000000000c1';
  begin
    update public.notes set sketch = 'javascript:alert(1)' where id = '0d0d0d0d-0000-4000-8000-0000000000c1';
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL a non-image drawing was accepted'; end if;
  ok := false;
  begin
    update public.notes set sketch = 'data:image/png;base64,' || repeat('A', 70000) where id = '0d0d0d0d-0000-4000-8000-0000000000c1';
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL an oversized drawing was accepted'; end if;
  raise notice 'PASS drawings are small images only';
end $$;

reset role;
rollback;
