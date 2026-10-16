-- Checks for 20261016050000_events_and_reactions.sql (F16 events, F15 reactions).
-- Run the whole file in one go as postgres (SQL editor / MCP execute_sql, or `pnpm db:test`). Acts as `anon`,
-- prints `PASS …`, raises `FAIL …` on the first problem, ends with ROLLBACK.

begin;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into public.videos (id, crew_id, title, source, youtube_id)
values ('10101010-0000-4000-8000-0000000000a1', (select private.default_group()), 'Prueba evento', 'youtube', 'zzTestEvt01');
insert into public.members (id, name) values ('10101010-0000-4000-8000-0000000000b1', 'Prueba Ines');

-- Events and their repertoire.
insert into public.events (id, crew_id, name, starts_at, place)
values ('10101010-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'Showcase de diciembre',
        now() + interval '12 days', 'Sala Pop');
insert into public.event_songs (id, event_id, video_id, position)
values ('10101010-0000-4000-8000-000000000011', '10101010-0000-4000-8000-000000000001', '10101010-0000-4000-8000-0000000000a1', 0);
do $$
declare ok boolean := false;
begin
  if (select crew_id from public.events where id = '10101010-0000-4000-8000-000000000001') <> private.default_group() then
    raise exception 'FAIL event not in the default group';
  end if;
  begin
    insert into public.event_songs (event_id, video_id)
    values ('10101010-0000-4000-8000-000000000001', '10101010-0000-4000-8000-0000000000a1');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL the same song twice in an event'; end if;
  update public.event_songs set position = 3 where id = '10101010-0000-4000-8000-000000000011';
  update public.events set place = 'Sala Grande' where id = '10101010-0000-4000-8000-000000000001';
  raise notice 'PASS events keep their repertoire, once per song, editable';
end $$;

-- Archiving the song hides it from the repertoire; archiving the event archives its songs.
delete from public.videos where id = '10101010-0000-4000-8000-0000000000a1';
do $$
begin
  if exists (select 1 from public.event_songs where event_id = '10101010-0000-4000-8000-000000000001') then
    raise exception 'FAIL an archived song still shows in the repertoire';
  end if;
  raise notice 'PASS archived songs leave the repertoire';
end $$;
delete from public.events where id = '10101010-0000-4000-8000-000000000001';

-- Reactions: only on shared takes, one of each emoji per person, known emoji only.
insert into public.videos (id, crew_id, title, source, youtube_id)
values ('10101010-0000-4000-8000-0000000000a2', (select private.default_group()), 'Prueba reacción', 'youtube', 'zzTestEvt02');
insert into public.takes (id, video_id, song_start_seconds, duration_seconds)
values ('10101010-0000-4000-8000-000000000021', '10101010-0000-4000-8000-0000000000a2', 0, 10);
do $$
declare ok boolean := false;
begin
  begin
    insert into public.take_reactions (take_id, emoji) values ('10101010-0000-4000-8000-000000000021', '🔥');
  exception when others then ok := sqlerrm = 'reaction_take_invalid';
  end;
  if not ok then raise exception 'FAIL a reaction on a take that is not shared'; end if;
  raise notice 'PASS reactions only on shared takes';
end $$;
reset role;
update public.takes set shared_path = (select private.default_group())::text || '/10101010-0000-4000-8000-000000000021.mp4'
where id = '10101010-0000-4000-8000-000000000021';
set local role anon;
insert into public.take_reactions (take_id, member_id, emoji)
values ('10101010-0000-4000-8000-000000000021', '10101010-0000-4000-8000-0000000000b1', '🔥'),
       ('10101010-0000-4000-8000-000000000021', '10101010-0000-4000-8000-0000000000b1', '👏');
do $$
declare ok boolean := false;
begin
  begin
    insert into public.take_reactions (take_id, member_id, emoji)
    values ('10101010-0000-4000-8000-000000000021', '10101010-0000-4000-8000-0000000000b1', '🔥');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL the same reaction twice by one person'; end if;
  ok := false;
  begin
    insert into public.take_reactions (take_id, emoji) values ('10101010-0000-4000-8000-000000000021', '💩');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL an unknown emoji accepted'; end if;
  delete from public.take_reactions where take_id = '10101010-0000-4000-8000-000000000021' and emoji = '👏';
  if (select count(*) from public.take_reactions where take_id = '10101010-0000-4000-8000-000000000021') <> 1 then
    raise exception 'FAIL removing a reaction did not work';
  end if;
  raise notice 'PASS one reaction of each per person, known emoji, removable';
end $$;

reset role;
do $$
begin
  if (select count(*) from public.event_songs where event_id = '10101010-0000-4000-8000-000000000001' and archived_at is not null) <> 1
     or (select archived_at from public.events where id = '10101010-0000-4000-8000-000000000001') is null then
    raise exception 'FAIL deleting an event did not archive it with its songs';
  end if;
  raise notice 'PASS deleting an event archives it and its repertoire';
end $$;

rollback;
