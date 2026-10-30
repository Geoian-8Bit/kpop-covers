-- Checks for 20261030120000_calendar_push.sql (REQ-05: the feed of calendar changes and the push subscriptions).
-- Run the whole file in one go as postgres (SQL editor / MCP execute_sql, or `pnpm db:test`). Acts as `anon`,
-- prints `PASS …`, raises `FAIL …` on the first problem, ends with ROLLBACK.
-- Fixed dates far ahead (2031) so the texts are exact: 2031-11-07 is a Friday, 2031-11-08 a Saturday.

begin;

-- ───────────── The Spanish texts (pure functions, as postgres) ─────────────
do $$
begin
  if private.cal_day('2031-11-08') <> 'sáb 8 nov' then raise exception 'FAIL cal_day: %', private.cal_day('2031-11-08'); end if;
  if private.cal_span('2031-11-08', '2031-11-08') <> 'el sáb 8 nov' then raise exception 'FAIL cal_span one day'; end if;
  if private.cal_span('2031-11-08', '2031-11-12') <> 'del 8 al 12 nov' then raise exception 'FAIL cal_span same month'; end if;
  if private.cal_span('2031-10-30', '2031-11-02') <> 'del 30 oct al 2 nov' then raise exception 'FAIL cal_span across months'; end if;
  if private.calendar_absence_text('Ana', 'all_day', null, '2031-11-08', '2031-11-08') <> 'Ana no puede el sáb 8 nov' then
    raise exception 'FAIL absence text all day';
  end if;
  if private.calendar_absence_text('Ana', 'arrives', '19:00', '2031-11-08', '2031-11-08') <> 'Ana llega a las 19:00 el sáb 8 nov' then
    raise exception 'FAIL absence text arrives';
  end if;
  if private.calendar_absence_text('Ana', 'leaves', '20:00', '2031-11-08', '2031-11-08') <> 'Ana se va a las 20:00 el sáb 8 nov' then
    raise exception 'FAIL absence text leaves';
  end if;
  if private.calendar_absence_text('Ana', 'all_day', null, '2031-11-08', '2031-11-12') <> 'Ana no puede del 8 al 12 nov' then
    raise exception 'FAIL absence text range';
  end if;
  if private.cal_next_weekday('2031-11-07', 3) <> '2031-11-12' or private.cal_next_weekday('2031-11-12', 3) <> '2031-11-12' then
    raise exception 'FAIL cal_next_weekday';
  end if;
  if private.calendar_rule_text(3, '18:00', '21:00', '2031-11-12', false) <> 'Desde el miércoles 12, ensayo los miércoles de 18:00 a 21:00' then
    raise exception 'FAIL rule text: %', private.calendar_rule_text(3, '18:00', '21:00', '2031-11-12', false);
  end if;
  if private.calendar_rule_text(3, '18:00', '21:00', '2031-11-12', true) <> 'Desde el miércoles 12, ya no hay ensayo los miércoles' then
    raise exception 'FAIL rule ended text';
  end if;
  if private.calendar_rule_text(6, '10:00', '12:00', '2031-11-08', false) <> 'Desde el sábado 8, ensayo los sábados de 10:00 a 12:00' then
    raise exception 'FAIL rule text plural';
  end if;
  raise notice 'PASS the feed texts: days, ranges, «llega» / «se va», weekly rules';
end $$;

-- Another group with a change of its own (anon must not see it).
insert into public.crews (id, name) values ('0d0d0d0d-0000-4000-8000-0000000000f1', 'Prueba avisos otro grupo');
insert into public.calendar_changes (crew_id, target_date, body)
values ('0d0d0d0d-0000-4000-8000-0000000000f1', '2031-11-08', 'Prueba ajena');

-- Today in Madrid and next Wednesday, for anon (the private helpers are not theirs to call).
create temp table push_check_days on commit drop as
  select private.madrid_today() as today, private.cal_next_weekday(private.madrid_today(), 3) as wed;
grant select on push_check_days to anon;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into public.members (id, name) values ('0d0d0d0d-0000-4000-8000-0000000000a1', 'Prueba Ana'),
                                             ('0d0d0d0d-0000-4000-8000-0000000000a2', 'Prueba Bea');

-- ───────────── Absences ─────────────
do $$
declare
  c public.calendar_changes;
  v_n int;
begin
  insert into public.absences (id, member_id, starts_on, ends_on, created_by_member)
  values ('0d0d0d0d-0000-4000-8000-000000000001', '0d0d0d0d-0000-4000-8000-0000000000a1', '2031-11-08', '2031-11-08',
          '0d0d0d0d-0000-4000-8000-0000000000a2');
  select * into c from public.calendar_changes where body = 'Prueba Ana no puede el sáb 8 nov';
  if c.id is null or c.author_member is distinct from '0d0d0d0d-0000-4000-8000-0000000000a2'
     or c.subject_member is distinct from '0d0d0d0d-0000-4000-8000-0000000000a1' or c.target_date <> '2031-11-08'
     or c.crew_id <> private.default_group() then
    raise exception 'FAIL marking an absence: % / % / %', c.body, c.author_member, c.target_date;
  end if;

  insert into public.absences (member_id, starts_on, ends_on) values ('0d0d0d0d-0000-4000-8000-0000000000a1', '2031-11-08', '2031-11-12');
  if not exists (select 1 from public.calendar_changes where body = 'Prueba Ana no puede del 8 al 12 nov' and author_member is null) then
    raise exception 'FAIL a range makes one notice «del 8 al 12 nov», anonymous';
  end if;
  insert into public.absences (member_id, starts_on, ends_on) values ('0d0d0d0d-0000-4000-8000-0000000000a1', '2031-10-30', '2031-11-02');
  if not exists (select 1 from public.calendar_changes where body = 'Prueba Ana no puede del 30 oct al 2 nov') then
    raise exception 'FAIL a range across months';
  end if;
  insert into public.absences (member_id, starts_on, ends_on, kind, at_time)
  values ('0d0d0d0d-0000-4000-8000-0000000000a2', '2031-11-08', '2031-11-08', 'arrives', '19:00');
  if not exists (select 1 from public.calendar_changes where body = 'Prueba Bea llega a las 19:00 el sáb 8 nov') then
    raise exception 'FAIL «llega a las» notice';
  end if;
  raise notice 'PASS marking absences writes the feed with the exact text, who did it and who it is about';

  -- Edit: dates / kind / time notify with «Cambio: »; the note alone doesn't.
  update public.absences set kind = 'leaves', at_time = '20:00', changed_by_member = '0d0d0d0d-0000-4000-8000-0000000000a1'
  where id = '0d0d0d0d-0000-4000-8000-000000000001';
  select * into c from public.calendar_changes where body like 'Cambio: %';
  if c.body is distinct from 'Cambio: Prueba Ana se va a las 20:00 el sáb 8 nov'
     or c.author_member is distinct from '0d0d0d0d-0000-4000-8000-0000000000a1' then
    raise exception 'FAIL editing an absence: % / %', c.body, c.author_member;
  end if;
  select count(*) into v_n from public.calendar_changes;
  update public.absences set note = 'Solo la nota' where id = '0d0d0d0d-0000-4000-8000-000000000001';
  if (select count(*) from public.calendar_changes) <> v_n then
    raise exception 'FAIL changing only the note notified';
  end if;
  raise notice 'PASS editing an absence notifies «Cambio: …» (not for the note alone)';

  -- Remove with who did it (archive_calendar_row), and with a plain delete (anonymous).
  perform public.archive_calendar_row('absences', '0d0d0d0d-0000-4000-8000-000000000001', '0d0d0d0d-0000-4000-8000-0000000000a2');
  if exists (select 1 from public.absences where id = '0d0d0d0d-0000-4000-8000-000000000001') then
    raise exception 'FAIL archive_calendar_row left the absence visible';
  end if;
  select * into c from public.calendar_changes where body = 'Prueba Ana ya puede el sáb 8 nov';
  if c.id is null or c.author_member is distinct from '0d0d0d0d-0000-4000-8000-0000000000a2' then
    raise exception 'FAIL removing an absence: «ya puede» with its author';
  end if;
  delete from public.absences where member_id = '0d0d0d0d-0000-4000-8000-0000000000a1' and starts_on = '2031-11-08' and ends_on = '2031-11-12';
  if not exists (select 1 from public.calendar_changes where body = 'Prueba Ana ya puede del 8 al 12 nov' and author_member is null) then
    raise exception 'FAIL a plain delete still notifies «ya puede», anonymous';
  end if;
  raise notice 'PASS removing an absence notifies «ya puede» (with or without who did it)';

  -- Past dates say nothing (marking, editing or removing).
  select count(*) into v_n from public.calendar_changes;
  insert into public.absences (id, member_id, starts_on, ends_on) values ('0d0d0d0d-0000-4000-8000-000000000002', '0d0d0d0d-0000-4000-8000-0000000000a1', '2020-01-01', '2020-01-03');
  update public.absences set ends_on = '2020-01-04' where id = '0d0d0d0d-0000-4000-8000-000000000002';
  delete from public.absences where id = '0d0d0d0d-0000-4000-8000-000000000002';
  if (select count(*) from public.calendar_changes) <> v_n then
    raise exception 'FAIL a past absence wrote the feed';
  end if;
  raise notice 'PASS past absences write nothing';

  -- An unknown author is dropped, not trusted.
  insert into public.absences (id, member_id, starts_on, ends_on, created_by_member, changed_by_member)
  values ('0d0d0d0d-0000-4000-8000-000000000003', '0d0d0d0d-0000-4000-8000-0000000000a2', '2031-11-20', '2031-11-20', null,
          '0d0d0d0d-0000-4000-8000-0000000000ff');
  if (select changed_by_member from public.absences where id = '0d0d0d0d-0000-4000-8000-000000000003') is not null then
    raise exception 'FAIL an unknown changed_by_member was kept';
  end if;
  raise notice 'PASS an unknown author becomes null';
end $$;

-- ───────────── Weekly rules ─────────────
do $$
declare
  v_wed   date := (select wed from push_check_days);
  v_rule  uuid;
  v_new   public.rehearsal_rules;
  v_n     int;
  c       public.calendar_changes;
begin
  insert into public.rehearsal_rules (weekday, starts_at, ends_at, changed_by_member)
  values (3, '18:00', '20:00', '0d0d0d0d-0000-4000-8000-0000000000a1') returning id into v_rule;
  select * into c from public.calendar_changes where body like 'Desde el miércoles %de 18:00 a 20:00';
  if c.body is distinct from 'Desde el miércoles ' || extract(day from v_wed)::int || ', ensayo los miércoles de 18:00 a 20:00'
     or c.target_date <> v_wed or c.author_member is distinct from '0d0d0d0d-0000-4000-8000-0000000000a1' then
    raise exception 'FAIL creating a rule: % (%)', c.body, c.target_date;
  end if;

  select count(*) into v_n from public.calendar_changes;
  v_new := public.edit_rehearsal_rule(v_rule, 3::smallint, '18:00', '21:00', '0d0d0d0d-0000-4000-8000-0000000000a2');
  if (select count(*) from public.calendar_changes) <> v_n + 1 then
    raise exception 'FAIL editing a rule must write exactly one notice';
  end if;
  if not exists (
    select 1 from public.calendar_changes
    where body = 'Desde el miércoles ' || extract(day from v_wed)::int || ', ensayo los miércoles de 18:00 a 21:00'
      and author_member = '0d0d0d0d-0000-4000-8000-0000000000a2'
  ) then
    raise exception 'FAIL editing a rule: text or author';
  end if;
  -- Older callers (4 arguments) still work.
  v_new := public.edit_rehearsal_rule(v_new.id, 3::smallint, '18:30', '21:00');

  perform public.end_rehearsal_rule(v_new.id, '0d0d0d0d-0000-4000-8000-0000000000a1');
  if not exists (
    select 1 from public.calendar_changes
    where body = 'Desde el miércoles ' || extract(day from v_wed)::int || ', ya no hay ensayo los miércoles'
      and author_member = '0d0d0d0d-0000-4000-8000-0000000000a1' and target_date = v_wed
  ) then
    raise exception 'FAIL ending a rule: «ya no hay ensayo»';
  end if;
  raise notice 'PASS rules: creating, editing (one notice) and ending write the exact text';
end $$;

-- ───────────── Exceptions ─────────────
do $$
declare
  v_rule uuid;
  v_id   uuid;
  v_n    int;
begin
  insert into public.rehearsal_rules (weekday, starts_at, ends_at) values (5, '18:00', '21:00') returning id into v_rule;
  insert into public.rehearsal_exceptions (on_date, kind, rule_id, changed_by_member)
  values ('2031-11-07', 'cancel', v_rule, '0d0d0d0d-0000-4000-8000-0000000000a1') returning id into v_id;
  if not exists (select 1 from public.calendar_changes where body = 'Cancelado el ensayo del vie 7 nov'
                 and target_date = '2031-11-07' and author_member = '0d0d0d0d-0000-4000-8000-0000000000a1') then
    raise exception 'FAIL cancelling a rehearsal';
  end if;
  perform public.archive_calendar_row('rehearsal_exceptions', v_id, '0d0d0d0d-0000-4000-8000-0000000000a2');
  if not exists (select 1 from public.calendar_changes where body = 'Vuelve el ensayo del vie 7 nov'
                 and author_member = '0d0d0d0d-0000-4000-8000-0000000000a2') then
    raise exception 'FAIL undoing a cancellation';
  end if;
  insert into public.rehearsal_exceptions (on_date, kind, starts_at, ends_at) values ('2031-11-08', 'extra', '18:00', '20:00')
  returning id into v_id;
  if not exists (select 1 from public.calendar_changes where body = 'Ensayo extra el sáb 8 nov de 18:00 a 20:00') then
    raise exception 'FAIL a one-off rehearsal';
  end if;
  delete from public.rehearsal_exceptions where id = v_id;
  if not exists (select 1 from public.calendar_changes where body = 'Ya no hay ensayo extra el sáb 8 nov') then
    raise exception 'FAIL removing a one-off rehearsal';
  end if;
  -- Removing a whole rule says «ya no hay ensayo» once: its cancellations going with it say nothing.
  insert into public.rehearsal_exceptions (on_date, kind, rule_id) values ('2031-11-14', 'cancel', v_rule);
  select count(*) into v_n from public.calendar_changes;
  -- The whole file is one statement for the burst guard (PGlite runs it as one query): start its count afresh.
  perform set_config('app.archive_burst', '', true);
  delete from public.rehearsal_rules where id = v_rule;
  if (select count(*) from public.calendar_changes) <> v_n + 1
     or exists (select 1 from public.calendar_changes where body = 'Vuelve el ensayo del vie 14 nov') then
    raise exception 'FAIL removing a rule with cancellations';
  end if;
  -- A past one-off rehearsal says nothing.
  select count(*) into v_n from public.calendar_changes;
  insert into public.rehearsal_exceptions (on_date, kind, starts_at, ends_at) values ('2020-01-04', 'extra', '18:00', '20:00');
  if (select count(*) from public.calendar_changes) <> v_n then
    raise exception 'FAIL a past exception wrote the feed';
  end if;
  raise notice 'PASS exceptions: cancel, undo, one-off and its removal write the exact text; past dates nothing';
end $$;

-- ───────────── What anon can't do ─────────────
do $$
declare ok boolean;
begin
  if exists (select 1 from public.calendar_changes where body = 'Prueba ajena') then
    raise exception 'FAIL anon sees another group''s feed';
  end if;
  ok := false;
  begin
    insert into public.calendar_changes (target_date, body) values ('2031-11-08', 'Prueba falsa');
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL anon wrote the feed directly'; end if;
  ok := false;
  begin
    update public.calendar_changes set body = 'Prueba cambiada';
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL anon edited the feed'; end if;
  ok := false;
  begin
    delete from public.calendar_changes;
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL anon deleted from the feed'; end if;
  ok := false;
  begin
    perform 1 from public.push_subscriptions;
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL anon can read push_subscriptions'; end if;
  ok := false;
  begin
    insert into public.push_subscriptions (crew_id, endpoint, p256dh, auth)
    values (private.default_group(), 'https://example.test/x', repeat('a', 40), repeat('b', 16));
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL anon wrote push_subscriptions directly'; end if;
  ok := false;
  begin
    perform public.archive_calendar_row('members', '0d0d0d0d-0000-4000-8000-0000000000a1');
  exception when others then ok := sqlerrm like 'archive_calendar_row: unexpected table%';
  end;
  if not ok then raise exception 'FAIL archive_calendar_row accepted another table'; end if;
  raise notice 'PASS anon reads only its group''s feed, can''t write it and can''t touch push_subscriptions';
end $$;

-- ───────────── Subscription RPCs ─────────────
select public.save_push_subscription('https://fcm.googleapis.com/fcm/send/prueba-1', repeat('p', 87), repeat('k', 22),
                                     '0d0d0d0d-0000-4000-8000-0000000000a1');
-- The same device again, now as Bea: one row, updated.
select public.save_push_subscription('https://fcm.googleapis.com/fcm/send/prueba-1', repeat('q', 87), repeat('k', 22),
                                     '0d0d0d0d-0000-4000-8000-0000000000a2');
select public.save_push_subscription('https://fcm.googleapis.com/fcm/send/prueba-2', repeat('p', 87), repeat('k', 22),
                                     '0d0d0d0d-0000-4000-8000-0000000000ff');
do $$
declare ok boolean := false;
begin
  begin
    perform public.save_push_subscription('http://insecure.test/x', repeat('p', 87), repeat('k', 22), null);
  exception when others then ok := sqlerrm = 'push_subscription_invalid';
  end;
  if not ok then raise exception 'FAIL a non-https endpoint was accepted'; end if;
end $$;

reset role;
do $$
begin
  if (select count(*) from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/prueba-1') <> 1
     or (select member_id from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/prueba-1')
        is distinct from '0d0d0d0d-0000-4000-8000-0000000000a2'
     or (select p256dh from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/prueba-1') <> repeat('q', 87) then
    raise exception 'FAIL save_push_subscription must upsert by endpoint (one row, new member and keys)';
  end if;
  if (select member_id from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/prueba-2') is not null then
    raise exception 'FAIL an unknown member was stored on a subscription';
  end if;
end $$;
set local role anon;
select public.delete_push_subscription('https://fcm.googleapis.com/fcm/send/prueba-1');
reset role;
do $$
begin
  if exists (select 1 from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/prueba-1') then
    raise exception 'FAIL delete_push_subscription left the row';
  end if;
  raise notice 'PASS subscription RPCs: upsert by endpoint, member validated, https only, delete';
end $$;

rollback;
