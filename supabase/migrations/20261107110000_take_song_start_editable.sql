-- A take uploaded from the gallery may cover only part of the song: in «Repaso» the group says which second of the
-- song matches the take's start point (song_lead_seconds). song_start_seconds becomes editable, and song_end_seconds
-- with it (the client sends both, so `song_end_seconds >= song_start_seconds` keeps holding).

grant update (song_start_seconds, song_end_seconds) on public.takes to anon, authenticated;
