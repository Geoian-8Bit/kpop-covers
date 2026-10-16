-- One Shoot · ideas, fase 3: F5 (repaso apilado / superpuesto) y F6 (notas sobre la toma).
-- Additive and backwards compatible: new columns with defaults; the app deployed before keeps working.
--
--  F5 · Each take keeps what the review learnt about it, for everybody:
--       takes.sync_adjust_seconds  fine sync (±0.3 s) for the phone's camera/sound delay;
--       takes.fit_scale / fit_x / fit_y  how the original sits over the take in «Superpuesto» (two-finger fit):
--       scale of the original and its centre offset as a fraction of the frame (−1…1).
--  F6 · A note can belong to a take: at the take's moment (take_seconds) and, as before, at the song's second
--       (at_seconds, so it also shows on the song). Optional category, recipient (a member), status and a small
--       drawing over the frame (a data URL image, capped at ~60 KB).

-- ─────────────────────────────────────────────────────────────
-- F5 · takes: sync adjustment and overlay fit
-- ─────────────────────────────────────────────────────────────

alter table public.takes
  add column if not exists sync_adjust_seconds numeric(5, 3) not null default 0,
  add column if not exists fit_scale numeric(6, 3) not null default 1,
  add column if not exists fit_x numeric(6, 4) not null default 0,
  add column if not exists fit_y numeric(6, 4) not null default 0;

alter table public.takes drop constraint if exists takes_sync_adjust_range;
alter table public.takes add constraint takes_sync_adjust_range check (sync_adjust_seconds between -0.3 and 0.3);
alter table public.takes drop constraint if exists takes_fit_range;
alter table public.takes add constraint takes_fit_range check (
  fit_scale between 0.2 and 5 and fit_x between -1 and 1 and fit_y between -1 and 1
);

grant update (sync_adjust_seconds, fit_scale, fit_x, fit_y) on public.takes to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- F6 · notes on a take
-- ─────────────────────────────────────────────────────────────

alter table public.notes
  add column if not exists take_id uuid references public.takes (id) on delete set null,
  add column if not exists take_seconds numeric(10, 3),
  add column if not exists category text,
  add column if not exists for_member_id uuid references public.members (id) on delete set null,
  add column if not exists status text not null default 'open',
  add column if not exists sketch text;

alter table public.notes drop constraint if exists notes_take_seconds_range;
alter table public.notes add constraint notes_take_seconds_range check (
  take_seconds is null or (take_id is not null and take_seconds between 0 and 7200)
);
alter table public.notes drop constraint if exists notes_category_check;
alter table public.notes add constraint notes_category_check check (
  category is null or category in ('tiempo', 'brazos', 'piernas', 'direccion', 'espacio', 'expresion', 'energia')
);
alter table public.notes drop constraint if exists notes_status_check;
alter table public.notes add constraint notes_status_check check (status in ('open', 'done'));
alter table public.notes drop constraint if exists notes_sketch_shape;
alter table public.notes add constraint notes_sketch_shape check (
  sketch is null
  or (char_length(sketch) <= 60000 and sketch ~ '^data:image/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$')
);

create index if not exists notes_take_idx on public.notes (take_id);
create index if not exists notes_for_member_idx on public.notes (for_member_id);

-- The take must be a live take of the note's own song, the recipient a live member of the group; otherwise they
-- are dropped quietly (a phone with a stale list must not lose the note over it).
create or replace function private.guard_note_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.take_id is not null and not exists (
    select 1 from public.takes t
    where t.id = new.take_id and t.video_id = new.video_id and t.archived_at is null
  ) then
    new.take_id := null;
    new.take_seconds := null;
  end if;
  if new.for_member_id is not null and not exists (
    select 1 from public.members m
    where m.id = new.for_member_id and m.crew_id = new.crew_id and m.archived_at is null
  ) then
    new.for_member_id := null;
  end if;
  if new.author_member_id is not null and not exists (
    select 1 from public.members m
    where m.id = new.author_member_id and m.crew_id = new.crew_id and m.archived_at is null
  ) then
    new.author_member_id := null;
  end if;
  return new;
end;
$$;

-- After notes_set_crew (name order: «notes_set_crew» < «notes_zz_links»), so crew_id is the video's.
drop trigger if exists notes_zz_links on public.notes;
create trigger notes_zz_links before insert or update of take_id, for_member_id, author_member_id on public.notes
  for each row execute function private.guard_note_links();

-- A note's take and moment are set when it's written; text, category, recipient, status and drawing can change.
grant update (category, for_member_id, status, sketch) on public.notes to anon, authenticated;

revoke execute on function private.guard_note_links() from public, anon, authenticated;
