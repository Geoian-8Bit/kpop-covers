-- One Shoot · Firma ligera de los votos de una votación (REQ-19.4).
-- PollPage polls every 8 s and used to download every ballot. It now asks this signature first and only downloads
-- the ballots when it changes. A count + latest date would miss a changed vote (cast_vote archives the old ballot and
-- writes a new one: same count, and a re-vote may restore the same rows), so the signature hashes the live ballots
-- themselves.
--
-- SECURITY INVOKER + stable: it reads poll_votes with the caller's own permissions, so RLS decides which votes count
-- (same rows a direct select would return: live votes of a live poll of the default group). A poll with no live
-- votes (or one the caller cannot see) gives null.
-- Additive: nothing else changes. Checks: supabase/tests/poll_votes_signature_checks.sql.

create or replace function public.poll_votes_signature(p_poll uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select md5(string_agg(
           v.option_id::text || ':' || v.member_id::text || ':' || coalesce(v.rank::text, ''),
           ',' order by v.option_id, v.member_id
         ))
  from public.poll_votes v
  where v.poll_id = p_poll and v.archived_at is null;
$$;

revoke all on function public.poll_votes_signature(uuid) from public;
grant execute on function public.poll_votes_signature(uuid) to anon, authenticated;
