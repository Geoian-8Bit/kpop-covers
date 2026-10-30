-- One Shoot · Pantalla completa vertical y horizontal (REQ-02).
-- Additive: one nullable column. A YouTube video's proportion (width / height) is not known to the browser until the
-- iframe plays, so it is saved when the video is added (oEmbed size, or 9/16 for a /shorts/ link). Null = unknown,
-- treated as horizontal (the behaviour before). Existing videos stay null: no data migration.
-- Only set in the insert (anon can already insert videos); the update grant on videos stays as it is.

alter table public.videos
  add column if not exists aspect_ratio numeric(7, 4)
  check (aspect_ratio is null or aspect_ratio between 0.2 and 5);

comment on column public.videos.aspect_ratio is 'Width / height of the video when known (YouTube: oEmbed or /shorts/). Null: unknown, shown as horizontal.';
