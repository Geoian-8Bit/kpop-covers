-- «Repaso»: each video keeps its own speed. A take danced to the song at 0,75× plays at 1× and the song at 0,75×;
-- the group may also change the take's own speed. Song time at a take second t:
--   song_start + (t − song_lead) × (speed ÷ take_speed) + sync_adjust.
-- takes.speed (the song's speed) already allows 0,25–2 (20261016010000_takes.sql); take_speed gets the same range.
-- Both become editable from the review, with song_end_seconds (already granted) recomputed by the client.

alter table public.takes
  add column if not exists take_speed numeric(4, 3) not null default 1;

alter table public.takes drop constraint if exists takes_take_speed_range;
alter table public.takes add constraint takes_take_speed_range
  check (take_speed between 0.25 and 2);

grant update (speed, take_speed) on public.takes to anon, authenticated;
