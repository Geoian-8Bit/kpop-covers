-- Checks for 20261030150000_review_fixes.sql (plan settings keep participants who left the group).
-- Run the whole file in one go as postgres (SQL editor / MCP execute_sql, or `pnpm db:test`). Acts as `anon`,
-- prints `PASS …`, raises `FAIL …` on the first problem, ends with ROLLBACK.

begin;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into public.members (id, name) values ('0e0e0e0e-0000-4000-8000-0000000000a1', 'Prueba Ana'),
                                             ('0e0e0e0e-0000-4000-8000-0000000000a2', 'Prueba Bea'),
                                             ('0e0e0e0e-0000-4000-8000-0000000000a3', 'Prueba Cris');
insert into public.videos (id, crew_id, title, source, youtube_id)
values ('0e0e0e0e-0000-4000-8000-0000000000b1', (select private.default_group()), 'Prueba canción', 'youtube', 'zzRevw000B1');

do $$
declare p public.formation_plans;
begin
  p := public.create_formation_plan('0e0e0e0e-0000-4000-8000-0000000000b1', 'Con 2',
    '["0e0e0e0e-0000-4000-8000-0000000000a1","0e0e0e0e-0000-4000-8000-0000000000a2"]');
  perform set_config('test.plan', p.id::text, true);
end $$;

-- Bea leaves the group (deleting archives).
delete from public.members where id = '0e0e0e0e-0000-4000-8000-0000000000a2';

do $$
declare r jsonb;
begin
  r := public.update_formation_plan(current_setting('test.plan')::uuid, 0, jsonb_build_object(
    'name', 'Con 2 bis',
    'members', '["0e0e0e0e-0000-4000-8000-0000000000a1","0e0e0e0e-0000-4000-8000-0000000000a2"]'::jsonb));
  if not (r ->> 'ok')::boolean or (r ->> 'revision')::int <> 1 or r #>> '{plan,name}' <> 'Con 2 bis' then
    raise exception 'FAIL plan settings with an archived participant still in it were refused: %', r;
  end if;
  if (select count(*) from public.formation_plan_members where plan_id = current_setting('test.plan')::uuid) <> 2 then
    raise exception 'FAIL the archived participant was dropped from the plan';
  end if;
  raise notice 'PASS a plan can be edited while someone who left the group is still in it';
end $$;

do $$
declare ok boolean := false;
begin
  -- An archived member not in the plan can't be added.
  delete from public.members where id = '0e0e0e0e-0000-4000-8000-0000000000a3';
  begin
    perform public.update_formation_plan(current_setting('test.plan')::uuid, 1, jsonb_build_object(
      'members', '["0e0e0e0e-0000-4000-8000-0000000000a1","0e0e0e0e-0000-4000-8000-0000000000a3"]'::jsonb));
  exception when others then
    ok := sqlerrm = 'formation_member_invalid';
  end;
  if not ok then raise exception 'FAIL an archived member was added to a plan'; end if;
  if (select revision from public.formation_plans where id = current_setting('test.plan')::uuid) <> 1 then
    raise exception 'FAIL a refused participants list still wrote the plan';
  end if;
  raise notice 'PASS an archived member who is not in the plan is still refused, without writing';
end $$;

do $$
declare r jsonb;
begin
  -- Unticking the archived participant works and archives their row.
  r := public.update_formation_plan(current_setting('test.plan')::uuid, 1,
    jsonb_build_object('members', '["0e0e0e0e-0000-4000-8000-0000000000a1"]'::jsonb));
  if not (r ->> 'ok')::boolean then raise exception 'FAIL removing the archived participant failed: %', r; end if;
  if (select count(*) from public.formation_plan_members where plan_id = current_setting('test.plan')::uuid) <> 1 then
    raise exception 'FAIL the archived participant is still live in the plan';
  end if;
  -- Once out, they can't come back.
  begin
    perform public.update_formation_plan(current_setting('test.plan')::uuid, 2, jsonb_build_object(
      'members', '["0e0e0e0e-0000-4000-8000-0000000000a1","0e0e0e0e-0000-4000-8000-0000000000a2"]'::jsonb));
    raise exception 'FAIL an archived member came back into a plan';
  exception when others then
    if sqlerrm <> 'formation_member_invalid' then raise; end if;
  end;
  raise notice 'PASS an archived participant can be removed, and then not added back';
end $$;

rollback;
