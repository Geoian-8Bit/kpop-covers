-- One Shoot · F1 review round 2: the linked file's identity is also protected when it only lives on one phone.
--
-- A YouTube entry whose file is bigger than 50 MB is linked with file_name / file_size / duration but no cloud
-- path. A second phone with a stale view could describe a different file over it. Now, for YouTube entries, once a
-- file is described its description only changes by removing it first (file_name → null, as «Quitar el archivo»
-- and «Cambiar archivo» do), whether or not it is in the cloud. Uploaded videos are not affected.

create or replace function private.guard_linked_file()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user::text in ('anon', 'authenticated')
     and old.source = 'youtube'
     and old.file_name is not null
     and new.file_name is not null
     and (
       new.file_name is distinct from old.file_name
       or new.file_size is distinct from old.file_size
       or new.file_duration_seconds is distinct from old.file_duration_seconds
     ) then
    raise exception 'file_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_linked_file() from public, anon, authenticated;
