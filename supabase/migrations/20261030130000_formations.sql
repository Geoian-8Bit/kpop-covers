-- One Shoot · Editor de formaciones, base F-1 (REQ-06).
-- Additive: three new tables, the RPCs that write them with a per-plan revision (no Realtime: a stale write is
-- refused and the client says «Alguien ha cambiado este plan»), one read RPC for the names of the people in plans
-- (archived members included, shown greyed out) and archive_row learning the new tables.
--
--  formation_plans         one plan per song and line-up («Con 5», «Con 4 si falta alguien»…): stage size in metres,
--                          grid, beat data for REQ-09 and `revision`, bumped by every write of the plan or its
--                          formations. Created, edited and duplicated only through the RPCs; deleting archives.
--  formation_plan_members  who dances in a plan. A removed participant is archived (their positions stay in the
--                          formations in case they come back); adding them again revives the row.
--  formations              keyframes anchored to the video: `at` (seconds), `transition` (seconds before `at` the move
--                          starts), `positions` ({ memberId: { x, y } } in metres from the stage corner), `note`
--                          (REQ-07) and `props` (REQ-10). Written only by save_formation / delete_formation.
--  Deleting a plan or its song archives everything under it (repo rule: deleting archives).

-- ─────────────────────────────────────────────────────────────
-- 1) Tables
-- ─────────────────────────────────────────────────────────────

create table if not exists public.formation_plans (
  id          uuid primary key default gen_random_uuid(),
  crew_id     uuid not null references public.crews (id) on delete cascade,
  video_id    uuid not null references public.videos (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  stage_width numeric not null default 8 check (stage_width between 2 and 30),
  stage_depth numeric not null default 6 check (stage_depth between 2 and 30),
  grid        numeric not null default 0.5 check (grid between 0.1 and 2),
  bpm         numeric check (bpm is null or bpm between 40 and 240),
  first_beat  numeric check (first_beat is null or first_beat between 0 and 36000),
  revision    int not null default 0,
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists formation_plans_crew_idx on public.formation_plans (crew_id);
create index if not exists formation_plans_video_idx on public.formation_plans (video_id, created_at);

create table if not exists public.formation_plan_members (
  id          uuid primary key default gen_random_uuid(),
  crew_id     uuid not null references public.crews (id) on delete cascade,
  plan_id     uuid not null references public.formation_plans (id) on delete cascade,
  member_id   uuid not null references public.members (id) on delete cascade,
  created_at  timestamptz not null default now(),
  archived_at timestamptz,
  constraint formation_plan_members_plan_member_key unique (plan_id, member_id)
);
create index if not exists formation_plan_members_crew_idx on public.formation_plan_members (crew_id);
create index if not exists formation_plan_members_member_idx on public.formation_plan_members (member_id);

create table if not exists public.formations (
  id          uuid primary key default gen_random_uuid(),
  crew_id     uuid not null references public.crews (id) on delete cascade,
  plan_id     uuid not null references public.formation_plans (id) on delete cascade,
  at          numeric not null check (at between 0 and 36000),
  transition  numeric not null default 2 check (transition between 0 and 30),
  positions   jsonb not null default '{}'::jsonb check (jsonb_typeof(positions) = 'object'),
  note        text check (note is null or char_length(note) <= 280),
  props       jsonb not null default '[]'::jsonb check (jsonb_typeof(props) = 'array'),
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists formations_crew_idx on public.formations (crew_id);
create index if not exists formations_plan_at_idx on public.formations (plan_id, at);
-- Two formations of a plan never share a moment (the client moves a clash 0.1 s and says so).
create unique index if not exists formations_plan_at_key on public.formations (plan_id, at) where archived_at is null;

alter table public.formation_plans enable row level security;
alter table public.formation_plan_members enable row level security;
alter table public.formations enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 2) Triggers (same pattern as every group table)
-- ─────────────────────────────────────────────────────────────

drop trigger if exists formation_plans_a_set_crew on public.formation_plans;
create trigger formation_plans_a_set_crew before insert on public.formation_plans for each row execute function private.set_group_crew();
drop trigger if exists formation_plans_b_client_stamp on public.formation_plans;
create trigger formation_plans_b_client_stamp before insert on public.formation_plans for each row execute function private.stamp_new_row();
drop trigger if exists formation_plans_d_row_cap on public.formation_plans;
create trigger formation_plans_d_row_cap before insert on public.formation_plans for each row execute function private.guard_simple_cap('1000');
drop trigger if exists formation_plans_archive_on_delete on public.formation_plans;
create trigger formation_plans_archive_on_delete before delete on public.formation_plans
  for each row execute function private.archive_instead_of_delete();
drop trigger if exists formation_plans_bulk_delete_guard on public.formation_plans;
create trigger formation_plans_bulk_delete_guard after delete on public.formation_plans
  referencing old table as gone for each statement execute function private.guard_bulk_delete();

drop trigger if exists formation_plan_members_a_set_crew on public.formation_plan_members;
create trigger formation_plan_members_a_set_crew before insert on public.formation_plan_members for each row execute function private.set_group_crew();
drop trigger if exists formation_plan_members_b_client_stamp on public.formation_plan_members;
create trigger formation_plan_members_b_client_stamp before insert on public.formation_plan_members for each row execute function private.stamp_new_row();
drop trigger if exists formation_plan_members_d_row_cap on public.formation_plan_members;
create trigger formation_plan_members_d_row_cap before insert on public.formation_plan_members for each row execute function private.guard_simple_cap('20000');
drop trigger if exists formation_plan_members_archive_on_delete on public.formation_plan_members;
create trigger formation_plan_members_archive_on_delete before delete on public.formation_plan_members
  for each row execute function private.archive_instead_of_delete();
drop trigger if exists formation_plan_members_bulk_delete_guard on public.formation_plan_members;
create trigger formation_plan_members_bulk_delete_guard after delete on public.formation_plan_members
  referencing old table as gone for each statement execute function private.guard_bulk_delete();

drop trigger if exists formations_a_set_crew on public.formations;
create trigger formations_a_set_crew before insert on public.formations for each row execute function private.set_group_crew();
drop trigger if exists formations_b_client_stamp on public.formations;
create trigger formations_b_client_stamp before insert on public.formations for each row execute function private.stamp_new_row();
drop trigger if exists formations_d_row_cap on public.formations;
create trigger formations_d_row_cap before insert on public.formations for each row execute function private.guard_simple_cap('50000');
drop trigger if exists formations_archive_on_delete on public.formations;
create trigger formations_archive_on_delete before delete on public.formations
  for each row execute function private.archive_instead_of_delete();
drop trigger if exists formations_bulk_delete_guard on public.formations;
create trigger formations_bulk_delete_guard after delete on public.formations
  referencing old table as gone for each statement execute function private.guard_bulk_delete();

-- ─────────────────────────────────────────────────────────────
-- 3) RLS and grants: read the group; plans can be deleted (archived). Every other write goes through the RPCs.
-- ─────────────────────────────────────────────────────────────

drop policy if exists formation_plans_open_select on public.formation_plans;
drop policy if exists formation_plans_open_delete on public.formation_plans;
create policy formation_plans_open_select on public.formation_plans for select to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);
create policy formation_plans_open_delete on public.formation_plans for delete to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);

drop policy if exists formation_plan_members_open_select on public.formation_plan_members;
create policy formation_plan_members_open_select on public.formation_plan_members for select to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);

drop policy if exists formations_open_select on public.formations;
create policy formations_open_select on public.formations for select to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);

revoke insert, update, delete on public.formation_plans, public.formation_plan_members, public.formations from anon, authenticated;
grant select on public.formation_plans, public.formation_plan_members, public.formations to anon, authenticated;
grant delete on public.formation_plans to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4) Helpers
-- ─────────────────────────────────────────────────────────────

-- A JSON number, or null when the value is anything else.
create or replace function private.json_num(p jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p) = 'number' then (p #>> '{}')::numeric end;
$$;

-- The live plan of the group, locked for the write (null when it doesn't exist or isn't ours).
create or replace function private.lock_formation_plan(p_plan uuid)
returns public.formation_plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.formation_plans;
begin
  select * into v_plan from public.formation_plans
  where id = p_plan and crew_id = private.default_group() and archived_at is null
  for update;
  if v_plan.id is null then
    raise exception 'formation_plan_not_found' using errcode = 'P0001';
  end if;
  return v_plan;
end;
$$;

-- Validates `positions` against the stage: an object of up to 40 members of the group, each { x, y } inside it.
create or replace function private.check_formation_positions(p_positions jsonb, p_crew uuid, p_width numeric, p_depth numeric)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_val jsonb;
  v_x   numeric;
  v_y   numeric;
  v_n   int := 0;
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
    if jsonb_typeof(v_val) <> 'object' or exists (select 1 from jsonb_object_keys(v_val) k where k not in ('x', 'y')) then
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
  end loop;
end;
$$;

-- Live members of the group from a jsonb array of ids (unknown or archived ones are refused).
create or replace function private.formation_member_ids(p_members jsonb, p_crew uuid)
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
    where not exists (select 1 from public.members m where m.id = i and m.crew_id = p_crew and m.archived_at is null)
  ) then
    raise exception 'formation_member_invalid' using errcode = 'P0001';
  end if;
  return v_ids;
end;
$$;

-- Makes the live participants of a plan exactly `p_ids`: missing ones are added (or revived), the rest archived.
create or replace function private.set_formation_participants(p_plan uuid, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.formation_plan_members set archived_at = now()
  where plan_id = p_plan and archived_at is null and not (member_id = any (p_ids));
  update public.formation_plan_members set archived_at = null, created_at = now()
  where plan_id = p_plan and archived_at is not null and member_id = any (p_ids);
  insert into public.formation_plan_members (plan_id, member_id)
  select p_plan, i from unnest(p_ids) i
  where not exists (select 1 from public.formation_plan_members pm where pm.plan_id = p_plan and pm.member_id = i);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 5) RPCs
-- ─────────────────────────────────────────────────────────────

-- A new plan for a song with its participants (all live members of the group, by default in the client).
create or replace function public.create_formation_plan(
  p_video uuid, p_name text, p_members jsonb, p_width numeric default 8, p_depth numeric default 6
)
returns public.formation_plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_crew uuid := private.default_group();
  v_ids  uuid[];
  v_plan public.formation_plans;
begin
  if not exists (select 1 from public.videos v where v.id = p_video and v.crew_id = v_crew and v.archived_at is null) then
    raise exception 'formation_video_not_found' using errcode = 'P0001';
  end if;
  v_ids := private.formation_member_ids(p_members, v_crew);
  insert into public.formation_plans (video_id, name, stage_width, stage_depth)
  values (p_video, btrim(p_name), coalesce(p_width, 8), coalesce(p_depth, 6))
  returning * into v_plan;
  perform private.set_formation_participants(v_plan.id, v_ids);
  return v_plan;
end;
$$;

-- Edits a plan if nobody changed it since `p_expected_revision`. Patch keys: name, stage_width, stage_depth, grid,
-- bpm, first_beat (null clears the beat data), members (array of ids). A smaller stage pulls every position inside.
-- Returns { ok, revision, plan } or { ok: false, conflict: true, revision } without writing.
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
  -- Points outside a smaller stage fit inside its edge.
  update public.formations f set positions = (
    select coalesce(jsonb_object_agg(e.key, jsonb_build_object(
      'x', least(greatest(coalesce(private.json_num(e.value -> 'x'), 0), 0), v_width),
      'y', least(greatest(coalesce(private.json_num(e.value -> 'y'), 0), 0), v_depth)
    )), '{}'::jsonb)
    from jsonb_each(f.positions) e
  )
  where f.plan_id = v_plan.id and f.archived_at is null
    and exists (
      select 1 from jsonb_each(f.positions) e
      where private.json_num(e.value -> 'x') > v_width or private.json_num(e.value -> 'y') > v_depth
    );
  if p_patch ? 'members' then
    perform private.set_formation_participants(v_plan.id, private.formation_member_ids(p_patch -> 'members', v_plan.crew_id));
  end if;
  return jsonb_build_object('ok', true, 'revision', v_plan.revision, 'plan', to_jsonb(v_plan));
end;
$$;

-- A copy of a plan (participants and formations) under a new name.
create or replace function public.duplicate_formation_plan(p_plan uuid, p_name text)
returns public.formation_plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_src  public.formation_plans;
  v_plan public.formation_plans;
begin
  select * into v_src from public.formation_plans
  where id = p_plan and crew_id = private.default_group() and archived_at is null;
  if v_src.id is null then
    raise exception 'formation_plan_not_found' using errcode = 'P0001';
  end if;
  insert into public.formation_plans (video_id, name, stage_width, stage_depth, grid, bpm, first_beat)
  values (v_src.video_id, btrim(p_name), v_src.stage_width, v_src.stage_depth, v_src.grid, v_src.bpm, v_src.first_beat)
  returning * into v_plan;
  insert into public.formation_plan_members (plan_id, member_id)
  select v_plan.id, pm.member_id from public.formation_plan_members pm
  where pm.plan_id = v_src.id and pm.archived_at is null;
  insert into public.formations (plan_id, at, transition, positions, note, props)
  select v_plan.id, f.at, f.transition, f.positions, f.note, f.props from public.formations f
  where f.plan_id = v_src.id and f.archived_at is null;
  return v_plan;
end;
$$;

-- Creates or updates one formation if nobody changed the plan since `p_expected_revision`.
-- p_formation: { id?, at, transition?, positions, note? }. Returns { ok, revision, formation } or a conflict.
create or replace function public.save_formation(p_plan uuid, p_expected_revision int, p_formation jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.formation_plans;
  v_row  public.formations;
  v_id   uuid;
  v_at   numeric;
  v_tr   numeric;
  v_note text;
  v_key  text;
begin
  v_plan := private.lock_formation_plan(p_plan);
  if v_plan.revision <> p_expected_revision then
    return jsonb_build_object('ok', false, 'conflict', true, 'revision', v_plan.revision);
  end if;
  if p_formation is null or jsonb_typeof(p_formation) <> 'object' then
    raise exception 'formation_invalid' using errcode = 'P0001', detail = 'formation';
  end if;
  for v_key in select jsonb_object_keys(p_formation) loop
    if v_key not in ('id', 'at', 'transition', 'positions', 'note') then
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

  if v_id is not null then
    select * into v_row from public.formations where id = v_id;
    if v_row.id is not null and v_row.plan_id <> v_plan.id then
      raise exception 'formation_not_found' using errcode = 'P0001';
    end if;
  end if;
  if v_row.id is not null then
    -- An archived one of this plan comes back (undoing a delete in the editor keeps the formation's id).
    update public.formations set at = v_at, transition = v_tr, positions = p_formation -> 'positions', note = v_note,
      archived_at = null
    where id = v_row.id
    returning * into v_row;
  else
    if (select count(*) from public.formations where plan_id = v_plan.id and archived_at is null) >= 300 then
      raise exception 'formations_cap_reached' using errcode = 'P0001';
    end if;
    insert into public.formations (id, plan_id, at, transition, positions, note)
    values (coalesce(v_id, gen_random_uuid()), v_plan.id, v_at, v_tr, p_formation -> 'positions', v_note)
    returning * into v_row;
  end if;
  update public.formation_plans set revision = revision + 1 where id = v_plan.id returning revision into v_plan.revision;
  return jsonb_build_object('ok', true, 'revision', v_plan.revision, 'formation', to_jsonb(v_row));
exception
  when unique_violation then
    raise exception 'formation_time_taken' using errcode = 'P0001';
end;
$$;

-- Removes (archives) one formation if nobody changed the plan since `p_expected_revision`.
create or replace function public.delete_formation(p_plan uuid, p_expected_revision int, p_formation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.formation_plans;
begin
  v_plan := private.lock_formation_plan(p_plan);
  if v_plan.revision <> p_expected_revision then
    return jsonb_build_object('ok', false, 'conflict', true, 'revision', v_plan.revision);
  end if;
  update public.formations set archived_at = now()
  where id = p_formation_id and plan_id = v_plan.id and archived_at is null;
  if not found then
    raise exception 'formation_not_found' using errcode = 'P0001';
  end if;
  update public.formation_plans set revision = revision + 1 where id = v_plan.id returning revision into v_plan.revision;
  return jsonb_build_object('ok', true, 'revision', v_plan.revision);
end;
$$;

-- Names and colours of the people the editor can draw: live members plus archived ones that still take part in a
-- live plan (their point stays, greyed out with their name). members' own RLS hides archived rows, hence the definer.
create or replace function public.formation_members()
returns table (id uuid, name text, color text, archived boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.name, m.color, m.archived_at is not null
  from public.members m
  where m.crew_id = private.default_group()
    and (
      m.archived_at is null
      or exists (
        select 1 from public.formation_plan_members pm
        join public.formation_plans p on p.id = pm.plan_id
        where pm.member_id = m.id and pm.archived_at is null and p.archived_at is null
      )
    )
  order by m.created_at;
$$;

-- ─────────────────────────────────────────────────────────────
-- 6) archive_row knows the formation tables (same as 20261030110000 plus them)
-- ─────────────────────────────────────────────────────────────

create or replace function private.archive_row(p_table text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() < 1 then
    raise exception 'archive_row only runs from the delete trigger';
  end if;
  if p_table = 'videos' then
    update public.videos       set archived_at = now() where id = p_id and archived_at is null;
    update public.clips        set archived_at = now() where video_id = p_id and archived_at is null;
    update public.notes        set archived_at = now() where video_id = p_id and archived_at is null;
    update public.takes        set archived_at = now() where video_id = p_id and archived_at is null;
    update public.follow_paths set archived_at = now() where video_id = p_id and archived_at is null;
    update public.video_stems  set archived_at = now() where video_id = p_id and archived_at is null;
    update public.formations   set archived_at = now()
    where archived_at is null and plan_id in (select id from public.formation_plans where video_id = p_id);
    update public.formation_plan_members set archived_at = now()
    where archived_at is null and plan_id in (select id from public.formation_plans where video_id = p_id);
    update public.formation_plans set archived_at = now() where video_id = p_id and archived_at is null;
  elsif p_table = 'bags' then
    update public.bags      set archived_at = now() where id = p_id and archived_at is null;
    update public.bag_items set archived_at = now() where bag_id = p_id and archived_at is null;
  elsif p_table = 'tracks' then
    update public.tracks      set archived_at = now() where id = p_id and archived_at is null;
    update public.track_items set archived_at = now() where track_id = p_id and archived_at is null;
  elsif p_table = 'polls' then
    update public.polls        set archived_at = now() where id = p_id and archived_at is null;
    update public.poll_options set archived_at = now() where poll_id = p_id and archived_at is null;
  elsif p_table = 'events' then
    update public.events      set archived_at = now() where id = p_id and archived_at is null;
    update public.event_songs set archived_at = now() where event_id = p_id and archived_at is null;
  elsif p_table = 'rehearsal_rules' then
    update public.rehearsal_rules      set archived_at = now() where id = p_id and archived_at is null;
    update public.rehearsal_exceptions set archived_at = now() where rule_id = p_id and archived_at is null;
  elsif p_table = 'formation_plans' then
    update public.formation_plans        set archived_at = now() where id = p_id and archived_at is null;
    update public.formations             set archived_at = now() where plan_id = p_id and archived_at is null;
    update public.formation_plan_members set archived_at = now() where plan_id = p_id and archived_at is null;
  elsif p_table in ('clips', 'notes', 'members', 'takes', 'bag_items', 'track_items', 'wishes', 'wish_interest',
                    'poll_options', 'event_songs', 'take_reactions', 'follow_paths', 'video_stems',
                    'absences', 'rehearsal_exceptions', 'formations', 'formation_plan_members') then
    execute format('update public.%I set archived_at = now() where id = $1 and archived_at is null', p_table)
      using p_id;
  else
    raise exception 'archive_row: unexpected table %', p_table;
  end if;
end;
$$;

revoke execute on function private.json_num(jsonb) from public, anon, authenticated;
revoke execute on function private.lock_formation_plan(uuid) from public, anon, authenticated;
revoke execute on function private.check_formation_positions(jsonb, uuid, numeric, numeric) from public, anon, authenticated;
revoke execute on function private.formation_member_ids(jsonb, uuid) from public, anon, authenticated;
revoke execute on function private.set_formation_participants(uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.create_formation_plan(uuid, text, jsonb, numeric, numeric) from public;
revoke execute on function public.update_formation_plan(uuid, int, jsonb) from public;
revoke execute on function public.duplicate_formation_plan(uuid, text) from public;
revoke execute on function public.save_formation(uuid, int, jsonb) from public;
revoke execute on function public.delete_formation(uuid, int, uuid) from public;
revoke execute on function public.formation_members() from public;
grant execute on function public.create_formation_plan(uuid, text, jsonb, numeric, numeric) to anon, authenticated;
grant execute on function public.update_formation_plan(uuid, int, jsonb) to anon, authenticated;
grant execute on function public.duplicate_formation_plan(uuid, text) to anon, authenticated;
grant execute on function public.save_formation(uuid, int, jsonb) to anon, authenticated;
grant execute on function public.delete_formation(uuid, int, uuid) to anon, authenticated;
grant execute on function public.formation_members() to anon, authenticated;
grant execute on function private.archive_row(text, uuid) to anon, authenticated;
