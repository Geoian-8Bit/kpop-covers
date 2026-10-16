-- One Shoot · grupo, B1: F13 (bolsas para sortear) y F14 (Random Play Dance y pistas guardadas).
-- Additive: new tables only (and archive_row learns them). Same open single-group rules as everything else:
-- the group is always the default one, «borrar» archives, archived songs / clips / people disappear from bags
-- without breaking them, and a track keeps an archived clip as «no disponible».
--
--  bags         a named bag of songs, clips or people; draw mode «se queda» (keep) or «se quita» (remove), and
--               «sin repetir seguidas» for bags that keep.
--  bag_items    what is in a bag (exactly one of video / clip / member, matching the bag's kind); removed_at is set
--               when a draw takes it out, «Rellenar» clears it.
--  bag_draws    the bag's history: what came out, when, by whom, and whether it was taken out.
--  draw_from_bag(bag, count, remove, member)  draws at random on the server, atomically (two phones drawing at
--               once can't take out the same item twice). SECURITY INVOKER: it runs with the caller's RLS.
--  tracks       a saved Random Play Dance round: name, pause between clips, countdown, use each clip's mirror and
--               speed, and when the title shows (before it plays, or after: «modo adivinar»).
--  track_items  the track's clips in order.

-- ─────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────

create table if not exists public.bags (
  id          uuid primary key default gen_random_uuid(),
  crew_id     uuid not null references public.crews (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  kind        text not null check (kind in ('songs', 'clips', 'people')),
  draw_mode   text not null default 'keep' check (draw_mode in ('keep', 'remove')),
  no_repeat   boolean not null default false,
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists bags_crew_idx on public.bags (crew_id);
create unique index if not exists bags_crew_name_key
  on public.bags (crew_id, lower(btrim(name))) where archived_at is null;

create table if not exists public.bag_items (
  id          uuid primary key default gen_random_uuid(),
  crew_id     uuid not null references public.crews (id) on delete cascade,
  bag_id      uuid not null references public.bags (id) on delete cascade,
  video_id    uuid references public.videos (id) on delete cascade,
  clip_id     uuid references public.clips (id) on delete cascade,
  member_id   uuid references public.members (id) on delete cascade,
  removed_at  timestamptz,
  created_at  timestamptz not null default now(),
  archived_at timestamptz,
  constraint bag_items_one_ref check (num_nonnulls(video_id, clip_id, member_id) = 1)
);
create index if not exists bag_items_bag_idx on public.bag_items (bag_id);
create index if not exists bag_items_crew_idx on public.bag_items (crew_id);
create index if not exists bag_items_video_idx on public.bag_items (video_id);
create index if not exists bag_items_clip_idx on public.bag_items (clip_id);
create index if not exists bag_items_member_idx on public.bag_items (member_id);
-- The same thing only once per bag (live items).
create unique index if not exists bag_items_once_key
  on public.bag_items (bag_id, coalesce(video_id, clip_id, member_id)) where archived_at is null;

create table if not exists public.bag_draws (
  id          uuid primary key default gen_random_uuid(),
  crew_id     uuid not null references public.crews (id) on delete cascade,
  bag_id      uuid not null references public.bags (id) on delete cascade,
  item_id     uuid references public.bag_items (id) on delete set null,
  label       text not null check (char_length(label) between 1 and 200),
  removed     boolean not null default false,
  member_id   uuid references public.members (id) on delete set null,
  drawn_at    timestamptz not null default clock_timestamp(),
  -- Draw order even within the same millisecond («sin repetir seguidas» looks at the last one).
  seq         bigint generated always as identity
);
create index if not exists bag_draws_bag_idx on public.bag_draws (bag_id, drawn_at desc);
create index if not exists bag_draws_crew_idx on public.bag_draws (crew_id);
create index if not exists bag_draws_item_idx on public.bag_draws (item_id);
create index if not exists bag_draws_member_idx on public.bag_draws (member_id);

create table if not exists public.tracks (
  id            uuid primary key default gen_random_uuid(),
  crew_id       uuid not null references public.crews (id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 80),
  pause_seconds numeric(3, 1) not null default 2 check (pause_seconds between 0 and 5),
  countdown     boolean not null default true,
  use_clip_settings boolean not null default true,
  title_mode    text not null default 'before' check (title_mode in ('before', 'after')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz
);
create index if not exists tracks_crew_idx on public.tracks (crew_id);

create table if not exists public.track_items (
  id          uuid primary key default gen_random_uuid(),
  crew_id     uuid not null references public.crews (id) on delete cascade,
  track_id    uuid not null references public.tracks (id) on delete cascade,
  clip_id     uuid not null references public.clips (id) on delete cascade,
  position    int not null check (position between 0 and 999),
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists track_items_track_idx on public.track_items (track_id, position);
create index if not exists track_items_crew_idx on public.track_items (crew_id);
create index if not exists track_items_clip_idx on public.track_items (clip_id);

alter table public.bags enable row level security;
alter table public.bag_items enable row level security;
alter table public.bag_draws enable row level security;
alter table public.tracks enable row level security;
alter table public.track_items enable row level security;

-- ─────────────────────────────────────────────────────────────
-- Integrity: an item matches its bag's kind and points at something live of the group
-- ─────────────────────────────────────────────────────────────

create or replace function private.guard_bag_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
begin
  select b.kind into v_kind from public.bags b
  where b.id = new.bag_id and b.crew_id = new.crew_id and b.archived_at is null;
  if v_kind is null then
    raise exception 'bag_not_found' using errcode = 'P0001';
  end if;
  if (v_kind = 'songs' and (new.video_id is null or not exists (
        select 1 from public.videos v where v.id = new.video_id and v.crew_id = new.crew_id and v.archived_at is null)))
     or (v_kind = 'clips' and (new.clip_id is null or not exists (
        select 1 from public.clips c where c.id = new.clip_id and c.crew_id = new.crew_id and c.archived_at is null)))
     or (v_kind = 'people' and (new.member_id is null or not exists (
        select 1 from public.members m where m.id = new.member_id and m.crew_id = new.crew_id and m.archived_at is null)))
  then
    raise exception 'bag_item_invalid' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function private.guard_track_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.tracks t where t.id = new.track_id and t.crew_id = new.crew_id and t.archived_at is null
  ) then
    raise exception 'track_not_found' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' and not exists (
    select 1 from public.clips c where c.id = new.clip_id and c.crew_id = new.crew_id and c.archived_at is null
  ) then
    raise exception 'track_item_invalid' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function private.guard_bag_draw()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.bags b where b.id = new.bag_id and b.crew_id = new.crew_id and b.archived_at is null
  ) then
    raise exception 'bag_not_found' using errcode = 'P0001';
  end if;
  if new.item_id is not null and not exists (
    select 1 from public.bag_items i where i.id = new.item_id and i.bag_id = new.bag_id
  ) then
    new.item_id := null;
  end if;
  if new.member_id is not null and not exists (
    select 1 from public.members m where m.id = new.member_id and m.crew_id = new.crew_id and m.archived_at is null
  ) then
    new.member_id := null;
  end if;
  if current_user::text in ('anon', 'authenticated') then
    new.drawn_at := clock_timestamp();
  end if;
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Triggers (BEFORE triggers run in name order: crew first, then stamp, checks, cap)
-- ─────────────────────────────────────────────────────────────

drop trigger if exists bags_a_set_crew on public.bags;
create trigger bags_a_set_crew before insert on public.bags for each row execute function private.set_group_crew();
drop trigger if exists bags_b_client_stamp on public.bags;
create trigger bags_b_client_stamp before insert on public.bags for each row execute function private.stamp_new_row();
drop trigger if exists bags_c_row_cap on public.bags;
create trigger bags_c_row_cap before insert on public.bags for each row execute function private.guard_simple_cap('200');
drop trigger if exists bags_archive_on_delete on public.bags;
create trigger bags_archive_on_delete before delete on public.bags
  for each row execute function private.archive_instead_of_delete();
drop trigger if exists bags_bulk_delete_guard on public.bags;
create trigger bags_bulk_delete_guard after delete on public.bags
  referencing old table as gone for each statement execute function private.guard_bulk_delete();

drop trigger if exists bag_items_a_set_crew on public.bag_items;
create trigger bag_items_a_set_crew before insert on public.bag_items for each row execute function private.set_group_crew();
drop trigger if exists bag_items_b_client_stamp on public.bag_items;
create trigger bag_items_b_client_stamp before insert on public.bag_items for each row execute function private.stamp_new_row();
drop trigger if exists bag_items_c_check on public.bag_items;
create trigger bag_items_c_check before insert on public.bag_items for each row execute function private.guard_bag_item();
drop trigger if exists bag_items_d_row_cap on public.bag_items;
create trigger bag_items_d_row_cap before insert on public.bag_items for each row execute function private.guard_simple_cap('5000');
drop trigger if exists bag_items_archive_on_delete on public.bag_items;
create trigger bag_items_archive_on_delete before delete on public.bag_items
  for each row execute function private.archive_instead_of_delete();
drop trigger if exists bag_items_bulk_delete_guard on public.bag_items;
create trigger bag_items_bulk_delete_guard after delete on public.bag_items
  referencing old table as gone for each statement execute function private.guard_bulk_delete();

drop trigger if exists bag_draws_a_set_crew on public.bag_draws;
create trigger bag_draws_a_set_crew before insert on public.bag_draws for each row execute function private.set_group_crew();
drop trigger if exists bag_draws_c_check on public.bag_draws;
create trigger bag_draws_c_check before insert on public.bag_draws for each row execute function private.guard_bag_draw();

drop trigger if exists tracks_a_set_crew on public.tracks;
create trigger tracks_a_set_crew before insert on public.tracks for each row execute function private.set_group_crew();
drop trigger if exists tracks_b_client_stamp on public.tracks;
create trigger tracks_b_client_stamp before insert on public.tracks for each row execute function private.stamp_new_row();
drop trigger if exists tracks_c_row_cap on public.tracks;
create trigger tracks_c_row_cap before insert on public.tracks for each row execute function private.guard_simple_cap('300');
drop trigger if exists tracks_touch on public.tracks;
create trigger tracks_touch before update on public.tracks for each row execute function public.touch_updated_at();
drop trigger if exists tracks_archive_on_delete on public.tracks;
create trigger tracks_archive_on_delete before delete on public.tracks
  for each row execute function private.archive_instead_of_delete();
drop trigger if exists tracks_bulk_delete_guard on public.tracks;
create trigger tracks_bulk_delete_guard after delete on public.tracks
  referencing old table as gone for each statement execute function private.guard_bulk_delete();

drop trigger if exists track_items_a_set_crew on public.track_items;
create trigger track_items_a_set_crew before insert on public.track_items for each row execute function private.set_group_crew();
drop trigger if exists track_items_b_client_stamp on public.track_items;
create trigger track_items_b_client_stamp before insert on public.track_items for each row execute function private.stamp_new_row();
drop trigger if exists track_items_c_check on public.track_items;
create trigger track_items_c_check before insert or update of position on public.track_items
  for each row execute function private.guard_track_item();
drop trigger if exists track_items_d_row_cap on public.track_items;
create trigger track_items_d_row_cap before insert on public.track_items for each row execute function private.guard_simple_cap('20000');
drop trigger if exists track_items_archive_on_delete on public.track_items;
create trigger track_items_archive_on_delete before delete on public.track_items
  for each row execute function private.archive_instead_of_delete();
drop trigger if exists track_items_bulk_delete_guard on public.track_items;
create trigger track_items_bulk_delete_guard after delete on public.track_items
  referencing old table as gone for each statement execute function private.guard_bulk_delete();

-- ─────────────────────────────────────────────────────────────
-- RLS: the default group, live rows; items of an archived bag / song / clip / person are hidden
-- ─────────────────────────────────────────────────────────────

drop policy if exists bags_open_select on public.bags;
drop policy if exists bags_open_insert on public.bags;
drop policy if exists bags_open_update on public.bags;
drop policy if exists bags_open_delete on public.bags;
create policy bags_open_select on public.bags for select to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);
create policy bags_open_insert on public.bags for insert to anon, authenticated
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy bags_open_update on public.bags for update to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null)
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy bags_open_delete on public.bags for delete to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);

drop policy if exists bag_items_open_select on public.bag_items;
drop policy if exists bag_items_open_insert on public.bag_items;
drop policy if exists bag_items_open_update on public.bag_items;
drop policy if exists bag_items_open_delete on public.bag_items;
create policy bag_items_open_select on public.bag_items for select to anon, authenticated
  using (
    crew_id = (select private.default_group()) and archived_at is null
    and exists (select 1 from public.bags b where b.id = bag_items.bag_id and b.archived_at is null)
    and (video_id is null or exists (select 1 from public.videos v where v.id = bag_items.video_id and v.archived_at is null))
    and (clip_id is null or exists (
      select 1 from public.clips c join public.videos v on v.id = c.video_id
      where c.id = bag_items.clip_id and c.archived_at is null and v.archived_at is null))
    and (member_id is null or exists (select 1 from public.members m where m.id = bag_items.member_id and m.archived_at is null))
  );
create policy bag_items_open_insert on public.bag_items for insert to anon, authenticated
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy bag_items_open_update on public.bag_items for update to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null)
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy bag_items_open_delete on public.bag_items for delete to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);

drop policy if exists bag_draws_open_select on public.bag_draws;
drop policy if exists bag_draws_open_insert on public.bag_draws;
drop policy if exists bag_draws_open_update on public.bag_draws;
create policy bag_draws_open_select on public.bag_draws for select to anon, authenticated
  using (
    crew_id = (select private.default_group())
    and exists (select 1 from public.bags b where b.id = bag_draws.bag_id and b.archived_at is null)
  );
create policy bag_draws_open_insert on public.bag_draws for insert to anon, authenticated
  with check (crew_id = (select private.default_group()));
create policy bag_draws_open_update on public.bag_draws for update to anon, authenticated
  using (crew_id = (select private.default_group())) with check (crew_id = (select private.default_group()));

drop policy if exists tracks_open_select on public.tracks;
drop policy if exists tracks_open_insert on public.tracks;
drop policy if exists tracks_open_update on public.tracks;
drop policy if exists tracks_open_delete on public.tracks;
create policy tracks_open_select on public.tracks for select to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);
create policy tracks_open_insert on public.tracks for insert to anon, authenticated
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy tracks_open_update on public.tracks for update to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null)
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy tracks_open_delete on public.tracks for delete to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);

-- Track items stay visible when their clip is archived: the player shows them as «no disponible» and skips them.
drop policy if exists track_items_open_select on public.track_items;
drop policy if exists track_items_open_insert on public.track_items;
drop policy if exists track_items_open_update on public.track_items;
drop policy if exists track_items_open_delete on public.track_items;
create policy track_items_open_select on public.track_items for select to anon, authenticated
  using (
    crew_id = (select private.default_group()) and archived_at is null
    and exists (select 1 from public.tracks t where t.id = track_items.track_id and t.archived_at is null)
  );
create policy track_items_open_insert on public.track_items for insert to anon, authenticated
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy track_items_open_update on public.track_items for update to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null)
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy track_items_open_delete on public.track_items for delete to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);

-- ─────────────────────────────────────────────────────────────
-- Column privileges (archived_at, crew and references are never client-editable)
-- ─────────────────────────────────────────────────────────────

revoke update on public.bags, public.bag_items, public.bag_draws, public.tracks, public.track_items from anon, authenticated;
grant select, insert, delete on public.bags, public.bag_items, public.tracks, public.track_items to anon, authenticated;
grant select, insert on public.bag_draws to anon, authenticated;
revoke delete on public.bag_draws from anon, authenticated;
grant update (name, draw_mode, no_repeat) on public.bags to anon, authenticated;
grant update (removed_at) on public.bag_items to anon, authenticated;
grant update (removed) on public.bag_draws to anon, authenticated;
grant update (name, pause_seconds, countdown, use_clip_settings, title_mode) on public.tracks to anon, authenticated;
grant update (position) on public.track_items to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- archive_row knows the new tables (archiving a bag / track archives its items with it)
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
  elsif p_table in ('clips', 'notes', 'members', 'takes', 'bag_items', 'track_items') then
    execute format('update public.%I set archived_at = now() where id = $1 and archived_at is null', p_table)
      using p_id;
  else
    raise exception 'archive_row: unexpected table %', p_table;
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Drawing (F13): random, atomic, with the caller's own permissions
-- ─────────────────────────────────────────────────────────────

-- Draws p_count items from a bag (1–10). p_remove: take them out (null = the bag's mode). «Sin repetir seguidas»
-- skips the item of the last draw when there is anything else. Returns the draws, in order. Items already taken
-- out are not drawn; with nothing left it returns no rows (the app offers «Rellenar»).
create or replace function public.draw_from_bag(
  p_bag uuid,
  p_count int default 1,
  p_remove boolean default null,
  p_member uuid default null
)
returns setof public.bag_draws
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bag    public.bags;
  v_remove boolean;
  v_last   uuid;
  v_item   record;
  v_draw   public.bag_draws;
  v_label  text;
begin
  select * into v_bag from public.bags where id = p_bag and archived_at is null for update;
  if v_bag.id is null then
    raise exception 'bag_not_found' using errcode = 'P0001';
  end if;
  v_remove := coalesce(p_remove, v_bag.draw_mode = 'remove');
  if v_bag.no_repeat then
    select d.item_id into v_last from public.bag_draws d where d.bag_id = p_bag order by d.seq desc limit 1;
  end if;
  for v_item in
    select i.*, (i.id = v_last) as was_last
    from public.bag_items i
    where i.bag_id = p_bag and i.removed_at is null
    order by (i.id = v_last) nulls first, random()
    limit greatest(1, least(coalesce(p_count, 1), 10))
  loop
    select coalesce(
      (select v.title from public.videos v where v.id = v_item.video_id),
      (select c.name || ' · ' || v.title from public.clips c join public.videos v on v.id = c.video_id where c.id = v_item.clip_id),
      (select m.name from public.members m where m.id = v_item.member_id),
      '—'
    ) into v_label;
    insert into public.bag_draws (bag_id, crew_id, item_id, label, removed, member_id)
    values (p_bag, v_bag.crew_id, v_item.id, left(v_label, 200), v_remove, p_member)
    returning * into v_draw;
    if v_remove then
      update public.bag_items set removed_at = now() where id = v_item.id;
    end if;
    return next v_draw;
  end loop;
end;
$$;

revoke execute on function public.draw_from_bag(uuid, int, boolean, uuid) from public;
grant execute on function public.draw_from_bag(uuid, int, boolean, uuid) to anon, authenticated;

revoke execute on function private.guard_bag_item() from public, anon, authenticated;
revoke execute on function private.guard_track_item() from public, anon, authenticated;
revoke execute on function private.guard_bag_draw() from public, anon, authenticated;
grant execute on function private.archive_row(text, uuid) to anon, authenticated;
