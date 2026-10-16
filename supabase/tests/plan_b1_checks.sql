-- Checks for 20261016030000_bags_and_tracks.sql (F13 bags, F14 tracks).
-- Run the whole file in one go as postgres (SQL editor / MCP execute_sql, or `pnpm db:test`). Acts as `anon`,
-- prints `PASS …`, raises `FAIL …` on the first problem, ends with ROLLBACK.

begin;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into public.videos (id, crew_id, title, source, youtube_id)
values ('0e0e0e0e-0000-4000-8000-0000000000a1', (select private.default_group()), 'Prueba bolsa A', 'youtube', 'zzTestBag01'),
       ('0e0e0e0e-0000-4000-8000-0000000000a2', (select private.default_group()), 'Prueba bolsa B', 'youtube', 'zzTestBag02'),
       ('0e0e0e0e-0000-4000-8000-0000000000a3', (select private.default_group()), 'Prueba bolsa C', 'youtube', 'zzTestBag03');
insert into public.clips (id, video_id, crew_id, name, start_seconds, end_seconds)
values ('0e0e0e0e-0000-4000-8000-0000000000c1', '0e0e0e0e-0000-4000-8000-0000000000a1', (select private.default_group()), 'Estribillo', 10, 20);
insert into public.members (id, name) values ('0e0e0e0e-0000-4000-8000-0000000000b1', 'Prueba Flor');

-- Bags: group forced, names unique among live bags.
insert into public.bags (id, crew_id, name, kind, draw_mode)
values ('0e0e0e0e-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'Próxima coreo', 'songs', 'remove');
do $$
declare ok boolean := false;
begin
  if (select crew_id from public.bags where id = '0e0e0e0e-0000-4000-8000-000000000001') <> private.default_group() then
    raise exception 'FAIL bag not in the default group';
  end if;
  begin
    insert into public.bags (name, kind) values (' próxima COREO ', 'songs');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL duplicate bag name accepted'; end if;
  raise notice 'PASS bags belong to the group and have unique names';
end $$;

-- Items must match the bag's kind and be live; the same thing only once.
insert into public.bag_items (bag_id, video_id) values
  ('0e0e0e0e-0000-4000-8000-000000000001', '0e0e0e0e-0000-4000-8000-0000000000a1'),
  ('0e0e0e0e-0000-4000-8000-000000000001', '0e0e0e0e-0000-4000-8000-0000000000a2'),
  ('0e0e0e0e-0000-4000-8000-000000000001', '0e0e0e0e-0000-4000-8000-0000000000a3');
do $$
declare ok boolean := false;
begin
  begin
    insert into public.bag_items (bag_id, clip_id) values ('0e0e0e0e-0000-4000-8000-000000000001', '0e0e0e0e-0000-4000-8000-0000000000c1');
  exception when others then ok := sqlerrm = 'bag_item_invalid';
  end;
  if not ok then raise exception 'FAIL a clip went into a bag of songs'; end if;
  ok := false;
  begin
    insert into public.bag_items (bag_id, video_id) values ('0e0e0e0e-0000-4000-8000-000000000001', '0e0e0e0e-0000-4000-8000-0000000000a1');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL the same song went into a bag twice'; end if;
  raise notice 'PASS bag items match the bag kind, once each';
end $$;

-- Drawing with «se quita»: every draw takes one out; with none left, nothing comes out; «Rellenar» puts them back.
do $$
declare n int;
begin
  perform public.draw_from_bag('0e0e0e0e-0000-4000-8000-000000000001', 2, null, '0e0e0e0e-0000-4000-8000-0000000000b1');
  if (select count(*) from public.bag_items where bag_id = '0e0e0e0e-0000-4000-8000-000000000001' and removed_at is not null) <> 2 then
    raise exception 'FAIL a «se quita» draw did not take the items out';
  end if;
  if (select count(*) from public.bag_draws where bag_id = '0e0e0e0e-0000-4000-8000-000000000001' and removed
      and member_id = '0e0e0e0e-0000-4000-8000-0000000000b1') <> 2 then
    raise exception 'FAIL draws not recorded in the history';
  end if;
  select count(*) into n from public.draw_from_bag('0e0e0e0e-0000-4000-8000-000000000001', 5);
  if n <> 1 then raise exception 'FAIL drew % items, only 1 was left', n; end if;
  select count(*) into n from public.draw_from_bag('0e0e0e0e-0000-4000-8000-000000000001');
  if n <> 0 then raise exception 'FAIL drew from an empty bag'; end if;
  update public.bag_items set removed_at = null where bag_id = '0e0e0e0e-0000-4000-8000-000000000001';
  select count(*) into n from public.draw_from_bag('0e0e0e0e-0000-4000-8000-000000000001', 1, false);
  if n <> 1 or (select count(*) from public.bag_items where bag_id = '0e0e0e0e-0000-4000-8000-000000000001' and removed_at is not null) <> 0 then
    raise exception 'FAIL «Devolver» or «Rellenar» did not work';
  end if;
  raise notice 'PASS draws take out (or not), history kept, empty bag draws nothing, refill works';
end $$;

-- «Sin repetir seguidas» on a bag that keeps: never the same item twice in a row.
insert into public.bags (id, name, kind, draw_mode, no_repeat)
values ('0e0e0e0e-0000-4000-8000-000000000002', 'Calentar', 'songs', 'keep', true);
insert into public.bag_items (bag_id, video_id) values
  ('0e0e0e0e-0000-4000-8000-000000000002', '0e0e0e0e-0000-4000-8000-0000000000a1'),
  ('0e0e0e0e-0000-4000-8000-000000000002', '0e0e0e0e-0000-4000-8000-0000000000a2');
do $$
declare prev uuid; cur uuid; i int;
begin
  for i in 1..12 loop
    select item_id into cur from public.draw_from_bag('0e0e0e0e-0000-4000-8000-000000000002');
    if prev is not null and cur = prev then raise exception 'FAIL the same item came out twice in a row'; end if;
    prev := cur;
  end loop;
  if exists (select 1 from public.bag_items where bag_id = '0e0e0e0e-0000-4000-8000-000000000002' and removed_at is not null) then
    raise exception 'FAIL a «se queda» bag lost items';
  end if;
  raise notice 'PASS «se queda» keeps items and «sin repetir seguidas» works';
end $$;

-- Review round 1: the history is only written by draws (no direct inserts, no made-up time or order).
do $$
declare ok boolean := false;
begin
  begin
    insert into public.bag_draws (bag_id, label, removed) values ('0e0e0e0e-0000-4000-8000-000000000002', 'Inventada', true);
  exception when others then ok := sqlerrm = 'bag_draw_direct';
  end;
  if not ok then raise exception 'FAIL a draw was written directly into the history'; end if;
  ok := false;
  begin
    insert into public.bag_draws (bag_id, label, drawn_at) values ('0e0e0e0e-0000-4000-8000-000000000002', 'Vieja', '2000-01-01');
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL a draw time could be set by the client'; end if;
  if exists (select 1 from public.bag_draws where drawn_at < now() - interval '1 hour') then
    raise exception 'FAIL a draw carries a time in the past';
  end if;
  raise notice 'PASS the bag history is only written by draws, with the server''s time';
end $$;

-- An archived song disappears from the bag without breaking it.
delete from public.videos where id = '0e0e0e0e-0000-4000-8000-0000000000a2';
do $$
begin
  if (select count(*) from public.bag_items where bag_id = '0e0e0e0e-0000-4000-8000-000000000002') <> 1 then
    raise exception 'FAIL an archived song still shows in the bag';
  end if;
  raise notice 'PASS archived songs leave the bag quietly';
end $$;

-- Tracks: clips in order, reorder, archived clip stays as «no disponible».
insert into public.tracks (id, name, pause_seconds) values ('0e0e0e0e-0000-4000-8000-000000000003', 'Calentamiento martes', 3);
insert into public.track_items (id, track_id, clip_id, position) values
  ('0e0e0e0e-0000-4000-8000-0000000000d1', '0e0e0e0e-0000-4000-8000-000000000003', '0e0e0e0e-0000-4000-8000-0000000000c1', 0);
update public.track_items set position = 4 where id = '0e0e0e0e-0000-4000-8000-0000000000d1';
do $$
declare ok boolean := false;
begin
  begin
    update public.tracks set pause_seconds = 9 where id = '0e0e0e0e-0000-4000-8000-000000000003';
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL a pause over 5 s was accepted'; end if;
  ok := false;
  begin
    update public.track_items set clip_id = null where id = '0e0e0e0e-0000-4000-8000-0000000000d1';
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL a track item''s clip could be rewritten'; end if;
  raise notice 'PASS tracks keep their options in range and their clips fixed';
end $$;
delete from public.clips where id = '0e0e0e0e-0000-4000-8000-0000000000c1';
do $$
begin
  if not exists (select 1 from public.track_items where id = '0e0e0e0e-0000-4000-8000-0000000000d1') then
    raise exception 'FAIL a track lost the item of an archived clip';
  end if;
  raise notice 'PASS a track keeps an archived clip as «no disponible»';
end $$;

-- Deleting archives (bag and its items), the history cannot be deleted.
delete from public.bags where id = '0e0e0e0e-0000-4000-8000-000000000001';
do $$
declare ok boolean := false;
begin
  if exists (select 1 from public.bags where id = '0e0e0e0e-0000-4000-8000-000000000001') then
    raise exception 'FAIL deleted bag still visible';
  end if;
  begin
    delete from public.bag_draws where bag_id = '0e0e0e0e-0000-4000-8000-000000000002';
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL bag history could be deleted'; end if;
  raise notice 'PASS deleting a bag archives it; the history stays';
end $$;
reset role;
do $$
begin
  if (select count(*) from public.bag_items where bag_id = '0e0e0e0e-0000-4000-8000-000000000001' and archived_at is not null) <> 3 then
    raise exception 'FAIL the bag''s items were not archived with it';
  end if;
  raise notice 'PASS archived bag rows are kept';
end $$;

rollback;
