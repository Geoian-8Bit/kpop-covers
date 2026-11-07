-- Takes recorded outside the app (a video uploaded from the gallery) need two things the in-app recorder never did:
--   takes.label              a name typed by the group («Grupo · primera versión»), shown instead of «Sin nombre»;
--   takes.song_lead_seconds  the take's second where the song starts (the dance starts 12,57 s into the video).
-- Song time at a take second t: song_start + (t − song_lead) × speed + sync_adjust.

alter table public.takes
  add column if not exists label text,
  add column if not exists song_lead_seconds numeric(8, 3) not null default 0;

alter table public.takes drop constraint if exists takes_label_length;
alter table public.takes add constraint takes_label_length
  check (label is null or char_length(btrim(label)) between 1 and 80);

alter table public.takes drop constraint if exists takes_song_lead_range;
alter table public.takes add constraint takes_song_lead_range
  check (song_lead_seconds between 0 and 600);

grant update (label, song_lead_seconds) on public.takes to anon, authenticated;
