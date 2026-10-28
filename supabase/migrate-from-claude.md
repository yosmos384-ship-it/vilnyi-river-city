# CRM v3.15: moving from the Claude store to Supabase

Status: prepared on branch `crm-v3.15`. **Nothing here has been applied.** The schema has not been run on the
project `vilnyi-gt-river`, no data has been moved, and the anon key is not filled in yet.

Never put a service_role key, a database password or any other secret in this repository, in a chat, or in a file
that is committed. The anon key is public by design; the service key stays inside Supabase.

## Before you start

- Ask the team to stop editing in the CRM during the move. The export is a snapshot.
- Known gap until v3.16: the public booking form (`js/booking.js`, unchanged in v3.15) still writes web reservations
  and leads to the old Claude store. Until v3.16 they will not reach the new CRM, and the booking form does not see
  units sold in the new CRM. See the open questions in the release report.

## Steps

1. **Connection values (owner, before publishing).** In the Supabase dashboard of `vilnyi-gt-river`, open
   Project Settings, then API. Copy the Project URL and the `anon` public key into `js/crm/config.js`
   (`SUPABASE_URL`, `SUPABASE_ANON_KEY`). Do not copy the `service_role` key or the database password anywhere.
   While these two values are empty, the CRM runs in local demo mode.

2. **Auth settings.** In Authentication, then Providers, then Email:
   - turn off "Allow new users to sign up" (there is no public sign-up);
   - keep email and password sign-in on;
   - set the minimum password length to 12;
   - set the Site URL and add the CRM page URL to the redirect URLs (same value as `CRM_REDIRECT_URL` in step 6).

3. **Schema.** Open the SQL editor, paste `supabase/schema.sql` and run it once. It is written to run on a fresh
   project; check that it finishes without errors and that every table shows RLS enabled.

4. **Rule tests (on a test database, never the live project).** On a local Postgres 16 database run, in order:
   `tests/local-stub.sql`, then `supabase/schema.sql`, then `tests/crm-rules.test.sql`. The last one prints
   "ALL CRM RULE CHECKS PASSED" and rolls back everything it creates.

5. **First admin (owner).** In Authentication, then Users, add a user with the email
   `yosmos@vrc.internal` and confirm it. Set its password yourself in the dashboard. Then run in the SQL editor:

   ```sql
   insert into public.profiles (id, username, full_name, role, permissions, active)
   select id, 'yosmos', 'Yos', 'admin', '{}'::jsonb, true
   from auth.users where email = 'yosmos@vrc.internal';
   ```

6. **Edge Function (owner, from your own machine with the Supabase CLI).**

   ```
   supabase functions deploy admin-users
   supabase secrets set CRM_ALLOWED_ORIGIN=<origin of the CRM page> CRM_REDIRECT_URL=<CRM page URL>
   ```

   Supabase provides the service key to the function. Do not set it yourself in a file.

7. **Export from the current CRM (decision needed, see release report).** The v3.14 CRM has no full export; its
   Settings, Data tab offers CSV only. The script expects this JSON shape:

   ```json
   { "format": "vrc-crm-export", "version": 1, "collections": { "clients": [], "deals": [], "units": [], "settings": [] } }
   ```

   Keep the file outside the repository.

8. **Generate the SQL (local, no network).**

   ```
   node scripts/migrate-crm.mjs ~/vrc-crm-export.json --out ~/vrc-migration.sql --owner <your profile id>
   ```

   The script prints the row counts from the export ("before") and from the SQL ("after") per collection, and every
   row it skipped. The two counts must match, apart from the rows listed as skipped.

9. **Run the migration (owner).** Paste the SQL file into the Supabase SQL editor and run it. It is one transaction
   and uses `on conflict do nothing`, so re-running it is safe. Compare `select count(*)` per table with the "after"
   counts.

10. **Smoke test.** Sign in as `yosmos`. Open Units, Clients and Deals. Reserve one free unit for a test client and
    release it again. In Users and access, create one agent with the default permissions, open the reset link in a
    private window, set a password, and check that the agent cannot open Users and access or the Settings page.

11. **Publish is a separate approval.** Only after steps 1 to 10 and the owner's go-ahead: the version files are
    updated and the site is published. Nothing in this document publishes anything.

## Rollback

- The v3.14 site is untouched on `main`. The restore point is branch `backup/v3.14` at commit 818cd0e.
- The data move only inserts rows and keeps the export file. To undo it before publishing, restore the project from a
  Supabase backup or delete the rows listed in the migration file.
