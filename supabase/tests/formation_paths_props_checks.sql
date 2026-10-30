-- Checks for 20261030140000_formation_paths_props.sql (REQ-08 paths inside positions, REQ-10 props).
-- Run the whole file in one go as postgres (SQL editor / MCP execute_sql, or `pnpm db:test`). Acts as `anon`,
-- prints `PASS …`, raises `FAIL …` on the first problem, ends with ROLLBACK.

begin;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into public.members (id, name) values ('0e0e0e0e-0000-4000-8000-0000000000a1', 'Prueba Ana'),
                                             ('0e0e0e0e-0000-4000-8000-0000000000a2', 'Prueba Bea');
insert into public.videos (id, crew_id, title, source, youtube_id)
values ('0e0e0e0e-0000-4000-8000-0000000000b1', (select private.default_group()), 'Prueba recorridos', 'youtube', 'zzPath000B1');

do $$
declare p public.formation_plans;
begin
  p := public.create_formation_plan('0e0e0e0e-0000-4000-8000-0000000000b1', 'Prueba recorridos',
    '["0e0e0e0e-0000-4000-8000-0000000000a1","0e0e0e0e-0000-4000-8000-0000000000a2"]');
  perform set_config('test.plan', p.id::text, true);
end $$;

-- ───────────── Old shapes keep working (the deployed client) ─────────────

do $$
declare
  v_plan uuid := current_setting('test.plan')::uuid;
  r jsonb;
begin
  r := public.save_formation(v_plan, 0, '{"id":"0e0e0e0e-0000-4000-8000-000000000001","at":0,"positions":{"0e0e0e0e-0000-4000-8000-0000000000a1":{"x":1,"y":1}},"note":null}');
  if not (r ->> 'ok')::boolean or (r #> '{formation,props}') <> '[]'::jsonb then
    raise exception 'FAIL an old-style formation (no props, no path) was not saved with empty props (%)', r;
  end if;
  raise notice 'PASS a formation without props nor paths saves as before, with props = []';
end $$;

-- ───────────── Paths ─────────────

do $$
declare
  v_plan uuid := current_setting('test.plan')::uuid;
  r jsonb;
  ok boolean;
  bad text;
begin
  r := public.save_formation(v_plan, 1, '{"id":"0e0e0e0e-0000-4000-8000-000000000002","at":10,"positions":{
    "0e0e0e0e-0000-4000-8000-0000000000a1":{"x":7,"y":5,"path":{"kind":"curve","points":[{"x":4,"y":0}]}},
    "0e0e0e0e-0000-4000-8000-0000000000a2":{"x":2,"y":2,"path":{"kind":"points","points":[{"x":1,"y":1},{"x":3,"y":1}]}}}}');
  if (r ->> 'revision')::int <> 2 or (r #>> '{formation,positions,0e0e0e0e-0000-4000-8000-0000000000a1,path,kind}') <> 'curve' then
    raise exception 'FAIL a formation with paths was not saved (%)', r;
  end if;
  r := public.save_formation(v_plan, 2, '{"id":"0e0e0e0e-0000-4000-8000-000000000003","at":20,"positions":{
    "0e0e0e0e-0000-4000-8000-0000000000a1":{"x":7,"y":1,"path":{"kind":"free","points":[{"x":6,"y":3},{"x":7.5,"y":2}]}}}}');
  if (r ->> 'revision')::int <> 3 then raise exception 'FAIL a free path was not saved (%)', r; end if;

  foreach bad in array array[
    '{"kind":"curve","points":[{"x":1,"y":1},{"x":2,"y":2}]}',
    '{"kind":"curve","points":[]}',
    '{"kind":"zigzag","points":[{"x":1,"y":1}]}',
    '{"kind":"points","points":[{"x":1,"y":1},{"x":1,"y":1},{"x":1,"y":1},{"x":1,"y":1},{"x":1,"y":1},{"x":1,"y":1},{"x":1,"y":1},{"x":1,"y":1},{"x":1,"y":1}]}',
    '{"kind":"free","points":[{"x":9,"y":1}]}',
    '{"kind":"free","points":[{"x":1,"y":"1"}]}',
    '{"kind":"free","points":[{"x":1,"y":1,"z":0}]}',
    '{"kind":"free","points":[{"x":1,"y":1}],"speed":2}',
    '"curve"'
  ] loop
    ok := false;
    begin
      perform public.save_formation(v_plan, 3, jsonb_build_object('at', 30, 'positions',
        jsonb_build_object('0e0e0e0e-0000-4000-8000-0000000000a1', jsonb_build_object('x', 1, 'y', 1, 'path', bad::jsonb))));
    exception when others then ok := sqlerrm = 'formation_invalid';
    end;
    if not ok then raise exception 'FAIL a malformed path was accepted: %', bad; end if;
  end loop;
  if (select revision from public.formation_plans where id = v_plan) <> 3 then
    raise exception 'FAIL a refused path still bumped the revision';
  end if;
  raise notice 'PASS paths: curve (1 point), points (1–8), free (1–40) inside the stage; anything else is formation_invalid';
end $$;

-- ───────────── Props ─────────────

do $$
declare
  v_plan uuid := current_setting('test.plan')::uuid;
  r jsonb;
  ok boolean;
  bad text;
begin
  r := public.save_formation(v_plan, 3, '{"id":"0e0e0e0e-0000-4000-8000-000000000001","at":0,
    "positions":{"0e0e0e0e-0000-4000-8000-0000000000a1":{"x":1,"y":1}},
    "props":[{"id":"0e0e0e0e-0000-4000-8000-0000000000c1","kind":"chair","x":4,"y":5,"rot":0},
             {"id":"0e0e0e0e-0000-4000-8000-0000000000c2","kind":"mark","x":2,"y":5,"rot":90,"label":"Salida"}]}');
  if jsonb_array_length(r #> '{formation,props}') <> 2 or (r ->> 'revision')::int <> 4 then
    raise exception 'FAIL props were not saved (%)', r;
  end if;
  -- The deployed client sends no props: they stay.
  r := public.save_formation(v_plan, 4, '{"id":"0e0e0e0e-0000-4000-8000-000000000001","at":0,"positions":{"0e0e0e0e-0000-4000-8000-0000000000a1":{"x":1.5,"y":1}}}');
  if jsonb_array_length(r #> '{formation,props}') <> 2 then
    raise exception 'FAIL saving without props wiped them (%)', r;
  end if;
  -- An explicit empty list removes them.
  r := public.save_formation(v_plan, 5, '{"id":"0e0e0e0e-0000-4000-8000-000000000001","at":0,"positions":{},"props":[]}');
  if (r #> '{formation,props}') <> '[]'::jsonb then
    raise exception 'FAIL an empty props list did not clear them (%)', r;
  end if;

  foreach bad in array array[
    '[{"id":"0e0e0e0e-0000-4000-8000-0000000000c1","kind":"sofa","x":1,"y":1}]',
    '[{"id":"nope","kind":"chair","x":1,"y":1}]',
    '[{"kind":"chair","x":1,"y":1}]',
    '[{"id":"0e0e0e0e-0000-4000-8000-0000000000c1","kind":"chair","x":1,"y":1},{"id":"0e0e0e0e-0000-4000-8000-0000000000c1","kind":"bench","x":2,"y":2}]',
    '[{"id":"0e0e0e0e-0000-4000-8000-0000000000c1","kind":"chair","x":1,"y":1,"rot":360}]',
    '[{"id":"0e0e0e0e-0000-4000-8000-0000000000c1","kind":"chair","x":1,"y":1,"rot":"0"}]',
    '[{"id":"0e0e0e0e-0000-4000-8000-0000000000c1","kind":"mark","x":1,"y":1,"label":"aaaaaaaaaaaaaaaaaaaaaaaaa"}]',
    '[{"id":"0e0e0e0e-0000-4000-8000-0000000000c1","kind":"chair","x":1,"y":1,"colour":"red"}]',
    '{"chair":1}'
  ] loop
    ok := false;
    begin
      perform public.save_formation(v_plan, 6, jsonb_build_object('at', 40, 'positions', '{}'::jsonb, 'props', bad::jsonb));
    exception when others then ok := sqlerrm = 'formation_invalid';
    end;
    if not ok then raise exception 'FAIL malformed props were accepted: %', bad; end if;
  end loop;
  ok := false;
  begin
    perform public.save_formation(v_plan, 6, '{"at":40,"positions":{},"props":[{"id":"0e0e0e0e-0000-4000-8000-0000000000c1","kind":"step","x":8.5,"y":1}]}');
  exception when others then ok := sqlerrm = 'formation_out_of_stage';
  end;
  if not ok then raise exception 'FAIL a prop off the stage was accepted'; end if;
  ok := false;
  begin
    perform public.save_formation(v_plan, 6, jsonb_build_object('at', 40, 'positions', '{}'::jsonb, 'props',
      (select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'kind', 'chair', 'x', 1, 'y', 1)) from generate_series(1, 31))));
  exception when others then ok := sqlerrm = 'formation_invalid';
  end;
  if not ok then raise exception 'FAIL 31 props were accepted'; end if;
  raise notice 'PASS props: up to 30, unique uuids, chair/bench/mark/step, rot 0–<360, label ≤ 24, inside the stage; absent keeps them';
end $$;

-- ───────────── A smaller stage keeps paths and props, pulled inside ─────────────

do $$
declare
  v_plan uuid := current_setting('test.plan')::uuid;
  r jsonb;
  v_pos jsonb;
  v_props jsonb;
begin
  r := public.save_formation(v_plan, 6, '{"id":"0e0e0e0e-0000-4000-8000-000000000001","at":0,"positions":{},
    "props":[{"id":"0e0e0e0e-0000-4000-8000-0000000000c1","kind":"bench","x":7.5,"y":5.5,"rot":45},
             {"id":"0e0e0e0e-0000-4000-8000-0000000000c2","kind":"mark","x":1,"y":1,"rot":0,"label":"X"}]}');
  r := public.update_formation_plan(v_plan, 7, '{"stage_width":4,"stage_depth":4}');
  if not (r ->> 'ok')::boolean then raise exception 'FAIL shrinking the stage (%)', r; end if;
  select positions into v_pos from public.formations where id = '0e0e0e0e-0000-4000-8000-000000000002';
  if v_pos #> '{0e0e0e0e-0000-4000-8000-0000000000a1}' <> '{"x":4,"y":4,"path":{"kind":"curve","points":[{"x":4,"y":0}]}}'::jsonb
     or v_pos #> '{0e0e0e0e-0000-4000-8000-0000000000a2,path}' <> '{"kind":"points","points":[{"x":1,"y":1},{"x":3,"y":1}]}'::jsonb then
    raise exception 'FAIL a smaller stage lost or broke the paths (%)', v_pos;
  end if;
  select positions into v_pos from public.formations where id = '0e0e0e0e-0000-4000-8000-000000000003';
  if v_pos #> '{0e0e0e0e-0000-4000-8000-0000000000a1,path,points}' <> '[{"x":4,"y":3},{"x":4,"y":2}]'::jsonb then
    raise exception 'FAIL path points outside a smaller stage were not pulled inside (%)', v_pos;
  end if;
  select props into v_props from public.formations where id = '0e0e0e0e-0000-4000-8000-000000000001';
  if v_props <> '[{"id":"0e0e0e0e-0000-4000-8000-0000000000c1","kind":"bench","x":4,"y":4,"rot":45},
                  {"id":"0e0e0e0e-0000-4000-8000-0000000000c2","kind":"mark","x":1,"y":1,"rot":0,"label":"X"}]'::jsonb then
    raise exception 'FAIL props outside a smaller stage were not pulled inside, in order, with their data (%)', v_props;
  end if;
  raise notice 'PASS a smaller stage pulls places, path points and props inside, keeping kinds, turns and labels';
end $$;

do $$
declare
  v_plan uuid := current_setting('test.plan')::uuid;
  p public.formation_plans;
begin
  p := public.duplicate_formation_plan(v_plan, 'Prueba copia');
  if (select props from public.formations where plan_id = p.id and at = 0) is distinct from
     (select props from public.formations where id = '0e0e0e0e-0000-4000-8000-000000000001')
     or (select positions from public.formations where plan_id = p.id and at = 10) is distinct from
        (select positions from public.formations where id = '0e0e0e0e-0000-4000-8000-000000000002') then
    raise exception 'FAIL duplicating a plan did not copy paths and props';
  end if;
  raise notice 'PASS duplicating a plan copies its paths and props';
end $$;

rollback;
