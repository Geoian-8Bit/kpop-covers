-- Checks for 20261031130000_poll_votes_signature.sql (REQ-19.4: light signature of a poll's live ballots).
-- Run the whole file in one go as postgres (SQL editor / MCP execute_sql, or `pnpm db:test`). Acts as `anon`,
-- prints `PASS …`, raises `FAIL …` on the first problem, ends with ROLLBACK.

begin;
-- Another group to move rows into later (as postgres: anon can only write the default group).
insert into public.crews (id, name) values ('0d0d0d0d-0000-4000-8000-0000000002f1', 'Prueba firma otro grupo');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into public.members (id, name) values
  ('0d0d0d0d-0000-4000-8000-0000000002b1', 'Prueba Ana'),
  ('0d0d0d0d-0000-4000-8000-0000000002b2', 'Prueba Bea');
insert into public.wishes (id, youtube_id, title) values
  ('0d0d0d0d-0000-4000-8000-0000000002e1', 'zzSigWish01', 'Prueba deseo 1'),
  ('0d0d0d0d-0000-4000-8000-0000000002e2', 'zzSigWish02', 'Prueba deseo 2');
insert into public.polls (id, title, vote_type) values
  ('0d0d0d0d-0000-4000-8000-0000000002a1', 'Prueba firma', 'ranking');
insert into public.poll_options (id, poll_id, wish_id) values
  ('0d0d0d0d-0000-4000-8000-0000000002c1', '0d0d0d0d-0000-4000-8000-0000000002a1', '0d0d0d0d-0000-4000-8000-0000000002e1'),
  ('0d0d0d0d-0000-4000-8000-0000000002c2', '0d0d0d0d-0000-4000-8000-0000000002a1', '0d0d0d0d-0000-4000-8000-0000000002e2');

do $$
declare
  p  uuid := '0d0d0d0d-0000-4000-8000-0000000002a1';
  a  uuid := '0d0d0d0d-0000-4000-8000-0000000002b1';
  b  uuid := '0d0d0d0d-0000-4000-8000-0000000002b2';
  o1 uuid := '0d0d0d0d-0000-4000-8000-0000000002c1';
  o2 uuid := '0d0d0d0d-0000-4000-8000-0000000002c2';
  s0 text; s1 text; s2 text; s3 text; s4 text;
begin
  if (select p.provolatile <> 's' or p.prosecdef from pg_catalog.pg_proc p
      where p.oid = 'public.poll_votes_signature(uuid)'::regprocedure) then
    raise exception 'FAIL poll_votes_signature must be stable and security invoker';
  end if;

  s0 := public.poll_votes_signature(p);
  if s0 is not null then raise exception 'FAIL a poll without votes should sign null, got %', s0; end if;

  perform public.cast_vote(p, a, array[o1]);
  s1 := public.poll_votes_signature(p);
  if s1 is null then raise exception 'FAIL voting did not change the signature'; end if;
  if s1 <> md5(o1::text || ':' || a::text || ':1') then
    raise exception 'FAIL signature formula: % <> %', s1, md5(o1::text || ':' || a::text || ':1');
  end if;

  perform public.cast_vote(p, a, array[o2]);
  s2 := public.poll_votes_signature(p);
  if s2 is not distinct from s1 then raise exception 'FAIL changing the vote kept the signature'; end if;

  -- Same count and option set, different order (ranks): still a change.
  perform public.cast_vote(p, a, array[o1, o2]);
  s3 := public.poll_votes_signature(p);
  perform public.cast_vote(p, a, array[o2, o1]);
  s4 := public.poll_votes_signature(p);
  if s4 is not distinct from s3 then raise exception 'FAIL reordering the ranking kept the signature'; end if;

  -- Only the live ballot counts: going back to the first ballot gives the first signature again.
  perform public.cast_vote(p, a, array[o1]);
  if public.poll_votes_signature(p) is distinct from s1 then
    raise exception 'FAIL the signature depends on archived ballots';
  end if;

  perform public.cast_vote(p, b, array[o1]);
  if public.poll_votes_signature(p) is not distinct from s1 then
    raise exception 'FAIL a second voter kept the signature';
  end if;

  -- Withdrawing (empty ballot) changes it back; withdrawing the last vote gives null.
  perform public.cast_vote(p, b, array[]::uuid[]);
  if public.poll_votes_signature(p) is distinct from s1 then raise exception 'FAIL withdrawing did not change the signature'; end if;
  perform public.cast_vote(p, a, array[]::uuid[]);
  if public.poll_votes_signature(p) is not null then raise exception 'FAIL no live votes should sign null'; end if;

  perform public.cast_vote(p, a, array[o1]);
  raise notice 'PASS the signature changes on vote, change, reorder and withdrawal, and ignores archived ballots';
end $$;

-- RLS decides: votes moved to another group, or of an archived poll, are not signed for anon.
reset role;
update public.poll_votes set crew_id = '0d0d0d0d-0000-4000-8000-0000000002f1'
where poll_id = '0d0d0d0d-0000-4000-8000-0000000002a1';
set local role anon;
do $$
begin
  if public.poll_votes_signature('0d0d0d0d-0000-4000-8000-0000000002a1') is not null then
    raise exception 'FAIL votes of another group were signed for anon';
  end if;
end $$;
reset role;
update public.poll_votes set crew_id = (select private.default_group())
where poll_id = '0d0d0d0d-0000-4000-8000-0000000002a1';
set local role anon;
do $$
begin
  if public.poll_votes_signature('0d0d0d0d-0000-4000-8000-0000000002a1') is null then
    raise exception 'FAIL votes back in the group should be signed again';
  end if;
end $$;
delete from public.polls where id = '0d0d0d0d-0000-4000-8000-0000000002a1';
do $$
begin
  if public.poll_votes_signature('0d0d0d0d-0000-4000-8000-0000000002a1') is not null then
    raise exception 'FAIL votes of an archived poll were signed';
  end if;
  raise notice 'PASS the signature respects RLS (other group, archived poll)';
end $$;

rollback;
