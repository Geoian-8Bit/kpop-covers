-- Checks for 20261030130000_formations.sql (REQ-06 formation plans, participants and formations with revisions).
-- Run the whole file in one go as postgres (SQL editor / MCP execute_sql, or `pnpm db:test`). Acts as `anon`,
-- prints `PASS …`, raises `FAIL …` on the first problem, ends with ROLLBACK.

begin;
-- Another group with its own song and plan (as postgres: anon only writes the default group).
insert into public.crews (id, name) values ('0d0d0d0d-0000-4000-8000-0000000000f1', 'Prueba formaciones otro grupo');
insert into public.videos (id, crew_id, title, source, youtube_id)
values ('0d0d0d0d-0000-4000-8000-0000000000f2', (select private.default_group()), 'Prueba ajena', 'youtube', 'zzForm000F2');
insert into public.formation_plans (id, video_id, name)
values ('0d0d0d0d-0000-4000-8000-0000000000f3', '0d0d0d0d-0000-4000-8000-0000000000f2', 'Prueba ajena');
update public.formation_plans set crew_id = '0d0d0d0d-0000-4000-8000-0000000000f1' where id = '0d0d0d0d-0000-4000-8000-0000000000f3';
update public.videos set crew_id = '0d0d0d0d-0000-4000-8000-0000000000f1' where id = '0d0d0d0d-0000-4000-8000-0000000000f2';

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into public.members (id, name) values ('0d0d0d0d-0000-4000-8000-0000000000a1', 'Prueba Ana'),
                                             ('0d0d0d0d-0000-4000-8000-0000000000a2', 'Prueba Bea'),
                                             ('0d0d0d0d-0000-4000-8000-0000000000a3', 'Prueba Cris');
insert into public.videos (id, crew_id, title, source, youtube_id)
values ('0d0d0d0d-0000-4000-8000-0000000000b1', (select private.default_group()), 'Prueba canción', 'youtube', 'zzForm000B1');

-- ───────────── Plans ─────────────

do $$
declare p public.formation_plans;
begin
  p := public.create_formation_plan('0d0d0d0d-0000-4000-8000-0000000000b1', '  Con 3  ',
    '["0d0d0d0d-0000-4000-8000-0000000000a1","0d0d0d0d-0000-4000-8000-0000000000a2","0d0d0d0d-0000-4000-8000-0000000000a3"]');
  if p.name <> 'Con 3' or p.stage_width <> 8 or p.stage_depth <> 6 or p.grid <> 0.5 or p.revision <> 0
     or p.crew_id <> private.default_group() then
    raise exception 'FAIL new plan not stored with its defaults';
  end if;
  if (select count(*) from public.formation_plan_members where plan_id = p.id) <> 3 then
    raise exception 'FAIL new plan has not its three participants';
  end if;
  perform set_config('test.plan', p.id::text, true);
  raise notice 'PASS a plan is born with its name trimmed, an 8×6 stage, a 0.5 m grid, revision 0 and its participants';
end $$;

do $$
declare ok boolean;
begin
  if exists (select 1 from public.formation_plans where id = '0d0d0d0d-0000-4000-8000-0000000000f3') then
    raise exception 'FAIL another group''s plan is visible';
  end if;
  ok := false;
  begin
    insert into public.formation_plans (video_id, name) values ('0d0d0d0d-0000-4000-8000-0000000000b1', 'Directo');
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL anon inserted a plan directly'; end if;
  ok := false;
  begin
    insert into public.formations (plan_id, at) values (current_setting('test.plan')::uuid, 1);
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL anon inserted a formation directly'; end if;
  ok := false;
  begin
    update public.formation_plans set revision = 99 where id = current_setting('test.plan')::uuid;
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL anon updated a plan directly'; end if;
  ok := false;
  begin
    perform public.save_formation('0d0d0d0d-0000-4000-8000-0000000000f3', 0, '{"at":1,"positions":{}}');
  exception when others then ok := sqlerrm = 'formation_plan_not_found';
  end;
  if not ok then raise exception 'FAIL a formation was saved into another group''s plan'; end if;
  ok := false;
  begin
    perform public.create_formation_plan('0d0d0d0d-0000-4000-8000-0000000000f2', 'Ajena', '[]');
  exception when others then ok := sqlerrm = 'formation_video_not_found';
  end;
  if not ok then raise exception 'FAIL a plan was created on another group''s song'; end if;
  ok := false;
  begin
    perform public.create_formation_plan('0d0d0d0d-0000-4000-8000-0000000000b1', repeat('a', 61), '[]');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL a 61-letter name was accepted'; end if;
  ok := false;
  begin
    perform public.create_formation_plan('0d0d0d0d-0000-4000-8000-0000000000b1', 'Grande', '[]', 31, 6);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL a 31 m stage was accepted'; end if;
  ok := false;
  begin
    perform public.create_formation_plan('0d0d0d0d-0000-4000-8000-0000000000b1', 'Ajeno', '["0d0d0d0d-0000-4000-8000-0000000000ff"]');
  exception when others then ok := sqlerrm = 'formation_member_invalid';
  end;
  if not ok then raise exception 'FAIL an unknown participant was accepted'; end if;
  raise notice 'PASS only the group''s plans show; writes only through the RPCs; name ≤ 60, stage ≤ 30 m, known people';
end $$;

-- ───────────── Formations: save, revision and conflicts ─────────────

do $$
declare
  v_plan uuid := current_setting('test.plan')::uuid;
  r jsonb;
begin
  r := public.save_formation(v_plan, 0, '{"id":"0d0d0d0d-0000-4000-8000-000000000001","at":0,"positions":{"0d0d0d0d-0000-4000-8000-0000000000a1":{"x":1,"y":1},"0d0d0d0d-0000-4000-8000-0000000000a2":{"x":4,"y":3}}}');
  if not (r ->> 'ok')::boolean or (r ->> 'revision')::int <> 1 or (r #>> '{formation,id}') <> '0d0d0d0d-0000-4000-8000-000000000001'
     or (r #>> '{formation,transition}')::numeric <> 2 then
    raise exception 'FAIL first formation not saved (%)', r;
  end if;
  r := public.save_formation(v_plan, 1, '{"at":10.004,"transition":3,"positions":{"0d0d0d0d-0000-4000-8000-0000000000a1":{"x":7,"y":5}},"note":"  Giro  "}');
  if (r ->> 'revision')::int <> 2 or (r #>> '{formation,at}')::numeric <> 10 or (r #>> '{formation,note}') <> 'Giro' then
    raise exception 'FAIL second formation not saved with at rounded and note trimmed (%)', r;
  end if;
  -- Updating the first one keeps its id and bumps the revision.
  r := public.save_formation(v_plan, 2, '{"id":"0d0d0d0d-0000-4000-8000-000000000001","at":0.5,"positions":{"0d0d0d0d-0000-4000-8000-0000000000a1":{"x":2,"y":2}}}');
  if (r ->> 'revision')::int <> 3 or (select at from public.formations where id = '0d0d0d0d-0000-4000-8000-000000000001') <> 0.5
     or (select count(*) from public.formations where plan_id = v_plan) <> 2 then
    raise exception 'FAIL updating a formation (%)', r;
  end if;
  raise notice 'PASS save_formation creates and updates, rounds at to 0.01 s, trims the note and bumps the revision';
end $$;

do $$
declare
  v_plan uuid := current_setting('test.plan')::uuid;
  r jsonb;
begin
  -- Another device saved meanwhile: revision 1 is stale, nothing is written.
  r := public.save_formation(v_plan, 1, '{"id":"0d0d0d0d-0000-4000-8000-000000000001","at":4,"positions":{}}');
  if (r ->> 'ok')::boolean or not (r ->> 'conflict')::boolean or (r ->> 'revision')::int <> 3 then
    raise exception 'FAIL stale save not reported as a conflict (%)', r;
  end if;
  if (select at from public.formations where id = '0d0d0d0d-0000-4000-8000-000000000001') <> 0.5 then
    raise exception 'FAIL a stale save wrote anyway';
  end if;
  r := public.delete_formation(v_plan, 2, '0d0d0d0d-0000-4000-8000-000000000001');
  if (r ->> 'ok')::boolean or not (r ->> 'conflict')::boolean then
    raise exception 'FAIL stale delete not reported as a conflict';
  end if;
  r := public.update_formation_plan(v_plan, 0, '{"name":"Otro"}');
  if (r ->> 'ok')::boolean or (select name from public.formation_plans where id = v_plan) <> 'Con 3' then
    raise exception 'FAIL stale plan edit not reported as a conflict';
  end if;
  raise notice 'PASS a stale revision returns a conflict and writes nothing (save, delete and plan edit)';
end $$;

do $$
declare
  v_plan uuid := current_setting('test.plan')::uuid;
  ok boolean;
  v_bad text;
begin
  foreach v_bad in array array[
    '{"at":20,"positions":{"0d0d0d0d-0000-4000-8000-0000000000a1":{"x":9,"y":1}}}',
    '{"at":20,"positions":{"0d0d0d0d-0000-4000-8000-0000000000a1":{"x":-0.1,"y":1}}}',
    '{"at":20,"positions":{"0d0d0d0d-0000-4000-8000-0000000000a1":{"x":1,"y":6.5}}}'
  ] loop
    ok := false;
    begin
      perform public.save_formation(v_plan, 3, v_bad::jsonb);
    exception when others then ok := sqlerrm = 'formation_out_of_stage';
    end;
    if not ok then raise exception 'FAIL a point outside the stage was accepted: %', v_bad; end if;
  end loop;
  foreach v_bad in array array[
    '{"at":20,"positions":{"0d0d0d0d-0000-4000-8000-0000000000ff":{"x":1,"y":1}}}',
    '{"at":20,"positions":{"nadie":{"x":1,"y":1}}}',
    '{"at":20,"positions":{"0d0d0d0d-0000-4000-8000-0000000000a1":{"x":"1","y":1}}}',
    '{"at":20,"positions":{"0d0d0d0d-0000-4000-8000-0000000000a1":{"x":1,"y":1,"z":2}}}',
    '{"at":20,"positions":[]}',
    '{"at":"20","positions":{}}',
    '{"positions":{}}',
    '{"at":20,"positions":{},"color":"red"}',
    '{"at":20,"transition":"2","positions":{}}',
    '{"at":20,"positions":{},"note":5}',
    '{"id":"nope","at":20,"positions":{}}'
  ] loop
    ok := false;
    begin
      perform public.save_formation(v_plan, 3, v_bad::jsonb);
    exception when others then ok := sqlerrm = 'formation_invalid';
    end;
    if not ok then raise exception 'FAIL a malformed formation was accepted: %', v_bad; end if;
  end loop;
  ok := false;
  begin
    perform public.save_formation(v_plan, 3, '{"at":-1,"positions":{}}');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL a negative time was accepted'; end if;
  ok := false;
  begin
    perform public.save_formation(v_plan, 3, '{"at":20,"transition":31,"positions":{}}');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL a 31 s transition was accepted'; end if;
  ok := false;
  begin
    perform public.save_formation(v_plan, 3, jsonb_build_object('at', 20, 'positions', '{}'::jsonb, 'note', repeat('a', 281)));
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL a 281-letter note was accepted'; end if;
  ok := false;
  begin
    perform public.save_formation(v_plan, 3, '{"at":10,"positions":{}}');
  exception when others then ok := sqlerrm = 'formation_time_taken';
  end;
  if not ok then raise exception 'FAIL two formations at the same second were accepted'; end if;
  if (select revision from public.formation_plans where id = v_plan) <> 3 then
    raise exception 'FAIL a refused save bumped the revision';
  end if;
  raise notice 'PASS positions validated (inside the stage, known people, {x, y} numbers), at ≥ 0, transition ≤ 30, note ≤ 280, one formation per moment';
end $$;

-- ───────────── Plan edits ─────────────

do $$
declare
  v_plan uuid := current_setting('test.plan')::uuid;
  r jsonb;
  ok boolean;
begin
  -- A smaller stage pulls the point at x = 7 inside.
  r := public.update_formation_plan(v_plan, 3, '{"name":"Con 2","stage_width":6,"bpm":120,"first_beat":0.4,"members":["0d0d0d0d-0000-4000-8000-0000000000a1","0d0d0d0d-0000-4000-8000-0000000000a2"]}');
  if not (r ->> 'ok')::boolean or (r ->> 'revision')::int <> 4 or (r #>> '{plan,name}') <> 'Con 2' or (r #>> '{plan,bpm}')::numeric <> 120 then
    raise exception 'FAIL plan edit (%)', r;
  end if;
  if (select (positions #>> '{0d0d0d0d-0000-4000-8000-0000000000a1,x}')::numeric from public.formations where plan_id = v_plan and at = 10) <> 6 then
    raise exception 'FAIL a point outside the smaller stage was not pulled inside';
  end if;
  if (select count(*) from public.formation_plan_members where plan_id = v_plan) <> 2 then
    raise exception 'FAIL removed participant still listed';
  end if;
  -- Back again: the same row revives (unique per plan and member).
  r := public.update_formation_plan(v_plan, 4, '{"members":["0d0d0d0d-0000-4000-8000-0000000000a1","0d0d0d0d-0000-4000-8000-0000000000a2","0d0d0d0d-0000-4000-8000-0000000000a3"]}');
  if (select count(*) from public.formation_plan_members where plan_id = v_plan) <> 3 then
    raise exception 'FAIL participant not added back';
  end if;
  r := public.update_formation_plan(v_plan, 5, '{"bpm":null,"first_beat":null}');
  if (select bpm from public.formation_plans where id = v_plan) is not null then
    raise exception 'FAIL bpm not cleared';
  end if;
  ok := false;
  begin
    perform public.update_formation_plan(v_plan, 6, '{"bpm":300}');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL a bpm of 300 was accepted'; end if;
  ok := false;
  begin
    perform public.update_formation_plan(v_plan, 6, '{"revision":0}');
  exception when others then ok := sqlerrm = 'formation_invalid';
  end;
  if not ok then raise exception 'FAIL an unknown plan field was accepted'; end if;
  raise notice 'PASS plan edits: name, stage (points pulled inside), beat data (40–240 or none) and participants (removed and back)';
end $$;

-- ───────────── Duplicate, delete, archive ─────────────

do $$
declare
  v_plan uuid := current_setting('test.plan')::uuid;
  p public.formation_plans;
  r jsonb;
begin
  p := public.duplicate_formation_plan(v_plan, 'Con 3 (copia)');
  if p.revision <> 0 or (select count(*) from public.formations where plan_id = p.id) <> 2
     or (select count(*) from public.formation_plan_members where plan_id = p.id) <> 3 then
    raise exception 'FAIL duplicate is not a full copy';
  end if;
  r := public.delete_formation(v_plan, 6, '0d0d0d0d-0000-4000-8000-000000000001');
  if not (r ->> 'ok')::boolean or exists (select 1 from public.formations where id = '0d0d0d0d-0000-4000-8000-000000000001') then
    raise exception 'FAIL delete_formation (%)', r;
  end if;
  -- Archived, not gone: the same moment can be used again.
  r := public.save_formation(v_plan, 7, '{"at":0.5,"positions":{}}');
  if not (r ->> 'ok')::boolean then raise exception 'FAIL the archived formation''s moment is still taken'; end if;
  -- Undo in the editor saves the deleted one again with its id: it comes back.
  r := public.save_formation(v_plan, 8, '{"id":"0d0d0d0d-0000-4000-8000-000000000001","at":1.5,"positions":{}}');
  if not (r ->> 'ok')::boolean or not exists (select 1 from public.formations where id = '0d0d0d0d-0000-4000-8000-000000000001' and at = 1.5) then
    raise exception 'FAIL a deleted formation saved again with its id did not come back';
  end if;
  -- A formation id of another plan can't be taken over.
  begin
    perform public.save_formation(v_plan, 9, jsonb_build_object('id', (select id from public.formations where plan_id = p.id limit 1), 'at', 40, 'positions', '{}'::jsonb));
    raise exception 'FAIL another plan''s formation was overwritten';
  exception when others then
    if sqlerrm <> 'formation_not_found' then raise; end if;
  end;
  -- Deleting the plan archives it with its formations and participants.
  delete from public.formation_plans where id = p.id;
  if exists (select 1 from public.formation_plans where id = p.id)
     or exists (select 1 from public.formations where plan_id = p.id)
     or exists (select 1 from public.formation_plan_members where plan_id = p.id) then
    raise exception 'FAIL deleting a plan left something visible';
  end if;
  raise notice 'PASS duplicate copies participants and formations; deleting archives (formation or whole plan)';
end $$;

do $$
declare v_plan uuid := current_setting('test.plan')::uuid;
begin
  -- An archived participant keeps a greyed-out name for the editor.
  delete from public.members where id = '0d0d0d0d-0000-4000-8000-0000000000a3';
  if not exists (select 1 from public.formation_members() where id = '0d0d0d0d-0000-4000-8000-0000000000a3' and archived) then
    raise exception 'FAIL archived participant missing from formation_members()';
  end if;
  -- Deleting the song archives its plans.
  delete from public.videos where id = '0d0d0d0d-0000-4000-8000-0000000000b1';
  if exists (select 1 from public.formation_plans where id = v_plan) or exists (select 1 from public.formations where plan_id = v_plan) then
    raise exception 'FAIL deleting the song left its plans visible';
  end if;
  if exists (select 1 from public.formation_members() where id = '0d0d0d0d-0000-4000-8000-0000000000a3') then
    raise exception 'FAIL an archived member without live plans is still named';
  end if;
  raise notice 'PASS archived people keep their name while in a live plan; deleting the song archives its plans';
end $$;

rollback;
