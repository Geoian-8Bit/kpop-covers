-- One Shoot · grupo, B3: F16 (cuenta atrás al próximo evento) y F15 (reacciones en las tomas compartidas).
-- Additive: new tables only (and archive_row learns them).
--
--  events          name, date and time, place. The home shows the nearest one still to come; past events stop
--                  showing on their own (the app hides them a day after; nothing is deleted).
--  event_songs     the event's repertoire: songs of the library, in order.
--  take_reactions  quick emoji on takes shared with the group (🔥 👏 💯 😂), one of each per person (or «sin nombre»).
--                  Only on shared takes (the reduced copy is in the cloud); no comment threads (notes are F6).

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  crew_id     uuid not null references public.crews (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  starts_at   timestamptz not null,
  place       text check (place is null or char_length(place) <= 120),
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists events_crew_idx on public.events (crew_id, starts_at);

create table if not exists public.event_songs (
  id          uuid primary key default gen_random_uuid(),
  crew_id     uuid not null references public.crews (id) on delete cascade,
  event_id    uuid not null references public.events (id) on delete cascade,
  video_id    uuid not null references public.videos (id) on delete cascade,
  position    int not null default 0 check (position between 0 and 999),
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists event_songs_event_idx on public.event_songs (event_id, position);
create index if not exists event_songs_crew_idx on public.event_songs (crew_id);
create index if not exists event_songs_video_idx on public.event_songs (video_id);
create unique index if not exists event_songs_once_key
  on public.event_songs (event_id, video_id) where archived_at is null;

create table if not exists public.take_reactions (
  id          uuid primary key default gen_random_uuid(),
  crew_id     uuid not null references public.crews (id) on delete cascade,
  take_id     uuid not null references public.takes (id) on delete cascade,
  member_id   uuid references public.members (id) on delete set null,
  emoji       text not null check (emoji in ('🔥', '👏', '💯', '😂')),
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists take_reactions_take_idx on public.take_reactions (take_id);
create index if not exists take_reactions_crew_idx on public.take_reactions (crew_id);
create index if not exists take_reactions_member_idx on public.take_reactions (member_id);
create unique index if not exists take_reactions_once_key on public.take_reactions (
  take_id, coalesce(member_id, '00000000-0000-0000-0000-000000000000'::uuid), emoji
) where archived_at is null;

alter table public.events enable row level security;
alter table public.event_songs enable row level security;
alter table public.take_reactions enable row level security;

create or replace function private.guard_b3_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'event_songs' then
    if not exists (select 1 from public.events e where e.id = new.event_id and e.crew_id = new.crew_id and e.archived_at is null) then
      raise exception 'event_not_found' using errcode = 'P0001';
    end if;
    if tg_op = 'INSERT' and not exists (
      select 1 from public.videos v where v.id = new.video_id and v.crew_id = new.crew_id and v.archived_at is null
    ) then
      raise exception 'event_song_invalid' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'take_reactions' then
    if not exists (
      select 1 from public.takes t
      where t.id = new.take_id and t.crew_id = new.crew_id and t.archived_at is null and t.shared_path is not null
    ) then
      raise exception 'reaction_take_invalid' using errcode = 'P0001';
    end if;
    if new.member_id is not null and not exists (
      select 1 from public.members m where m.id = new.member_id and m.crew_id = new.crew_id and m.archived_at is null
    ) then
      new.member_id := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists events_a_set_crew on public.events;
create trigger events_a_set_crew before insert on public.events for each row execute function private.set_group_crew();
drop trigger if exists events_b_client_stamp on public.events;
create trigger events_b_client_stamp before insert on public.events for each row execute function private.stamp_new_row();
drop trigger if exists events_c_row_cap on public.events;
create trigger events_c_row_cap before insert on public.events for each row execute function private.guard_simple_cap('300');
drop trigger if exists events_archive_on_delete on public.events;
create trigger events_archive_on_delete before delete on public.events
  for each row execute function private.archive_instead_of_delete();
drop trigger if exists events_bulk_delete_guard on public.events;
create trigger events_bulk_delete_guard after delete on public.events
  referencing old table as gone for each statement execute function private.guard_bulk_delete();

drop trigger if exists event_songs_a_set_crew on public.event_songs;
create trigger event_songs_a_set_crew before insert on public.event_songs for each row execute function private.set_group_crew();
drop trigger if exists event_songs_b_client_stamp on public.event_songs;
create trigger event_songs_b_client_stamp before insert on public.event_songs for each row execute function private.stamp_new_row();
drop trigger if exists event_songs_c_links on public.event_songs;
create trigger event_songs_c_links before insert or update of position on public.event_songs
  for each row execute function private.guard_b3_links();
drop trigger if exists event_songs_d_row_cap on public.event_songs;
create trigger event_songs_d_row_cap before insert on public.event_songs for each row execute function private.guard_simple_cap('5000');
drop trigger if exists event_songs_archive_on_delete on public.event_songs;
create trigger event_songs_archive_on_delete before delete on public.event_songs
  for each row execute function private.archive_instead_of_delete();
drop trigger if exists event_songs_bulk_delete_guard on public.event_songs;
create trigger event_songs_bulk_delete_guard after delete on public.event_songs
  referencing old table as gone for each statement execute function private.guard_bulk_delete();

drop trigger if exists take_reactions_a_set_crew on public.take_reactions;
create trigger take_reactions_a_set_crew before insert on public.take_reactions for each row execute function private.set_group_crew();
drop trigger if exists take_reactions_b_client_stamp on public.take_reactions;
create trigger take_reactions_b_client_stamp before insert on public.take_reactions for each row execute function private.stamp_new_row();
drop trigger if exists take_reactions_c_links on public.take_reactions;
create trigger take_reactions_c_links before insert on public.take_reactions for each row execute function private.guard_b3_links();
drop trigger if exists take_reactions_d_row_cap on public.take_reactions;
create trigger take_reactions_d_row_cap before insert on public.take_reactions for each row execute function private.guard_simple_cap('50000');
drop trigger if exists take_reactions_archive_on_delete on public.take_reactions;
create trigger take_reactions_archive_on_delete before delete on public.take_reactions
  for each row execute function private.archive_instead_of_delete();
drop trigger if exists take_reactions_bulk_delete_guard on public.take_reactions;
create trigger take_reactions_bulk_delete_guard after delete on public.take_reactions
  referencing old table as gone for each statement execute function private.guard_bulk_delete();

drop policy if exists events_open_select on public.events;
drop policy if exists events_open_insert on public.events;
drop policy if exists events_open_update on public.events;
drop policy if exists events_open_delete on public.events;
create policy events_open_select on public.events for select to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);
create policy events_open_insert on public.events for insert to anon, authenticated
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy events_open_update on public.events for update to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null)
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy events_open_delete on public.events for delete to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);

drop policy if exists event_songs_open_select on public.event_songs;
drop policy if exists event_songs_open_insert on public.event_songs;
drop policy if exists event_songs_open_update on public.event_songs;
drop policy if exists event_songs_open_delete on public.event_songs;
create policy event_songs_open_select on public.event_songs for select to anon, authenticated
  using (
    crew_id = (select private.default_group()) and archived_at is null
    and exists (select 1 from public.events e where e.id = event_songs.event_id and e.archived_at is null)
    and exists (select 1 from public.videos v where v.id = event_songs.video_id and v.archived_at is null)
  );
create policy event_songs_open_insert on public.event_songs for insert to anon, authenticated
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy event_songs_open_update on public.event_songs for update to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null)
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy event_songs_open_delete on public.event_songs for delete to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);

drop policy if exists take_reactions_open_select on public.take_reactions;
drop policy if exists take_reactions_open_insert on public.take_reactions;
drop policy if exists take_reactions_open_delete on public.take_reactions;
create policy take_reactions_open_select on public.take_reactions for select to anon, authenticated
  using (
    crew_id = (select private.default_group()) and archived_at is null
    and exists (select 1 from public.takes t where t.id = take_reactions.take_id and t.archived_at is null)
  );
create policy take_reactions_open_insert on public.take_reactions for insert to anon, authenticated
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy take_reactions_open_delete on public.take_reactions for delete to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);

revoke update on public.events, public.event_songs, public.take_reactions from anon, authenticated;
grant select, insert, delete on public.events, public.event_songs, public.take_reactions to anon, authenticated;
grant update (name, starts_at, place) on public.events to anon, authenticated;
grant update (position) on public.event_songs to anon, authenticated;

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
    update public.videos set archived_at = now() where id = p_id and archived_at is null;
    update public.clips  set archived_at = now() where video_id = p_id and archived_at is null;
    update public.notes  set archived_at = now() where video_id = p_id and archived_at is null;
    update public.takes  set archived_at = now() where video_id = p_id and archived_at is null;
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
  elsif p_table in ('clips', 'notes', 'members', 'takes', 'bag_items', 'track_items', 'wishes', 'wish_interest',
                    'poll_options', 'event_songs', 'take_reactions') then
    execute format('update public.%I set archived_at = now() where id = $1 and archived_at is null', p_table)
      using p_id;
  else
    raise exception 'archive_row: unexpected table %', p_table;
  end if;
end;
$$;

revoke execute on function private.guard_b3_links() from public, anon, authenticated;
grant execute on function private.archive_row(text, uuid) to anon, authenticated;
