-- Timed notes on a video ("this step needs work"), shown as dots on the timeline wave.
-- Same open single-group access and hardening as clips.

create table public.notes (
  id          uuid primary key default gen_random_uuid(),
  video_id    uuid not null references public.videos (id) on delete cascade,
  crew_id     uuid not null references public.crews (id) on delete cascade,
  at_seconds  numeric(10, 3) not null check (at_seconds >= 0),
  body        text not null check (char_length(body) between 1 and 500),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- A double tap must not leave the same note twice.
  constraint notes_video_at_body_key unique (video_id, at_seconds, body)
);

create index notes_crew_idx on public.notes (crew_id);
create index notes_created_by_idx on public.notes (created_by);

alter table public.notes enable row level security;

-- Notes inherit crew_id from their video (the clips helper does exactly that).
create trigger notes_set_crew
before insert or update of video_id on public.notes
for each row execute function public.clips_set_crew();

create trigger notes_touch
before update on public.notes
for each row execute function public.touch_updated_at();

create policy notes_open_all on public.notes for all to anon, authenticated
  using (crew_id = (select private.default_group())) with check (crew_id = (select private.default_group()));

revoke update on public.notes from anon, authenticated;
grant update (body, at_seconds) on public.notes to anon, authenticated;

-- Caps and bulk-delete guard, like videos and clips.
create or replace function private.guard_row_caps()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'videos'
     and (select count(*) from public.videos where crew_id = new.crew_id) >= 500 then
    raise exception 'videos_cap_reached' using errcode = 'P0001';
  elsif tg_table_name = 'clips'
     and (select count(*) from public.clips where crew_id = new.crew_id) >= 5000 then
    raise exception 'clips_cap_reached' using errcode = 'P0001';
  elsif tg_table_name = 'notes'
     and (select count(*) from public.notes where crew_id = new.crew_id) >= 5000 then
    raise exception 'notes_cap_reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- The client sends crew_id (RLS then checks it against the group), so the cap can count by it.
create trigger notes_row_cap before insert on public.notes
  for each row execute function private.guard_row_caps();

create trigger notes_bulk_delete_guard after delete on public.notes
  referencing old table as gone for each statement execute function private.guard_bulk_delete();
