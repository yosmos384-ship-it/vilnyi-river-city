// CRM sign-in on Supabase Auth: username + password.
// A username maps to an internal address (<username>@vrc.internal) that never receives mail,
// so there is no public sign-up and no reset email. The admin creates the account and hands over a
// one-time recovery link (see v-users.js). The browser holds only the anon key; admin actions go
// through the admin-users Edge Function, which keeps the service key on the server.
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_JS } from './config.js?v=3.15';

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,31}$/;
export const normUsername = u => String(u || '').trim().toLowerCase();
export const validUsername = u => USERNAME_RE.test(normUsername(u));
export const internalEmail = u => `${normUsername(u)}@vrc.internal`;

let clientPromise = null;
// Loaded lazily, so the local demo never touches the network.
export function getClient() {
  if (!clientPromise) {
    clientPromise = import(SUPABASE_JS).then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }));
  }
  return clientPromise;
}

export async function signIn(username, password) {
  const sb = await getClient();
  const { error } = await sb.auth.signInWithPassword({ email: internalEmail(username), password });
  if (error) { const e = new Error('bad_credentials'); e.code = 'bad_credentials'; throw e; }   // same message for wrong user or password
}

export async function signOut() {
  const sb = await getClient();
  await sb.auth.signOut();
}

// Used after the user opens the recovery link the admin sent.
export async function setNewPassword(password) {
  const sb = await getClient();
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw error;
}

// The signed-in user's CRM profile, or null if the account has none. Inactive profiles are returned
// (RLS lets a user read their own row) so the app can show a precise "no access" message.
export async function loadProfile(sb) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data, error } = await sb.from('profiles').select('id, username, full_name, role, permissions, active').eq('id', user.id).maybeSingle();
  if (error) throw error;
  return data;
}
