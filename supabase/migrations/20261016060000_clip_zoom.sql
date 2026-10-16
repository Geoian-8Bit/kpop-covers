-- One Shoot · ideas, fase 4: F9 (zoom sobre el vídeo) — «Guardar con un clip: al abrir el clip, se ve ampliado».
-- Additive: three columns with defaults on clips (no zoom = scale 1, centred). F7 (aplauso) and F8 (clips dentro de
-- las tomas) need no schema: F8 creates ordinary clips of the song.
--
--   zoom_scale  1 (whole video) … 4
--   zoom_x / zoom_y  the zoomed area's centre, as a fraction of the frame (0…1, 0.5 = centre). Mirroring flips x
--                    when shown (the zoom follows the picture).

alter table public.clips
  add column if not exists zoom_scale numeric(4, 2) not null default 1,
  add column if not exists zoom_x numeric(5, 4) not null default 0.5,
  add column if not exists zoom_y numeric(5, 4) not null default 0.5;

alter table public.clips drop constraint if exists clips_zoom_range;
alter table public.clips add constraint clips_zoom_range check (
  zoom_scale between 1 and 4 and zoom_x between 0 and 1 and zoom_y between 0 and 1
);

grant update (zoom_scale, zoom_x, zoom_y) on public.clips to anon, authenticated;
