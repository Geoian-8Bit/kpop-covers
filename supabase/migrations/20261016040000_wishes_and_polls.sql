-- One Shoot · grupo, B2: F12 (lista de deseos) y F11 (propuestas y votación de la próxima cover).
-- Additive and backwards compatible: new tables, one new nullable column on bag_items (a bag of songs can also hold
-- wishes), its check relaxed to allow it, and archive_row learns the new tables.
--
--  wishes         «canciones que nos gustaría hacer»: a YouTube link (title, artist, thumbnail saved), optional
--                 original members, difficulty and comment, who proposed it. «Añadir a la biblioteca» sets
--                 added_video_id: the wish leaves the list (it stays as the record of where the video came from).
--  wish_interest  «Me apunto»: one row per person and wish (trust-based, F2).
--  polls          a vote between wishes: single / multi / ranking, results live or only at the end, named or
--                 anonymous (anonymous is a display rule: in this open app the rows are readable), closing time or
--                 closed by hand; closed_at and the winner are set once.
--  poll_options   the wishes that take part.
--  poll_votes     one ballot per person (rows: the options chosen, with a rank for «ranking»). cast_vote() replaces a
--                 person's ballot atomically while the poll is open.

-- ─────────────────────────────────────────────────────────────
-- F12 · wishes
-- ─────────────────────────────────────────────────────────────

create table if not exists public.wishes (
  id                    uuid primary key default gen_random_uuid(),
  crew_id               uuid not null references public.crews (id) on delete cascade,
  youtube_id            text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  title                 text not null check (char_length(btrim(title)) between 1 and 200),
  artist                text check (artist is null or char_length(artist) <= 120),
  thumbnail_url         text check (
    thumbnail_url is null or thumbnail_url ~ '^https://i\.ytimg\.com/vi/[A-Za-z0-9_-]{11}/[a-z0-9_]+\.jpg$'
  ),
  members_count         int check (members_count is null or members_count between 1 and 30),
  difficulty            text check (difficulty is null or difficulty in ('facil', 'media', 'dificil')),
  comment               text check (comment is null or char_length(comment) <= 300),
  proposed_by_member_id uuid references public.members (id) on delete set null,
  added_video_id        uuid references public.videos (id) on delete set null,
  created_at            timestamptz not null default now(),
  archived_at           timestamptz
);
create index if not exists wishes_crew_idx on public.wishes (crew_id);
create index if not exists wishes_member_idx on public.wishes (proposed_by_member_id);
create index if not exists wishes_video_idx on public.wishes (added_video_id);
-- The same YouTube video only once in the live list.
create unique index if not exists wishes_crew_youtube_key
  on public.wishes (crew_id, youtube_id) where archived_at is null and added_video_id is null;

create table if not exists public.wish_interest (
  id          uuid primary key default gen_random_uuid(),
  crew_id     uuid not null references public.crews (id) on delete cascade,
  wish_id     uuid not null references public.wishes (id) on delete cascade,
  member_id   uuid not null references public.members (id) on delete cascade,
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists wish_interest_wish_idx on public.wish_interest (wish_id);
create index if not exists wish_interest_crew_idx on public.wish_interest (crew_id);
create index if not exists wish_interest_member_idx on public.wish_interest (member_id);
create unique index if not exists wish_interest_once_key
  on public.wish_interest (wish_id, member_id) where archived_at is null;

-- ─────────────────────────────────────────────────────────────
-- F11 · polls
-- ─────────────────────────────────────────────────────────────

create table if not exists public.polls (
  id             uuid primary key default gen_random_uuid(),
  crew_id        uuid not null references public.crews (id) on delete cascade,
  title          text not null check (char_length(btrim(title)) between 1 and 80),
  vote_type      text not null check (vote_type in ('single', 'multi', 'ranking')),
  results_live   boolean not null default true,
  anonymous      boolean not null default false,
  closes_at      timestamptz,
  closed_at      timestamptz,
  winner_wish_id uuid references public.wishes (id) on delete set null,
  -- A second round between the tied ones points at the poll it comes from.
  parent_poll_id uuid references public.polls (id) on delete set null,
  created_by_member_id uuid references public.members (id) on delete set null,
  created_at     timestamptz not null default now(),
  archived_at    timestamptz
);
create index if not exists polls_crew_idx on public.polls (crew_id);
create index if not exists polls_winner_idx on public.polls (winner_wish_id);
create index if not exists polls_parent_idx on public.polls (parent_poll_id);
create index if not exists polls_member_idx on public.polls (created_by_member_id);

create table if not exists public.poll_options (
  id          uuid primary key default gen_random_uuid(),
  crew_id     uuid not null references public.crews (id) on delete cascade,
  poll_id     uuid not null references public.polls (id) on delete cascade,
  wish_id     uuid not null references public.wishes (id) on delete cascade,
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists poll_options_poll_idx on public.poll_options (poll_id);
create index if not exists poll_options_crew_idx on public.poll_options (crew_id);
create index if not exists poll_options_wish_idx on public.poll_options (wish_id);
create unique index if not exists poll_options_once_key
  on public.poll_options (poll_id, wish_id) where archived_at is null;

create table if not exists public.poll_votes (
  id          uuid primary key default gen_random_uuid(),
  crew_id     uuid not null references public.crews (id) on delete cascade,
  poll_id     uuid not null references public.polls (id) on delete cascade,
  option_id   uuid not null references public.poll_options (id) on delete cascade,
  member_id   uuid not null references public.members (id) on delete cascade,
  rank        int check (rank is null or rank between 1 and 50),
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists poll_votes_poll_idx on public.poll_votes (poll_id);
create index if not exists poll_votes_crew_idx on public.poll_votes (crew_id);
create index if not exists poll_votes_option_idx on public.poll_votes (option_id);
create index if not exists poll_votes_member_idx on public.poll_votes (member_id);
create unique index if not exists poll_votes_once_key
  on public.poll_votes (poll_id, member_id, option_id) where archived_at is null;

alter table public.wishes enable row level security;
alter table public.wish_interest enable row level security;
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

-- ─────────────────────────────────────────────────────────────
-- Integrity
-- ─────────────────────────────────────────────────────────────

-- Links to members / videos / wishes / polls must be live rows of the group; optional ones are dropped, required
-- ones refuse the row.
create or replace function private.guard_group_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'wishes' then
    if new.proposed_by_member_id is not null and not exists (
      select 1 from public.members m where m.id = new.proposed_by_member_id and m.crew_id = new.crew_id and m.archived_at is null
    ) then
      new.proposed_by_member_id := null;
    end if;
    if new.added_video_id is not null and not exists (
      select 1 from public.videos v where v.id = new.added_video_id and v.crew_id = new.crew_id and v.archived_at is null
    ) then
      raise exception 'wish_video_invalid' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'wish_interest' then
    if not exists (select 1 from public.wishes w where w.id = new.wish_id and w.crew_id = new.crew_id and w.archived_at is null)
       or not exists (select 1 from public.members m where m.id = new.member_id and m.crew_id = new.crew_id and m.archived_at is null)
    then
      raise exception 'wish_interest_invalid' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'polls' then
    if new.created_by_member_id is not null and not exists (
      select 1 from public.members m where m.id = new.created_by_member_id and m.crew_id = new.crew_id and m.archived_at is null
    ) then
      new.created_by_member_id := null;
    end if;
    if new.parent_poll_id is not null and not exists (
      select 1 from public.polls p where p.id = new.parent_poll_id and p.crew_id = new.crew_id
    ) then
      new.parent_poll_id := null;
    end if;
  elsif tg_table_name = 'poll_options' then
    if not exists (select 1 from public.polls p where p.id = new.poll_id and p.crew_id = new.crew_id and p.archived_at is null and p.closed_at is null)
       or not exists (select 1 from public.wishes w where w.id = new.wish_id and w.crew_id = new.crew_id and w.archived_at is null)
    then
      raise exception 'poll_option_invalid' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- Closing is once (closed_at null → set) and the winner must be one of the poll's options; a closed poll's other
-- settings are frozen.
create or replace function private.guard_poll_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user::text not in ('anon', 'authenticated') then
    return new;
  end if;
  if old.closed_at is not null then
    if new.closed_at is distinct from old.closed_at or new.winner_wish_id is distinct from old.winner_wish_id
       or new.vote_type is distinct from old.vote_type or new.closes_at is distinct from old.closes_at then
      raise exception 'poll_closed' using errcode = 'P0001';
    end if;
  elsif new.closed_at is not null then
    new.closed_at := now();
  end if;
  if new.vote_type is distinct from old.vote_type
     and exists (select 1 from public.poll_votes v where v.poll_id = new.id and v.archived_at is null) then
    raise exception 'poll_has_votes' using errcode = 'P0001';
  end if;
  if new.winner_wish_id is not null and new.winner_wish_id is distinct from old.winner_wish_id and (
    new.closed_at is null
    or not exists (select 1 from public.poll_options o where o.poll_id = new.id and o.wish_id = new.winner_wish_id and o.archived_at is null)
  ) then
    raise exception 'poll_winner_invalid' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Triggers
-- ─────────────────────────────────────────────────────────────

drop trigger if exists wishes_a_set_crew on public.wishes;
create trigger wishes_a_set_crew before insert on public.wishes for each row execute function private.set_group_crew();
drop trigger if exists wishes_b_client_stamp on public.wishes;
create trigger wishes_b_client_stamp before insert on public.wishes for each row execute function private.stamp_new_row();
drop trigger if exists wishes_c_links on public.wishes;
create trigger wishes_c_links before insert or update of proposed_by_member_id, added_video_id on public.wishes
  for each row execute function private.guard_group_links();
drop trigger if exists wishes_d_row_cap on public.wishes;
create trigger wishes_d_row_cap before insert on public.wishes for each row execute function private.guard_simple_cap('1000');
drop trigger if exists wishes_archive_on_delete on public.wishes;
create trigger wishes_archive_on_delete before delete on public.wishes
  for each row execute function private.archive_instead_of_delete();
drop trigger if exists wishes_bulk_delete_guard on public.wishes;
create trigger wishes_bulk_delete_guard after delete on public.wishes
  referencing old table as gone for each statement execute function private.guard_bulk_delete();

drop trigger if exists wish_interest_a_set_crew on public.wish_interest;
create trigger wish_interest_a_set_crew before insert on public.wish_interest for each row execute function private.set_group_crew();
drop trigger if exists wish_interest_b_client_stamp on public.wish_interest;
create trigger wish_interest_b_client_stamp before insert on public.wish_interest for each row execute function private.stamp_new_row();
drop trigger if exists wish_interest_c_links on public.wish_interest;
create trigger wish_interest_c_links before insert on public.wish_interest for each row execute function private.guard_group_links();
drop trigger if exists wish_interest_d_row_cap on public.wish_interest;
create trigger wish_interest_d_row_cap before insert on public.wish_interest for each row execute function private.guard_simple_cap('20000');
drop trigger if exists wish_interest_archive_on_delete on public.wish_interest;
create trigger wish_interest_archive_on_delete before delete on public.wish_interest
  for each row execute function private.archive_instead_of_delete();
drop trigger if exists wish_interest_bulk_delete_guard on public.wish_interest;
create trigger wish_interest_bulk_delete_guard after delete on public.wish_interest
  referencing old table as gone for each statement execute function private.guard_bulk_delete();

drop trigger if exists polls_a_set_crew on public.polls;
create trigger polls_a_set_crew before insert on public.polls for each row execute function private.set_group_crew();
drop trigger if exists polls_b_client_stamp on public.polls;
create trigger polls_b_client_stamp before insert on public.polls for each row execute function private.stamp_new_row();
drop trigger if exists polls_c_links on public.polls;
create trigger polls_c_links before insert or update of created_by_member_id, parent_poll_id on public.polls
  for each row execute function private.guard_group_links();
drop trigger if exists polls_d_row_cap on public.polls;
create trigger polls_d_row_cap before insert on public.polls for each row execute function private.guard_simple_cap('500');
drop trigger if exists polls_e_update on public.polls;
create trigger polls_e_update before update on public.polls for each row execute function private.guard_poll_update();
drop trigger if exists polls_archive_on_delete on public.polls;
create trigger polls_archive_on_delete before delete on public.polls
  for each row execute function private.archive_instead_of_delete();
drop trigger if exists polls_bulk_delete_guard on public.polls;
create trigger polls_bulk_delete_guard after delete on public.polls
  referencing old table as gone for each statement execute function private.guard_bulk_delete();

drop trigger if exists poll_options_a_set_crew on public.poll_options;
create trigger poll_options_a_set_crew before insert on public.poll_options for each row execute function private.set_group_crew();
drop trigger if exists poll_options_b_client_stamp on public.poll_options;
create trigger poll_options_b_client_stamp before insert on public.poll_options for each row execute function private.stamp_new_row();
drop trigger if exists poll_options_c_links on public.poll_options;
create trigger poll_options_c_links before insert on public.poll_options for each row execute function private.guard_group_links();
drop trigger if exists poll_options_d_row_cap on public.poll_options;
create trigger poll_options_d_row_cap before insert on public.poll_options for each row execute function private.guard_simple_cap('10000');
drop trigger if exists poll_options_archive_on_delete on public.poll_options;
create trigger poll_options_archive_on_delete before delete on public.poll_options
  for each row execute function private.archive_instead_of_delete();
drop trigger if exists poll_options_bulk_delete_guard on public.poll_options;
create trigger poll_options_bulk_delete_guard after delete on public.poll_options
  referencing old table as gone for each statement execute function private.guard_bulk_delete();

drop trigger if exists poll_votes_a_set_crew on public.poll_votes;
create trigger poll_votes_a_set_crew before insert on public.poll_votes for each row execute function private.set_group_crew();
drop trigger if exists poll_votes_b_client_stamp on public.poll_votes;
create trigger poll_votes_b_client_stamp before insert on public.poll_votes for each row execute function private.stamp_new_row();
drop trigger if exists poll_votes_d_row_cap on public.poll_votes;
create trigger poll_votes_d_row_cap before insert on public.poll_votes for each row execute function private.guard_simple_cap('100000');

-- ─────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────

drop policy if exists wishes_open_select on public.wishes;
drop policy if exists wishes_open_insert on public.wishes;
drop policy if exists wishes_open_update on public.wishes;
drop policy if exists wishes_open_delete on public.wishes;
create policy wishes_open_select on public.wishes for select to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);
create policy wishes_open_insert on public.wishes for insert to anon, authenticated
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy wishes_open_update on public.wishes for update to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null)
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy wishes_open_delete on public.wishes for delete to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);

drop policy if exists wish_interest_open_select on public.wish_interest;
drop policy if exists wish_interest_open_insert on public.wish_interest;
drop policy if exists wish_interest_open_delete on public.wish_interest;
create policy wish_interest_open_select on public.wish_interest for select to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);
create policy wish_interest_open_insert on public.wish_interest for insert to anon, authenticated
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy wish_interest_open_delete on public.wish_interest for delete to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);

drop policy if exists polls_open_select on public.polls;
drop policy if exists polls_open_insert on public.polls;
drop policy if exists polls_open_update on public.polls;
drop policy if exists polls_open_delete on public.polls;
create policy polls_open_select on public.polls for select to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);
create policy polls_open_insert on public.polls for insert to anon, authenticated
  with check (crew_id = (select private.default_group()) and archived_at is null and closed_at is null);
create policy polls_open_update on public.polls for update to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null)
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy polls_open_delete on public.polls for delete to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);

drop policy if exists poll_options_open_select on public.poll_options;
drop policy if exists poll_options_open_insert on public.poll_options;
drop policy if exists poll_options_open_delete on public.poll_options;
create policy poll_options_open_select on public.poll_options for select to anon, authenticated
  using (
    crew_id = (select private.default_group()) and archived_at is null
    and exists (select 1 from public.polls p where p.id = poll_options.poll_id and p.archived_at is null)
  );
create policy poll_options_open_insert on public.poll_options for insert to anon, authenticated
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy poll_options_open_delete on public.poll_options for delete to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);

drop policy if exists poll_votes_open_select on public.poll_votes;
drop policy if exists poll_votes_open_insert on public.poll_votes;
create policy poll_votes_open_select on public.poll_votes for select to anon, authenticated
  using (
    crew_id = (select private.default_group()) and archived_at is null
    and exists (select 1 from public.polls p where p.id = poll_votes.poll_id and p.archived_at is null)
  );
-- Votes only go in through cast_vote() (checks the ballot); the direct insert stays open to it via RLS.
create policy poll_votes_open_insert on public.poll_votes for insert to anon, authenticated
  with check (crew_id = (select private.default_group()) and archived_at is null);

-- ─────────────────────────────────────────────────────────────
-- Column privileges
-- ─────────────────────────────────────────────────────────────

revoke update on public.wishes, public.wish_interest, public.polls, public.poll_options, public.poll_votes from anon, authenticated;
grant select, insert, delete on public.wishes, public.wish_interest, public.polls, public.poll_options to anon, authenticated;
revoke insert, delete on public.poll_votes from anon, authenticated;
grant select on public.poll_votes to anon, authenticated;
grant update (title, artist, members_count, difficulty, comment, added_video_id) on public.wishes to anon, authenticated;
grant update (title, results_live, anonymous, closes_at, closed_at, winner_wish_id) on public.polls to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Voting (F11): one ballot per person, replaced atomically while the poll is open. SECURITY DEFINER because votes
-- are not writable directly (so a script can't stuff the ballot box with rows); it checks everything itself.
-- ─────────────────────────────────────────────────────────────

create or replace function public.cast_vote(p_poll uuid, p_member uuid, p_options uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poll  public.polls;
  v_n     int := coalesce(array_length(p_options, 1), 0);
  v_valid int;
  i       int;
begin
  select * into v_poll from public.polls
  where id = p_poll and crew_id = private.default_group() and archived_at is null
  for update;
  if v_poll.id is null then
    raise exception 'poll_not_found' using errcode = 'P0001';
  end if;
  if v_poll.closed_at is not null or (v_poll.closes_at is not null and v_poll.closes_at <= now()) then
    raise exception 'poll_closed' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.members m where m.id = p_member and m.crew_id = v_poll.crew_id and m.archived_at is null) then
    raise exception 'vote_member_invalid' using errcode = 'P0001';
  end if;
  if v_n > 0 then
    select count(distinct o.id) into v_valid from public.poll_options o
    where o.poll_id = p_poll and o.archived_at is null and o.id = any (p_options);
    if v_valid <> v_n then
      raise exception 'vote_options_invalid' using errcode = 'P0001';
    end if;
  end if;
  if v_poll.vote_type = 'single' and v_n > 1 then
    raise exception 'vote_options_invalid' using errcode = 'P0001';
  end if;
  -- The previous ballot is archived (kept), the new one written; an empty array withdraws the vote.
  update public.poll_votes set archived_at = now()
  where poll_id = p_poll and member_id = p_member and archived_at is null;
  for i in 1 .. v_n loop
    insert into public.poll_votes (poll_id, crew_id, option_id, member_id, rank)
    values (p_poll, v_poll.crew_id, p_options[i], p_member, case when v_poll.vote_type = 'ranking' then i end);
  end loop;
  return v_n;
end;
$$;

revoke execute on function public.cast_vote(uuid, uuid, uuid[]) from public;
grant execute on function public.cast_vote(uuid, uuid, uuid[]) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Bags of songs can hold wishes too (F13 «canciones de la biblioteca o de la lista de deseos»)
-- ─────────────────────────────────────────────────────────────

alter table public.bag_items add column if not exists wish_id uuid references public.wishes (id) on delete cascade;
create index if not exists bag_items_wish_idx on public.bag_items (wish_id);
alter table public.bag_items drop constraint if exists bag_items_one_ref;
alter table public.bag_items add constraint bag_items_one_ref check (num_nonnulls(video_id, clip_id, member_id, wish_id) = 1);
drop index if exists public.bag_items_once_key;
create unique index if not exists bag_items_once_key
  on public.bag_items (bag_id, coalesce(video_id, clip_id, member_id, wish_id)) where archived_at is null;

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
  if (v_kind = 'songs' and not (
        (new.video_id is not null and exists (
          select 1 from public.videos v where v.id = new.video_id and v.crew_id = new.crew_id and v.archived_at is null))
        or (new.wish_id is not null and exists (
          select 1 from public.wishes w where w.id = new.wish_id and w.crew_id = new.crew_id and w.archived_at is null))))
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

drop policy if exists bag_items_open_select on public.bag_items;
create policy bag_items_open_select on public.bag_items for select to anon, authenticated
  using (
    crew_id = (select private.default_group()) and archived_at is null
    and exists (select 1 from public.bags b where b.id = bag_items.bag_id and b.archived_at is null)
    and (video_id is null or exists (select 1 from public.videos v where v.id = bag_items.video_id and v.archived_at is null))
    and (clip_id is null or exists (
      select 1 from public.clips c join public.videos v on v.id = c.video_id
      where c.id = bag_items.clip_id and c.archived_at is null and v.archived_at is null))
    and (member_id is null or exists (select 1 from public.members m where m.id = bag_items.member_id and m.archived_at is null))
    and (wish_id is null or exists (select 1 from public.wishes w where w.id = bag_items.wish_id and w.archived_at is null))
  );

-- draw_from_bag labels wishes too.
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
  perform set_config('app.bag_draw', '1', true);
  select * into v_bag from public.bags where id = p_bag and archived_at is null for update;
  if v_bag.id is null then
    raise exception 'bag_not_found' using errcode = 'P0001';
  end if;
  v_remove := coalesce(p_remove, v_bag.draw_mode = 'remove');
  if v_bag.no_repeat then
    select d.item_id into v_last from public.bag_draws d where d.bag_id = p_bag order by d.seq desc limit 1;
  end if;
  for v_item in
    select i.*
    from public.bag_items i
    where i.bag_id = p_bag and i.removed_at is null
    order by (i.id = v_last) nulls first, random()
    limit greatest(1, least(coalesce(p_count, 1), 10))
  loop
    select coalesce(
      (select v.title from public.videos v where v.id = v_item.video_id),
      (select w.title from public.wishes w where w.id = v_item.wish_id),
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
  perform set_config('app.bag_draw', '', true);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- archive_row knows the new tables
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
  elsif p_table = 'polls' then
    update public.polls        set archived_at = now() where id = p_id and archived_at is null;
    update public.poll_options set archived_at = now() where poll_id = p_id and archived_at is null;
  elsif p_table in ('clips', 'notes', 'members', 'takes', 'bag_items', 'track_items', 'wishes', 'wish_interest',
                    'poll_options') then
    execute format('update public.%I set archived_at = now() where id = $1 and archived_at is null', p_table)
      using p_id;
  else
    raise exception 'archive_row: unexpected table %', p_table;
  end if;
end;
$$;

revoke execute on function private.guard_group_links() from public, anon, authenticated;
revoke execute on function private.guard_poll_update() from public, anon, authenticated;
grant execute on function private.archive_row(text, uuid) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Review round 1 (database): ballots can't grow the table, options are fixed once voting starts, polls can't be
-- born closed or reopened, and closing freezes anonymity and results visibility too.
-- ─────────────────────────────────────────────────────────────
-- (a) one row per (poll, member, option) for ever: a changed ballot flips archived_at / rank, the table can't grow by re-voting
drop index if exists public.poll_votes_once_key;
create unique index if not exists poll_votes_once_key on public.poll_votes (poll_id, member_id, option_id);

create or replace function public.cast_vote(p_poll uuid, p_member uuid, p_options uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poll  public.polls;
  v_n     int := coalesce(array_length(p_options, 1), 0);
  v_valid int;
  v_rank  int;
  i       int;
begin
  select * into v_poll from public.polls
  where id = p_poll and crew_id = private.default_group() and archived_at is null
  for update;
  if v_poll.id is null then
    raise exception 'poll_not_found' using errcode = 'P0001';
  end if;
  if v_poll.closed_at is not null or (v_poll.closes_at is not null and v_poll.closes_at <= now()) then
    raise exception 'poll_closed' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.members m where m.id = p_member and m.crew_id = v_poll.crew_id and m.archived_at is null) then
    raise exception 'vote_member_invalid' using errcode = 'P0001';
  end if;
  if v_n > 0 then
    select count(distinct o.id) into v_valid from public.poll_options o
    where o.poll_id = p_poll and o.archived_at is null and o.id = any (p_options);
    if v_valid <> v_n then
      raise exception 'vote_options_invalid' using errcode = 'P0001';
    end if;
  end if;
  if v_poll.vote_type = 'single' and v_n > 1 then
    raise exception 'vote_options_invalid' using errcode = 'P0001';
  end if;
  update public.poll_votes set archived_at = now()
  where poll_id = p_poll and member_id = p_member and archived_at is null
    and (v_n = 0 or option_id <> all (p_options));
  -- A candidate whose wish was deleted meanwhile is skipped (the rest of the ballot still counts, ranks close up).
  v_rank := 0;
  for i in 1 .. v_n loop
    continue when not exists (
      select 1 from public.poll_options o join public.wishes w on w.id = o.wish_id and w.archived_at is null
      where o.id = p_options[i]
    );
    v_rank := v_rank + 1;
    insert into public.poll_votes (poll_id, crew_id, option_id, member_id, rank)
    values (p_poll, v_poll.crew_id, p_options[i], p_member, case when v_poll.vote_type = 'ranking' then v_rank end)
    on conflict (poll_id, member_id, option_id)
    do update set archived_at = null, rank = excluded.rank, created_at = now();
  end loop;
  return v_n;
end;
$$;

-- (b) options: never on a closed/expired poll, never once it has votes, at most 50; the client can't remove them
revoke delete on public.poll_options from anon, authenticated;
drop policy if exists poll_options_open_delete on public.poll_options;

create or replace function private.guard_option_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user::text not in ('anon', 'authenticated') then
    return new;
  end if;
  if exists (select 1 from public.poll_votes v where v.poll_id = new.poll_id and v.archived_at is null)
     or exists (select 1 from public.polls p where p.id = new.poll_id and p.closes_at is not null and p.closes_at <= now()) then
    raise exception 'poll_closed' using errcode = 'P0001';
  end if;
  if (select count(*) from public.poll_options o where o.poll_id = new.poll_id and o.archived_at is null) >= 50 then
    raise exception 'poll_options_cap_reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function private.guard_option_insert() from public, anon, authenticated;
drop trigger if exists poll_options_c2_open on public.poll_options;
create trigger poll_options_c2_open before insert on public.poll_options for each row execute function private.guard_option_insert();

-- (c) polls: no winner/closed on insert (column grant); closed = frozen incl. anonymous/results_live; expired can't be reopened by moving closes_at
revoke insert on public.polls from anon, authenticated;
grant insert (id, title, vote_type, results_live, anonymous, closes_at, parent_poll_id, created_by_member_id) on public.polls to anon, authenticated;

create or replace function private.guard_poll_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user::text not in ('anon', 'authenticated') then
    return new;
  end if;
  if old.closed_at is not null then
    if new.closed_at is distinct from old.closed_at or new.winner_wish_id is distinct from old.winner_wish_id
       or new.vote_type is distinct from old.vote_type or new.closes_at is distinct from old.closes_at
       or new.anonymous is distinct from old.anonymous or new.results_live is distinct from old.results_live then
      raise exception 'poll_closed' using errcode = 'P0001';
    end if;
  elsif old.closes_at is not null and old.closes_at <= now() and new.closes_at is distinct from old.closes_at then
    raise exception 'poll_closed' using errcode = 'P0001';
  elsif new.closed_at is not null then
    new.closed_at := now();
  end if;
  if new.vote_type is distinct from old.vote_type
     and exists (select 1 from public.poll_votes v where v.poll_id = new.id and v.archived_at is null) then
    raise exception 'poll_has_votes' using errcode = 'P0001';
  end if;
  if new.winner_wish_id is not null and new.winner_wish_id is distinct from old.winner_wish_id and (
    new.closed_at is null
    or not exists (select 1 from public.poll_options o where o.poll_id = new.id and o.wish_id = new.winner_wish_id and o.archived_at is null)
  ) then
    raise exception 'poll_winner_invalid' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop policy if exists poll_votes_open_insert on public.poll_votes;

revoke execute on function private.guard_poll_update() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Interface review round 1: closing counts the votes on the server, at the moment of closing (a phone's cached
-- tally must never pick the winner). SECURITY INVOKER: it runs with the caller's own permissions.
--   p_resolve 'auto' : one winner → close with it; a tie → nothing changes, returns the tied wishes.
--   p_resolve 'pick' : close with p_winner, which must be one of the tied leaders (the tie-break draw).
--   p_resolve 'none' : close without a winner (a second round was started between the tied ones).
-- Ranking points: n − position + 1, n = live candidates.
-- ─────────────────────────────────────────────────────────────

create or replace function public.close_poll(p_poll uuid, p_resolve text default 'auto', p_winner uuid default null)
returns json
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_poll   public.polls;
  v_n      int;
  v_top    numeric;
  v_leaders uuid[];
begin
  select * into v_poll from public.polls where id = p_poll and archived_at is null for update;
  if v_poll.id is null then
    raise exception 'poll_not_found' using errcode = 'P0001';
  end if;
  if v_poll.closed_at is not null then
    return json_build_object('status', 'closed', 'winner', v_poll.winner_wish_id, 'tied', '[]'::json);
  end if;
  select count(*) into v_n from public.poll_options o
  join public.wishes w on w.id = o.wish_id and w.archived_at is null
  where o.poll_id = p_poll and o.archived_at is null;

  with scores as (
    select o.wish_id,
           coalesce(sum(case when v_poll.vote_type = 'ranking' then v_n - v.rank + 1 else 1 end), 0) as score
    from public.poll_options o
    join public.wishes w on w.id = o.wish_id and w.archived_at is null
    left join public.poll_votes v on v.option_id = o.id and v.archived_at is null
    where o.poll_id = p_poll and o.archived_at is null
    group by o.wish_id
  )
  select max(score), array_agg(wish_id order by wish_id) filter (where score = (select max(score) from scores))
  into v_top, v_leaders
  from scores;

  if p_resolve = 'none' then
    update public.polls set closed_at = now() where id = p_poll;
    return json_build_object('status', 'closed', 'winner', null, 'tied', coalesce(to_json(v_leaders), '[]'::json));
  end if;
  if p_resolve = 'pick' then
    if p_winner is null or not (p_winner = any (coalesce(v_leaders, '{}'))) then
      raise exception 'poll_winner_invalid' using errcode = 'P0001';
    end if;
    update public.polls set closed_at = now(), winner_wish_id = p_winner where id = p_poll;
    return json_build_object('status', 'closed', 'winner', p_winner, 'tied', to_json(v_leaders));
  end if;
  if v_leaders is null or coalesce(v_top, 0) = 0 then
    -- Nobody voted: closes without a winner.
    update public.polls set closed_at = now() where id = p_poll;
    return json_build_object('status', 'closed', 'winner', null, 'tied', '[]'::json);
  end if;
  if array_length(v_leaders, 1) > 1 then
    return json_build_object('status', 'tie', 'winner', null, 'tied', to_json(v_leaders));
  end if;
  update public.polls set closed_at = now(), winner_wish_id = v_leaders[1] where id = p_poll;
  return json_build_object('status', 'closed', 'winner', v_leaders[1], 'tied', '[]'::json);
end;
$$;

revoke execute on function public.close_poll(uuid, text, uuid) from public;
grant execute on function public.close_poll(uuid, text, uuid) to anon, authenticated;
