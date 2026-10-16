-- One Shoot · B1 review round 1 (database): the bag history is only written by draws, with the server's time.
--
--  1) Clients can only insert the plain columns of a draw (never its time or order), and only from inside
--     draw_from_bag() (it marks the transaction); a direct insert from the app or a script is refused.
--     The guard is SECURITY INVOKER now, so its role check sees the real caller.
--  2) Draw order index (bag, seq) for «sin repetir seguidas» and the history list; a hard cap per group so a script
--     can't fill the free database with draws.

revoke insert on public.bag_draws from anon, authenticated;
grant insert (bag_id, crew_id, item_id, label, removed, member_id) on public.bag_draws to anon, authenticated;

create or replace function private.guard_bag_draw()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_count bigint;
begin
  if current_user::text not in ('anon', 'authenticated') then
    return new;
  end if;
  if coalesce(current_setting('app.bag_draw', true), '') <> '1' then
    raise exception 'bag_draw_direct' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.bags b where b.id = new.bag_id and b.crew_id = new.crew_id and b.archived_at is null
  ) then
    raise exception 'bag_not_found' using errcode = 'P0001';
  end if;
  if new.item_id is not null and not exists (
    select 1 from public.bag_items i where i.id = new.item_id and i.bag_id = new.bag_id
  ) then
    new.item_id := null;
  end if;
  if new.member_id is not null and not exists (
    select 1 from public.members m where m.id = new.member_id and m.crew_id = new.crew_id and m.archived_at is null
  ) then
    new.member_id := null;
  end if;
  new.drawn_at := clock_timestamp();
  select count(*) into v_count from public.bag_draws d where d.crew_id = new.crew_id;
  if v_count >= 100000 then
    raise exception 'bag_draws_cap_reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function private.guard_bag_draw() from public, anon, authenticated;

drop index if exists public.bag_draws_bag_idx;
create index if not exists bag_draws_bag_seq_idx on public.bag_draws (bag_id, seq desc);

-- draw_from_bag marks its own transaction as a draw (the guard above only accepts inserts that carry the mark).
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
revoke execute on function public.draw_from_bag(uuid, int, boolean, uuid) from public;
grant execute on function public.draw_from_bag(uuid, int, boolean, uuid) to anon, authenticated;
