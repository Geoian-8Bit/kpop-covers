-- One Shoot · Calendario de ausencias (REQ-03) y horarios de ensayo (REQ-04).
-- Additive: three new tables, two RPCs to edit and end a weekly rule from today, one read RPC for the names of the
-- people with absences (archived members included), and archive_row learning the new tables.
--
--  absences              who can't come (or arrives late / leaves early) on a day or a run of days. A range is one
--                        row so it makes one notice. Anyone marks anyone; created_by_member says who marked it.
--  rehearsal_rules       weekly rehearsals (ISO weekday, wall-clock times in Europe/Madrid). Never edited in place:
--                        edit_rehearsal_rule closes the old rule yesterday and opens a new one today, so past weeks
--                        keep the old timetable. end_rehearsal_rule closes it yesterday. Born valid from today.
--  rehearsal_exceptions  per-date changes: «cancel» one session of a rule, or an «extra» one-off rehearsal.
--  The sessions themselves are computed in the client (rehearsalRules.ts): only rules and exceptions are stored.
--  Deleting archives (repo rule). Dates and times are wall-clock in Europe/Madrid (no time zone stored).

-- ─────────────────────────────────────────────────────────────
-- 1) Tables
-- ─────────────────────────────────────────────────────────────

create table if not exists public.absences (
  id                uuid primary key default gen_random_uuid(),
  crew_id           uuid not null references public.crews (id) on delete cascade,
  member_id         uuid not null references public.members (id) on delete cascade,
  starts_on         date not null,
  ends_on           date not null,
  kind              text not null default 'all_day' check (kind in ('all_day', 'arrives', 'leaves')),
  at_time           time,
  note              text check (note is null or char_length(note) <= 140),
  created_by_member uuid references public.members (id) on delete set null,
  created_at        timestamptz not null default now(),
  archived_at       timestamptz,
  -- At most 61 days (the form says so too): a typo can't block a whole year.
  constraint absences_range_check check (ends_on >= starts_on and ends_on - starts_on <= 60),
  -- «arrives» / «leaves» need their time; a whole day has none.
  constraint absences_time_check check ((kind = 'all_day') = (at_time is null))
);
create index if not exists absences_crew_idx on public.absences (crew_id, starts_on);
create index if not exists absences_member_idx on public.absences (member_id);
create index if not exists absences_created_by_idx on public.absences (created_by_member);

create table if not exists public.rehearsal_rules (
  id          uuid primary key default gen_random_uuid(),
  crew_id     uuid not null references public.crews (id) on delete cascade,
  weekday     smallint not null check (weekday between 1 and 7),
  starts_at   time not null,
  ends_at     time not null,
  valid_from  date not null default ((now() at time zone 'Europe/Madrid')::date),
  -- Null: still running. A rule created and edited the same day ends up with valid_until < valid_from (no sessions).
  valid_until date,
  created_at  timestamptz not null default now(),
  archived_at timestamptz,
  constraint rehearsal_rules_times_check check (ends_at > starts_at)
);
create index if not exists rehearsal_rules_crew_idx on public.rehearsal_rules (crew_id, weekday);

create table if not exists public.rehearsal_exceptions (
  id          uuid primary key default gen_random_uuid(),
  crew_id     uuid not null references public.crews (id) on delete cascade,
  on_date     date not null,
  kind        text not null check (kind in ('cancel', 'extra')),
  rule_id     uuid references public.rehearsal_rules (id) on delete cascade,
  starts_at   time,
  ends_at     time,
  created_at  timestamptz not null default now(),
  archived_at timestamptz,
  -- A cancellation points at its rule and has no times; a one-off rehearsal has its times and no rule.
  constraint rehearsal_exceptions_shape_check check (
    (kind = 'cancel' and rule_id is not null and starts_at is null and ends_at is null)
    or (kind = 'extra' and rule_id is null and starts_at is not null and ends_at is not null and ends_at > starts_at)
  )
);
create index if not exists rehearsal_exceptions_crew_idx on public.rehearsal_exceptions (crew_id, on_date);
create index if not exists rehearsal_exceptions_rule_idx on public.rehearsal_exceptions (rule_id);
-- Cancelling a session twice doesn't duplicate it.
create unique index if not exists rehearsal_exceptions_cancel_once_key
  on public.rehearsal_exceptions (rule_id, on_date) where kind = 'cancel' and archived_at is null;

alter table public.absences enable row level security;
alter table public.rehearsal_rules enable row level security;
alter table public.rehearsal_exceptions enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 2) Insert rules
-- ─────────────────────────────────────────────────────────────

create or replace function private.madrid_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Europe/Madrid')::date;
$$;

create or replace function private.calendar_insert_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'absences' then
    -- Only live people of the group can be marked absent (an archived member can't).
    if not exists (
      select 1 from public.members m where m.id = new.member_id and m.crew_id = new.crew_id and m.archived_at is null
    ) then
      raise exception 'absence_member_invalid' using errcode = 'P0001';
    end if;
    if new.created_by_member is not null and not exists (
      select 1 from public.members m
      where m.id = new.created_by_member and m.crew_id = new.crew_id and m.archived_at is null
    ) then
      new.created_by_member := null;
    end if;
  elsif tg_table_name = 'rehearsal_exceptions' then
    -- No rule at all is the shape check's job (a clearer error).
    if new.kind = 'cancel' and new.rule_id is not null and not exists (
      select 1 from public.rehearsal_rules r
      where r.id = new.rule_id and r.crew_id = new.crew_id and r.archived_at is null
        and r.weekday = extract(isodow from new.on_date)
        and r.valid_from <= new.on_date and (r.valid_until is null or new.on_date <= r.valid_until)
    ) then
      raise exception 'rehearsal_cancel_invalid' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- The client can't rewrite history: a new rule runs from today (Madrid) and is open-ended. Invoker on purpose:
-- current_user must be the caller (inside a definer function it would be the owner).
create or replace function private.rule_from_today()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user::text in ('anon', 'authenticated') then
    new.valid_from := (now() at time zone 'Europe/Madrid')::date;
    new.valid_until := null;
  end if;
  return new;
end;
$$;

-- BEFORE triggers fire in name order: crew first, then stamp, then the links (they need the crew), then the cap.
drop trigger if exists absences_a_set_crew on public.absences;
create trigger absences_a_set_crew before insert on public.absences for each row execute function private.set_group_crew();
drop trigger if exists absences_b_client_stamp on public.absences;
create trigger absences_b_client_stamp before insert on public.absences for each row execute function private.stamp_new_row();
drop trigger if exists absences_c_links on public.absences;
create trigger absences_c_links before insert on public.absences for each row execute function private.calendar_insert_rules();
drop trigger if exists absences_d_row_cap on public.absences;
create trigger absences_d_row_cap before insert on public.absences for each row execute function private.guard_simple_cap('20000');
drop trigger if exists absences_archive_on_delete on public.absences;
create trigger absences_archive_on_delete before delete on public.absences
  for each row execute function private.archive_instead_of_delete();
drop trigger if exists absences_bulk_delete_guard on public.absences;
create trigger absences_bulk_delete_guard after delete on public.absences
  referencing old table as gone for each statement execute function private.guard_bulk_delete();

drop trigger if exists rehearsal_rules_a_set_crew on public.rehearsal_rules;
create trigger rehearsal_rules_a_set_crew before insert on public.rehearsal_rules for each row execute function private.set_group_crew();
drop trigger if exists rehearsal_rules_b_client_stamp on public.rehearsal_rules;
create trigger rehearsal_rules_b_client_stamp before insert on public.rehearsal_rules for each row execute function private.stamp_new_row();
drop trigger if exists rehearsal_rules_c_links on public.rehearsal_rules;
create trigger rehearsal_rules_c_links before insert on public.rehearsal_rules for each row execute function private.rule_from_today();
drop trigger if exists rehearsal_rules_d_row_cap on public.rehearsal_rules;
create trigger rehearsal_rules_d_row_cap before insert on public.rehearsal_rules for each row execute function private.guard_simple_cap('500');
drop trigger if exists rehearsal_rules_archive_on_delete on public.rehearsal_rules;
create trigger rehearsal_rules_archive_on_delete before delete on public.rehearsal_rules
  for each row execute function private.archive_instead_of_delete();
drop trigger if exists rehearsal_rules_bulk_delete_guard on public.rehearsal_rules;
create trigger rehearsal_rules_bulk_delete_guard after delete on public.rehearsal_rules
  referencing old table as gone for each statement execute function private.guard_bulk_delete();

drop trigger if exists rehearsal_exceptions_a_set_crew on public.rehearsal_exceptions;
create trigger rehearsal_exceptions_a_set_crew before insert on public.rehearsal_exceptions for each row execute function private.set_group_crew();
drop trigger if exists rehearsal_exceptions_b_client_stamp on public.rehearsal_exceptions;
create trigger rehearsal_exceptions_b_client_stamp before insert on public.rehearsal_exceptions for each row execute function private.stamp_new_row();
drop trigger if exists rehearsal_exceptions_c_links on public.rehearsal_exceptions;
create trigger rehearsal_exceptions_c_links before insert on public.rehearsal_exceptions for each row execute function private.calendar_insert_rules();
drop trigger if exists rehearsal_exceptions_d_row_cap on public.rehearsal_exceptions;
create trigger rehearsal_exceptions_d_row_cap before insert on public.rehearsal_exceptions for each row execute function private.guard_simple_cap('5000');
drop trigger if exists rehearsal_exceptions_archive_on_delete on public.rehearsal_exceptions;
create trigger rehearsal_exceptions_archive_on_delete before delete on public.rehearsal_exceptions
  for each row execute function private.archive_instead_of_delete();
drop trigger if exists rehearsal_exceptions_bulk_delete_guard on public.rehearsal_exceptions;
create trigger rehearsal_exceptions_bulk_delete_guard after delete on public.rehearsal_exceptions
  referencing old table as gone for each statement execute function private.guard_bulk_delete();

-- ─────────────────────────────────────────────────────────────
-- 3) RLS and grants
-- ─────────────────────────────────────────────────────────────

drop policy if exists absences_open_select on public.absences;
drop policy if exists absences_open_insert on public.absences;
drop policy if exists absences_open_update on public.absences;
drop policy if exists absences_open_delete on public.absences;
create policy absences_open_select on public.absences for select to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);
create policy absences_open_insert on public.absences for insert to anon, authenticated
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy absences_open_update on public.absences for update to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null)
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy absences_open_delete on public.absences for delete to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);

-- Rules: read, add and delete (archive). Editing and ending go through the RPCs below.
drop policy if exists rehearsal_rules_open_select on public.rehearsal_rules;
drop policy if exists rehearsal_rules_open_insert on public.rehearsal_rules;
drop policy if exists rehearsal_rules_open_delete on public.rehearsal_rules;
create policy rehearsal_rules_open_select on public.rehearsal_rules for select to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);
create policy rehearsal_rules_open_insert on public.rehearsal_rules for insert to anon, authenticated
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy rehearsal_rules_open_delete on public.rehearsal_rules for delete to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);

-- Exceptions: added and removed (undoing a cancellation archives it), never edited.
drop policy if exists rehearsal_exceptions_open_select on public.rehearsal_exceptions;
drop policy if exists rehearsal_exceptions_open_insert on public.rehearsal_exceptions;
drop policy if exists rehearsal_exceptions_open_delete on public.rehearsal_exceptions;
create policy rehearsal_exceptions_open_select on public.rehearsal_exceptions for select to anon, authenticated
  using (
    crew_id = (select private.default_group()) and archived_at is null
    and (rule_id is null or exists (
      select 1 from public.rehearsal_rules r where r.id = rehearsal_exceptions.rule_id and r.archived_at is null
    ))
  );
create policy rehearsal_exceptions_open_insert on public.rehearsal_exceptions for insert to anon, authenticated
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy rehearsal_exceptions_open_delete on public.rehearsal_exceptions for delete to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);

revoke update on public.absences, public.rehearsal_rules, public.rehearsal_exceptions from anon, authenticated;
grant select, insert, delete on public.absences, public.rehearsal_rules, public.rehearsal_exceptions to anon, authenticated;
-- The person and who marked it are fixed once saved; dates, kind, time and note can change.
grant update (starts_on, ends_on, kind, at_time, note, archived_at) on public.absences to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4) RPCs: edit or end a weekly rule from today (Europe/Madrid)
-- ─────────────────────────────────────────────────────────────

create or replace function public.edit_rehearsal_rule(p_rule uuid, p_weekday smallint, p_starts time, p_ends time)
returns public.rehearsal_rules
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.madrid_today();
  v_old   public.rehearsal_rules;
  v_new   public.rehearsal_rules;
begin
  select * into v_old from public.rehearsal_rules
  where id = p_rule and crew_id = private.default_group() and archived_at is null
    and (valid_until is null or valid_until >= v_today)
  for update;
  if v_old.id is null then
    raise exception 'rehearsal_rule_not_found' using errcode = 'P0001';
  end if;
  -- Past weeks keep the old timetable; the new one runs from today.
  update public.rehearsal_rules set valid_until = v_today - 1 where id = v_old.id;
  insert into public.rehearsal_rules (crew_id, weekday, starts_at, ends_at, valid_from)
  values (v_old.crew_id, p_weekday, p_starts, p_ends, v_today)
  returning * into v_new;
  -- Same weekday: the cancellations still to come follow the rule (that session is still called off).
  if p_weekday = v_old.weekday then
    update public.rehearsal_exceptions set rule_id = v_new.id
    where rule_id = v_old.id and kind = 'cancel' and on_date >= v_today and archived_at is null;
  end if;
  return v_new;
end;
$$;

create or replace function public.end_rehearsal_rule(p_rule uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.madrid_today();
  v_id    uuid;
begin
  select id into v_id from public.rehearsal_rules
  where id = p_rule and crew_id = private.default_group() and archived_at is null
    and (valid_until is null or valid_until >= v_today)
  for update;
  if v_id is null then
    raise exception 'rehearsal_rule_not_found' using errcode = 'P0001';
  end if;
  update public.rehearsal_rules set valid_until = v_today - 1 where id = v_id;
end;
$$;

-- Names and colours of the people the calendar shows: the live members plus archived ones that still have
-- absences (shown greyed out with their name). members' own RLS hides archived rows, hence the definer.
create or replace function public.calendar_members()
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
      or exists (select 1 from public.absences a where a.member_id = m.id and a.archived_at is null)
    )
  order by m.created_at;
$$;

-- ─────────────────────────────────────────────────────────────
-- 5) archive_row knows the calendar tables (same as 20261017130000 plus them)
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
  elsif p_table in ('clips', 'notes', 'members', 'takes', 'bag_items', 'track_items', 'wishes', 'wish_interest',
                    'poll_options', 'event_songs', 'take_reactions', 'follow_paths', 'video_stems',
                    'absences', 'rehearsal_exceptions') then
    execute format('update public.%I set archived_at = now() where id = $1 and archived_at is null', p_table)
      using p_id;
  else
    raise exception 'archive_row: unexpected table %', p_table;
  end if;
end;
$$;

revoke execute on function private.calendar_insert_rules() from public, anon, authenticated;
revoke execute on function private.rule_from_today() from public, anon, authenticated;
revoke execute on function private.madrid_today() from public, anon, authenticated;
revoke execute on function public.edit_rehearsal_rule(uuid, smallint, time, time) from public;
revoke execute on function public.end_rehearsal_rule(uuid) from public;
revoke execute on function public.calendar_members() from public;
grant execute on function public.edit_rehearsal_rule(uuid, smallint, time, time) to anon, authenticated;
grant execute on function public.end_rehearsal_rule(uuid) to anon, authenticated;
grant execute on function public.calendar_members() to anon, authenticated;
grant execute on function private.archive_row(text, uuid) to anon, authenticated;
