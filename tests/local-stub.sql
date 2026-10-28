-- Local test stub: reproduces only the Supabase pieces the CRM schema depends on
-- (roles anon / authenticated / service_role, auth.users, auth.uid(), the realtime publication).
-- Run on a DISPOSABLE local Postgres database only, never on the real project:
--   psql -d crm_test -v ON_ERROR_STOP=1 -f tests/local-stub.sql
--   psql -d crm_test -v ON_ERROR_STOP=1 -f supabase/schema.sql
--   psql -d crm_test -v ON_ERROR_STOP=1 -f tests/crm-rules.test.sql

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text unique);

-- Same contract as Supabase: the caller's user id comes from the JWT claim set for the request.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create publication supabase_realtime;
