-- One Shoot · Formaciones F-3 recorridos (REQ-08) y F-5 atrezo (REQ-10).
-- No new tables or columns: it teaches the existing RPCs the new shapes of the jsonb columns.
--
--  positions[memberId].path  optional: { kind: 'curve' | 'points' | 'free', points: [{ x, y }, …] } with 1 control
--                            point (curve), 1–8 points passed through (points) or 1–40 points of a simplified drawn
--                            line (free). Every point inside the stage. Absent = straight (old rows keep working).
--  formations.props          [{ id, kind: 'chair' | 'bench' | 'mark' | 'step', x, y, rot?, label? }], up to 30, ids
--                            unique uuids, inside the stage, rot 0–<360, label ≤ 24.
--
-- Compatible with the client already deployed: it never sends paths nor `props`; save_formation without `props`
-- keeps the formation's props (a new one gets `[]`), and positions without `path` are valid as before.
-- update_formation_plan now keeps paths and props when a smaller stage pulls everything inside.

-- ─────────────────────────────────────────────────────────────
-- 1) Validation helpers
-- ─────────────────────────────────────────────────────────────

-- A list of { x, y } inside the stage, with between p_min and p_max items.
create or replace function private.check_formation_points(p_points jsonb, p_min int, p_max int, p_width numeric, p_depth numeric)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_val jsonb;
  v_x   numeric;
  v_y   numeric;
begin
  if p_points is null or jsonb_typeof(p_points) <> 'array'
     or jsonb_array_length(p_points) < p_min or jsonb_array_length(p_points) > p_max then
    return false;
  end if;
  for v_val in select * from jsonb_array_elements(p_points) loop
    if jsonb_typeof(v_val) <> 'object' or exists (select 1 from jsonb_object_keys(v_val) k where k not in ('x', 'y')) then
      return false;
    end if;
    v_x := private.json_num(v_val -> 'x');
    v_y := private.json_num(v_val -> 'y');
    if v_x is null or v_y is null or v_x < 0 or v_y < 0 or v_x > p_width or v_y > p_depth then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- REQ-06 + REQ-08: `positions` is an object of up to 40 members of the group, each { x, y, path? } inside the stage.
create or replace function private.check_formation_positions(p_positions jsonb, p_crew uuid, p_width numeric, p_depth numeric)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key  text;
  v_val  jsonb;
  v_x    numeric;
  v_y    numeric;
  v_n    int := 0;
  v_path jsonb;
  v_kind text;
begin
  if p_positions is null or jsonb_typeof(p_positions) <> 'object' then
    raise exception 'formation_invalid' using errcode = 'P0001', detail = 'positions';
  end if;
  for v_key, v_val in select * from jsonb_each(p_positions) loop
    v_n := v_n + 1;
    if v_n > 40 then
      raise exception 'formation_invalid' using errcode = 'P0001', detail = 'too many people';
    end if;
    if v_key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or not exists (select 1 from public.members m where m.id = v_key::uuid and m.crew_id = p_crew) then
      raise exception 'formation_invalid' using errcode = 'P0001', detail = 'unknown member';
    end if;
    if jsonb_typeof(v_val) <> 'object' or exists (select 1 from jsonb_object_keys(v_val) k where k not in ('x', 'y', 'path')) then
      raise exception 'formation_invalid' using errcode = 'P0001', detail = 'position shape';
    end if;
    v_x := private.json_num(v_val -> 'x');
    v_y := private.json_num(v_val -> 'y');
    if v_x is null or v_y is null then
      raise exception 'formation_invalid' using errcode = 'P0001', detail = 'position numbers';
    end if;
    if v_x < 0 or v_y < 0 or v_x > p_width or v_y > p_depth then
      raise exception 'formation_out_of_stage' using errcode = 'P0001';
    end if;
    if v_val ? 'path' then
      v_path := v_val -> 'path';
      if jsonb_typeof(v_path) <> 'object' or exists (select 1 from jsonb_object_keys(v_path) k where k not in ('kind', 'points'))
         or jsonb_typeof(v_path -> 'kind') <> 'string' then
        raise exception 'formation_invalid' using errcode = 'P0001', detail = 'path shape';
      end if;
      v_kind := v_path ->> 'kind';
      if not (
        (v_kind = 'curve' and private.check_formation_points(v_path -> 'points', 1, 1, p_width, p_depth))
        or (v_kind = 'points' and private.check_formation_points(v_path -> 'points', 1, 8, p_width, p_depth))
        or (v_kind = 'free' and private.check_formation_points(v_path -> 'points', 1, 40, p_width, p_depth))
      ) then
        raise exception 'formation_invalid' using errcode = 'P0001', detail = 'path';
      end if;
    end if;
  end loop;
end;
$$;

-- REQ-10: `props` is an array of up to 30 props with unique uuids, a known kind, inside the stage.
create or replace function private.check_formation_props(p_props jsonb, p_width numeric, p_depth numeric)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_val jsonb;
  v_x   numeric;
  v_y   numeric;
  v_rot numeric;
  v_ids text[] := '{}';
begin
  if p_props is null or jsonb_typeof(p_props) <> 'array' or jsonb_array_length(p_props) > 30 then
    raise exception 'formation_invalid' using errcode = 'P0001', detail = 'props';
  end if;
  for v_val in select * from jsonb_array_elements(p_props) loop
    if jsonb_typeof(v_val) <> 'object'
       or exists (select 1 from jsonb_object_keys(v_val) k where k not in ('id', 'kind', 'x', 'y', 'rot', 'label')) then
      raise exception 'formation_invalid' using errcode = 'P0001', detail = 'prop shape';
    end if;
    if jsonb_typeof(v_val -> 'id') is distinct from 'string'
       or (v_val ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or (v_val ->> 'id') = any (v_ids) then
      raise exception 'formation_invalid' using errcode = 'P0001', detail = 'prop id';
    end if;
    v_ids := v_ids || (v_val ->> 'id');
    if jsonb_typeof(v_val -> 'kind') is distinct from 'string' or (v_val ->> 'kind') not in ('chair', 'bench', 'mark', 'step') then
      raise exception 'formation_invalid' using errcode = 'P0001', detail = 'prop kind';
    end if;
    v_x := private.json_num(v_val -> 'x');
    v_y := private.json_num(v_val -> 'y');
    if v_x is null or v_y is null then
      raise exception 'formation_invalid' using errcode = 'P0001', detail = 'prop numbers';
    end if;
    if v_val ? 'rot' then
      v_rot := private.json_num(v_val -> 'rot');
      if v_rot is null or v_rot < 0 or v_rot >= 360 then
        raise exception 'formation_invalid' using errcode = 'P0001', detail = 'prop rot';
      end if;
    end if;
    if v_val ? 'label' and (jsonb_typeof(v_val -> 'label') <> 'string' or char_length(v_val ->> 'label') > 24) then
      raise exception 'formation_invalid' using errcode = 'P0001', detail = 'prop label';
    end if;
    if v_x < 0 or v_y < 0 or v_x > p_width or v_y > p_depth then
      raise exception 'formation_out_of_stage' using errcode = 'P0001';
    end if;
  end loop;
end;
$$;

-- A point { x, y } pulled inside the stage (non-numbers become 0, as update_formation_plan always did).
create or replace function private.clamp_stage_point(p jsonb, p_width numeric, p_depth numeric)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'x', least(greatest(coalesce(private.json_num(p -> 'x'), 0), 0), p_width),
    'y', least(greatest(coalesce(private.json_num(p -> 'y'), 0), 0), p_depth)
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- 2) save_formation learns `props` (absent = keep the formation's own)
-- ─────────────────────────────────────────────────────────────

-- Creates or updates one formation if nobody changed the plan since `p_expected_revision`.
-- p_formation: { id?, at, transition?, positions, note?, props? }. Returns { ok, revision, formation } or a conflict.
create or replace function public.save_formation(p_plan uuid, p_expected_revision int, p_formation jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan  public.formation_plans;
  v_row   public.formations;
  v_id    uuid;
  v_at    numeric;
  v_tr    numeric;
  v_note  text;
  v_key   text;
  v_props jsonb;
begin
  v_plan := private.lock_formation_plan(p_plan);
  if v_plan.revision <> p_expected_revision then
    return jsonb_build_object('ok', false, 'conflict', true, 'revision', v_plan.revision);
  end if;
  if p_formation is null or jsonb_typeof(p_formation) <> 'object' then
    raise exception 'formation_invalid' using errcode = 'P0001', detail = 'formation';
  end if;
  for v_key in select jsonb_object_keys(p_formation) loop
    if v_key not in ('id', 'at', 'transition', 'positions', 'note', 'props') then
      raise exception 'formation_invalid' using errcode = 'P0001', detail = v_key;
    end if;
  end loop;
  if p_formation ? 'id' and jsonb_typeof(p_formation -> 'id') <> 'null' then
    if jsonb_typeof(p_formation -> 'id') <> 'string'
       or (p_formation ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'formation_invalid' using errcode = 'P0001', detail = 'id';
    end if;
    v_id := (p_formation ->> 'id')::uuid;
  end if;
  v_at := round(private.json_num(p_formation -> 'at'), 2);
  v_tr := coalesce(private.json_num(p_formation -> 'transition'), 2);
  if v_at is null or (p_formation ? 'transition' and jsonb_typeof(p_formation -> 'transition') <> 'number') then
    raise exception 'formation_invalid' using errcode = 'P0001', detail = 'at';
  end if;
  if p_formation ? 'note' and jsonb_typeof(p_formation -> 'note') not in ('string', 'null') then
    raise exception 'formation_invalid' using errcode = 'P0001', detail = 'note';
  end if;
  v_note := nullif(btrim(coalesce(p_formation ->> 'note', '')), '');
  perform private.check_formation_positions(p_formation -> 'positions', v_plan.crew_id, v_plan.stage_width, v_plan.stage_depth);
  if p_formation ? 'props' then
    v_props := p_formation -> 'props';
    perform private.check_formation_props(v_props, v_plan.stage_width, v_plan.stage_depth);
  end if;

  if v_id is not null then
    select * into v_row from public.formations where id = v_id;
    if v_row.id is not null and v_row.plan_id <> v_plan.id then
      raise exception 'formation_not_found' using errcode = 'P0001';
    end if;
  end if;
  if v_row.id is not null then
    -- An archived one of this plan comes back (undoing a delete in the editor keeps the formation's id).
    update public.formations set at = v_at, transition = v_tr, positions = p_formation -> 'positions', note = v_note,
      props = coalesce(v_props, props), archived_at = null
    where id = v_row.id
    returning * into v_row;
  else
    if (select count(*) from public.formations where plan_id = v_plan.id and archived_at is null) >= 300 then
      raise exception 'formations_cap_reached' using errcode = 'P0001';
    end if;
    insert into public.formations (id, plan_id, at, transition, positions, note, props)
    values (coalesce(v_id, gen_random_uuid()), v_plan.id, v_at, v_tr, p_formation -> 'positions', v_note, coalesce(v_props, '[]'::jsonb))
    returning * into v_row;
  end if;
  update public.formation_plans set revision = revision + 1 where id = v_plan.id returning revision into v_plan.revision;
  return jsonb_build_object('ok', true, 'revision', v_plan.revision, 'formation', to_jsonb(v_row));
exception
  when unique_violation then
    raise exception 'formation_time_taken' using errcode = 'P0001';
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3) update_formation_plan keeps paths and props when the stage shrinks
-- ─────────────────────────────────────────────────────────────

-- Edits a plan if nobody changed it since `p_expected_revision`. Patch keys: name, stage_width, stage_depth, grid,
-- bpm, first_beat (null clears the beat data), members (array of ids). A smaller stage pulls every position, path
-- point and prop inside. Returns { ok, revision, plan } or { ok: false, conflict: true, revision } without writing.
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
  if p_patch ? 'members' then
    perform private.set_formation_participants(v_plan.id, private.formation_member_ids(p_patch -> 'members', v_plan.crew_id));
  end if;
  return jsonb_build_object('ok', true, 'revision', v_plan.revision, 'plan', to_jsonb(v_plan));
end;
$$;

revoke execute on function private.check_formation_points(jsonb, int, int, numeric, numeric) from public, anon, authenticated;
revoke execute on function private.check_formation_positions(jsonb, uuid, numeric, numeric) from public, anon, authenticated;
revoke execute on function private.check_formation_props(jsonb, numeric, numeric) from public, anon, authenticated;
revoke execute on function private.clamp_stage_point(jsonb, numeric, numeric) from public, anon, authenticated;
revoke execute on function public.save_formation(uuid, int, jsonb) from public;
revoke execute on function public.update_formation_plan(uuid, int, jsonb) from public;
grant execute on function public.save_formation(uuid, int, jsonb) to anon, authenticated;
grant execute on function public.update_formation_plan(uuid, int, jsonb) to anon, authenticated;
