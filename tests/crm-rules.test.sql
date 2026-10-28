-- CRM v3.15 access and integrity rules. Plain SQL asserts, one PASS notice per check.
-- Run on a DISPOSABLE database only (local Postgres with tests/local-stub.sql and supabase/schema.sql applied).
--   psql -d crm_test -v ON_ERROR_STOP=1 -f tests/crm-rules.test.sql
-- Everything runs inside one transaction that is rolled back at the end, so nothing is left behind.
-- Required checks: viewer cannot update units; agent cannot delete; double sale is refused with an
-- audit entry; audit_log cannot be updated or deleted. Further checks cover scope, overrides and numbering.

begin;

create schema crm_test;
grant usage on schema crm_test to authenticated, anon;

-- Switch the session to a signed-in user (or back to the superuser with crm_test.su()).
create function crm_test.as(p_user uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', p_user::text, false);
  execute 'set role authenticated';
end $$;

create function crm_test.su() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', false);
end $$;

-- Runs a statement as the current role and returns its SQLSTATE, or 'none' when it succeeded.
create function crm_test.err(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'none';
exception when others then
  return sqlstate;
end $$;

-- Runs a statement as the current role and returns how many rows it touched.
create function crm_test.rows(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;

create function crm_test.check(p_name text, p_ok boolean) returns void language plpgsql as $$
begin
  if p_ok then raise notice 'PASS: %', p_name;
  else raise exception 'FAIL: %', p_name; end if;
end $$;

grant execute on all functions in schema crm_test to authenticated, anon;

-- ---------------------------------------------------------------------
-- Fixtures (superuser). Fake users only; no passwords, no real data.
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'yosmos@vrc.internal'),
  ('a0000000-0000-0000-0000-000000000002', 'agent-a@vrc.internal'),
  ('a0000000-0000-0000-0000-000000000003', 'agent-b@vrc.internal'),
  ('a0000000-0000-0000-0000-000000000004', 'viewer@vrc.internal'),
  ('a0000000-0000-0000-0000-000000000005', 'agent-c@vrc.internal');

insert into public.profiles (id, username, full_name, role, permissions, active) values
  ('a0000000-0000-0000-0000-000000000001', 'yosmos',  'Admin',    'admin',  '{}', true),
  ('a0000000-0000-0000-0000-000000000002', 'agent-a', 'Agent A', 'agent',  '{"change_units": true, "create_deals": true}', true),
  ('a0000000-0000-0000-0000-000000000003', 'agent-b', 'Agent B', 'agent',  '{"change_units": true, "create_deals": true}', true),
  ('a0000000-0000-0000-0000-000000000004', 'viewer',  'Viewer',   'viewer', '{"view_all_clients": true, "change_units": true, "create_deals": true, "delete": true}', true),
  ('a0000000-0000-0000-0000-000000000005', 'agent-c', 'Agent C', 'agent',  '{}', true);

-- ---------------------------------------------------------------------
-- 1. Viewer cannot update units (even with change_units toggled on)
-- ---------------------------------------------------------------------
do $$
declare v text; n bigint;
begin
  perform crm_test.as('a0000000-0000-0000-0000-000000000004');
  v := crm_test.err($q$ select public.set_unit_status('TEST-1', 'reserved', 'c-1', 'd-1') $q$);
  perform crm_test.check('viewer: set_unit_status is refused (sqlstate 42501)', v = '42501');
  v := crm_test.err($q$ update public.units set note = 'x' where id = 'TEST-1' $q$);
  perform crm_test.check('viewer: direct UPDATE on units is refused (sqlstate 42501)', v = '42501');
  v := crm_test.err($q$ update public.units set status = 'sold' where id = 'TEST-1' $q$);
  perform crm_test.check('viewer: direct UPDATE of status is refused (sqlstate 42501)', v = '42501');
  perform crm_test.su();
  select count(*) into n from public.units where id = 'TEST-1';
  perform crm_test.check('viewer: no unit row was created or changed', n = 0);
end $$;

-- ---------------------------------------------------------------------
-- 2. Agent cannot delete (clients or deals), and cannot see another agent's records
-- ---------------------------------------------------------------------
do $$
declare n bigint;
begin
  perform crm_test.as('a0000000-0000-0000-0000-000000000002');
  insert into public.clients (id, data) values ('c-test', '{"name": "Test client", "stage": "lead"}');
  insert into public.deals (id, data) values ('d-test', '{"clientId": "c-test", "status": "active"}');
  n := crm_test.rows($q$ delete from public.clients where id = 'c-test' $q$);
  perform crm_test.check('agent: DELETE on clients affects 0 rows', n = 0);
  n := crm_test.rows($q$ delete from public.deals where id = 'd-test' $q$);
  perform crm_test.check('agent: DELETE on deals affects 0 rows', n = 0);
  perform crm_test.su();
  select count(*) into n from public.clients where id = 'c-test';
  perform crm_test.check('agent: client still exists after the refused delete', n = 1);
end $$;

do $$
declare n bigint;
begin
  perform crm_test.as('a0000000-0000-0000-0000-000000000003');     -- agent B, no view_all_clients
  select count(*) into n from public.clients where id = 'c-test';
  perform crm_test.check('agent B cannot read agent A''s client (owner scope)', n = 0);
  perform crm_test.su();
end $$;

do $$
declare n bigint;
begin
  perform crm_test.as('a0000000-0000-0000-0000-000000000004');     -- viewer with view_all_clients
  select count(*) into n from public.clients where id = 'c-test';
  perform crm_test.check('viewer with view_all_clients can read the client (read-only)', n = 1);
  perform crm_test.su();
end $$;

-- ---------------------------------------------------------------------
-- 3. Double sale is refused, and the refusal is in the audit log
-- ---------------------------------------------------------------------
do $$
declare r jsonb; n bigint; st text;
begin
  perform crm_test.as('a0000000-0000-0000-0000-000000000002');     -- agent A reserves TEST-2
  r := public.set_unit_status('TEST-2', 'reserved', 'c-1', 'd-1');
  perform crm_test.check('agent A reserves an available unit', (r ->> 'ok')::boolean = true);

  perform crm_test.as('a0000000-0000-0000-0000-000000000003');     -- agent B tries to sell it to someone else
  r := public.set_unit_status('TEST-2', 'sold', 'c-2', 'd-2');
  perform crm_test.check('double sale is refused (code unit_taken)', (r ->> 'ok')::boolean = false and r ->> 'code' = 'unit_taken');

  perform crm_test.su();
  select status into st from public.units where id = 'TEST-2';
  perform crm_test.check('double sale: unit is still reserved by agent A''s client', st = 'reserved');
  select count(*) into n from public.units where id = 'TEST-2' and client_id = 'c-1';
  perform crm_test.check('double sale: unit still belongs to client c-1', n = 1);
  select count(*) into n from public.audit_log
    where action = 'unit.refused' and entity = 'units' and entity_id = 'TEST-2'
      and user_id = 'a0000000-0000-0000-0000-000000000003';
  perform crm_test.check('double sale: refusal is written to audit_log with agent B as actor', n = 1);
end $$;

-- Same client may move reserved -> sold (normal progression), by an agent who owns the change.
do $$
declare r jsonb; st text;
begin
  perform crm_test.as('a0000000-0000-0000-0000-000000000002');
  r := public.set_unit_status('TEST-2', 'sold', 'c-1', 'd-1');
  perform crm_test.check('same client may move reserved -> sold', (r ->> 'ok')::boolean = true);
  perform crm_test.su();
  select status into st from public.units where id = 'TEST-2';
  perform crm_test.check('reserved -> sold is stored', st = 'sold');
end $$;

-- The holding client may release its own unit; another client may not.
do $$
declare r jsonb; st text;
begin
  perform crm_test.as('a0000000-0000-0000-0000-000000000003');     -- agent B, client c-2 does not hold TEST-2
  r := public.set_unit_status('TEST-2', 'available', 'c-2', null);
  perform crm_test.check('another client cannot release a unit it does not hold', r ->> 'code' = 'unit_taken');
  perform crm_test.as('a0000000-0000-0000-0000-000000000002');     -- agent A, client c-1 holds TEST-2 (sold)
  r := public.set_unit_status('TEST-2', 'available', 'c-1', null);
  perform crm_test.check('holding client may release its own sold unit (cancelled deal)', (r ->> 'ok')::boolean = true);
  perform crm_test.su();
  select status into st from public.units where id = 'TEST-2';
  perform crm_test.check('release is stored as available', st = 'available');
end $$;

-- ---------------------------------------------------------------------
-- 4. audit_log is append-only: no update, no delete, no truncate, even for the admin
-- ---------------------------------------------------------------------
do $$
declare v text; n_before bigint; n_after bigint;
begin
  perform crm_test.su();
  select count(*) into n_before from public.audit_log;
  perform crm_test.check('audit_log has rows to protect', n_before > 0);

  perform crm_test.as('a0000000-0000-0000-0000-000000000001');     -- admin, signed in
  v := crm_test.err($q$ update public.audit_log set action = 'tampered' $q$);
  perform crm_test.check('admin cannot UPDATE audit_log (sqlstate 42501)', v = '42501');
  v := crm_test.err($q$ delete from public.audit_log $q$);
  perform crm_test.check('admin cannot DELETE from audit_log (sqlstate 42501)', v = '42501');
  v := crm_test.err($q$ truncate public.audit_log $q$);
  perform crm_test.check('admin cannot TRUNCATE audit_log (sqlstate 42501)', v = '42501');

  perform crm_test.su();
  v := crm_test.err($q$ delete from public.audit_log $q$);            -- superuser bypasses RLS and grants
  perform crm_test.check('even the database owner is stopped by the append-only trigger', v = '42501');
  select count(*) into n_after from public.audit_log;
  perform crm_test.check('audit_log row count is unchanged by every attempt', n_before = n_after);
end $$;

do $$
declare n bigint;
begin
  perform crm_test.as('a0000000-0000-0000-0000-000000000002');     -- agent: cannot read the audit log
  select count(*) into n from public.audit_log;
  perform crm_test.check('agent sees no audit_log rows (admin only)', n = 0);
  perform crm_test.su();
end $$;

-- ---------------------------------------------------------------------
-- 5. Agent without change_units cannot change units
-- ---------------------------------------------------------------------
do $$
declare v text;
begin
  perform crm_test.as('a0000000-0000-0000-0000-000000000005');
  v := crm_test.err($q$ select public.set_unit_status('TEST-3', 'reserved', 'c-3', 'd-3') $q$);
  perform crm_test.check('agent without change_units is refused (sqlstate 42501)', v = '42501');
  perform crm_test.su();
end $$;

-- ---------------------------------------------------------------------
-- 6. Override path: admin override is allowed and audited; request/approve for other users
-- ---------------------------------------------------------------------
do $$
declare r jsonb; st text; req bigint; rr jsonb; v text;
begin
  perform crm_test.as('a0000000-0000-0000-0000-000000000003');     -- agent B reserves TEST-4
  r := public.set_unit_status('TEST-4', 'reserved', 'c-4', 'd-4');
  perform crm_test.check('agent B reserves TEST-4', (r ->> 'ok')::boolean = true);

  r := public.set_unit_status('TEST-4', 'blocked');                -- agent A tries to block it
  perform crm_test.check('agent A cannot change a taken unit directly', r ->> 'code' = 'unit_taken');

  perform crm_test.as('a0000000-0000-0000-0000-000000000002');
  req := public.request_unit_change('TEST-4', 'blocked', null, null, 'Developer hold');
  perform crm_test.check('agent A can file an override request', req is not null);

  perform crm_test.as('a0000000-0000-0000-0000-000000000003');     -- agent B cannot approve it
  v := crm_test.err($q$ select public.resolve_unit_request(1, true, 'x') $q$);
  perform crm_test.check('non-admin cannot resolve a request (sqlstate 42501)', v = '42501');

  perform crm_test.as('a0000000-0000-0000-0000-000000000001');     -- admin approves
  rr := public.resolve_unit_request(req, true, 'approved in test');
  perform crm_test.check('admin approves the request', (rr ->> 'ok')::boolean = true);
  perform crm_test.su();
  select status into st from public.units where id = 'TEST-4';
  perform crm_test.check('approved request applies the change', st = 'blocked');
  perform crm_test.check('approval is audited', exists (select 1 from public.audit_log where action = 'unit.override.approved' and entity_id = 'TEST-4'));

  perform crm_test.as('a0000000-0000-0000-0000-000000000001');     -- admin releases TEST-4 (blocked) directly
  rr := public.set_unit_status('TEST-4', 'available');
  perform crm_test.check('admin override succeeds', (rr ->> 'ok')::boolean = true and (rr ->> 'override')::boolean = true);
  perform crm_test.su();
  perform crm_test.check('admin override is audited as unit.override', exists (select 1 from public.audit_log where action = 'unit.override' and entity_id = 'TEST-4'));
end $$;

-- ---------------------------------------------------------------------
-- 7. Users cannot change profiles (not even their own role)
-- ---------------------------------------------------------------------
do $$
declare n bigint; role_now text;
begin
  perform crm_test.as('a0000000-0000-0000-0000-000000000002');
  n := crm_test.rows($q$ update public.profiles set role = 'admin' where id = 'a0000000-0000-0000-0000-000000000002' $q$);
  perform crm_test.check('agent cannot promote self (0 rows)', n = 0);
  n := crm_test.rows($q$ update public.profiles set permissions = '{"delete": true}' where id = 'a0000000-0000-0000-0000-000000000002' $q$);
  perform crm_test.check('agent cannot grant self permissions (0 rows)', n = 0);
  perform crm_test.su();
  select role into role_now from public.profiles where id = 'a0000000-0000-0000-0000-000000000002';
  perform crm_test.check('agent role is still agent', role_now = 'agent');
end $$;

-- ---------------------------------------------------------------------
-- 8. Settings: only the admin writes them
-- ---------------------------------------------------------------------
do $$
declare n bigint;
begin
  perform crm_test.su();
  insert into public.settings (id, data) values ('main', '{"senderName": "VRC"}') on conflict (id) do nothing;
  perform crm_test.as('a0000000-0000-0000-0000-000000000002');
  n := crm_test.rows($q$ update public.settings set data = '{"senderName": "hacked"}' where id = 'main' $q$);
  perform crm_test.check('agent cannot change settings (0 rows)', n = 0);
  perform crm_test.su();
end $$;

-- ---------------------------------------------------------------------
-- 9. Deactivated users get nothing, even with a valid session
-- ---------------------------------------------------------------------
do $$
declare n bigint; v text;
begin
  perform crm_test.su();
  update public.profiles set active = false where id = 'a0000000-0000-0000-0000-000000000005';
  perform crm_test.as('a0000000-0000-0000-0000-000000000005');
  select count(*) into n from public.clients;
  perform crm_test.check('deactivated user reads no clients', n = 0);
  v := crm_test.err($q$ select public.set_unit_status('TEST-5', 'reserved', 'c-5', 'd-5') $q$);
  perform crm_test.check('deactivated user cannot change units (sqlstate 42501)', v = '42501');
  perform crm_test.su();
end $$;

-- ---------------------------------------------------------------------
-- 10. Document numbers come from an atomic counter; viewers cannot take one
-- ---------------------------------------------------------------------
do $$
declare a int; b int; v text;
begin
  perform crm_test.as('a0000000-0000-0000-0000-000000000002');
  a := public.next_counter('cy.proforma.2026', 1);
  b := public.next_counter('cy.proforma.2026', 1);
  perform crm_test.check('next_counter gives 1 then 2', a = 1 and b = 2);
  perform crm_test.as('a0000000-0000-0000-0000-000000000004');
  v := crm_test.err($q$ select public.next_counter('cy.proforma.2026', 1) $q$);
  perform crm_test.check('viewer cannot take a document number (sqlstate 42501)', v = '42501');
  perform crm_test.su();
end $$;

-- Everything above was a check; roll it all back so the database is left as it was.
rollback;
\echo 'ALL CRM RULE CHECKS PASSED (transaction rolled back)'
