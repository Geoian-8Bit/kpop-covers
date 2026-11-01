-- One Shoot · Reordenaciones atómicas e índices (REQ-20).
-- 1) Reordering a track or an event's set list sent one PATCH per item (30 items = 30 requests, not atomic: a failure
--    halfway left a mixed order). Two RPC now write the whole order in one statement, all or nothing.
-- 2) Indexes for real queries that had none (checked with `explain` in PGlite, see the checks file).
--
-- SECURITY INVOKER: RLS and the column grants decide, exactly as with the direct updates they replace (anon can
-- update `position` of live rows of the default group; the existing guards still run on `update of position`).
-- Rules: the list is not empty, has no repeats and every id is a live item of that (live, visible) track / event;
-- otherwise `track_positions_invalid` / `event_song_positions_invalid` and nothing changes. Position = index in the
-- list (0-based, what the client sent before). A list longer than 1000 hits the existing position check (23514).
-- Additive: nothing else changes. Indexes use `if not exists` and no `concurrently` (migrations run in a transaction).
-- Checks: supabase/tests/positions_rpc_checks.sql.

create or replace function public.set_track_positions(p_track uuid, p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_n     int := coalesce(array_length(p_ids, 1), 0);
  v_valid int;
  v_done  int;
begin
  if v_n = 0
     or (select count(distinct x) from unnest(p_ids) x) <> v_n
     or not exists (select 1 from public.tracks t where t.id = p_track and t.archived_at is null) then
    raise exception 'track_positions_invalid' using errcode = 'P0001';
  end if;
  select count(*) into v_valid from public.track_items i
  where i.track_id = p_track and i.archived_at is null and i.id = any (p_ids);
  if v_valid <> v_n then
    raise exception 'track_positions_invalid' using errcode = 'P0001';
  end if;
  update public.track_items i set position = o.ord - 1
  from unnest(p_ids) with ordinality as o (id, ord)
  where i.id = o.id and i.track_id = p_track and i.archived_at is null;
  get diagnostics v_done = row_count;
  -- RLS could still hide a row from the update that the select let through; never leave a partial order.
  if v_done <> v_n then
    raise exception 'track_positions_invalid' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.set_track_positions(uuid, uuid[]) from public;
grant execute on function public.set_track_positions(uuid, uuid[]) to anon, authenticated;

create or replace function public.set_event_song_positions(p_event uuid, p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_n     int := coalesce(array_length(p_ids, 1), 0);
  v_valid int;
  v_done  int;
begin
  if v_n = 0
     or (select count(distinct x) from unnest(p_ids) x) <> v_n
     or not exists (select 1 from public.events e where e.id = p_event and e.archived_at is null) then
    raise exception 'event_song_positions_invalid' using errcode = 'P0001';
  end if;
  select count(*) into v_valid from public.event_songs s
  where s.event_id = p_event and s.archived_at is null and s.id = any (p_ids);
  if v_valid <> v_n then
    raise exception 'event_song_positions_invalid' using errcode = 'P0001';
  end if;
  update public.event_songs s set position = o.ord - 1
  from unnest(p_ids) with ordinality as o (id, ord)
  where s.id = o.id and s.event_id = p_event and s.archived_at is null;
  get diagnostics v_done = row_count;
  if v_done <> v_n then
    raise exception 'event_song_positions_invalid' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.set_event_song_positions(uuid, uuid[]) from public;
grant execute on function public.set_event_song_positions(uuid, uuid[]) to anon, authenticated;

-- YouTube items of bags (added from search, not from the library) are looked up by video id.
create index if not exists bag_items_youtube_idx on public.bag_items (youtube_id)
  where archived_at is null and video_id is null;
-- Poll list: newest first within the group.
create index if not exists polls_crew_created_idx on public.polls (crew_id, created_at desc);
-- Track list: last edited first within the group.
create index if not exists tracks_crew_updated_idx on public.tracks (crew_id, updated_at desc);
-- Clip list: paged in creation order with the id as tie-breaker.
create index if not exists clips_crew_created_idx on public.clips (crew_id, created_at, id);
