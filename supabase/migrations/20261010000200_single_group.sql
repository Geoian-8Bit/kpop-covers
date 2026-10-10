-- One shared group for the whole app: every signed-in user joins the oldest crew (created on first use).
create or replace function public.join_group()
returns public.crews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_crew public.crews;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;
  select * into v_crew from public.crews order by created_at limit 1;
  if v_crew.id is null then
    insert into public.crews (name, created_by) values ('Coverscape', (select auth.uid())) returning * into v_crew;
    insert into public.crew_members (crew_id, user_id, role) values (v_crew.id, (select auth.uid()), 'owner');
  else
    insert into public.crew_members (crew_id, user_id, role)
    values (v_crew.id, (select auth.uid()), 'member')
    on conflict do nothing;
  end if;
  return v_crew;
end;
$$;

revoke execute on function public.join_group() from public, anon;
grant execute on function public.join_group() to authenticated;
