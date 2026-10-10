-- Coverscape · initial schema
-- Crews (dance groups) share a library of practice videos and saved clips.

-- ─────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_hue   int  not null default 340 check (avatar_hue between 0 and 360),
  created_at   timestamptz not null default now()
);

create table public.crews (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  invite_code text not null unique
              default upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8)),
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index crews_created_by_idx on public.crews (created_by);

create table public.crew_members (
  crew_id   uuid not null references public.crews (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (crew_id, user_id)
);
create index crew_members_user_idx on public.crew_members (user_id);

create table public.videos (
  id               uuid primary key default gen_random_uuid(),
  crew_id          uuid not null references public.crews (id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 200),
  artist           text check (char_length(artist) <= 120),
  source           text not null check (source in ('youtube', 'upload')),
  youtube_id       text check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  storage_path     text,
  file_name        text,
  file_size        bigint check (file_size >= 0),
  duration_seconds numeric(10, 3) check (duration_seconds >= 0),
  thumbnail_url    text,
  created_by       uuid default auth.uid() references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint videos_source_shape check (
    (source = 'youtube' and youtube_id is not null)
    or (source = 'upload' and file_name is not null)
  )
);
create index videos_crew_idx on public.videos (crew_id, created_at desc);
create index videos_created_by_idx on public.videos (created_by);

create table public.clips (
  id            uuid primary key default gen_random_uuid(),
  video_id      uuid not null references public.videos (id) on delete cascade,
  crew_id       uuid not null references public.crews (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 80),
  start_seconds numeric(10, 3) not null check (start_seconds >= 0),
  end_seconds   numeric(10, 3) not null,
  speed         numeric(4, 2) not null default 1 check (speed between 0.25 and 2),
  mirrored      boolean not null default true,
  color         text not null default 'wine'
                check (color in ('wine', 'plum', 'orchid', 'rose', 'gold', 'teal')),
  is_pinned     boolean not null default false,
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint clips_range check (end_seconds > start_seconds)
);
create index clips_video_idx on public.clips (video_id, start_seconds);
create index clips_crew_idx on public.clips (crew_id, is_pinned, created_at desc);
create index clips_created_by_idx on public.clips (created_by);

-- ─────────────────────────────────────────────────────────────
-- Helpers & triggers
-- ─────────────────────────────────────────────────────────────

create or replace function public.is_crew_member(p_crew_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.crew_members m
    where m.crew_id = p_crew_id and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.shares_crew_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.crew_members a
    join public.crew_members b on b.crew_id = a.crew_id
    where a.user_id = (select auth.uid()) and b.user_id = p_user_id
  );
$$;

-- Clips inherit crew_id from their video so RLS stays a single lookup.
create or replace function public.clips_set_crew()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select v.crew_id into new.crew_id from public.videos v where v.id = new.video_id;
  if new.crew_id is null then
    raise exception 'video % not found', new.video_id;
  end if;
  return new;
end;
$$;

create trigger clips_set_crew
before insert or update of video_id on public.clips
for each row execute function public.clips_set_crew();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger videos_touch
before update on public.videos
for each row execute function public.touch_updated_at();

-- Profile row for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_hue)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1), 'Dancer'), 40),
    (floor(random() * 360))::int
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- RPCs
-- ─────────────────────────────────────────────────────────────

create or replace function public.create_crew(p_name text)
returns public.crews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_crew public.crews;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;
  insert into public.crews (name, created_by)
  values (trim(p_name), (select auth.uid()))
  returning * into v_crew;
  insert into public.crew_members (crew_id, user_id, role)
  values (v_crew.id, (select auth.uid()), 'owner');
  return v_crew;
end;
$$;

create or replace function public.join_crew(p_code text)
returns public.crews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_crew public.crews;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;
  select * into v_crew from public.crews c where c.invite_code = upper(trim(p_code));
  if v_crew.id is null then
    raise exception 'invalid invite code' using errcode = 'P0002';
  end if;
  insert into public.crew_members (crew_id, user_id, role)
  values (v_crew.id, (select auth.uid()), 'member')
  on conflict do nothing;
  return v_crew;
end;
$$;

revoke execute on function public.create_crew(text) from public, anon;
revoke execute on function public.join_crew(text) from public, anon;
revoke execute on function public.is_crew_member(uuid) from public, anon;
revoke execute on function public.shares_crew_with(uuid) from public, anon;
revoke execute on function public.clips_set_crew() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.create_crew(text) to authenticated;
grant execute on function public.join_crew(text) to authenticated;
grant execute on function public.is_crew_member(uuid) to authenticated;
grant execute on function public.shares_crew_with(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Row level security
-- ─────────────────────────────────────────────────────────────

alter table public.profiles     enable row level security;
alter table public.crews        enable row level security;
alter table public.crew_members enable row level security;
alter table public.videos       enable row level security;
alter table public.clips        enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_crew_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy crews_select on public.crews for select to authenticated
  using (public.is_crew_member(id));
create policy crews_update on public.crews for update to authenticated
  using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
create policy crews_delete on public.crews for delete to authenticated
  using (created_by = (select auth.uid()));

create policy crew_members_select on public.crew_members for select to authenticated
  using (public.is_crew_member(crew_id));
create policy crew_members_leave on public.crew_members for delete to authenticated
  using (user_id = (select auth.uid()));

create policy videos_all on public.videos for all to authenticated
  using (public.is_crew_member(crew_id)) with check (public.is_crew_member(crew_id));

create policy clips_all on public.clips for all to authenticated
  using (public.is_crew_member(crew_id)) with check (public.is_crew_member(crew_id));

-- ─────────────────────────────────────────────────────────────
-- Storage: private bucket, one folder per crew  ({crew_id}/{file})
-- ─────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', false, 52428800, array['video/*', 'audio/*'])
on conflict (id) do nothing;

create policy videos_bucket_select on storage.objects for select to authenticated
  using (bucket_id = 'videos' and public.is_crew_member(((storage.foldername(name))[1])::uuid));
create policy videos_bucket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'videos' and public.is_crew_member(((storage.foldername(name))[1])::uuid));
create policy videos_bucket_delete on storage.objects for delete to authenticated
  using (bucket_id = 'videos' and public.is_crew_member(((storage.foldername(name))[1])::uuid));
