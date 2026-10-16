-- Checks for 20261016040000_wishes_and_polls.sql (F12 wish list, F11 polls).
-- Run the whole file in one go as postgres (SQL editor / MCP execute_sql, or `pnpm db:test`). Acts as `anon`,
-- prints `PASS …`, raises `FAIL …` on the first problem, ends with ROLLBACK.

begin;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into public.members (id, name) values
  ('0f0f0f0f-0000-4000-8000-0000000000b1', 'Prueba Gala'),
  ('0f0f0f0f-0000-4000-8000-0000000000b2', 'Prueba Hana');

-- Wishes: one live entry per YouTube video; «Me apunto» once per person.
insert into public.wishes (id, youtube_id, title, artist, difficulty, members_count, comment, proposed_by_member_id)
values ('0f0f0f0f-0000-4000-8000-000000000001', 'zzWishAAA01', 'Canción A', 'Grupo A', 'media', 5, 'para diciembre',
        '0f0f0f0f-0000-4000-8000-0000000000b1'),
       ('0f0f0f0f-0000-4000-8000-000000000002', 'zzWishBBB02', 'Canción B', null, null, null, null, null),
       ('0f0f0f0f-0000-4000-8000-000000000003', 'zzWishCCC03', 'Canción C', null, 'dificil', null, null, null);
insert into public.wish_interest (wish_id, member_id) values
  ('0f0f0f0f-0000-4000-8000-000000000001', '0f0f0f0f-0000-4000-8000-0000000000b1'),
  ('0f0f0f0f-0000-4000-8000-000000000001', '0f0f0f0f-0000-4000-8000-0000000000b2');
do $$
declare ok boolean := false;
begin
  begin
    insert into public.wishes (youtube_id, title) values ('zzWishAAA01', 'Repetida');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL the same YouTube video went into the wish list twice'; end if;
  ok := false;
  begin
    insert into public.wish_interest (wish_id, member_id)
    values ('0f0f0f0f-0000-4000-8000-000000000001', '0f0f0f0f-0000-4000-8000-0000000000b1');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL «Me apunto» counted twice for one person'; end if;
  ok := false;
  begin
    insert into public.wishes (youtube_id, title, difficulty) values ('zzWishDDD04', 'Mala', 'imposible');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL unknown difficulty accepted'; end if;
  raise notice 'PASS wishes are unique, interest is once per person, difficulty checked';
end $$;

-- Poll (ranking): options are wishes; cast_vote replaces the ballot; ranks follow the order given.
insert into public.polls (id, title, vote_type, results_live, created_by_member_id)
values ('0f0f0f0f-0000-4000-8000-000000000010', 'Próxima cover', 'ranking', false, '0f0f0f0f-0000-4000-8000-0000000000b1');
insert into public.poll_options (id, poll_id, wish_id) values
  ('0f0f0f0f-0000-4000-8000-000000000011', '0f0f0f0f-0000-4000-8000-000000000010', '0f0f0f0f-0000-4000-8000-000000000001'),
  ('0f0f0f0f-0000-4000-8000-000000000012', '0f0f0f0f-0000-4000-8000-000000000010', '0f0f0f0f-0000-4000-8000-000000000002'),
  ('0f0f0f0f-0000-4000-8000-000000000013', '0f0f0f0f-0000-4000-8000-000000000010', '0f0f0f0f-0000-4000-8000-000000000003');
do $$
declare ok boolean := false;
begin
  perform public.cast_vote('0f0f0f0f-0000-4000-8000-000000000010', '0f0f0f0f-0000-4000-8000-0000000000b1',
    array['0f0f0f0f-0000-4000-8000-000000000012', '0f0f0f0f-0000-4000-8000-000000000011']::uuid[]);
  perform public.cast_vote('0f0f0f0f-0000-4000-8000-000000000010', '0f0f0f0f-0000-4000-8000-0000000000b1',
    array['0f0f0f0f-0000-4000-8000-000000000011', '0f0f0f0f-0000-4000-8000-000000000013']::uuid[]);
  if (select count(*) from public.poll_votes where poll_id = '0f0f0f0f-0000-4000-8000-000000000010'
      and member_id = '0f0f0f0f-0000-4000-8000-0000000000b1') <> 2 then
    raise exception 'FAIL a changed vote left the old ballot counting';
  end if;
  if (select rank from public.poll_votes where option_id = '0f0f0f0f-0000-4000-8000-000000000011'
      and member_id = '0f0f0f0f-0000-4000-8000-0000000000b1') <> 1 then
    raise exception 'FAIL ranking order not stored';
  end if;
  begin
    insert into public.poll_votes (poll_id, option_id, member_id)
    values ('0f0f0f0f-0000-4000-8000-000000000010', '0f0f0f0f-0000-4000-8000-000000000011', '0f0f0f0f-0000-4000-8000-0000000000b2');
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL votes could be written directly (ballot stuffing)'; end if;
  ok := false;
  begin
    perform public.cast_vote('0f0f0f0f-0000-4000-8000-000000000010', '0f0f0f0f-0000-4000-8000-0000000000b2',
      array[gen_random_uuid()]);
  exception when others then ok := sqlerrm = 'vote_options_invalid';
  end;
  if not ok then raise exception 'FAIL a vote for an option outside the poll was accepted'; end if;
  raise notice 'PASS ballots replace atomically, ranks kept, no direct or foreign votes';
end $$;

-- Single vote: one option only.
insert into public.polls (id, title, vote_type) values ('0f0f0f0f-0000-4000-8000-000000000020', 'Un voto', 'single');
insert into public.poll_options (id, poll_id, wish_id) values
  ('0f0f0f0f-0000-4000-8000-000000000021', '0f0f0f0f-0000-4000-8000-000000000020', '0f0f0f0f-0000-4000-8000-000000000001'),
  ('0f0f0f0f-0000-4000-8000-000000000022', '0f0f0f0f-0000-4000-8000-000000000020', '0f0f0f0f-0000-4000-8000-000000000002');
do $$
declare ok boolean := false;
begin
  begin
    perform public.cast_vote('0f0f0f0f-0000-4000-8000-000000000020', '0f0f0f0f-0000-4000-8000-0000000000b1',
      array['0f0f0f0f-0000-4000-8000-000000000021', '0f0f0f0f-0000-4000-8000-000000000022']::uuid[]);
  exception when others then ok := sqlerrm = 'vote_options_invalid';
  end;
  if not ok then raise exception 'FAIL two options accepted in a single-vote poll'; end if;
  raise notice 'PASS single-vote polls take one option';
end $$;

-- Closing: once, winner must be an option, then no more votes or changes.
do $$
declare ok boolean := false;
begin
  begin
    update public.polls set closed_at = now(), winner_wish_id = gen_random_uuid() where id = '0f0f0f0f-0000-4000-8000-000000000010';
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FAIL a winner outside the poll was accepted'; end if;
  update public.polls set closed_at = now(), winner_wish_id = '0f0f0f0f-0000-4000-8000-000000000001'
  where id = '0f0f0f0f-0000-4000-8000-000000000010';
  ok := false;
  begin
    perform public.cast_vote('0f0f0f0f-0000-4000-8000-000000000010', '0f0f0f0f-0000-4000-8000-0000000000b2',
      array['0f0f0f0f-0000-4000-8000-000000000012']::uuid[]);
  exception when others then ok := sqlerrm = 'poll_closed';
  end;
  if not ok then raise exception 'FAIL voted in a closed poll'; end if;
  ok := false;
  begin
    update public.polls set winner_wish_id = '0f0f0f0f-0000-4000-8000-000000000002' where id = '0f0f0f0f-0000-4000-8000-000000000010';
  exception when others then ok := sqlerrm = 'poll_closed';
  end;
  if not ok then raise exception 'FAIL the winner of a closed poll was changed'; end if;
  raise notice 'PASS closing is once, the winner is an option, closed polls are frozen';
end $$;

-- A poll past its closing time takes no votes.
insert into public.polls (id, title, vote_type, closes_at)
values ('0f0f0f0f-0000-4000-8000-000000000030', 'Caducada', 'multi', now() + interval '1 hour');
insert into public.poll_options (id, poll_id, wish_id) values
  ('0f0f0f0f-0000-4000-8000-000000000031', '0f0f0f0f-0000-4000-8000-000000000030', '0f0f0f0f-0000-4000-8000-000000000003');
reset role;
update public.polls set closes_at = now() - interval '1 minute' where id = '0f0f0f0f-0000-4000-8000-000000000030';
set local role anon;
do $$
declare ok boolean := false;
begin
  begin
    perform public.cast_vote('0f0f0f0f-0000-4000-8000-000000000030', '0f0f0f0f-0000-4000-8000-0000000000b1',
      array['0f0f0f0f-0000-4000-8000-000000000031']::uuid[]);
  exception when others then ok := sqlerrm = 'poll_closed';
  end;
  if not ok then raise exception 'FAIL voted after the closing time'; end if;
  raise notice 'PASS no votes after the closing time';
end $$;

-- Review round 1: an expired poll can't be reopened; no poll is born with a winner; options are fixed; re-voting
-- doesn't pile up rows.
do $$
declare ok boolean := false;
begin
  begin
    update public.polls set closes_at = now() + interval '1 day' where id = '0f0f0f0f-0000-4000-8000-000000000030';
  exception when others then ok := sqlerrm = 'poll_closed';
  end;
  if not ok then raise exception 'FAIL an expired poll was reopened'; end if;
  ok := false;
  begin
    insert into public.polls (title, vote_type, winner_wish_id) values ('Con ganadora', 'single', '0f0f0f0f-0000-4000-8000-000000000003');
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL a poll was created with a winner'; end if;
  ok := false;
  begin
    insert into public.poll_options (poll_id, wish_id)
    values ('0f0f0f0f-0000-4000-8000-000000000030', '0f0f0f0f-0000-4000-8000-000000000002');
  exception when others then ok := sqlerrm = 'poll_closed';
  end;
  if not ok then raise exception 'FAIL an option was added to an expired poll'; end if;
  raise notice 'PASS expired polls stay closed, no born winners, options fixed';
end $$;
insert into public.polls (id, title, vote_type) values ('0f0f0f0f-0000-4000-8000-000000000050', 'Vaivén', 'single');
insert into public.poll_options (id, poll_id, wish_id) values
  ('0f0f0f0f-0000-4000-8000-000000000051', '0f0f0f0f-0000-4000-8000-000000000050', '0f0f0f0f-0000-4000-8000-000000000002'),
  ('0f0f0f0f-0000-4000-8000-000000000052', '0f0f0f0f-0000-4000-8000-000000000050', '0f0f0f0f-0000-4000-8000-000000000003');
do $$
declare i int;
begin
  for i in 1..20 loop
    perform public.cast_vote('0f0f0f0f-0000-4000-8000-000000000050', '0f0f0f0f-0000-4000-8000-0000000000b2',
      array[case when i % 2 = 0 then '0f0f0f0f-0000-4000-8000-000000000051' else '0f0f0f0f-0000-4000-8000-000000000052' end]::uuid[]);
  end loop;
  raise notice 'PASS changing a vote many times works';
end $$;
reset role;
do $$
begin
  if (select count(*) from public.poll_votes where poll_id = '0f0f0f0f-0000-4000-8000-000000000050') > 2 then
    raise exception 'FAIL re-voting piles up rows';
  end if;
  raise notice 'PASS re-voting reuses the ballot rows';
end $$;
set local role anon;

-- close_poll counts on the server: a clear winner closes; a tie doesn't until a tied leader is picked.
insert into public.polls (id, title, vote_type) values ('0f0f0f0f-0000-4000-8000-000000000060', 'Recuento', 'single');
insert into public.poll_options (id, poll_id, wish_id) values
  ('0f0f0f0f-0000-4000-8000-000000000061', '0f0f0f0f-0000-4000-8000-000000000060', '0f0f0f0f-0000-4000-8000-000000000002'),
  ('0f0f0f0f-0000-4000-8000-000000000062', '0f0f0f0f-0000-4000-8000-000000000060', '0f0f0f0f-0000-4000-8000-000000000003');
do $$
declare r json; ok boolean := false;
begin
  perform public.cast_vote('0f0f0f0f-0000-4000-8000-000000000060', '0f0f0f0f-0000-4000-8000-0000000000b1',
    array['0f0f0f0f-0000-4000-8000-000000000061']::uuid[]);
  perform public.cast_vote('0f0f0f0f-0000-4000-8000-000000000060', '0f0f0f0f-0000-4000-8000-0000000000b2',
    array['0f0f0f0f-0000-4000-8000-000000000062']::uuid[]);
  r := public.close_poll('0f0f0f0f-0000-4000-8000-000000000060');
  if r->>'status' <> 'tie' or json_array_length(r->'tied') <> 2 then raise exception 'FAIL a tie was not reported: %', r; end if;
  begin
    perform public.close_poll('0f0f0f0f-0000-4000-8000-000000000060', 'pick', '0f0f0f0f-0000-4000-8000-000000000001');
  exception when others then ok := sqlerrm = 'poll_winner_invalid';
  end;
  if not ok then raise exception 'FAIL a non-leader was picked as winner'; end if;
  r := public.close_poll('0f0f0f0f-0000-4000-8000-000000000060', 'pick', '0f0f0f0f-0000-4000-8000-000000000003');
  if (select winner_wish_id from public.polls where id = '0f0f0f0f-0000-4000-8000-000000000060') <> '0f0f0f0f-0000-4000-8000-000000000003' then
    raise exception 'FAIL the picked winner was not saved';
  end if;
  raise notice 'PASS close_poll counts on the server, reports ties and only accepts a tied leader';
end $$;

-- «Añadir a la biblioteca»: the wish leaves the list (and the same video can be wished again later).
insert into public.videos (id, crew_id, title, source, youtube_id)
values ('0f0f0f0f-0000-4000-8000-0000000000a1', (select private.default_group()), 'Canción A', 'youtube', 'zzWishAAA01');
update public.wishes set added_video_id = '0f0f0f0f-0000-4000-8000-0000000000a1' where id = '0f0f0f0f-0000-4000-8000-000000000001';
insert into public.wishes (youtube_id, title) values ('zzWishAAA01', 'Canción A otra vez');
do $$
begin
  raise notice 'PASS a wish moved to the library leaves the live list';
end $$;

-- Bags of songs take wishes too.
insert into public.bags (id, name, kind) values ('0f0f0f0f-0000-4000-8000-000000000040', 'Candidatas', 'songs');
insert into public.bag_items (bag_id, wish_id) values ('0f0f0f0f-0000-4000-8000-000000000040', '0f0f0f0f-0000-4000-8000-000000000002');
do $$
declare v_label text;
begin
  select label into v_label from public.draw_from_bag('0f0f0f0f-0000-4000-8000-000000000040');
  if v_label <> 'Canción B' then raise exception 'FAIL a wish in a bag drew as %', v_label; end if;
  raise notice 'PASS bags of songs hold and draw wishes';
end $$;

-- Deleting archives (a poll and its options).
delete from public.polls where id = '0f0f0f0f-0000-4000-8000-000000000020';
delete from public.wish_interest where wish_id = '0f0f0f0f-0000-4000-8000-000000000001' and member_id = '0f0f0f0f-0000-4000-8000-0000000000b2';
do $$
begin
  if exists (select 1 from public.polls where id = '0f0f0f0f-0000-4000-8000-000000000020')
     or (select count(*) from public.wish_interest where wish_id = '0f0f0f0f-0000-4000-8000-000000000001') <> 1 then
    raise exception 'FAIL delete did not archive';
  end if;
  raise notice 'PASS deleting a poll or an interest archives it';
end $$;

reset role;
rollback;
