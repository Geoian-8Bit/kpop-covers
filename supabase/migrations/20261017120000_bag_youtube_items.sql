-- One Shoot · mejoras de la prueba manual, punto 28: canciones de YouTube en una bolsa de canciones.
-- Additive and backwards compatible: new nullable columns on bag_items, the one-reference check relaxed to allow
-- them, one more partial unique index, one more column the client may update (video_id, only to link a YouTube song
-- to its library video, checked by a trigger), and draw_from_bag learns the new item's label.
--
--  A YouTube song lives only in its bag (no library video): youtube_id + title (+ artist, thumbnail, duration).
--  It is the item's own source: exactly one of video / clip / member / wish / youtube_id per row.
--  Adding a YouTube song that is already in the library stores the library video instead (no duplicates).
--  «Añadir a la biblioteca» after a draw: the app creates (or finds) the library video and sets the item's video_id;
--  the trigger checks it is the same YouTube video and clears the YouTube columns. Same row: the history keeps
--  pointing at it.
--  Archiving: unchanged (archive_row already archives bag_items; the policies hide archived rows).

alter table public.bag_items add column if not exists youtube_id text
  check (youtube_id is null or youtube_id ~ '^[A-Za-z0-9_-]{11}$');
alter table public.bag_items add column if not exists title text
  check (title is null or char_length(btrim(title)) between 1 and 200);
alter table public.bag_items add column if not exists artist text
  check (artist is null or char_length(artist) <= 120);
alter table public.bag_items add column if not exists thumbnail_url text
  check (thumbnail_url is null or thumbnail_url ~ '^https://i\.ytimg\.com/vi/[A-Za-z0-9_-]{11}/[a-z0-9_]+\.jpg$');
alter table public.bag_items add column if not exists duration_seconds numeric(10, 3)
  check (duration_seconds is null or duration_seconds between 0 and 86400);

-- Exactly one source; a YouTube song carries its title, and only YouTube songs carry these columns.
alter table public.bag_items drop constraint if exists bag_items_one_ref;
alter table public.bag_items add constraint bag_items_one_ref
  check (num_nonnulls(video_id, clip_id, member_id, wish_id, youtube_id) = 1);
alter table public.bag_items drop constraint if exists bag_items_youtube_fields;
alter table public.bag_items add constraint bag_items_youtube_fields check (
  case
    when youtube_id is null then title is null and artist is null and thumbnail_url is null and duration_seconds is null
    else title is not null
  end
);

-- The same YouTube song only once per bag (live items). The existing bag_items_once_key covers the other sources.
create unique index if not exists bag_items_youtube_once_key
  on public.bag_items (bag_id, youtube_id) where archived_at is null and youtube_id is not null;

-- ─────────────────────────────────────────────────────────────
-- Integrity on insert: kind, live references, and a song only once per bag by its YouTube video
-- ─────────────────────────────────────────────────────────────

create or replace function private.guard_bag_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind  text;
  v_video uuid;
  v_ytid  text;
begin
  select b.kind into v_kind from public.bags b
  where b.id = new.bag_id and b.crew_id = new.crew_id and b.archived_at is null;
  if v_kind is null then
    raise exception 'bag_not_found' using errcode = 'P0001';
  end if;

  -- A YouTube song already in the library goes in as the library video.
  if v_kind = 'songs' and new.youtube_id is not null and new.video_id is null then
    select v.id into v_video from public.videos v
    where v.crew_id = new.crew_id and v.youtube_id = new.youtube_id and v.archived_at is null
    limit 1;
    if v_video is not null then
      new.video_id := v_video;
      new.youtube_id := null;
      new.title := null;
      new.artist := null;
      new.thumbnail_url := null;
      new.duration_seconds := null;
    end if;
  end if;

  if (v_kind = 'songs' and not (
        (new.video_id is not null and exists (
          select 1 from public.videos v where v.id = new.video_id and v.crew_id = new.crew_id and v.archived_at is null))
        or (new.wish_id is not null and exists (
          select 1 from public.wishes w where w.id = new.wish_id and w.crew_id = new.crew_id and w.archived_at is null))
        or (new.youtube_id is not null and new.video_id is null and new.wish_id is null)))
     or (v_kind = 'clips' and (new.clip_id is null or new.youtube_id is not null or not exists (
        select 1 from public.clips c where c.id = new.clip_id and c.crew_id = new.crew_id and c.archived_at is null)))
     or (v_kind = 'people' and (new.member_id is null or new.youtube_id is not null or not exists (
        select 1 from public.members m where m.id = new.member_id and m.crew_id = new.crew_id and m.archived_at is null)))
  then
    raise exception 'bag_item_invalid' using errcode = 'P0001';
  end if;

  -- The same YouTube video by another source: a library song, a wish of the list or a YouTube-only song (any pair).
  -- The app shows it as «Ya en la bolsa» and the demo refuses it too. A transaction lock per bag and YouTube id
  -- keeps two phones adding it at once (from two different sources) from both getting in.
  if v_kind = 'songs' then
    v_ytid := coalesce(
      new.youtube_id,
      (select v.youtube_id from public.videos v where v.id = new.video_id),
      (select w.youtube_id from public.wishes w where w.id = new.wish_id)
    );
    if v_ytid is not null then
      perform pg_advisory_xact_lock(hashtext('bag_item:' || new.bag_id::text || ':' || v_ytid));
    end if;
    if v_ytid is not null and exists (
      select 1 from public.bag_items i
      left join public.videos v on v.id = i.video_id
      left join public.wishes w on w.id = i.wish_id
      where i.bag_id = new.bag_id and i.archived_at is null and i.id <> new.id
        and (i.youtube_id = v_ytid
          or (v.youtube_id = v_ytid and v.archived_at is null)
          or (w.youtube_id = v_ytid and w.archived_at is null))
    ) then
      raise exception 'bag_item_duplicate' using errcode = '23505';
    end if;
  end if;
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- «Añadir a la biblioteca»: a YouTube song of a bag points at its library video
-- ─────────────────────────────────────────────────────────────

create or replace function private.guard_bag_item_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.video_id is not distinct from old.video_id then
    return new;
  end if;
  if old.youtube_id is null or old.video_id is not null or new.video_id is null or not exists (
    select 1 from public.videos v
    where v.id = new.video_id and v.crew_id = old.crew_id and v.archived_at is null and v.youtube_id = old.youtube_id
  ) then
    raise exception 'bag_item_invalid' using errcode = 'P0001';
  end if;
  new.youtube_id := null;
  new.title := null;
  new.artist := null;
  new.thumbnail_url := null;
  new.duration_seconds := null;
  return new;
end;
$$;

drop trigger if exists bag_items_e_link on public.bag_items;
create trigger bag_items_e_link before update of video_id on public.bag_items
  for each row execute function private.guard_bag_item_link();

grant update (video_id) on public.bag_items to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- draw_from_bag labels YouTube songs (their own title)
-- ─────────────────────────────────────────────────────────────

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
      (select w.title from public.wishes w where w.id = v_item.wish_id),
      (select c.name || ' · ' || v.title from public.clips c join public.videos v on v.id = c.video_id where c.id = v_item.clip_id),
      (select m.name from public.members m where m.id = v_item.member_id),
      nullif(btrim(v_item.title), ''),
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

revoke execute on function private.guard_bag_item() from public, anon, authenticated;
revoke execute on function private.guard_bag_item_link() from public, anon, authenticated;
