-- RLS helpers do not need to be callable over the REST API.
create schema if not exists private;
grant usage on schema private to authenticated;
alter function public.is_crew_member(uuid) set schema private;
alter function public.shares_crew_with(uuid) set schema private;
