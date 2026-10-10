-- Open access without login: anyone with the URL can use the app, scoped to the single (oldest) group.
create or replace function private.default_group()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.crews order by created_at limit 1;
$$;

grant usage on schema private to anon;
revoke execute on function private.default_group() from public;
grant execute on function private.default_group() to anon, authenticated;

create policy crews_open_select on public.crews for select to anon, authenticated
  using (id = private.default_group());

create policy videos_open_all on public.videos for all to anon, authenticated
  using (crew_id = private.default_group()) with check (crew_id = private.default_group());

create policy clips_open_all on public.clips for all to anon, authenticated
  using (crew_id = private.default_group()) with check (crew_id = private.default_group());

create policy videos_bucket_open_select on storage.objects for select to anon, authenticated
  using (bucket_id = 'videos' and (storage.foldername(name))[1] = private.default_group()::text);
create policy videos_bucket_open_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'videos' and (storage.foldername(name))[1] = private.default_group()::text);
create policy videos_bucket_open_delete on storage.objects for delete to anon, authenticated
  using (bucket_id = 'videos' and (storage.foldername(name))[1] = private.default_group()::text);
