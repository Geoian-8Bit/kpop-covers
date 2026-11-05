-- One Shoot · Pósteres de vídeos subidos fuera de las listas (REQ-14).
-- An uploaded video keeps its poster as a base64 JPEG in `thumbnail_url` (`data:…`, up to 150 000 chars). Every list
-- (library, bags, events, RPD) used to download it for each row: 0.6–1.4 MB for 30 uploads. Three generated columns
-- let the lists ask for a light row and fetch the posters apart, once, keyed by a revision:
--   poster_inline      — true when the poster is inline (`data:`), false otherwise (also for no poster at all);
--   list_thumbnail_url — the thumbnail the lists show: the YouTube URL, or null for an inline poster;
--   poster_rev         — md5 of the inline poster (changes when another file is linked), null otherwise.
--
-- Additive and data-free: Postgres fills the generated columns for every existing row (one table rewrite of
-- public.videos). Generated columns cannot be written, so no update grant is added; the table-level select grant
-- already covers them and RLS / delete = archive stay exactly as they are.
-- Apply it BEFORE deploying the client that selects these columns (it would otherwise get a 400 on every list).
-- Checks: supabase/tests/video_list_columns_checks.sql.

alter table public.videos
  add column if not exists poster_inline boolean
    generated always as (coalesce(thumbnail_url like 'data:%', false)) stored,
  add column if not exists list_thumbnail_url text
    generated always as (case when thumbnail_url like 'data:%' then null else thumbnail_url end) stored,
  add column if not exists poster_rev text
    generated always as (case when thumbnail_url like 'data:%' then md5(thumbnail_url) end) stored;

comment on column public.videos.poster_inline is 'REQ-14: true when thumbnail_url is an inline data: poster (uploaded video).';
comment on column public.videos.list_thumbnail_url is 'REQ-14: thumbnail for lists; null when the poster is inline (fetched apart).';
comment on column public.videos.poster_rev is 'REQ-14: md5 of the inline poster, the cache key of the poster query; null otherwise.';
