-- F11 · close_poll counts like the app:
-- · a ranking ballot is renumbered over the candidates still alive (archiving one after the vote gave 0 or
--   negative points to the places below it);
-- · ballots of members removed from the group no longer count.
-- Same function as 20261016080000 with only the score query changed.

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

  with live_votes as (
    -- Ballots of people still in the group, on options still alive. In a ranking, each ballot is renumbered
    -- over what is left (1, 2, 3…), like the count the app shows.
    select v.option_id,
           row_number() over (partition by v.member_id order by v.rank nulls last, v.created_at, v.id) as live_rank
    from public.poll_votes v
    join public.poll_options o on o.id = v.option_id and o.poll_id = p_poll and o.archived_at is null
    join public.wishes w on w.id = o.wish_id and w.archived_at is null
    join public.members m on m.id = v.member_id and m.archived_at is null
    where v.poll_id = p_poll and v.archived_at is null
  ),
  scores as (
    select o.wish_id,
           coalesce(sum(case when lv.option_id is null then 0
                             when v_poll.vote_type = 'ranking' then greatest(0, v_n - lv.live_rank + 1)
                             else 1 end), 0) as score
    from public.poll_options o
    join public.wishes w on w.id = o.wish_id and w.archived_at is null
    left join live_votes lv on lv.option_id = o.id
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
