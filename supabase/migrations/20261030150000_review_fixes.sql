-- One Shoot · Review fixes for the calendar / formations migrations (20261030100000–20261030140000).
-- Additive: one new private helper and update_formation_plan calling it. No table or data changes.
--
--  «Ajustes del plan» always sends the plan's participants, and those include people who have since left the group
--  (archived members: their point stays, greyed out, and the form lists them ticked). update_formation_plan validated
--  the list with formation_member_ids, which refuses archived members, so once anyone in a plan was removed from the
--  group the plan could no longer be renamed or resized (formation_member_invalid) until they were unticked.
--  Now an archived member is accepted when they are already a live participant of that plan; adding an archived
--  member who isn't in it is still refused (create_formation_plan keeps the strict check).

-- Live members of the group, plus archived ones that already take part in `p_plan` (kept, never newly added).
create or replace function private.formation_member_ids_for_plan(p_members jsonb, p_crew uuid, p_plan uuid)
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if p_members is null or jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) > 40 then
    raise exception 'formation_invalid' using errcode = 'P0001', detail = 'members';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_members) e
    where jsonb_typeof(e) <> 'string'
       or (e #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception 'formation_invalid' using errcode = 'P0001', detail = 'members';
  end if;
  select coalesce(array_agg(distinct (e #>> '{}')::uuid), '{}') into v_ids from jsonb_array_elements(p_members) e;
  if exists (
    select 1 from unnest(v_ids) i
    where not exists (
      select 1 from public.members m
      where m.id = i and m.crew_id = p_crew
        and (
          m.archived_at is null
          or exists (
            select 1 from public.formation_plan_members pm
            where pm.plan_id = p_plan and pm.member_id = m.id and pm.archived_at is null
          )
        )
    )
  ) then
    raise exception 'formation_member_invalid' using errcode = 'P0001';
  end if;
  return v_ids;
end;
$$;

-- Same as 20261030140000 except the participants check (formation_member_ids_for_plan).
create or replace function public.update_formation_plan(p_plan uuid, p_expected_revision int, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan  public.formation_plans;
  v_key   text;
  v_width numeric;
  v_depth numeric;
  v_ids   uuid[];
begin
  v_plan := private.lock_formation_plan(p_plan);
  if v_plan.revision <> p_expected_revision then
    return jsonb_build_object('ok', false, 'conflict', true, 'revision', v_plan.revision);
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'formation_invalid' using errcode = 'P0001', detail = 'patch';
  end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('name', 'stage_width', 'stage_depth', 'grid', 'bpm', 'first_beat', 'members') then
      raise exception 'formation_invalid' using errcode = 'P0001', detail = v_key;
    end if;
  end loop;
  -- Checked before writing anything (the participants as they are now decide who may stay).
  if p_patch ? 'members' then
    v_ids := private.formation_member_ids_for_plan(p_patch -> 'members', v_plan.crew_id, v_plan.id);
  end if;
  if p_patch ? 'name' then
    if jsonb_typeof(p_patch -> 'name') <> 'string' then
      raise exception 'formation_invalid' using errcode = 'P0001', detail = 'name';
    end if;
    v_plan.name := btrim(p_patch ->> 'name');
  end if;
  if p_patch ? 'stage_width' then v_plan.stage_width := private.json_num(p_patch -> 'stage_width'); end if;
  if p_patch ? 'stage_depth' then v_plan.stage_depth := private.json_num(p_patch -> 'stage_depth'); end if;
  if p_patch ? 'grid' then v_plan.grid := private.json_num(p_patch -> 'grid'); end if;
  if p_patch ? 'bpm' then v_plan.bpm := private.json_num(p_patch -> 'bpm'); end if;
  if p_patch ? 'first_beat' then v_plan.first_beat := private.json_num(p_patch -> 'first_beat'); end if;
  if v_plan.stage_width is null or v_plan.stage_depth is null or v_plan.grid is null
     or (p_patch ? 'bpm' and jsonb_typeof(p_patch -> 'bpm') not in ('number', 'null'))
     or (p_patch ? 'first_beat' and jsonb_typeof(p_patch -> 'first_beat') not in ('number', 'null')) then
    raise exception 'formation_invalid' using errcode = 'P0001', detail = 'numbers';
  end if;
  -- The table checks (name length, stage 2–30 m, bpm 40–240) give the precise error.
  update public.formation_plans set
    name = v_plan.name, stage_width = v_plan.stage_width, stage_depth = v_plan.stage_depth, grid = v_plan.grid,
    bpm = v_plan.bpm, first_beat = v_plan.first_beat, revision = revision + 1
  where id = v_plan.id
  returning * into v_plan;
  v_width := v_plan.stage_width;
  v_depth := v_plan.stage_depth;
  -- Points, path points and props outside a smaller stage fit inside its edge (the rest of each item untouched).
  update public.formations f set
    positions = (
      select coalesce(jsonb_object_agg(e.key,
        private.clamp_stage_point(e.value, v_width, v_depth)
        || case when jsonb_typeof(e.value -> 'path') = 'object' and jsonb_typeof(e.value #> '{path,points}') = 'array' then
             jsonb_build_object('path', (e.value -> 'path') || jsonb_build_object('points', (
               select coalesce(jsonb_agg(private.clamp_stage_point(pt, v_width, v_depth) order by n), '[]'::jsonb)
               from jsonb_array_elements(e.value #> '{path,points}') with ordinality as q(pt, n)
             )))
           else '{}'::jsonb end
      ), '{}'::jsonb)
      from jsonb_each(f.positions) e
    ),
    props = (
      select coalesce(jsonb_agg(pr || private.clamp_stage_point(pr, v_width, v_depth) order by n), '[]'::jsonb)
      from jsonb_array_elements(f.props) with ordinality as q(pr, n)
    )
  where f.plan_id = v_plan.id and f.archived_at is null
    and (
      exists (
        select 1 from jsonb_each(f.positions) e
        where private.json_num(e.value -> 'x') > v_width or private.json_num(e.value -> 'y') > v_depth
           or exists (
             select 1 from jsonb_array_elements(case when jsonb_typeof(e.value #> '{path,points}') = 'array'
                                                     then e.value #> '{path,points}' else '[]'::jsonb end) pt
             where private.json_num(pt -> 'x') > v_width or private.json_num(pt -> 'y') > v_depth
           )
      )
      or exists (
        select 1 from jsonb_array_elements(f.props) pr
        where private.json_num(pr -> 'x') > v_width or private.json_num(pr -> 'y') > v_depth
      )
    );
  if v_ids is not null then
    perform private.set_formation_participants(v_plan.id, v_ids);
  end if;
  return jsonb_build_object('ok', true, 'revision', v_plan.revision, 'plan', to_jsonb(v_plan));
end;
$$;

revoke execute on function private.formation_member_ids_for_plan(jsonb, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.update_formation_plan(uuid, int, jsonb) from public;
grant execute on function public.update_formation_plan(uuid, int, jsonb) to anon, authenticated;
