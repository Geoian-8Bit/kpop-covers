-- Checks for 20261030110000_calendar.sql (REQ-03 absences, REQ-04 weekly rehearsals and their exceptions).
-- Run the whole file in one go as postgres (SQL editor / MCP execute_sql, or `pnpm db:test`). Acts as `anon`,
-- prints `PASS …`, raises `FAIL …` on the first problem, ends with ROLLBACK.

begin;
-- Another group with its own member, absence and rule (as postgres: anon can only write the default group).
insert into public.crews (id, name) values ('0c0c0c0c-0000-4000-8000-0000000000f1', 'Prueba calendario otro grupo');
insert into public.members (id, crew_id, name) values ('0c0c0c0c-0000-4000-8000-0000000000f2', '0c0c0c0c-0000-4000-8000-0000000000f1', 'Prueba Ajena');
insert into public.absences (id, crew_id, member_id, starts_on, ends_on)
values ('0c0c0c0c-0000-4000-8000-0000000000f3', '0c0c0c0c-0000-4000-8000-0000000000f1', '0c0c0c0c-0000-4000-8000-0000000000f2', '2026-11-02', '2026-11-02');
insert into public.rehearsal_rules (id, crew_id, weekday, starts_at, ends_at)
values ('0c0c0c0c-0000-4000-8000-0000000000f4', '0c0c0c0c-0000-4000-8000-0000000000f1', 3, '18:00', '20:00');
-- The insert triggers always put rows in the default group: move them afterwards, as the admin could.
update public.absences set crew_id = '0c0c0c0c-0000-4000-8000-0000000000f1' where id = '0c0c0c0c-0000-4000-8000-0000000000f3';
update public.rehearsal_rules set crew_id = '0c0c0c0c-0000-4000-8000-0000000000f1' where id = '0c0c0c0c-0000-4000-8000-0000000000f4';
update public.members set crew_id = '0c0c0c0c-0000-4000-8000-0000000000f1' where id = '0c0c0c0c-0000-4000-8000-0000000000f2';
-- Postgres can still seed a rule that started long ago (the client can't).
insert into public.rehearsal_rules (id, crew_id, weekday, starts_at, ends_at, valid_from)
values ('0c0c0c0c-0000-4000-8000-0000000000d1', (select private.default_group()), 5, '18:00', '21:00', '2026-01-02');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into public.members (id, name) values ('0c0c0c0c-0000-4000-8000-0000000000a1', 'Prueba Ana'),
                                             ('0c0c0c0c-0000-4000-8000-0000000000a2', 'Prueba Bea'),
                                             ('0c0c0c0c-0000-4000-8000-0000000000a3', 'Prueba Cris');

-- ───────────── Absences ─────────────

-- A range is one row; «arrives» keeps its time; who marked it is kept.
insert into public.absences (id, member_id, starts_on, ends_on, created_by_member)
values ('0c0c0c0c-0000-4000-8000-000000000001', '0c0c0c0c-0000-4000-8000-0000000000a1', '2026-12-08', '2026-12-12',
        '0c0c0c0c-0000-4000-8000-0000000000a2');
insert into public.absences (id, member_id, starts_on, ends_on, kind, at_time, note)
values ('0c0c0c0c-0000-4000-8000-000000000002', '0c0c0c0c-0000-4000-8000-0000000000a2', '2026-12-09', '2026-12-09',
        'arrives', '19:00', 'Sale tarde del trabajo');
do $$
declare r public.absences;
begin
  select * into r from public.absences where id = '0c0c0c0c-0000-4000-8000-000000000001';
  if r.kind <> 'all_day' or r.at_time is not null or r.crew_id <> private.default_group()
     or r.created_by_member is distinct from '0c0c0c0c-0000-4000-8000-0000000000a2' then
    raise exception 'FAIL absence range not stored as written';
  end if;
  if (select at_time from public.absences where id = '0c0c0c0c-0000-4000-8000-000000000002') <> '19:00'::time then
    raise exception 'FAIL «arrives» time not stored';
  end if;
  raise notice 'PASS an absence range is one row; «llega a las» keeps its time; who marked it is kept';
end $$;

-- The checks: reversed range, more than 61 days, time vs kind, note length, unknown kind.
do $$
declare ok boolean;
begin
  ok := false;
  begin
    insert into public.absences (member_id, starts_on, ends_on) values ('0c0c0c0c-0000-4000-8000-0000000000a1', '2026-12-12', '2026-12-08');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL a range ending before it starts was accepted'; end if;
  ok := false;
  begin
    insert into public.absences (member_id, starts_on, ends_on) values ('0c0c0c0c-0000-4000-8000-0000000000a1', '2026-12-01', '2027-01-31');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL a range of 62 days was accepted'; end if;
  -- 61 days (60 apart) is the most allowed.
  insert into public.absences (id, member_id, starts_on, ends_on)
  values ('0c0c0c0c-0000-4000-8000-000000000003', '0c0c0c0c-0000-4000-8000-0000000000a3', '2026-12-01', '2027-01-30');
  ok := false;
  begin
    insert into public.absences (member_id, starts_on, ends_on, kind) values ('0c0c0c0c-0000-4000-8000-0000000000a1', '2026-12-01', '2026-12-01', 'leaves');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL «leaves» without a time was accepted'; end if;
  ok := false;
  begin
    insert into public.absences (member_id, starts_on, ends_on, at_time) values ('0c0c0c0c-0000-4000-8000-0000000000a1', '2026-12-01', '2026-12-01', '18:00');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL a whole day with a time was accepted'; end if;
  ok := false;
  begin
    insert into public.absences (member_id, starts_on, ends_on, note) values ('0c0c0c0c-0000-4000-8000-0000000000a1', '2026-12-01', '2026-12-01', repeat('a', 141));
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL a note of 141 letters was accepted'; end if;
  ok := false;
  begin
    insert into public.absences (member_id, starts_on, ends_on, kind, at_time) values ('0c0c0c0c-0000-4000-8000-0000000000a1', '2026-12-01', '2026-12-01', 'maybe', '18:00');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL an unknown kind was accepted'; end if;
  raise notice 'PASS absence checks: order, at most 61 days, time with «llega/se va» only, note ≤ 140, known kinds';
end $$;

-- Overlapping absences of the same person are allowed.
insert into public.absences (member_id, starts_on, ends_on, kind, at_time)
values ('0c0c0c0c-0000-4000-8000-0000000000a1', '2026-12-10', '2026-12-10', 'leaves', '20:00');
do $$
begin
  if (select count(*) from public.absences where member_id = '0c0c0c0c-0000-4000-8000-0000000000a1'
      and starts_on <= '2026-12-10' and ends_on >= '2026-12-10') <> 2 then
    raise exception 'FAIL overlapping absences of one person not both kept';
  end if;
  raise notice 'PASS overlapping absences of one person are both kept';
end $$;

-- Dates, kind, time and note change; the person, who marked it and the group don't.
update public.absences set ends_on = '2026-12-11', kind = 'leaves', at_time = '20:30', note = 'Cambio'
where id = '0c0c0c0c-0000-4000-8000-000000000001';
do $$
declare ok boolean;
begin
  if (select ends_on from public.absences where id = '0c0c0c0c-0000-4000-8000-000000000001') <> '2026-12-11' then
    raise exception 'FAIL absence dates not editable';
  end if;
  ok := false;
  begin
    update public.absences set member_id = '0c0c0c0c-0000-4000-8000-0000000000a3' where id = '0c0c0c0c-0000-4000-8000-000000000001';
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL the absent person could be changed'; end if;
  ok := false;
  begin
    update public.absences set created_by_member = null where id = '0c0c0c0c-0000-4000-8000-000000000001';
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL who marked it could be changed'; end if;
  ok := false;
  begin
    update public.absences set crew_id = '0c0c0c0c-0000-4000-8000-0000000000f1' where id = '0c0c0c0c-0000-4000-8000-000000000001';
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL an absence could move to another group'; end if;
  ok := false;
  begin
    update public.absences set ends_on = '2026-12-01' where id = '0c0c0c0c-0000-4000-8000-000000000001';
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL an edit could reverse the range'; end if;
  raise notice 'PASS dates, kind, time and note are editable; person, author and group are not';
end $$;

-- Group isolation: the other group's absence is invisible; a client-sent crew_id is ignored; foreign members refused.
insert into public.absences (id, crew_id, member_id, starts_on, ends_on)
values ('0c0c0c0c-0000-4000-8000-000000000004', '0c0c0c0c-0000-4000-8000-0000000000f1', '0c0c0c0c-0000-4000-8000-0000000000a3', '2026-12-20', '2026-12-20');
do $$
declare ok boolean := false;
begin
  if exists (select 1 from public.absences where id = '0c0c0c0c-0000-4000-8000-0000000000f3') then
    raise exception 'FAIL another group''s absence is visible';
  end if;
  if (select crew_id from public.absences where id = '0c0c0c0c-0000-4000-8000-000000000004') <> private.default_group() then
    raise exception 'FAIL a client-sent crew_id was kept';
  end if;
  begin
    insert into public.absences (member_id, starts_on, ends_on) values ('0c0c0c0c-0000-4000-8000-0000000000f2', '2026-12-20', '2026-12-20');
  exception when others then ok := sqlerrm = 'absence_member_invalid';
  end;
  if not ok then raise exception 'FAIL another group''s member could be marked absent'; end if;
  raise notice 'PASS absences stay in the default group';
end $$;

-- Deleting archives: the absence disappears; an archived member can't be marked, but their absences keep the name.
delete from public.absences where id = '0c0c0c0c-0000-4000-8000-000000000004';
delete from public.members where id = '0c0c0c0c-0000-4000-8000-0000000000a3';
do $$
declare ok boolean := false;
begin
  if exists (select 1 from public.absences where id = '0c0c0c0c-0000-4000-8000-000000000004') then
    raise exception 'FAIL a deleted absence is still visible';
  end if;
  begin
    insert into public.absences (member_id, starts_on, ends_on) values ('0c0c0c0c-0000-4000-8000-0000000000a3', '2026-12-21', '2026-12-21');
  exception when others then ok := sqlerrm = 'absence_member_invalid';
  end;
  if not ok then raise exception 'FAIL an archived member could be marked absent'; end if;
  if not exists (select 1 from public.absences where id = '0c0c0c0c-0000-4000-8000-000000000003') then
    raise exception 'FAIL an archived member''s absences disappeared';
  end if;
  if not exists (select 1 from public.calendar_members() where id = '0c0c0c0c-0000-4000-8000-0000000000a3' and archived
                 and name = 'Prueba Cris') then
    raise exception 'FAIL calendar_members lacks the archived member with absences';
  end if;
  if exists (select 1 from public.calendar_members() where id = '0c0c0c0c-0000-4000-8000-0000000000f2') then
    raise exception 'FAIL calendar_members shows another group''s member';
  end if;
  raise notice 'PASS deleting archives; archived members keep their name on old absences and cannot be marked';
end $$;

-- ───────────── Weekly rules ─────────────

-- A new rule runs from today, whatever the client sends; times must be in order; weekday 1–7.
insert into public.rehearsal_rules (id, weekday, starts_at, ends_at, valid_from, valid_until)
values ('0c0c0c0c-0000-4000-8000-0000000000b1', 3, '18:00', '20:00', '2020-01-01', '2020-02-01');
do $$
declare ok boolean;
begin
  if (select valid_from from public.rehearsal_rules where id = '0c0c0c0c-0000-4000-8000-0000000000b1')
       <> (now() at time zone 'Europe/Madrid')::date
     or (select valid_until from public.rehearsal_rules where id = '0c0c0c0c-0000-4000-8000-0000000000b1') is not null then
    raise exception 'FAIL a new rule does not run from today';
  end if;
  ok := false;
  begin
    insert into public.rehearsal_rules (weekday, starts_at, ends_at) values (3, '20:00', '18:00');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL a rule ending before it starts was accepted'; end if;
  ok := false;
  begin
    insert into public.rehearsal_rules (weekday, starts_at, ends_at) values (8, '18:00', '20:00');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL weekday 8 was accepted'; end if;
  ok := false;
  begin
    update public.rehearsal_rules set starts_at = '17:00' where id = '0c0c0c0c-0000-4000-8000-0000000000b1';
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL a rule could be edited in place'; end if;
  if exists (select 1 from public.rehearsal_rules where id = '0c0c0c0c-0000-4000-8000-0000000000f4') then
    raise exception 'FAIL another group''s rule is visible';
  end if;
  raise notice 'PASS rules run from today, times in order, weekday 1–7, no direct edits, own group only';
end $$;

-- Editing the long-running Friday rule closes it yesterday and opens a new one today.
do $$
declare
  v_new   public.rehearsal_rules;
  v_today date := (now() at time zone 'Europe/Madrid')::date;
begin
  v_new := public.edit_rehearsal_rule('0c0c0c0c-0000-4000-8000-0000000000d1', 5::smallint, '18:00', '22:00');
  if (select valid_until from public.rehearsal_rules where id = '0c0c0c0c-0000-4000-8000-0000000000d1') <> v_today - 1 then
    raise exception 'FAIL the old rule was not closed yesterday';
  end if;
  if (select starts_at from public.rehearsal_rules where id = '0c0c0c0c-0000-4000-8000-0000000000d1') <> '18:00'::time
     or (select ends_at from public.rehearsal_rules where id = '0c0c0c0c-0000-4000-8000-0000000000d1') <> '21:00'::time then
    raise exception 'FAIL the old rule lost its timetable';
  end if;
  if v_new.valid_from <> v_today or v_new.valid_until is not null or v_new.ends_at <> '22:00'::time or v_new.weekday <> 5
     or v_new.crew_id <> private.default_group() then
    raise exception 'FAIL the new rule is not today''s timetable';
  end if;
  raise notice 'PASS edit_rehearsal_rule keeps past weeks and runs the new timetable from today';
end $$;

-- A rule created and edited the same day ends up with valid_until < valid_from; an ended rule can't be edited again.
do $$
declare
  v_new   public.rehearsal_rules;
  v_today date := (now() at time zone 'Europe/Madrid')::date;
  ok      boolean := false;
begin
  v_new := public.edit_rehearsal_rule('0c0c0c0c-0000-4000-8000-0000000000b1', 3::smallint, '18:00', '21:00');
  if (select valid_until from public.rehearsal_rules where id = '0c0c0c0c-0000-4000-8000-0000000000b1') <> v_today - 1
     or (select valid_from from public.rehearsal_rules where id = '0c0c0c0c-0000-4000-8000-0000000000b1') <> v_today then
    raise exception 'FAIL same-day edit did not leave valid_until < valid_from';
  end if;
  begin
    perform public.edit_rehearsal_rule('0c0c0c0c-0000-4000-8000-0000000000b1', 3::smallint, '18:00', '19:00');
  exception when others then ok := sqlerrm = 'rehearsal_rule_not_found';
  end;
  if not ok then raise exception 'FAIL an ended rule could be edited again'; end if;
  ok := false;
  begin
    perform public.edit_rehearsal_rule(v_new.id, 3::smallint, '21:00', '18:00');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL edit accepted times out of order'; end if;
  ok := false;
  begin
    perform public.edit_rehearsal_rule('0c0c0c0c-0000-4000-8000-0000000000f4', 3::smallint, '18:00', '19:00');
  exception when others then ok := sqlerrm = 'rehearsal_rule_not_found';
  end;
  if not ok then raise exception 'FAIL another group''s rule could be edited'; end if;
  raise notice 'PASS same-day edits leave the old rule empty; ended and foreign rules cannot be edited';
end $$;

-- Ending a rule closes it yesterday; twice is refused.
do $$
declare
  v_rule  uuid;
  v_today date := (now() at time zone 'Europe/Madrid')::date;
  ok      boolean := false;
begin
  insert into public.rehearsal_rules (weekday, starts_at, ends_at) values (1, '10:00', '12:00') returning id into v_rule;
  perform public.end_rehearsal_rule(v_rule);
  if (select valid_until from public.rehearsal_rules where id = v_rule) <> v_today - 1 then
    raise exception 'FAIL end_rehearsal_rule did not close the rule yesterday';
  end if;
  begin
    perform public.end_rehearsal_rule(v_rule);
  exception when others then ok := sqlerrm = 'rehearsal_rule_not_found';
  end;
  if not ok then raise exception 'FAIL an ended rule could be ended again'; end if;
  ok := false;
  begin
    perform public.end_rehearsal_rule('0c0c0c0c-0000-4000-8000-0000000000f4');
  exception when others then ok := sqlerrm = 'rehearsal_rule_not_found';
  end;
  if not ok then raise exception 'FAIL another group''s rule could be ended'; end if;
  raise notice 'PASS end_rehearsal_rule closes the rule yesterday, once, own group only';
end $$;

-- ───────────── Exceptions ─────────────

-- A cancellation on a day of a live rule, once; on the wrong weekday or before the rule, refused.
do $$
declare
  v_rule   uuid;
  v_today  date := (now() at time zone 'Europe/Madrid')::date;
  v_day    date;
  ok       boolean;
begin
  select id into v_rule from public.rehearsal_rules where weekday = 5 and valid_until is null and ends_at = '22:00';
  -- The next Friday from today (today included).
  v_day := v_today + ((5 - extract(isodow from v_today)::int + 7) % 7);
  insert into public.rehearsal_exceptions (on_date, kind, rule_id) values (v_day, 'cancel', v_rule);
  ok := false;
  begin
    insert into public.rehearsal_exceptions (on_date, kind, rule_id) values (v_day, 'cancel', v_rule);
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL a session could be cancelled twice'; end if;
  ok := false;
  begin
    insert into public.rehearsal_exceptions (on_date, kind, rule_id) values (v_day + 1, 'cancel', v_rule);
  exception when others then ok := sqlerrm = 'rehearsal_cancel_invalid';
  end;
  if not ok then raise exception 'FAIL a cancellation on the wrong weekday was accepted'; end if;
  ok := false;
  begin
    insert into public.rehearsal_exceptions (on_date, kind, rule_id) values (v_day - 7 * 60, 'cancel', v_rule);
  exception when others then ok := sqlerrm = 'rehearsal_cancel_invalid';
  end;
  if not ok then raise exception 'FAIL a cancellation before the rule started was accepted'; end if;
  ok := false;
  begin
    insert into public.rehearsal_exceptions (on_date, kind) values (v_day, 'cancel');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL a cancellation without a rule was accepted'; end if;
  raise notice 'PASS cancellations: on a day of a live rule, once only';
end $$;

-- Editing the rule (same weekday) carries the cancellations still to come over to the new rule.
do $$
declare
  v_old  uuid;
  v_new  public.rehearsal_rules;
begin
  select id into v_old from public.rehearsal_rules where weekday = 5 and valid_until is null and ends_at = '22:00';
  v_new := public.edit_rehearsal_rule(v_old, 5::smallint, '17:00', '21:00');
  if exists (select 1 from public.rehearsal_exceptions where rule_id = v_old and kind = 'cancel') then
    raise exception 'FAIL a cancellation to come stayed on the closed rule';
  end if;
  if not exists (select 1 from public.rehearsal_exceptions where rule_id = v_new.id and kind = 'cancel') then
    raise exception 'FAIL the cancellation did not follow the edited rule';
  end if;
  raise notice 'PASS cancellations to come follow an edit on the same weekday';
end $$;

-- A one-off rehearsal needs both times in order and no rule; undoing removes it (archives).
do $$
declare
  v_id uuid;
  ok   boolean;
begin
  insert into public.rehearsal_exceptions (on_date, kind, starts_at, ends_at) values ('2026-12-12', 'extra', '11:00', '13:00')
  returning id into v_id;
  ok := false;
  begin
    insert into public.rehearsal_exceptions (on_date, kind, starts_at) values ('2026-12-12', 'extra', '11:00');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL a one-off rehearsal without an end was accepted'; end if;
  ok := false;
  begin
    insert into public.rehearsal_exceptions (on_date, kind, starts_at, ends_at) values ('2026-12-12', 'extra', '13:00', '11:00');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL a one-off rehearsal ending before it starts was accepted'; end if;
  ok := false;
  begin
    insert into public.rehearsal_exceptions (on_date, kind) values ('2026-12-12', 'holiday');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL an unknown exception kind was accepted'; end if;
  delete from public.rehearsal_exceptions where id = v_id;
  if exists (select 1 from public.rehearsal_exceptions where id = v_id) then
    raise exception 'FAIL a removed exception is still visible';
  end if;
  raise notice 'PASS one-off rehearsals: both times in order; removing archives';
end $$;

-- Bulk deletes are blocked like everywhere else.
do $$
declare ok boolean := false;
begin
  insert into public.absences (member_id, starts_on, ends_on)
  select '0c0c0c0c-0000-4000-8000-0000000000a2', d, d from generate_series('2027-02-01'::date, '2027-02-04'::date, '1 day') d;
  begin
    delete from public.absences where member_id = '0c0c0c0c-0000-4000-8000-0000000000a2' and starts_on >= '2027-02-01';
  exception when others then ok := sqlerrm = 'bulk_delete_blocked';
  end;
  if not ok then raise exception 'FAIL bulk archive of absences not blocked'; end if;
  raise notice 'PASS bulk archive of absences blocked';
end $$;

rollback;
