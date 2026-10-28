-- =====================================================================
-- VILNYI RIVER CITY — CRM back office: Supabase schema (CRM v3.15)
-- Target project: vilnyi-gt-river (eu-central-1, free plan). NOT APPLIED YET.
-- Apply once, from the Supabase SQL editor, by the owner (see supabase/migrate-from-claude.md).
-- Contains no secrets. The service_role key is never used by the browser and never appears here.
--
-- Design rules
--   * RLS is enabled on every table. Anonymous (anon) users get nothing.
--   * Record tables keep the CRM document in a jsonb column `data` (same shape the views already use),
--     plus the few columns the rules need (owner_id, status, ...).
--   * A unit's status changes only through public.set_unit_status(), which locks the row,
--     refuses a double sale or any change by a non-admin on a taken unit, and writes audit_log.
--   * audit_log is append-only: no UPDATE/DELETE/TRUNCATE privilege and a trigger that refuses them.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Profiles (one row per CRM user; id = auth.users.id)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null unique check (username ~ '^[a-z0-9][a-z0-9._-]{1,31}$'),
  full_name   text not null default '',
  role        text not null check (role in ('admin', 'manager', 'agent', 'viewer')),
  permissions jsonb not null default '{}'::jsonb,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Permission keys: view_all_clients, change_units, create_deals, delete, send_emails, manage_users.
-- manage_users is stored and shown, but in v3.15 only the admin role manages profiles (RLS below).

-- ---------------------------------------------------------------------
-- 2. Units (only units that differ from 'available' need a row)
-- ---------------------------------------------------------------------
create table if not exists public.units (
  id          text primary key,
  status      text not null default 'available' check (status in ('available', 'reserved', 'sold', 'blocked')),
  client_id   text,
  deal_id     text,
  note        text not null default '',
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

-- ---------------------------------------------------------------------
-- 3. Record tables (clients, deals, documents, tasks, emails, templates, leads, reservations, settings)
-- ---------------------------------------------------------------------
create table if not exists public.clients (
  id          text primary key,
  owner_id    uuid references auth.users(id) on delete set null,
  data        jsonb not null default '{}'::jsonb,   -- timeline[] embedded (bounded, 400 entries)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

create table if not exists public.deals (
  id          text primary key,
  owner_id    uuid references auth.users(id) on delete set null,
  data        jsonb not null default '{}'::jsonb,   -- schedule[] and payments[] embedded
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

create table if not exists public.documents (
  id          text primary key,
  owner_id    uuid references auth.users(id) on delete set null,
  data        jsonb not null default '{}'::jsonb,   -- includes the snapshot used to re-render the PDF
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

create table if not exists public.tasks (
  id          text primary key,
  owner_id    uuid references auth.users(id) on delete set null,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

create table if not exists public.emails (
  id          text primary key,
  owner_id    uuid references auth.users(id) on delete set null,
  data        jsonb not null default '{}'::jsonb,   -- mass-email run with per-recipient log
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

create table if not exists public.templates (
  id          text primary key,
  owner_id    uuid references auth.users(id) on delete set null,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

-- Web leads and reservations are still written by the public site (booking.js) into the old store
-- until v3.16. Here they are read-only for the CRM, except that CRM staff may cancel a reservation.
create table if not exists public.leads (
  id          text primary key,
  owner_id    uuid references auth.users(id) on delete set null,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

create table if not exists public.reservations (
  id          text primary key,                      -- resNo
  owner_id    uuid references auth.users(id) on delete set null,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

create table if not exists public.settings (
  id          text primary key,                      -- 'main'
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

-- Document number counters: changed only by public.next_counter().
create table if not exists public.counters (
  key    text primary key,
  value  integer not null
);

-- ---------------------------------------------------------------------
-- 4. Override requests (a non-admin asks an admin to change a taken unit)
-- ---------------------------------------------------------------------
create table if not exists public.unit_requests (
  id                   bigserial primary key,
  requester            uuid not null references auth.users(id) on delete cascade,
  unit_id              text not null,
  requested_status     text not null check (requested_status in ('available', 'reserved', 'sold', 'blocked')),
  requested_client_id  text,
  requested_deal_id    text,
  reason               text not null check (length(btrim(reason)) >= 3),
  status               text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  resolved_by          uuid references auth.users(id) on delete set null,
  resolved_at          timestamptz,
  resolution_note      text,
  created_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. Audit log (append-only)
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id          bigserial primary key,
  user_id     uuid references auth.users(id) on delete set null,
  action      text not null,
  entity      text,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. Helper functions (used by the policies and the RPCs)
--    SECURITY DEFINER + fixed search_path so RLS on profiles cannot recurse.
-- ---------------------------------------------------------------------
create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.active);
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.active and p.role = 'admin');
$$;

-- Permission check for reading or acting. Admin holds every permission.
create or replace function public.has_perm(p_perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active
      and (p.role = 'admin' or (p.permissions ->> p_perm) = 'true')
  );
$$;

-- Write check: active admin, manager or agent who holds the permission. Viewers never write.
create or replace function public.can_write(p_perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active and p.role in ('admin', 'manager', 'agent')
      and (p.role = 'admin' or (p.permissions ->> p_perm) = 'true')
  );
$$;

-- Plain record editing: active admin, manager or agent (not a viewer).
create or replace function public.can_edit() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active and p.role in ('admin', 'manager', 'agent')
  );
$$;

-- Record scope: admin and holders of view_all_clients see everything; others see records they own.
create or replace function public.in_scope(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.has_perm('view_all_clients') or p_owner = auth.uid();
$$;

-- Fill owner_id with the creator on insert.
create or replace function public.default_owner() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.owner_id is null then new.owner_id := auth.uid(); end if;
  return new;
end $$;

-- Stamp updated_at / updated_by on every update.
create or replace function public.touch_row() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;

-- audit_log: refuse every UPDATE, DELETE and TRUNCATE, even from the service role.
create or replace function public.audit_log_append_only() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'audit_log is append-only' using errcode = '42501';
end $$;

drop trigger if exists audit_log_no_update_delete on public.audit_log;
create trigger audit_log_no_update_delete
  before update or delete on public.audit_log
  for each row execute function public.audit_log_append_only();

drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_append_only();

-- Triggers on record tables
do $$
declare t text;
begin
  foreach t in array array['clients', 'deals', 'documents', 'tasks', 'emails', 'templates', 'leads', 'reservations', 'settings']
  loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_row()', t, t);
  end loop;
  foreach t in array array['clients', 'deals', 'documents', 'tasks', 'emails', 'templates', 'leads', 'reservations']
  loop
    execute format('drop trigger if exists %I_owner on public.%I', t, t);
    execute format('create trigger %I_owner before insert on public.%I for each row execute function public.default_owner()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 7. Row level security
-- ---------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.units         enable row level security;
alter table public.clients       enable row level security;
alter table public.deals         enable row level security;
alter table public.documents     enable row level security;
alter table public.tasks         enable row level security;
alter table public.emails        enable row level security;
alter table public.templates     enable row level security;
alter table public.leads         enable row level security;
alter table public.reservations  enable row level security;
alter table public.settings      enable row level security;
alter table public.counters      enable row level security;
alter table public.unit_requests enable row level security;
alter table public.audit_log     enable row level security;

-- profiles: a user reads their own row; only the admin creates, changes or removes profiles.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- units: read by active users. No write policy at all: writes go through set_unit_status / set_unit_note.
drop policy if exists units_select on public.units;
create policy units_select on public.units for select to authenticated
  using (public.is_active());

-- clients
drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients for select to authenticated
  using (public.is_active() and public.in_scope(owner_id));
drop policy if exists clients_insert on public.clients;
create policy clients_insert on public.clients for insert to authenticated
  with check (public.can_edit());
drop policy if exists clients_update on public.clients;
create policy clients_update on public.clients for update to authenticated
  using (public.can_edit() and public.in_scope(owner_id)) with check (public.can_edit());
drop policy if exists clients_delete on public.clients;
create policy clients_delete on public.clients for delete to authenticated
  using (public.can_write('delete') and public.in_scope(owner_id));

-- deals
drop policy if exists deals_select on public.deals;
create policy deals_select on public.deals for select to authenticated
  using (public.is_active() and public.in_scope(owner_id));
drop policy if exists deals_insert on public.deals;
create policy deals_insert on public.deals for insert to authenticated
  with check (public.can_write('create_deals'));
drop policy if exists deals_update on public.deals;
create policy deals_update on public.deals for update to authenticated
  using (public.can_write('create_deals') and public.in_scope(owner_id))
  with check (public.can_write('create_deals'));
drop policy if exists deals_delete on public.deals;
create policy deals_delete on public.deals for delete to authenticated
  using (public.can_write('delete') and public.in_scope(owner_id));

-- documents (issued pro-formas, receipts, reservations, quotes, credit notes)
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select to authenticated
  using (public.is_active() and public.in_scope(owner_id));
drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert to authenticated
  with check (public.can_edit());
drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents for update to authenticated
  using (public.can_edit() and public.in_scope(owner_id)) with check (public.can_edit());
drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents for delete to authenticated
  using (public.can_write('delete') and public.in_scope(owner_id));

-- tasks
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using (public.is_active() and public.in_scope(owner_id));
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.can_edit());
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using (public.can_edit() and public.in_scope(owner_id)) with check (public.can_edit());
drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.can_write('delete') and public.in_scope(owner_id));

-- emails (mass-email runs): sending needs send_emails
drop policy if exists emails_select on public.emails;
create policy emails_select on public.emails for select to authenticated
  using (public.is_active() and public.in_scope(owner_id));
drop policy if exists emails_insert on public.emails;
create policy emails_insert on public.emails for insert to authenticated
  with check (public.can_write('send_emails'));
drop policy if exists emails_update on public.emails;
create policy emails_update on public.emails for update to authenticated
  using (public.can_write('send_emails') and public.in_scope(owner_id))
  with check (public.can_write('send_emails'));
drop policy if exists emails_delete on public.emails;
create policy emails_delete on public.emails for delete to authenticated
  using (public.can_write('delete') and public.in_scope(owner_id));

-- templates: any active editor
drop policy if exists templates_select on public.templates;
create policy templates_select on public.templates for select to authenticated
  using (public.is_active());
drop policy if exists templates_write on public.templates;
create policy templates_write on public.templates for all to authenticated
  using (public.can_edit()) with check (public.can_edit());

-- leads and reservations (public-site data; CRM may update, e.g. cancel a reservation)
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads for select to authenticated
  using (public.is_active() and public.in_scope(owner_id));
drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads for update to authenticated
  using (public.can_edit() and public.in_scope(owner_id)) with check (public.can_edit());
drop policy if exists leads_delete on public.leads;
create policy leads_delete on public.leads for delete to authenticated
  using (public.can_write('delete') and public.in_scope(owner_id));

drop policy if exists reservations_select on public.reservations;
create policy reservations_select on public.reservations for select to authenticated
  using (public.is_active() and public.in_scope(owner_id));
drop policy if exists reservations_insert on public.reservations;
create policy reservations_insert on public.reservations for insert to authenticated
  with check (public.can_edit());
drop policy if exists reservations_update on public.reservations;
create policy reservations_update on public.reservations for update to authenticated
  using (public.can_edit() and public.in_scope(owner_id)) with check (public.can_edit());
drop policy if exists reservations_delete on public.reservations;
create policy reservations_delete on public.reservations for delete to authenticated
  using (public.can_write('delete') and public.in_scope(owner_id));

-- settings: everyone active reads, only the admin writes (company, bank and numbering data)
drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings for select to authenticated
  using (public.is_active());
drop policy if exists settings_admin_write on public.settings;
create policy settings_admin_write on public.settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- counters: read only (changed by next_counter)
drop policy if exists counters_select on public.counters;
create policy counters_select on public.counters for select to authenticated
  using (public.is_active());

-- unit_requests: admin sees all, a requester sees their own. Created and resolved only by RPCs.
drop policy if exists unit_requests_select on public.unit_requests;
create policy unit_requests_select on public.unit_requests for select to authenticated
  using (public.is_admin() or requester = auth.uid());

-- audit_log: admin reads everything; any active user may append a row attributed to themselves.
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated
  using (public.is_admin());
drop policy if exists audit_log_insert on public.audit_log;
create policy audit_log_insert on public.audit_log for insert to authenticated
  with check (public.is_active() and user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 8. Privileges (belt and braces on top of RLS)
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select, insert, update, delete on public.profiles to authenticated;
grant select on public.units to authenticated;
grant select, insert, update, delete on public.clients, public.deals, public.documents, public.tasks,
  public.emails, public.templates, public.leads, public.reservations, public.settings to authenticated;
grant select on public.counters to authenticated;
grant select on public.unit_requests to authenticated;
grant select, insert on public.audit_log to authenticated;      -- no UPDATE or DELETE privilege at all
grant usage, select on sequence public.audit_log_id_seq to authenticated;

-- ---------------------------------------------------------------------
-- 9. RPCs: unit status, overrides, document numbers
-- ---------------------------------------------------------------------

-- Change a unit's status. Locks the unit row, so two agents cannot both sell it.
-- Returns jsonb. A refusal returns {ok:false, code:'unit_taken'} and is NOT raised, because a raised
-- error would roll back the audit row for the refusal in the same transaction.
create or replace function public.set_unit_status(
  p_unit_id text, p_status text, p_client_id text default null, p_deal_id text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_cur public.units%rowtype;
  v_conflict boolean;
  v_before jsonb;
  v_after jsonb;
  v_client text;
  v_deal text;
begin
  if v_uid is null or not public.is_active() then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_status not in ('available', 'reserved', 'sold', 'blocked') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if not public.can_write('change_units') then
    raise exception 'forbidden' using errcode = '42501', hint = 'change_units';
  end if;

  insert into public.units (id) values (p_unit_id) on conflict (id) do nothing;
  select * into v_cur from public.units where id = p_unit_id for update;   -- row lock; waits for a concurrent sale
  v_before := jsonb_build_object('status', v_cur.status, 'client_id', v_cur.client_id, 'deal_id', v_cur.deal_id);

  -- Taken unit: only the client that holds it may move it on (reserved -> sold, or release it).
  -- Anything else (another client, a block, a release by anyone else) is a conflict.
  v_conflict := v_cur.status <> 'available'
    and not (v_cur.status in ('reserved', 'sold') and p_status in ('reserved', 'sold', 'available')
             and p_client_id is not null and p_client_id = v_cur.client_id);

  if v_conflict and not public.is_admin() then
    insert into public.audit_log (user_id, action, entity, entity_id, before, after)
      values (v_uid, 'unit.refused', 'units', p_unit_id, v_before,
              jsonb_build_object('requested_status', p_status, 'client_id', p_client_id, 'deal_id', p_deal_id));
    return jsonb_build_object('ok', false, 'code', 'unit_taken', 'status', v_cur.status);
  end if;

  if p_status = 'available' then v_client := null; v_deal := null;
  else v_client := p_client_id; v_deal := p_deal_id; end if;

  update public.units
     set status = p_status, client_id = v_client, deal_id = v_deal, updated_at = now(), updated_by = v_uid
   where id = p_unit_id;

  v_after := jsonb_build_object('status', p_status, 'client_id', v_client, 'deal_id', v_deal);
  insert into public.audit_log (user_id, action, entity, entity_id, before, after)
    values (v_uid, case when v_conflict then 'unit.override' else 'unit.status' end, 'units', p_unit_id, v_before, v_after);
  return jsonb_build_object('ok', true, 'status', p_status, 'override', v_conflict);
end $$;

-- Change the free-text note of a unit.
create or replace function public.set_unit_note(p_unit_id text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public.can_write('change_units') then
    raise exception 'forbidden' using errcode = '42501', hint = 'change_units';
  end if;
  insert into public.units (id) values (p_unit_id) on conflict (id) do nothing;
  update public.units set note = coalesce(p_note, ''), updated_at = now(), updated_by = v_uid where id = p_unit_id;
  insert into public.audit_log (user_id, action, entity, entity_id, after)
    values (v_uid, 'unit.note', 'units', p_unit_id, jsonb_build_object('note', coalesce(p_note, '')));
  return jsonb_build_object('ok', true);
end $$;

-- A non-admin asks an admin to change a taken unit. The admin approves or rejects it.
create or replace function public.request_unit_change(
  p_unit_id text, p_status text, p_client_id text, p_deal_id text, p_reason text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
begin
  if not public.can_write('change_units') then
    raise exception 'forbidden' using errcode = '42501', hint = 'change_units';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  insert into public.unit_requests (requester, unit_id, requested_status, requested_client_id, requested_deal_id, reason)
    values (v_uid, p_unit_id, p_status, p_client_id, p_deal_id, btrim(p_reason))
    returning id into v_id;
  insert into public.audit_log (user_id, action, entity, entity_id, after)
    values (v_uid, 'unit.request', 'units', p_unit_id,
            jsonb_build_object('request_id', v_id, 'requested_status', p_status, 'reason', btrim(p_reason)));
  return v_id;
end $$;

-- Admin decides a pending request. Approving applies the requested change.
create or replace function public.resolve_unit_request(p_request_id bigint, p_approve boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_req public.unit_requests%rowtype;
  v_cur public.units%rowtype;
  v_before jsonb;
  v_client text;
  v_deal text;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501', hint = 'admin only';
  end if;
  select * into v_req from public.unit_requests where id = p_request_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_req.status <> 'pending' then raise exception 'not_pending' using errcode = '22023'; end if;

  if p_approve then
    insert into public.units (id) values (v_req.unit_id) on conflict (id) do nothing;
    select * into v_cur from public.units where id = v_req.unit_id for update;
    v_before := jsonb_build_object('status', v_cur.status, 'client_id', v_cur.client_id, 'deal_id', v_cur.deal_id);
    if v_req.requested_status = 'available' then v_client := null; v_deal := null;
    else v_client := v_req.requested_client_id; v_deal := v_req.requested_deal_id; end if;
    update public.units
       set status = v_req.requested_status, client_id = v_client, deal_id = v_deal, updated_at = now(), updated_by = v_uid
     where id = v_req.unit_id;
    insert into public.audit_log (user_id, action, entity, entity_id, before, after)
      values (v_uid, 'unit.override.approved', 'units', v_req.unit_id, v_before,
              jsonb_build_object('status', v_req.requested_status, 'client_id', v_client, 'deal_id', v_deal, 'request_id', p_request_id));
  end if;

  update public.unit_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         resolved_by = v_uid, resolved_at = now(), resolution_note = p_note
   where id = p_request_id;
  insert into public.audit_log (user_id, action, entity, entity_id, after)
    values (v_uid, case when p_approve then 'unit.request.approved' else 'unit.request.rejected' end,
            'unit_requests', p_request_id::text, jsonb_build_object('unit_id', v_req.unit_id));
  return jsonb_build_object('ok', true, 'status', case when p_approve then 'approved' else 'rejected' end);
end $$;

-- Next document number for a key such as "cy.proforma.2026" (first value = start).
create or replace function public.next_counter(p_key text, p_start integer default 1)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_start integer := greatest(coalesce(p_start, 1), 1);
  v integer;
begin
  if not public.can_edit() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.counters (key, value) values (p_key, v_start)
    on conflict (key) do update set value = greatest(public.counters.value + 1, v_start)
    returning value into v;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 10. Function privileges: only signed-in users may call the RPCs
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on function public.is_active(), public.is_admin(), public.has_perm(text), public.can_write(text),
  public.can_edit(), public.in_scope(uuid), public.set_unit_status(text, text, text, text),
  public.set_unit_note(text, text), public.request_unit_change(text, text, text, text, text),
  public.resolve_unit_request(bigint, boolean, text), public.next_counter(text, integer) to authenticated;
-- The trigger functions are not callable by clients.
revoke execute on function public.default_owner(), public.touch_row(), public.audit_log_append_only() from authenticated;

-- ---------------------------------------------------------------------
-- 11. Realtime: the CRM refreshes a table when it changes (RLS still applies).
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['units', 'clients', 'deals', 'documents', 'tasks', 'emails', 'templates', 'leads', 'reservations', 'settings', 'counters', 'unit_requests']
    loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then null;
      end;
    end loop;
  end if;
end $$;
