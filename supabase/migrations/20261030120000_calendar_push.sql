-- One Shoot · Avisos del calendario (REQ-05): the feed of calendar changes and the Web Push subscriptions.
-- Additive. The feed works on its own (the in-app dot only reads it); the push side needs the Edge Function
-- `notify-calendar`, its secrets and a Database Webhook on `calendar_changes` (docs/DEPLOY.md, «Avisos»).
--
--  calendar_changes    one row per change that affects today or later (Europe/Madrid), with its Spanish text
--                      composed here. Written only by the triggers below (security definer); anon reads its group.
--  push_subscriptions  one row per device that turned «Avisos» on. anon can't read it: only the RPCs
--                      save_push_subscription / delete_push_subscription touch it, and the Edge Function reads it
--                      with the service role (server only).
--  changed_by_member   new column on absences, rehearsal_rules and rehearsal_exceptions: who made the last change
--                      (from «¿Quién eres?»), so their own devices are not notified. Validated (an unknown or
--                      archived member becomes null). The rule RPCs take it as p_member, and archive_calendar_row
--                      removes an absence or an exception saying who did it (a plain delete still works, anonymous).

-- ─────────────────────────────────────────────────────────────
-- 1) Who made the change
-- ─────────────────────────────────────────────────────────────

alter table public.absences add column if not exists changed_by_member uuid references public.members (id) on delete set null;
alter table public.rehearsal_rules add column if not exists changed_by_member uuid references public.members (id) on delete set null;
alter table public.rehearsal_exceptions add column if not exists changed_by_member uuid references public.members (id) on delete set null;
create index if not exists absences_changed_by_idx on public.absences (changed_by_member);
create index if not exists rehearsal_rules_changed_by_idx on public.rehearsal_rules (changed_by_member);
create index if not exists rehearsal_exceptions_changed_by_idx on public.rehearsal_exceptions (changed_by_member);

-- A live member of that group, else null (trust, not security: anyone can pick any name).
create or replace function private.calendar_author(p_crew uuid, p_member uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id from public.members m
  where m.id = p_member and m.crew_id = p_crew and m.archived_at is null;
$$;

create or replace function private.calendar_author_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.changed_by_member is not null then
    new.changed_by_member := private.calendar_author(new.crew_id, new.changed_by_member);
  end if;
  return new;
end;
$$;

-- After the crew is set (a_set_crew) and before the FK check (constraint triggers run after the row).
drop trigger if exists absences_e_author on public.absences;
create trigger absences_e_author before insert or update of changed_by_member on public.absences
  for each row execute function private.calendar_author_guard();
drop trigger if exists rehearsal_rules_e_author on public.rehearsal_rules;
create trigger rehearsal_rules_e_author before insert or update of changed_by_member on public.rehearsal_rules
  for each row execute function private.calendar_author_guard();
drop trigger if exists rehearsal_exceptions_e_author on public.rehearsal_exceptions;
create trigger rehearsal_exceptions_e_author before insert or update of changed_by_member on public.rehearsal_exceptions
  for each row execute function private.calendar_author_guard();

-- The client sends who edits an absence along with the edit.
grant update (changed_by_member) on public.absences to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2) The feed
-- ─────────────────────────────────────────────────────────────

create table if not exists public.calendar_changes (
  id             uuid primary key default gen_random_uuid(),
  crew_id        uuid not null references public.crews (id) on delete cascade,
  -- Who made the change (null: a device without «¿Quién eres?»): their devices are skipped.
  author_member  uuid references public.members (id) on delete set null,
  -- Who the change is about (the absent person), if anyone.
  subject_member uuid references public.members (id) on delete set null,
  -- The day it affects (the notification's tag and link: /calendario?dia=…).
  target_date    date not null,
  body           text not null check (char_length(body) between 1 and 300),
  created_at     timestamptz not null default now()
);
create index if not exists calendar_changes_crew_idx on public.calendar_changes (crew_id, created_at desc);
create index if not exists calendar_changes_author_idx on public.calendar_changes (author_member);
create index if not exists calendar_changes_subject_idx on public.calendar_changes (subject_member);

alter table public.calendar_changes enable row level security;
drop policy if exists calendar_changes_open_select on public.calendar_changes;
create policy calendar_changes_open_select on public.calendar_changes for select to anon, authenticated
  using (crew_id = (select private.default_group()));
revoke all on public.calendar_changes from anon, authenticated;
grant select on public.calendar_changes to anon, authenticated;

-- ───────────── Spanish text (mirrored by apps/web/src/features/calendar/calendarFeedRules.ts for the demo) ─────────────

-- «sáb 8 nov» (the calendar's own short names: calendarRules.ts WEEKDAYS_SHORT / MONTHS_SHORT).
create or replace function private.cal_day(p date)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['lun', 'mar', 'miér', 'jue', 'vie', 'sáb', 'dom'])[extract(isodow from p)::int]
    || ' ' || extract(day from p)::int
    || ' ' || (array['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'])[extract(month from p)::int];
$$;

-- «el sáb 8 nov» · «del 8 al 12 nov» · «del 30 oct al 2 nov».
create or replace function private.cal_span(p_from date, p_to date)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_to <= p_from then 'el ' || private.cal_day(p_from)
    when date_trunc('month', p_from) = date_trunc('month', p_to) then
      'del ' || extract(day from p_from)::int || ' al ' || extract(day from p_to)::int || ' '
      || (array['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'])[extract(month from p_to)::int]
    else
      'del ' || extract(day from p_from)::int || ' '
      || (array['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'])[extract(month from p_from)::int]
      || ' al ' || extract(day from p_to)::int || ' '
      || (array['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'])[extract(month from p_to)::int]
  end;
$$;

-- «Ana no puede el sáb 8 nov» · «Ana llega a las 19:00 el sáb 8 nov» · «Ana se va a las 20:00 del 8 al 12 nov».
create or replace function private.calendar_absence_text(p_name text, p_kind text, p_at time, p_from date, p_to date)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(nullif(btrim(p_name), ''), 'Alguien') || ' '
    || case p_kind
         when 'arrives' then 'llega a las ' || to_char(p_at, 'HH24:MI')
         when 'leaves' then 'se va a las ' || to_char(p_at, 'HH24:MI')
         else 'no puede'
       end
    || ' ' || private.cal_span(p_from, p_to);
$$;

-- First day on or after p_from that falls on that ISO weekday.
create or replace function private.cal_next_weekday(p_from date, p_weekday int)
returns date
language sql
immutable
set search_path = ''
as $$
  select p_from + ((p_weekday - extract(isodow from p_from)::int + 7) % 7);
$$;

-- «Desde el miércoles 5, ensayo los miércoles de 18:00 a 21:00» · «Desde el miércoles 5, ya no hay ensayo los miércoles».
create or replace function private.calendar_rule_text(p_weekday int, p_starts time, p_ends time, p_from date, p_ended boolean)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'Desde el '
    || (array['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'])[p_weekday]
    || ' ' || extract(day from p_from)::int || ', '
    || case when p_ended then 'ya no hay ensayo los ' else 'ensayo los ' end
    || (array['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'])[p_weekday]
    || case when p_ended then '' else ' de ' || to_char(p_starts, 'HH24:MI') || ' a ' || to_char(p_ends, 'HH24:MI') end;
$$;

-- One feed row, plus a little housekeeping: rows older than 120 days are of no use to anyone.
create or replace function private.calendar_post(p_crew uuid, p_author uuid, p_subject uuid, p_date date, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.calendar_changes (crew_id, author_member, subject_member, target_date, body)
  values (p_crew, private.calendar_author(p_crew, p_author), p_subject, p_date, left(p_body, 300));
  delete from public.calendar_changes where crew_id = p_crew and created_at < now() - interval '120 days';
end;
$$;

-- ───────────── Triggers that write the feed ─────────────

create or replace function private.calendar_feed_absences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.madrid_today();
  v_name  text;
  v_body  text;
begin
  select m.name into v_name from public.members m where m.id = new.member_id;
  if tg_op = 'INSERT' then
    if new.archived_at is not null or new.ends_on < v_today then
      return null;
    end if;
    v_body := private.calendar_absence_text(v_name, new.kind, new.at_time, new.starts_on, new.ends_on);
    perform private.calendar_post(new.crew_id, coalesce(new.changed_by_member, new.created_by_member), new.member_id,
                                  greatest(new.starts_on, v_today), v_body);
  elsif old.archived_at is null and new.archived_at is not null then
    -- Removed («Ya puede»).
    if old.ends_on < v_today then
      return null;
    end if;
    perform private.calendar_post(new.crew_id, new.changed_by_member, new.member_id, greatest(old.starts_on, v_today),
      coalesce(nullif(btrim(v_name), ''), 'Alguien') || ' ya puede ' || private.cal_span(old.starts_on, old.ends_on));
  elsif new.archived_at is null
        and (new.starts_on, new.ends_on, new.kind, new.at_time) is distinct from (old.starts_on, old.ends_on, old.kind, old.at_time)
        and (new.ends_on >= v_today or old.ends_on >= v_today) then
    -- Edited dates, kind or time (a note alone doesn't notify anyone).
    v_body := 'Cambio: ' || private.calendar_absence_text(v_name, new.kind, new.at_time, new.starts_on, new.ends_on);
    perform private.calendar_post(new.crew_id, new.changed_by_member, new.member_id,
      case when new.ends_on >= v_today then greatest(new.starts_on, v_today) else greatest(old.starts_on, v_today) end,
      v_body);
  end if;
  return null;
end;
$$;

create or replace function private.calendar_feed_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.madrid_today();
  v_from  date;
begin
  if tg_op = 'INSERT' then
    if new.archived_at is not null or (new.valid_until is not null and new.valid_until < greatest(new.valid_from, v_today)) then
      return null;
    end if;
    v_from := private.cal_next_weekday(greatest(new.valid_from, v_today), new.weekday);
    perform private.calendar_post(new.crew_id, new.changed_by_member, null, v_from,
      private.calendar_rule_text(new.weekday, new.starts_at, new.ends_at, v_from, false));
    return null;
  end if;
  -- edit_rehearsal_rule closes the old rule and opens a new one: only the new one speaks.
  if coalesce(current_setting('oneshoot.calendar_quiet', true), '') = 'on' then
    return null;
  end if;
  -- Ended from today (end_rehearsal_rule) or removed while it still ran.
  if (old.archived_at is null and (old.valid_until is null or old.valid_until >= v_today))
     and (new.archived_at is not null or (new.valid_until is not null and new.valid_until < v_today)) then
    v_from := private.cal_next_weekday(greatest(old.valid_from, v_today), old.weekday);
    perform private.calendar_post(new.crew_id, new.changed_by_member, null, v_from,
      private.calendar_rule_text(old.weekday, old.starts_at, old.ends_at, v_from, true));
  end if;
  return null;
end;
$$;

create or replace function private.calendar_feed_exceptions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.madrid_today();
begin
  if tg_op = 'INSERT' then
    if new.archived_at is not null or new.on_date < v_today then
      return null;
    end if;
    perform private.calendar_post(new.crew_id, new.changed_by_member, null, new.on_date,
      case when new.kind = 'cancel' then 'Cancelado el ensayo del ' || private.cal_day(new.on_date)
           else 'Ensayo extra el ' || private.cal_day(new.on_date) || ' de ' || to_char(new.starts_at, 'HH24:MI')
                || ' a ' || to_char(new.ends_at, 'HH24:MI') end);
    return null;
  end if;
  -- Only removing speaks (an edit of a rule moving its cancellations over doesn't).
  if not (old.archived_at is null and new.archived_at is not null) or old.on_date < v_today then
    return null;
  end if;
  if old.kind = 'cancel' then
    -- The rule itself went away (removed or ended before that day): nothing comes back.
    if not exists (
      select 1 from public.rehearsal_rules r
      where r.id = old.rule_id and r.archived_at is null and (r.valid_until is null or r.valid_until >= old.on_date)
    ) then
      return null;
    end if;
    perform private.calendar_post(new.crew_id, new.changed_by_member, null, old.on_date,
      'Vuelve el ensayo del ' || private.cal_day(old.on_date));
  else
    perform private.calendar_post(new.crew_id, new.changed_by_member, null, old.on_date,
      'Ya no hay ensayo extra el ' || private.cal_day(old.on_date));
  end if;
  return null;
end;
$$;

drop trigger if exists absences_feed on public.absences;
create trigger absences_feed after insert or update on public.absences
  for each row execute function private.calendar_feed_absences();
drop trigger if exists rehearsal_rules_feed on public.rehearsal_rules;
create trigger rehearsal_rules_feed after insert or update on public.rehearsal_rules
  for each row execute function private.calendar_feed_rules();
drop trigger if exists rehearsal_exceptions_feed on public.rehearsal_exceptions;
create trigger rehearsal_exceptions_feed after insert or update on public.rehearsal_exceptions
  for each row execute function private.calendar_feed_exceptions();

-- ─────────────────────────────────────────────────────────────
-- 3) Rule RPCs learn who did it (p_member, optional: older clients keep working)
-- ─────────────────────────────────────────────────────────────

drop function if exists public.edit_rehearsal_rule(uuid, smallint, time, time);
create or replace function public.edit_rehearsal_rule(
  p_rule uuid, p_weekday smallint, p_starts time, p_ends time, p_member uuid default null
)
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
  -- Past weeks keep the old timetable; the new one runs from today. Closing the old one says nothing (the new
  -- rule's notice tells the change).
  perform set_config('oneshoot.calendar_quiet', 'on', true);
  update public.rehearsal_rules set valid_until = v_today - 1 where id = v_old.id;
  perform set_config('oneshoot.calendar_quiet', '', true);
  insert into public.rehearsal_rules (crew_id, weekday, starts_at, ends_at, valid_from, changed_by_member)
  values (v_old.crew_id, p_weekday, p_starts, p_ends, v_today, p_member)
  returning * into v_new;
  -- Same weekday: the cancellations still to come follow the rule (that session is still called off).
  if p_weekday = v_old.weekday then
    update public.rehearsal_exceptions set rule_id = v_new.id
    where rule_id = v_old.id and kind = 'cancel' and on_date >= v_today and archived_at is null;
  end if;
  return v_new;
end;
$$;

drop function if exists public.end_rehearsal_rule(uuid);
create or replace function public.end_rehearsal_rule(p_rule uuid, p_member uuid default null)
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
  update public.rehearsal_rules set valid_until = v_today - 1, changed_by_member = p_member where id = v_id;
end;
$$;

-- Remove (archive) an absence or a rehearsal exception, saying who did it, in one request.
create or replace function public.archive_calendar_row(p_table text, p_id uuid, p_member uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_table = 'absences' then
    update public.absences set changed_by_member = p_member, archived_at = now()
    where id = p_id and crew_id = private.default_group() and archived_at is null;
  elsif p_table = 'rehearsal_exceptions' then
    update public.rehearsal_exceptions set changed_by_member = p_member, archived_at = now()
    where id = p_id and crew_id = private.default_group() and archived_at is null;
  else
    raise exception 'archive_calendar_row: unexpected table %', p_table using errcode = 'P0001';
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 4) Push subscriptions
-- ─────────────────────────────────────────────────────────────

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  crew_id     uuid not null references public.crews (id) on delete cascade,
  -- The device's «¿Quién eres?» (null: none). Its own changes don't notify it.
  member_id   uuid references public.members (id) on delete set null,
  endpoint    text not null unique check (char_length(endpoint) between 12 and 1000 and endpoint like 'https://%'),
  p256dh      text not null check (char_length(p256dh) between 20 and 200),
  auth        text not null check (char_length(auth) between 8 and 100),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Last time a push to it was accepted (written by the Edge Function).
  last_ok_at  timestamptz
);
create index if not exists push_subscriptions_crew_idx on public.push_subscriptions (crew_id);
create index if not exists push_subscriptions_member_idx on public.push_subscriptions (member_id);

-- RLS on and no policy at all: anon and authenticated see nothing. Only the RPCs (definer) and the service role.
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- Insert or update by endpoint (the same device subscribing twice updates its row; a new «¿Quién eres?» too).
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_member uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_crew uuid := private.default_group();
begin
  if v_crew is null then
    raise exception 'no_group' using errcode = 'P0001';
  end if;
  if p_endpoint is null or p_endpoint not like 'https://%' or char_length(p_endpoint) > 1000 then
    raise exception 'push_subscription_invalid' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('push_subscriptions'), hashtext(v_crew::text));
  if not exists (select 1 from public.push_subscriptions where endpoint = p_endpoint)
     and (select count(*) from public.push_subscriptions where crew_id = v_crew) >= 300 then
    raise exception 'push_subscriptions_cap_reached' using errcode = 'P0001';
  end if;
  insert into public.push_subscriptions (crew_id, member_id, endpoint, p256dh, auth)
  values (v_crew, private.calendar_author(v_crew, p_member), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set crew_id = excluded.crew_id, member_id = excluded.member_id, p256dh = excluded.p256dh,
        auth = excluded.auth, updated_at = now();
end;
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and crew_id = private.default_group();
$$;

-- ─────────────────────────────────────────────────────────────
-- 5) Grants
-- ─────────────────────────────────────────────────────────────

revoke execute on function private.calendar_author(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.calendar_author_guard() from public, anon, authenticated;
revoke execute on function private.cal_day(date) from public, anon, authenticated;
revoke execute on function private.cal_span(date, date) from public, anon, authenticated;
revoke execute on function private.calendar_absence_text(text, text, time, date, date) from public, anon, authenticated;
revoke execute on function private.cal_next_weekday(date, int) from public, anon, authenticated;
revoke execute on function private.calendar_rule_text(int, time, time, date, boolean) from public, anon, authenticated;
revoke execute on function private.calendar_post(uuid, uuid, uuid, date, text) from public, anon, authenticated;
revoke execute on function private.calendar_feed_absences() from public, anon, authenticated;
revoke execute on function private.calendar_feed_rules() from public, anon, authenticated;
revoke execute on function private.calendar_feed_exceptions() from public, anon, authenticated;

revoke execute on function public.edit_rehearsal_rule(uuid, smallint, time, time, uuid) from public;
revoke execute on function public.end_rehearsal_rule(uuid, uuid) from public;
revoke execute on function public.archive_calendar_row(text, uuid, uuid) from public;
revoke execute on function public.save_push_subscription(text, text, text, uuid) from public;
revoke execute on function public.delete_push_subscription(text) from public;
grant execute on function public.edit_rehearsal_rule(uuid, smallint, time, time, uuid) to anon, authenticated;
grant execute on function public.end_rehearsal_rule(uuid, uuid) to anon, authenticated;
grant execute on function public.archive_calendar_row(text, uuid, uuid) to anon, authenticated;
grant execute on function public.save_push_subscription(text, text, text, uuid) to anon, authenticated;
grant execute on function public.delete_push_subscription(text) to anon, authenticated;
