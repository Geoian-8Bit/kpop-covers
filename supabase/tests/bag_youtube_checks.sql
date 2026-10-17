-- Checks for 20261017120000_bag_youtube_items.sql (point 28: YouTube songs that live only in a bag).
-- Run the whole file in one go as postgres (SQL editor / MCP execute_sql, or `pnpm db:test`). Acts as `anon`,
-- prints `PASS …`, raises `FAIL …` on the first problem, ends with ROLLBACK.

begin;
-- Another group with its own video of a YouTube song (as postgres: anon can only write the default group).
insert into public.crews (id, name) values ('0f0f0f0f-0000-4000-8000-0000000000f1', 'Prueba YT otro grupo');
insert into public.videos (id, crew_id, title, source, youtube_id)
values ('0f0f0f0f-0000-4000-8000-0000000000a9', '0f0f0f0f-0000-4000-8000-0000000000f1', 'Prueba YT de otro grupo', 'youtube', 'zzBagYt0008');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into public.videos (id, crew_id, title, source, youtube_id)
values ('0f0f0f0f-0000-4000-8000-0000000000a1', (select private.default_group()), 'Prueba YT biblioteca', 'youtube', 'zzBagYt0001');
insert into public.clips (id, video_id, crew_id, name, start_seconds, end_seconds)
values ('0f0f0f0f-0000-4000-8000-0000000000c1', '0f0f0f0f-0000-4000-8000-0000000000a1', (select private.default_group()), 'Estribillo', 10, 20);
insert into public.bags (id, name, kind, draw_mode)
values ('0f0f0f0f-0000-4000-8000-000000000001', 'Prueba YT canciones', 'songs', 'keep'),
       ('0f0f0f0f-0000-4000-8000-000000000002', 'Prueba YT clips', 'clips', 'keep');

-- A YouTube song goes into a bag of songs without creating a library video.
insert into public.bag_items (id, bag_id, youtube_id, title, artist, thumbnail_url, duration_seconds)
values ('0f0f0f0f-0000-4000-8000-0000000000e1', '0f0f0f0f-0000-4000-8000-000000000001', 'zzBagYt0002',
        'Prueba YT solo bolsa', 'Canal', 'https://i.ytimg.com/vi/zzBagYt0002/mqdefault.jpg', 158);
do $$
begin
  if not exists (
    select 1 from public.bag_items
    where id = '0f0f0f0f-0000-4000-8000-0000000000e1' and video_id is null and youtube_id = 'zzBagYt0002'
      and title = 'Prueba YT solo bolsa'
  ) then
    raise exception 'FAIL the YouTube song is not in the bag';
  end if;
  if exists (select 1 from public.videos where youtube_id = 'zzBagYt0002') then
    raise exception 'FAIL a YouTube song of a bag created a library video';
  end if;
  raise notice 'PASS a YouTube song lives only in its bag';
end $$;

-- Its columns are checked: id format, a title, lengths, thumbnail host, one source only, songs bags only.
do $$
declare ok boolean;
begin
  ok := false;
  begin
    insert into public.bag_items (bag_id, youtube_id, title) values ('0f0f0f0f-0000-4000-8000-000000000001', 'not-an-id', 'X');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL a bad YouTube id was accepted'; end if;
  ok := false;
  begin
    insert into public.bag_items (bag_id, youtube_id) values ('0f0f0f0f-0000-4000-8000-000000000001', 'zzBagYt0003');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL a YouTube song without a title was accepted'; end if;
  ok := false;
  begin
    insert into public.bag_items (bag_id, youtube_id, title) values ('0f0f0f0f-0000-4000-8000-000000000001', 'zzBagYt0003', repeat('a', 201));
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL a title over 200 characters was accepted'; end if;
  ok := false;
  begin
    insert into public.bag_items (bag_id, youtube_id, title, thumbnail_url)
    values ('0f0f0f0f-0000-4000-8000-000000000001', 'zzBagYt0003', 'X', 'https://example.com/a.jpg');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL a thumbnail from another host was accepted'; end if;
  ok := false;
  begin
    insert into public.bag_items (bag_id, video_id, youtube_id, title)
    values ('0f0f0f0f-0000-4000-8000-000000000001', '0f0f0f0f-0000-4000-8000-0000000000a1', 'zzBagYt0003', 'X');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL an item with two sources was accepted'; end if;
  ok := false;
  begin
    insert into public.bag_items (bag_id, clip_id, title) values ('0f0f0f0f-0000-4000-8000-000000000002', '0f0f0f0f-0000-4000-8000-0000000000c1', 'X');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL a title went on an item that is not a YouTube song'; end if;
  ok := false;
  begin
    insert into public.bag_items (bag_id, youtube_id, title) values ('0f0f0f0f-0000-4000-8000-000000000002', 'zzBagYt0003', 'X');
  exception when others then ok := sqlerrm = 'bag_item_invalid';
  end;
  if not ok then raise exception 'FAIL a YouTube song went into a bag of clips'; end if;
  raise notice 'PASS YouTube songs are checked (id, title, lengths, thumbnail, one source, songs bags only)';
end $$;

-- Only once per bag, by its YouTube video; one already in the library goes in as the library video.
do $$
declare ok boolean;
begin
  ok := false;
  begin
    insert into public.bag_items (bag_id, youtube_id, title) values ('0f0f0f0f-0000-4000-8000-000000000001', 'zzBagYt0002', 'Otra vez');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL the same YouTube song went into a bag twice'; end if;

  insert into public.bag_items (id, bag_id, youtube_id, title)
  values ('0f0f0f0f-0000-4000-8000-0000000000e2', '0f0f0f0f-0000-4000-8000-000000000001', 'zzBagYt0001', 'Ya en la biblioteca');
  if not exists (
    select 1 from public.bag_items
    where id = '0f0f0f0f-0000-4000-8000-0000000000e2' and video_id = '0f0f0f0f-0000-4000-8000-0000000000a1'
      and youtube_id is null and title is null
  ) then
    raise exception 'FAIL a YouTube song already in the library was not stored as the library video';
  end if;
  ok := false;
  begin
    insert into public.bag_items (bag_id, youtube_id, title) values ('0f0f0f0f-0000-4000-8000-000000000001', 'zzBagYt0001', 'Duplicada');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL a library song went in twice through YouTube'; end if;
  raise notice 'PASS a YouTube song goes in once, and as the library video when the library has it';
end $$;

-- The draw labels it with its title.
do $$
declare d public.bag_draws;
begin
  delete from public.bag_items where id = '0f0f0f0f-0000-4000-8000-0000000000e2';
  select * into d from public.draw_from_bag('0f0f0f0f-0000-4000-8000-000000000001');
  if d.item_id is distinct from '0f0f0f0f-0000-4000-8000-0000000000e1' or d.label <> 'Prueba YT solo bolsa' then
    raise exception 'FAIL the draw of a YouTube song: % / %', d.item_id, d.label;
  end if;
  raise notice 'PASS a YouTube song comes out of the draw with its title in the history';
end $$;

-- «Añadir a la biblioteca»: once the library has it, the item points at the video (same row, history kept).
insert into public.videos (id, crew_id, title, source, youtube_id)
values ('0f0f0f0f-0000-4000-8000-0000000000a2', (select private.default_group()), 'Prueba YT solo bolsa', 'youtube', 'zzBagYt0002');
do $$
declare ok boolean;
begin
  ok := false;
  begin
    insert into public.bag_items (bag_id, video_id) values ('0f0f0f0f-0000-4000-8000-000000000001', '0f0f0f0f-0000-4000-8000-0000000000a2');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL the library video went in next to its own YouTube song'; end if;
  ok := false;
  begin
    update public.bag_items set video_id = '0f0f0f0f-0000-4000-8000-0000000000a1' where id = '0f0f0f0f-0000-4000-8000-0000000000e1';
  exception when others then ok := sqlerrm = 'bag_item_invalid';
  end;
  if not ok then raise exception 'FAIL a YouTube song was linked to another video'; end if;
  ok := false;
  begin
    update public.bag_items set title = 'Cambiada' where id = '0f0f0f0f-0000-4000-8000-0000000000e1';
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL the client could rewrite a YouTube song'; end if;

  update public.bag_items set video_id = '0f0f0f0f-0000-4000-8000-0000000000a2' where id = '0f0f0f0f-0000-4000-8000-0000000000e1';
  if not exists (
    select 1 from public.bag_items
    where id = '0f0f0f0f-0000-4000-8000-0000000000e1' and video_id = '0f0f0f0f-0000-4000-8000-0000000000a2'
      and youtube_id is null and title is null and thumbnail_url is null
  ) then
    raise exception 'FAIL the YouTube song does not point at its library video';
  end if;
  if (select count(*) from public.bag_draws where item_id = '0f0f0f0f-0000-4000-8000-0000000000e1') <> 1 then
    raise exception 'FAIL the history lost the draw of the linked song';
  end if;
  raise notice 'PASS «Añadir a la biblioteca» links the YouTube song to its video and keeps the history';
end $$;

-- A library item can't be repointed through video_id.
insert into public.videos (id, crew_id, title, source, youtube_id)
values ('0f0f0f0f-0000-4000-8000-0000000000a3', (select private.default_group()), 'Prueba YT otra', 'youtube', 'zzBagYt0004');
do $$
declare ok boolean := false;
begin
  begin
    update public.bag_items set video_id = '0f0f0f0f-0000-4000-8000-0000000000a3' where id = '0f0f0f0f-0000-4000-8000-0000000000e1';
  exception when others then ok := sqlerrm = 'bag_item_invalid';
  end;
  if not ok then raise exception 'FAIL a library item was repointed to another video'; end if;
  raise notice 'PASS library items keep their video';
end $$;

-- A wish of the list and a YouTube song of the same video never share a bag (either order).
insert into public.wishes (id, youtube_id, title) values
  ('0f0f0f0f-0000-4000-8000-0000000000d1', 'zzBagYt0006', 'Prueba YT deseo'),
  ('0f0f0f0f-0000-4000-8000-0000000000d2', 'zzBagYt0007', 'Prueba YT deseo dos');
insert into public.bag_items (bag_id, wish_id) values ('0f0f0f0f-0000-4000-8000-000000000001', '0f0f0f0f-0000-4000-8000-0000000000d1');
insert into public.bag_items (bag_id, youtube_id, title)
values ('0f0f0f0f-0000-4000-8000-000000000001', 'zzBagYt0007', 'Prueba YT antes que el deseo');
do $$
declare ok boolean;
begin
  ok := false;
  begin
    insert into public.bag_items (bag_id, youtube_id, title) values ('0f0f0f0f-0000-4000-8000-000000000001', 'zzBagYt0006', 'Como el deseo');
  exception when unique_violation then ok := sqlerrm = 'bag_item_duplicate';
  end;
  if not ok then raise exception 'FAIL a YouTube song went in next to the wish of the same video'; end if;
  ok := false;
  begin
    insert into public.bag_items (bag_id, wish_id) values ('0f0f0f0f-0000-4000-8000-000000000001', '0f0f0f0f-0000-4000-8000-0000000000d2');
  exception when unique_violation then ok := sqlerrm = 'bag_item_duplicate';
  end;
  if not ok then raise exception 'FAIL a wish went in next to the YouTube song of the same video'; end if;
  raise notice 'PASS a wish and a YouTube song of the same video never share a bag';
end $$;

-- The bag's library video is archived (and another group has the song): it goes in again as a YouTube song, and
-- it can't be linked to the archived video, to the other group's one, or have its video_id cleared.
insert into public.videos (id, crew_id, title, source, youtube_id)
values ('0f0f0f0f-0000-4000-8000-0000000000a4', (select private.default_group()), 'Prueba YT archivada', 'youtube', 'zzBagYt0008');
insert into public.bag_items (bag_id, video_id) values ('0f0f0f0f-0000-4000-8000-000000000001', '0f0f0f0f-0000-4000-8000-0000000000a4');
delete from public.videos where id = '0f0f0f0f-0000-4000-8000-0000000000a4';
do $$
declare ok boolean;
begin
  insert into public.bag_items (id, bag_id, youtube_id, title)
  values ('0f0f0f0f-0000-4000-8000-0000000000e5', '0f0f0f0f-0000-4000-8000-000000000001', 'zzBagYt0008', 'Prueba YT vuelve');
  if not exists (
    select 1 from public.bag_items
    where id = '0f0f0f0f-0000-4000-8000-0000000000e5' and video_id is null and youtube_id = 'zzBagYt0008'
  ) then
    raise exception 'FAIL a song whose library video is archived (or of another group) did not go in as YouTube';
  end if;
  ok := false;
  begin
    update public.bag_items set video_id = '0f0f0f0f-0000-4000-8000-0000000000a4' where id = '0f0f0f0f-0000-4000-8000-0000000000e5';
  exception when others then ok := sqlerrm = 'bag_item_invalid';
  end;
  if not ok then raise exception 'FAIL a YouTube song was linked to an archived video'; end if;
  ok := false;
  begin
    update public.bag_items set video_id = '0f0f0f0f-0000-4000-8000-0000000000a9' where id = '0f0f0f0f-0000-4000-8000-0000000000e5';
  exception when others then ok := sqlerrm = 'bag_item_invalid';
  end;
  if not ok then raise exception 'FAIL a YouTube song was linked to the video of another group'; end if;
  update public.bag_items set video_id = null where id = '0f0f0f0f-0000-4000-8000-0000000000e5';
  if not exists (
    select 1 from public.bag_items
    where id = '0f0f0f0f-0000-4000-8000-0000000000e5' and video_id is null and youtube_id = 'zzBagYt0008'
      and title = 'Prueba YT vuelve'
  ) then
    raise exception 'FAIL clearing video_id changed a YouTube song';
  end if;
  raise notice 'PASS links only to a live video of the group (archived, other group and null are refused or no-ops)';
end $$;

-- Clip and person items can't take a video_id; no YouTube song in a bag of people; the client can't rewrite the
-- YouTube columns.
insert into public.members (id, name) values ('0f0f0f0f-0000-4000-8000-0000000000b1', 'Prueba YT persona');
insert into public.bags (id, name, kind, draw_mode)
values ('0f0f0f0f-0000-4000-8000-000000000003', 'Prueba YT personas', 'people', 'keep');
insert into public.bag_items (id, bag_id, clip_id)
values ('0f0f0f0f-0000-4000-8000-0000000000e6', '0f0f0f0f-0000-4000-8000-000000000002', '0f0f0f0f-0000-4000-8000-0000000000c1');
insert into public.bag_items (id, bag_id, member_id)
values ('0f0f0f0f-0000-4000-8000-0000000000e7', '0f0f0f0f-0000-4000-8000-000000000003', '0f0f0f0f-0000-4000-8000-0000000000b1');
do $$
declare
  ok boolean;
  target uuid;
  change text[];
begin
  ok := false;
  begin
    insert into public.bag_items (bag_id, youtube_id, title) values ('0f0f0f0f-0000-4000-8000-000000000003', 'zzBagYt0003', 'X');
  exception when others then ok := sqlerrm = 'bag_item_invalid';
  end;
  if not ok then raise exception 'FAIL a YouTube song went into a bag of people'; end if;
  foreach target in array array['0f0f0f0f-0000-4000-8000-0000000000e6', '0f0f0f0f-0000-4000-8000-0000000000e7']::uuid[] loop
    ok := false;
    begin
      update public.bag_items set video_id = '0f0f0f0f-0000-4000-8000-0000000000a3' where id = target;
    exception when others then ok := sqlerrm = 'bag_item_invalid' or sqlstate = '23514';
    end;
    if not ok then raise exception 'FAIL a clip or person item took a video_id (%)', target; end if;
  end loop;
  foreach change slice 1 in array array[
    ['youtube_id', 'zzBagYt0010'], ['artist', 'Otro'],
    ['thumbnail_url', 'https://i.ytimg.com/vi/zzBagYt0010/mqdefault.jpg'], ['duration_seconds', '1']
  ] loop
    ok := false;
    begin
      execute format('update public.bag_items set %I = %L where id = %L',
        change[1], change[2], '0f0f0f0f-0000-4000-8000-0000000000e5');
    exception when insufficient_privilege then ok := true;
    end;
    if not ok then raise exception 'FAIL the client could change % of a YouTube song', change[1]; end if;
  end loop;
  raise notice 'PASS clip and person items keep their source, and the client can''t rewrite a YouTube song';
end $$;

-- In a bag that takes out what it draws, a YouTube song drawn (removed_at set) can still be linked to the library.
insert into public.bags (id, name, kind, draw_mode)
values ('0f0f0f0f-0000-4000-8000-000000000004', 'Prueba YT se quita', 'songs', 'remove');
insert into public.bag_items (id, bag_id, youtube_id, title)
values ('0f0f0f0f-0000-4000-8000-0000000000e8', '0f0f0f0f-0000-4000-8000-000000000004', 'zzBagYt0009', 'Prueba YT sacada');
select public.draw_from_bag('0f0f0f0f-0000-4000-8000-000000000004');
insert into public.videos (id, crew_id, title, source, youtube_id)
values ('0f0f0f0f-0000-4000-8000-0000000000a5', (select private.default_group()), 'Prueba YT sacada', 'youtube', 'zzBagYt0009');
do $$
begin
  if not exists (
    select 1 from public.bag_items where id = '0f0f0f0f-0000-4000-8000-0000000000e8' and removed_at is not null
  ) then
    raise exception 'FAIL the drawn YouTube song was not taken out';
  end if;
  update public.bag_items set video_id = '0f0f0f0f-0000-4000-8000-0000000000a5' where id = '0f0f0f0f-0000-4000-8000-0000000000e8';
  if not exists (
    select 1 from public.bag_items
    where id = '0f0f0f0f-0000-4000-8000-0000000000e8' and video_id = '0f0f0f0f-0000-4000-8000-0000000000a5'
      and youtube_id is null and removed_at is not null
  ) then
    raise exception 'FAIL a drawn YouTube song of a «se quita» bag was not linked';
  end if;
  if (select count(*) from public.bag_draws where item_id = '0f0f0f0f-0000-4000-8000-0000000000e8') <> 1 then
    raise exception 'FAIL the history lost the draw of the linked song';
  end if;
  raise notice 'PASS a drawn YouTube song of a «se quita» bag links to the library and stays out';
end $$;

-- Deleting a YouTube song archives it: gone from the bag, the history stays.
insert into public.bag_items (id, bag_id, youtube_id, title)
values ('0f0f0f0f-0000-4000-8000-0000000000e3', '0f0f0f0f-0000-4000-8000-000000000001', 'zzBagYt0005', 'Prueba YT borrar');
select public.draw_from_bag('0f0f0f0f-0000-4000-8000-000000000001', 10);
delete from public.bag_items where id = '0f0f0f0f-0000-4000-8000-0000000000e3';
do $$
begin
  if exists (select 1 from public.bag_items where id = '0f0f0f0f-0000-4000-8000-0000000000e3') then
    raise exception 'FAIL a deleted YouTube song still shows in the bag';
  end if;
  if not exists (
    select 1 from public.bag_draws where item_id = '0f0f0f0f-0000-4000-8000-0000000000e3' and label = 'Prueba YT borrar'
  ) then
    raise exception 'FAIL the history lost the draw of a deleted YouTube song';
  end if;
  raise notice 'PASS deleting a YouTube song archives it and keeps its history';
end $$;
reset role;
do $$
begin
  if not exists (
    select 1 from public.bag_items where id = '0f0f0f0f-0000-4000-8000-0000000000e3' and archived_at is not null
  ) then
    raise exception 'FAIL the YouTube song row was not kept as archived';
  end if;
  raise notice 'PASS archived YouTube song rows are kept';
end $$;

rollback;
