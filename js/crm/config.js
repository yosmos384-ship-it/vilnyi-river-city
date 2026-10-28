// CRM connection settings (Supabase project "vilnyi-gt-river").
// SUPABASE_ANON_KEY is the PUBLIC anon key by design: row level security in supabase/schema.sql protects the data.
// NEVER put the service_role key, the database password or any other secret in this file.
//
// Both values are EMPTY in the repository. They are filled in only before publishing
// (supabase/migrate-from-claude.md, step 1). While they are empty the CRM runs in LOCAL DEMO MODE
// on this browser's storage, with fictional sample data, and shows a clear demo banner.
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';
// Pinned client library (exact version, loaded from jsDelivr only when the connection is configured).
export const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

export const isConfigured = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY);
