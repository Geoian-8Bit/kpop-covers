-- Checks for 20261031100000_formation_curves.sql (REQ-08: a curve takes 1 or 2 control points).
-- Run the whole file in one go as postgres (SQL editor / MCP execute_sql, or `pnpm db:test`). Acts as `anon`,
-- prints `PASS …`, raises `FAIL …` on the first problem, ends with ROLLBACK.

begin;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into public.members (id, name) values ('0e0e0e0e-0000-4000-8000-0000000001a1', 'Prueba Curva');
insert into public.videos (id, crew_id, title, source, youtube_id)
values ('0e0e0e0e-0000-4000-8000-0000000001b1', (select private.default_group()), 'Prueba curvas', 'youtube', 'zzCurve01B1');

do $$
declare p public.formation_plans;
begin
  p := public.create_formation_plan('0e0e0e0e-0000-4000-8000-0000000001b1', 'Prueba curvas',
    '["0e0e0e0e-0000-4000-8000-0000000001a1"]');
  perform set_config('test.plan', p.id::text, true);
end $$;

do $$
declare
  v_plan uuid := current_setting('test.plan')::uuid;
  r jsonb;
  ok boolean;
  bad text;
begin
  -- An old-style arc (1 control point) still saves.
  r := public.save_formation(v_plan, 0, '{"id":"0e0e0e0e-0000-4000-8000-000000000101","at":0,"positions":{
    "0e0e0e0e-0000-4000-8000-0000000001a1":{"x":1,"y":3,"path":{"kind":"curve","points":[{"x":4,"y":1}]}}}}');
  if (r ->> 'revision')::int <> 1 then raise exception 'FAIL a 1-point curve was not saved (%)', r; end if;

  -- An S bend: 2 control points.
  r := public.save_formation(v_plan, 1, '{"id":"0e0e0e0e-0000-4000-8000-000000000102","at":10,"positions":{
    "0e0e0e0e-0000-4000-8000-0000000001a1":{"x":7,"y":3,"path":{"kind":"curve","points":[{"x":3,"y":1},{"x":5,"y":5}]}}}}');
  if (r ->> 'revision')::int <> 2
     or jsonb_array_length(r #> '{formation,positions,0e0e0e0e-0000-4000-8000-0000000001a1,path,points}') <> 2 then
    raise exception 'FAIL a 2-point curve was not saved (%)', r;
  end if;
  raise notice 'PASS a curve saves with 1 (arc) or 2 (S) control points';

  foreach bad in array array[
    '{"kind":"curve","points":[{"x":1,"y":1},{"x":2,"y":2},{"x":3,"y":3}]}',
    '{"kind":"curve","points":[]}',
    '{"kind":"curve","points":[{"x":1,"y":1},{"x":9,"y":2}]}',
    '{"kind":"curve","points":[{"x":1,"y":1},{"x":2}]}'
  ] loop
    ok := false;
    begin
      perform public.save_formation(v_plan, 2, jsonb_build_object('at', 20, 'positions',
        jsonb_build_object('0e0e0e0e-0000-4000-8000-0000000001a1', jsonb_build_object('x', 1, 'y', 1, 'path', bad::jsonb))));
    exception when others then ok := sqlerrm = 'formation_invalid';
    end;
    if not ok then raise exception 'FAIL a malformed curve was accepted: %', bad; end if;
  end loop;
  if (select revision from public.formation_plans where id = v_plan) <> 2 then
    raise exception 'FAIL a refused curve still bumped the revision';
  end if;
  raise notice 'PASS 3 control points, none, or one off the stage is formation_invalid';

  -- A smaller stage pulls both control points inside.
  r := public.update_formation_plan(v_plan, 2, '{"stage_width":4,"stage_depth":4}');
  if exists (
    select 1 from public.formations f, jsonb_array_elements(f.positions #> '{0e0e0e0e-0000-4000-8000-0000000001a1,path,points}') pt
    where f.plan_id = v_plan and f.archived_at is null
      and ((pt ->> 'x')::numeric > 4 or (pt ->> 'y')::numeric > 4)
  ) then
    raise exception 'FAIL a smaller stage left a control point outside';
  end if;
  raise notice 'PASS a smaller stage pulls both control points of an S inside';
end $$;

rollback;
