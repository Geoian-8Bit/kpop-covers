-- F11 · close_poll: an option with no votes scores 0, not 1.
-- The left join gave every option one row (v.* null), and the else branch counted it as a vote.
-- Same function as 20261016040000 with only the score expression changed.

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
           coalesce(sum(case when v.id is null then 0 when v_poll.vote_type = 'ranking' then v_n - v.rank + 1 else 1 end), 0) as score
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
