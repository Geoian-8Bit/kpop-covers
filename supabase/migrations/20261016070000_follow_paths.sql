-- One Shoot · ideas, fase 5: F10 (seguir a un bailarín).
-- Additive: a new table and one nullable column on clips.
--
--  follow_paths  where one dancer is in a video over time, computed once (on the device that analysed the linked
--                file) or placed by hand («modo manual»), and shared: the rest of the group uses it without
--                recomputing. keyframes is a JSON array of [seconds, x, y, w, h] with the box as fractions of the
--                frame (0…1), sorted by time; corrections recompute from a point and rewrite it.
--  clips.follow_path_id  «un clip puede guardarse siguiendo a X»: it opens zoomed on that dancer.

create table if not exists public.follow_paths (
  id          uuid primary key default gen_random_uuid(),
  crew_id     uuid not null references public.crews (id) on delete cascade,
  video_id    uuid not null references public.videos (id) on delete cascade,
  label       text not null check (char_length(btrim(label)) between 1 and 40),
  member_id   uuid references public.members (id) on delete set null,
  source      text not null default 'auto' check (source in ('auto', 'manual')),
  model       text check (model is null or char_length(model) <= 60),
  keyframes   jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz,
  constraint follow_paths_keyframes_shape check (
    jsonb_typeof(keyframes) = 'array' and pg_column_size(keyframes) <= 600000
  )
);
create index if not exists follow_paths_video_idx on public.follow_paths (video_id);
create index if not exists follow_paths_crew_idx on public.follow_paths (crew_id);
create index if not exists follow_paths_member_idx on public.follow_paths (member_id);

alter table public.follow_paths enable row level security;

alter table public.clips add column if not exists follow_path_id uuid references public.follow_paths (id) on delete set null;
create index if not exists clips_follow_path_idx on public.clips (follow_path_id);

-- The path belongs to its video's group; the member (who is followed) must be a live member; a clip can only
-- follow a path of its own song.
create or replace function private.guard_follow_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'follow_paths' then
    select v.crew_id into new.crew_id from public.videos v where v.id = new.video_id and v.archived_at is null;
    if new.crew_id is null then
      raise exception 'video % not found', new.video_id;
    end if;
    if new.member_id is not null and not exists (
      select 1 from public.members m where m.id = new.member_id and m.crew_id = new.crew_id and m.archived_at is null
    ) then
      new.member_id := null;
    end if;
  elsif tg_table_name = 'clips' then
    if new.follow_path_id is not null and not exists (
      select 1 from public.follow_paths f
      where f.id = new.follow_path_id and f.video_id = new.video_id and f.archived_at is null
    ) then
      new.follow_path_id := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists follow_paths_a_links on public.follow_paths;
create trigger follow_paths_a_links before insert or update of video_id, member_id on public.follow_paths
  for each row execute function private.guard_follow_links();
drop trigger if exists follow_paths_b_client_stamp on public.follow_paths;
create trigger follow_paths_b_client_stamp before insert on public.follow_paths
  for each row execute function private.stamp_new_row();
drop trigger if exists follow_paths_c_row_cap on public.follow_paths;
create trigger follow_paths_c_row_cap before insert on public.follow_paths
  for each row execute function private.guard_simple_cap('500');
drop trigger if exists follow_paths_touch on public.follow_paths;
create trigger follow_paths_touch before update on public.follow_paths
  for each row execute function public.touch_updated_at();
drop trigger if exists follow_paths_archive_on_delete on public.follow_paths;
create trigger follow_paths_archive_on_delete before delete on public.follow_paths
  for each row execute function private.archive_instead_of_delete();
drop trigger if exists follow_paths_bulk_delete_guard on public.follow_paths;
create trigger follow_paths_bulk_delete_guard after delete on public.follow_paths
  referencing old table as gone for each statement execute function private.guard_bulk_delete();

drop trigger if exists clips_zz_follow on public.clips;
create trigger clips_zz_follow before insert or update of follow_path_id on public.clips
  for each row execute function private.guard_follow_links();

drop policy if exists follow_paths_open_select on public.follow_paths;
drop policy if exists follow_paths_open_insert on public.follow_paths;
drop policy if exists follow_paths_open_update on public.follow_paths;
drop policy if exists follow_paths_open_delete on public.follow_paths;
create policy follow_paths_open_select on public.follow_paths for select to anon, authenticated
  using (
    crew_id = (select private.default_group()) and archived_at is null
    and exists (select 1 from public.videos v where v.id = follow_paths.video_id and v.archived_at is null)
  );
create policy follow_paths_open_insert on public.follow_paths for insert to anon, authenticated
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy follow_paths_open_update on public.follow_paths for update to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null)
  with check (crew_id = (select private.default_group()) and archived_at is null);
create policy follow_paths_open_delete on public.follow_paths for delete to anon, authenticated
  using (crew_id = (select private.default_group()) and archived_at is null);

revoke update on public.follow_paths from anon, authenticated;
grant select, insert, delete on public.follow_paths to anon, authenticated;
grant update (label, member_id, keyframes, model, source) on public.follow_paths to anon, authenticated;
grant update (follow_path_id) on public.clips to anon, authenticated;

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
                    'poll_options', 'event_songs', 'take_reactions', 'follow_paths') then
    execute format('update public.%I set archived_at = now() where id = $1 and archived_at is null', p_table)
      using p_id;
  else
    raise exception 'archive_row: unexpected table %', p_table;
  end if;
end;
$$;

revoke execute on function private.guard_follow_links() from public, anon, authenticated;
grant execute on function private.archive_row(text, uuid) to anon, authenticated;
