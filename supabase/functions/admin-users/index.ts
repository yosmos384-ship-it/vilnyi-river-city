// admin-users: account management for the CRM (Supabase Edge Function, Deno). Admin only.
//
// The service_role key exists only here, as a Supabase-provided environment variable. The browser sends the
// user's own access token; this function re-checks that the caller is an active admin before doing anything.
// Accounts are created with an internal address (<username>@vrc.internal) that never receives mail, so the
// function returns a one-time recovery link for the admin to hand over. The link is not stored anywhere.
//
// Environment (names only; values are set in the Supabase dashboard, never in the repository):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   provided by Supabase
//   CRM_ALLOWED_ORIGIN   the origin of the CRM page, for CORS (required)
//   CRM_REDIRECT_URL     the CRM page URL the recovery link returns to (must be allowed in Auth settings)
//
// Deploy with JWT verification on: supabase functions deploy admin-users
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const ROLES = ['admin', 'manager', 'agent', 'viewer'];
const PERMS = ['view_all_clients', 'change_units', 'create_deals', 'delete', 'send_emails', 'manage_users'];
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,31}$/;
const INACTIVE_BAN = '876000h';   // about 100 years: blocks sign-in and token refresh; 'none' lifts it

function cors() {
  return {
    'Access-Control-Allow-Origin': Deno.env.get('CRM_ALLOWED_ORIGIN') || 'null',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(), 'Content-Type': 'application/json' } });
}
function fail(code, status = 400) { return json({ error: code }, status); }

const cleanPerms = (p) => Object.fromEntries(PERMS.map(k => [k, !!(p && p[k] === true)]));

async function recoveryLink(admin, email) {
  const redirectTo = Deno.env.get('CRM_REDIRECT_URL');
  const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email, options: redirectTo ? { redirectTo } : {} });
  if (error) throw error;
  return data.properties.action_link;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'POST') return fail('bad_request', 405);

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return fail('unauthorized', 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: uerr } = await admin.auth.getUser(token);
  if (uerr || !user) return fail('unauthorized', 401);
  const { data: me } = await admin.from('profiles').select('id, role, active').eq('id', user.id).maybeSingle();
  if (!me || !me.active || me.role !== 'admin') return fail('forbidden', 403);

  let body;
  try { body = await req.json(); } catch (e) { return fail('bad_request'); }

  const audit = (action, entityId, before, after) => admin.from('audit_log').insert({
    user_id: user.id, action, entity: 'profiles', entity_id: String(entityId), before: before ?? null, after: after ?? null,
  });
  const profileOf = async (id) => (await admin.from('profiles').select('*').eq('id', id).maybeSingle()).data;

  try {
    if (body.action === 'create') {
      const username = String(body.username || '').trim().toLowerCase();
      if (!USERNAME_RE.test(username)) return fail('invalid_username');
      if (!ROLES.includes(body.role)) return fail('invalid_role');
      const fullName = String(body.full_name || '').trim().slice(0, 120);
      if (!fullName) return fail('invalid_name');
      const permissions = cleanPerms(body.permissions);
      if ((await admin.from('profiles').select('id').eq('username', username).maybeSingle()).data) return fail('exists', 409);
      const email = `${username}@vrc.internal`;
      const { data: created, error: cerr } = await admin.auth.admin.createUser({ email, email_confirm: true });
      if (cerr) return fail(/already|registered/i.test(cerr.message || '') ? 'exists' : 'server_error', /already|registered/i.test(cerr.message || '') ? 409 : 500);
      const id = created.user.id;
      const { error: perr } = await admin.from('profiles').insert({ id, username, full_name: fullName, role: body.role, permissions, active: true });
      if (perr) { await admin.auth.admin.deleteUser(id); return fail('server_error', 500); }
      const link = await recoveryLink(admin, email);
      await audit('user.create', id, null, { username, role: body.role, permissions });
      return json({ id, username, reset_link: link });
    }

    if (body.action === 'update') {
      const id = String(body.id || '');
      const cur = await profileOf(id);
      if (!cur) return fail('not_found', 404);
      if (body.role !== undefined && !ROLES.includes(body.role)) return fail('invalid_role');
      if (id === user.id && body.role !== undefined && body.role !== 'admin') return fail('self_lock', 409);
      const patch = {};
      if (body.full_name !== undefined) {
        const n = String(body.full_name).trim().slice(0, 120);
        if (!n) return fail('invalid_name');
        patch.full_name = n;
      }
      if (body.role !== undefined) patch.role = body.role;
      if (body.permissions !== undefined) patch.permissions = cleanPerms(body.permissions);
      if (Object.keys(patch).length) {
        const { error } = await admin.from('profiles').update(patch).eq('id', id);
        if (error) throw error;
      }
      await audit('user.update', id, { full_name: cur.full_name, role: cur.role, permissions: cur.permissions }, patch);
      return json({ ok: true });
    }

    if (body.action === 'set_active') {
      const id = String(body.id || '');
      const active = body.active === true;
      const cur = await profileOf(id);
      if (!cur) return fail('not_found', 404);
      if (id === user.id && !active) return fail('self_lock', 409);
      const { error } = await admin.from('profiles').update({ active }).eq('id', id);
      if (error) throw error;
      const { error: aerr } = await admin.auth.admin.updateUserById(id, { ban_duration: active ? 'none' : INACTIVE_BAN });
      if (aerr) throw aerr;
      await audit(active ? 'user.activate' : 'user.deactivate', id, { active: cur.active }, { active });
      return json({ ok: true });
    }

    if (body.action === 'reset_link') {
      const id = String(body.id || '');
      const cur = await profileOf(id);
      if (!cur) return fail('not_found', 404);
      const { data: au } = await admin.auth.admin.getUserById(id);
      const email = au?.user?.email;
      if (!email) return fail('not_found', 404);
      const link = await recoveryLink(admin, email);
      await audit('user.reset_link', id, null, null);
      return json({ reset_link: link });
    }

    return fail('bad_request');
  } catch (e) {
    console.error('admin-users', body?.action, e?.message || 'error');   // never log tokens or links
    return fail('server_error', 500);
  }
});
