-- One Shoot · Formaciones · recorridos curvos (REQ-08).
-- A `curve` path may now carry 2 control points (a cubic Bézier: smooth arcs and S bends) besides the 1 it had
-- (quadratic). Nothing else changes: `points` (1–8) and `free` (1–40) keep their shape (the client now walks them
-- as a smooth spline through the points, which needs no server change).
--
-- Compatible both ways: every row saved before stays valid, and the deployed client never sends 2-point curves.
-- Apply it BEFORE deploying the client that offers «En S» (it would otherwise get formation_invalid on save).
-- Checks: supabase/tests/formation_curves_checks.sql.

-- REQ-06 + REQ-08: `positions` is an object of up to 40 members of the group, each { x, y, path? } inside the stage.
-- A curve now takes 1 (arc) or 2 (cubic, S bends) control points.
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
        (v_kind = 'curve' and private.check_formation_points(v_path -> 'points', 1, 2, p_width, p_depth))
        or (v_kind = 'points' and private.check_formation_points(v_path -> 'points', 1, 8, p_width, p_depth))
        or (v_kind = 'free' and private.check_formation_points(v_path -> 'points', 1, 40, p_width, p_depth))
      ) then
        raise exception 'formation_invalid' using errcode = 'P0001', detail = 'path';
      end if;
    end if;
  end loop;
end;
$$;

revoke execute on function private.check_formation_positions(jsonb, uuid, numeric, numeric) from public, anon, authenticated;
