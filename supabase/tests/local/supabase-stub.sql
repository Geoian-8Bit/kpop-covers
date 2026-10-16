-- Minimal stand-in for what a Supabase project already has before our migrations run.
-- Only for the local PGlite harness (supabase/tests/local/run.mjs); never apply this to a real project.
-- It mirrors Supabase's defaults closely enough for supabase/migrations/*.sql and supabase/tests/*.sql:
-- the API roles, auth.uid()/role()/jwt() reading the request claims, the storage tables + foldername(), the
-- extensions schema with pgcrypto, and the default grants that make every new public table reachable by the API
-- roles (RLS is what actually limits them).

-- ─────────────────────────────────────────────────────────────
-- Roles (PostgREST switches to one of these per request)
-- ─────────────────────────────────────────────────────────────

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator noinherit; -- login role of PostgREST in Supabase; here only for completeness
grant anon, authenticated, service_role to authenticator;

-- ─────────────────────────────────────────────────────────────
-- extensions: pgcrypto lives here (migrations call extensions.gen_random_bytes)
-- ─────────────────────────────────────────────────────────────

create schema extensions;
create extension pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- public: Supabase's default privileges for objects postgres creates
-- ─────────────────────────────────────────────────────────────

grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- auth: users table + the JWT helpers (same bodies as Supabase's)
-- ─────────────────────────────────────────────────────────────

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id                 uuid primary key,
  email              text,
  role               text,
  raw_app_meta_data  jsonb,
  raw_user_meta_data jsonb,
  is_anonymous       boolean not null default false,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create function auth.role() returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- storage: buckets/objects (RLS on, API roles get table privileges) + foldername()
-- ─────────────────────────────────────────────────────────────

create schema storage;
grant usage on schema storage to anon, authenticated, service_role;

create table storage.buckets (
  id                 text primary key,
  name               text not null,
  owner              uuid,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);
create unique index bname on storage.buckets (name);

create table storage.objects (
  id               uuid primary key default gen_random_uuid(),
  bucket_id        text references storage.buckets (id),
  name             text,
  owner            uuid,
  metadata         jsonb,
  path_tokens      text[] generated always as (string_to_array(name, '/')) stored,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  last_accessed_at timestamptz default now()
);
create unique index bucketid_objname on storage.objects (bucket_id, name);

alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;

-- Same as Supabase: every path segment except the file name.
create function storage.foldername(name text) returns text[]
language plpgsql
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end
$$;

grant execute on function storage.foldername(text) to anon, authenticated, service_role;
