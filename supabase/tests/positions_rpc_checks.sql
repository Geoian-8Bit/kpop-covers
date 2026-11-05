-- Checks for 20261031140000_positions_rpc_and_indexes.sql (REQ-20: atomic reorders and indexes).
-- Run the whole file in one go as postgres (SQL editor / MCP execute_sql, or `pnpm db:test`). Acts as `anon`,
-- prints `PASS …`, raises `FAIL …` on the first problem, ends with ROLLBACK.

begin;
insert into public.crews (id, name) values ('0d0d0d0d-0000-4000-8000-0000000003f1', 'Prueba orden otro grupo');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into public.videos (id, crew_id, title, source, youtube_id) values
  ('0d0d0d0d-0000-4000-8000-0000000003a1', (select private.default_group()), 'Prueba orden 1', 'youtube', 'zzOrder0001'),
  ('0d0d0d0d-0000-4000-8000-0000000003a2', (select private.default_group()), 'Prueba orden 2', 'youtube', 'zzOrder0002'),
  ('0d0d0d0d-0000-4000-8000-0000000003a3', (select private.default_group()), 'Prueba orden 3', 'youtube', 'zzOrder0003');
insert into public.clips (id, video_id, name, start_seconds, end_seconds) values
  ('0d0d0d0d-0000-4000-8000-0000000003c1', '0d0d0d0d-0000-4000-8000-0000000003a1', 'Prueba A', 0, 10),
  ('0d0d0d0d-0000-4000-8000-0000000003c2', '0d0d0d0d-0000-4000-8000-0000000003a1', 'Prueba B', 10, 20),
  ('0d0d0d0d-0000-4000-8000-0000000003c3', '0d0d0d0d-0000-4000-8000-0000000003a1', 'Prueba C', 20, 30);
insert into public.tracks (id, name) values
  ('0d0d0d0d-0000-4000-8000-0000000003d1', 'Prueba pista'),
  ('0d0d0d0d-0000-4000-8000-0000000003d2', 'Prueba otra pista');
insert into public.track_items (id, track_id, clip_id, position) values
  ('0d0d0d0d-0000-4000-8000-0000000003e1', '0d0d0d0d-0000-4000-8000-0000000003d1', '0d0d0d0d-0000-4000-8000-0000000003c1', 0),
  ('0d0d0d0d-0000-4000-8000-0000000003e2', '0d0d0d0d-0000-4000-8000-0000000003d1', '0d0d0d0d-0000-4000-8000-0000000003c2', 1),
  ('0d0d0d0d-0000-4000-8000-0000000003e3', '0d0d0d0d-0000-4000-8000-0000000003d1', '0d0d0d0d-0000-4000-8000-0000000003c3', 2),
  ('0d0d0d0d-0000-4000-8000-0000000003e4', '0d0d0d0d-0000-4000-8000-0000000003d2', '0d0d0d0d-0000-4000-8000-0000000003c1', 0),
  ('0d0d0d0d-0000-4000-8000-0000000003e5', '0d0d0d0d-0000-4000-8000-0000000003d1', '0d0d0d0d-0000-4000-8000-0000000003c1', 3);
insert into public.events (id, name, starts_at) values
  ('0d0d0d0d-0000-4000-8000-0000000003b1', 'Prueba evento', now() + interval '3 days'),
  ('0d0d0d0d-0000-4000-8000-0000000003b2', 'Prueba otro evento', now() + interval '4 days');
insert into public.event_songs (id, event_id, video_id, position) values
  ('0d0d0d0d-0000-4000-8000-000000000301', '0d0d0d0d-0000-4000-8000-0000000003b1', '0d0d0d0d-0000-4000-8000-0000000003a1', 0),
  ('0d0d0d0d-0000-4000-8000-000000000302', '0d0d0d0d-0000-4000-8000-0000000003b1', '0d0d0d0d-0000-4000-8000-0000000003a2', 1),
  ('0d0d0d0d-0000-4000-8000-000000000303', '0d0d0d0d-0000-4000-8000-0000000003b1', '0d0d0d0d-0000-4000-8000-0000000003a3', 2),
  ('0d0d0d0d-0000-4000-8000-000000000304', '0d0d0d0d-0000-4000-8000-0000000003b2', '0d0d0d0d-0000-4000-8000-0000000003a1', 0);

-- An archived item of the track (deleting archives).
delete from public.track_items where id = '0d0d0d0d-0000-4000-8000-0000000003e5';

-- Correct order: position = index in the list.
select public.set_track_positions('0d0d0d0d-0000-4000-8000-0000000003d1',
  array['0d0d0d0d-0000-4000-8000-0000000003e3', '0d0d0d0d-0000-4000-8000-0000000003e1', '0d0d0d0d-0000-4000-8000-0000000003e2']::uuid[]);
select public.set_event_song_positions('0d0d0d0d-0000-4000-8000-0000000003b1',
  array['0d0d0d0d-0000-4000-8000-000000000302', '0d0d0d0d-0000-4000-8000-000000000303', '0d0d0d0d-0000-4000-8000-000000000301']::uuid[]);
do $$
begin
  if (select string_agg(id::text, ',' order by position) from public.track_items
      where track_id = '0d0d0d0d-0000-4000-8000-0000000003d1')
     is distinct from '0d0d0d0d-0000-4000-8000-0000000003e3,0d0d0d0d-0000-4000-8000-0000000003e1,0d0d0d0d-0000-4000-8000-0000000003e2'
     or (select position from public.track_items where id = '0d0d0d0d-0000-4000-8000-0000000003e3') <> 0
     or (select position from public.track_items where id = '0d0d0d0d-0000-4000-8000-0000000003e2') <> 2 then
    raise exception 'FAIL set_track_positions did not write the order';
  end if;
  if (select string_agg(id::text, ',' order by position) from public.event_songs
      where event_id = '0d0d0d0d-0000-4000-8000-0000000003b1')
     is distinct from '0d0d0d0d-0000-4000-8000-000000000302,0d0d0d0d-0000-4000-8000-000000000303,0d0d0d0d-0000-4000-8000-000000000301' then
    raise exception 'FAIL set_event_song_positions did not write the order';
  end if;
  if (select position from public.track_items where id = '0d0d0d0d-0000-4000-8000-0000000003e4') <> 0
     or (select position from public.event_songs where id = '0d0d0d0d-0000-4000-8000-000000000304') <> 0 then
    raise exception 'FAIL a reorder touched another track / event';
  end if;
  raise notice 'PASS both RPC write position = index of the list';
end $$;

-- Invalid lists: foreign id (other track / event), archived item, empty, null, repeats, unknown container.
-- Each one raises its *_invalid error and leaves the order as it was.
do $$
declare
  t uuid := '0d0d0d0d-0000-4000-8000-0000000003d1';
  e uuid := '0d0d0d0d-0000-4000-8000-0000000003b1';
  bad uuid[];
  lists uuid[][] := array[
    array['0d0d0d0d-0000-4000-8000-0000000003e1', '0d0d0d0d-0000-4000-8000-0000000003e4']::uuid[],
    array['0d0d0d0d-0000-4000-8000-0000000003e1', '0d0d0d0d-0000-4000-8000-0000000003e5']::uuid[],
    array['0d0d0d0d-0000-4000-8000-0000000003e1', '0d0d0d0d-0000-4000-8000-0000000003e1']::uuid[],
    array['0d0d0d0d-0000-4000-8000-0000000003e1', null]::uuid[]
  ];
  before_t text;
  before_e text;
  n int := 0;
begin
  select string_agg(id::text || '@' || position, ',' order by id) into before_t from public.track_items where track_id = t;
  select string_agg(id::text || '@' || position, ',' order by id) into before_e from public.event_songs where event_id = e;
  foreach bad slice 1 in array lists loop
    begin
      perform public.set_track_positions(t, bad);
      raise exception 'FAIL set_track_positions accepted %', bad;
    exception when raise_exception then
      if sqlerrm <> 'track_positions_invalid' then raise; end if;
      n := n + 1;
    end;
  end loop;
  begin
    perform public.set_track_positions(t, array[]::uuid[]);
    raise exception 'FAIL set_track_positions accepted an empty list';
  exception when raise_exception then
    if sqlerrm <> 'track_positions_invalid' then raise; end if;
  end;
  begin
    perform public.set_track_positions(t, null);
    raise exception 'FAIL set_track_positions accepted null';
  exception when raise_exception then
    if sqlerrm <> 'track_positions_invalid' then raise; end if;
  end;
  begin
    perform public.set_track_positions('0d0d0d0d-0000-4000-8000-0000000003d2', array['0d0d0d0d-0000-4000-8000-0000000003e1']::uuid[]);
    raise exception 'FAIL set_track_positions accepted an item of another track';
  exception when raise_exception then
    if sqlerrm <> 'track_positions_invalid' then raise; end if;
  end;
  begin
    perform public.set_event_song_positions(e,
      array['0d0d0d0d-0000-4000-8000-000000000301', '0d0d0d0d-0000-4000-8000-000000000304']::uuid[]);
    raise exception 'FAIL set_event_song_positions accepted a song of another event';
  exception when raise_exception then
    if sqlerrm <> 'event_song_positions_invalid' then raise; end if;
  end;
  begin
    perform public.set_event_song_positions(e,
      array['0d0d0d0d-0000-4000-8000-000000000301', '0d0d0d0d-0000-4000-8000-000000000301']::uuid[]);
    raise exception 'FAIL set_event_song_positions accepted repeats';
  exception when raise_exception then
    if sqlerrm <> 'event_song_positions_invalid' then raise; end if;
  end;
  begin
    perform public.set_event_song_positions(e, array[]::uuid[]);
    raise exception 'FAIL set_event_song_positions accepted an empty list';
  exception when raise_exception then
    if sqlerrm <> 'event_song_positions_invalid' then raise; end if;
  end;
  if n <> 4 then raise exception 'FAIL expected 4 rejected track lists, got %', n; end if;
  if (select string_agg(id::text || '@' || position, ',' order by id) from public.track_items where track_id = t) <> before_t
     or (select string_agg(id::text || '@' || position, ',' order by id) from public.event_songs where event_id = e) <> before_e then
    raise exception 'FAIL a rejected list changed positions';
  end if;
  raise notice 'PASS foreign, archived, repeated, null and empty lists are rejected with *_invalid and change nothing';
end $$;

-- RLS decides: an item moved to another group, or the items of an archived track / event, cannot be reordered.
reset role;
update public.track_items set crew_id = '0d0d0d0d-0000-4000-8000-0000000003f1' where id = '0d0d0d0d-0000-4000-8000-0000000003e2';
update public.event_songs set crew_id = '0d0d0d0d-0000-4000-8000-0000000003f1' where id = '0d0d0d0d-0000-4000-8000-000000000303';
set local role anon;
do $$
begin
  begin
    perform public.set_track_positions('0d0d0d0d-0000-4000-8000-0000000003d1',
      array['0d0d0d0d-0000-4000-8000-0000000003e2', '0d0d0d0d-0000-4000-8000-0000000003e1']::uuid[]);
    raise exception 'FAIL an item of another group was reordered';
  exception when raise_exception then
    if sqlerrm <> 'track_positions_invalid' then raise; end if;
  end;
  begin
    perform public.set_event_song_positions('0d0d0d0d-0000-4000-8000-0000000003b1',
      array['0d0d0d0d-0000-4000-8000-000000000303', '0d0d0d0d-0000-4000-8000-000000000301']::uuid[]);
    raise exception 'FAIL a song of another group was reordered';
  exception when raise_exception then
    if sqlerrm <> 'event_song_positions_invalid' then raise; end if;
  end;
end $$;
delete from public.tracks where id = '0d0d0d0d-0000-4000-8000-0000000003d2';
delete from public.events where id = '0d0d0d0d-0000-4000-8000-0000000003b2';
do $$
begin
  begin
    perform public.set_track_positions('0d0d0d0d-0000-4000-8000-0000000003d2', array['0d0d0d0d-0000-4000-8000-0000000003e4']::uuid[]);
    raise exception 'FAIL an archived track was reordered';
  exception when raise_exception then
    if sqlerrm <> 'track_positions_invalid' then raise; end if;
  end;
  begin
    perform public.set_event_song_positions('0d0d0d0d-0000-4000-8000-0000000003b2', array['0d0d0d0d-0000-4000-8000-000000000304']::uuid[]);
    raise exception 'FAIL an archived event was reordered';
  exception when raise_exception then
    if sqlerrm <> 'event_song_positions_invalid' then raise; end if;
  end;
  if exists (select 1 from pg_catalog.pg_proc p
             where p.oid in ('public.set_track_positions(uuid, uuid[])'::regprocedure,
                             'public.set_event_song_positions(uuid, uuid[])'::regprocedure,
                             'public.poll_votes_signature(uuid)'::regprocedure)
               and p.prosecdef) then
    raise exception 'FAIL the REQ-19/20 functions must be security invoker';
  end if;
  raise notice 'PASS the RPC respect RLS (other group, archived track / event) and run as invoker';
end $$;

-- REQ-20 · The four new indexes serve the app's real queries (as anon, so RLS adds the group and archive filters).
-- The planner's choice depends on table sizes, so plans that could still pick a scan and sort are steadied by
-- turning those off for this check only: what is checked is that each index fits its query (filter and order).
do $$
declare
  checks constant text[] := array[
    'polls_crew_created_idx',  'select * from public.polls order by created_at desc',
    'tracks_crew_updated_idx', 'select * from public.tracks order by updated_at desc',
    'clips_crew_created_idx',  'select * from public.clips order by created_at, id limit 1000 offset 0',
    'bag_items_youtube_idx',   'select id, bag_id from public.bag_items where youtube_id = ''zzOrder0001'' and video_id is null'
  ];
  line text;
  plan text;
begin
  perform set_config('enable_seqscan', 'off', true);
  perform set_config('enable_sort', 'off', true);
  perform set_config('enable_bitmapscan', 'off', true);
  for i in 1 .. array_length(checks, 1) / 2 loop
    plan := '';
    for line in execute 'explain ' || checks[2 * i] loop
      plan := plan || line || E'\n';
    end loop;
    if position(checks[2 * i - 1] in plan) = 0 then
      raise exception 'FAIL % is not used by: %', checks[2 * i - 1], checks[2 * i] using detail = plan;
    end if;
  end loop;
  perform set_config('enable_seqscan', 'on', true);
  perform set_config('enable_sort', 'on', true);
  perform set_config('enable_bitmapscan', 'on', true);
  raise notice 'PASS the polls, tracks, clips and YouTube-song queries use their new indexes';
end $$;

rollback;
