-- Checks for renaming and deleting members from «¿Quién eres?» / Ajustes (no new migration: the rules come from
-- 20261016000000_linked_file_and_members.sql). Run the whole file in one go as postgres (SQL editor / MCP
-- execute_sql, or `pnpm db:test`). Acts as `anon`, prints `PASS …`, raises `FAIL …` on the first problem, ends
-- with ROLLBACK.

begin;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into public.members (id, name) values
  ('0e0e0e0e-0000-4000-8000-0000000002a1', 'Prueba Mal Escritto'),
  ('0e0e0e0e-0000-4000-8000-0000000002a2', 'Prueba Otra');
insert into public.videos (id, crew_id, title, source, youtube_id)
values ('0e0e0e0e-0000-4000-8000-0000000002b1', (select private.default_group()), 'Prueba miembros', 'youtube', 'zzMembers01');
insert into public.notes (id, video_id, at_seconds, body, author_member_id)
values ('0e0e0e0e-0000-4000-8000-0000000002c1', '0e0e0e0e-0000-4000-8000-0000000002b1', 1, 'firmada',
        '0e0e0e0e-0000-4000-8000-0000000002a1');

-- Rename: the name (and colour) can change; a repeated or empty name is refused; nothing else can be written.
update public.members set name = 'Prueba Mal Escrito', color = 'sakura' where id = '0e0e0e0e-0000-4000-8000-0000000002a1';
do $$
begin
  if (select name from public.members where id = '0e0e0e0e-0000-4000-8000-0000000002a1') is distinct from 'Prueba Mal Escrito' then
    raise exception 'FAIL anon could not rename a member';
  end if;
  begin
    update public.members set name = '  prueba otra ' where id = '0e0e0e0e-0000-4000-8000-0000000002a1';
    raise exception 'FAIL a repeated name (case and spaces ignored) was accepted';
  exception when unique_violation then null;
  end;
  begin
    update public.members set name = '   ' where id = '0e0e0e0e-0000-4000-8000-0000000002a1';
    raise exception 'FAIL an empty name was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.members set archived_at = now() where id = '0e0e0e0e-0000-4000-8000-0000000002a1';
    raise exception 'FAIL anon wrote archived_at directly';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.members set crew_id = gen_random_uuid() where id = '0e0e0e0e-0000-4000-8000-0000000002a1';
    raise exception 'FAIL anon moved a member to another group';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS members can be renamed; repeated, empty and non-name columns are refused';
end $$;

-- Delete = archive: the member leaves the list, what they signed keeps pointing at them, the name is free again.
delete from public.members where id = '0e0e0e0e-0000-4000-8000-0000000002a1';
do $$
begin
  if exists (select 1 from public.members where id = '0e0e0e0e-0000-4000-8000-0000000002a1') then
    raise exception 'FAIL a deleted member is still listed';
  end if;
  if (select author_member_id from public.notes where id = '0e0e0e0e-0000-4000-8000-0000000002c1')
     is distinct from '0e0e0e0e-0000-4000-8000-0000000002a1'::uuid then
    raise exception 'FAIL deleting a member touched the notes they signed (row was really deleted?)';
  end if;
  update public.members set name = 'Prueba Revive' where id = '0e0e0e0e-0000-4000-8000-0000000002a1';
  if found then
    raise exception 'FAIL an archived member could still be renamed';
  end if;
  insert into public.members (name) values ('Prueba Mal Escrito');
  raise notice 'PASS deleting archives the member, keeps what they signed and frees the name';
end $$;

rollback;
