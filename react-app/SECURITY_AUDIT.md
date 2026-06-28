# Security Audit Notes

Date: 2026-06-05

## Current Database Access Model

The app uses a public Supabase anon key in the browser and a custom session
token stored in `localStorage`.

Admin and driver mutations for the hardened areas are protected through
`SECURITY DEFINER` RPC functions that accept `p_session_token`.

The main remaining database risk is direct table read access. A browser client
with only the anon key can still read many operational tables directly because
the current frontend still relies on direct `select` queries.

## Verified With Anon Key

Read access was previously confirmed for these tables using the anon key and
`select(..., { head: true, count: 'exact' })`:

- `clients`
- `routes`
- `entries`
- `logs`
- `driver_trips`
- `daily_costs`
- `cost_settings`
- `app_settings`
- `employees`
- `schedule_entries`
- `timeline_entries`
- `employee_months`

Direct read access was denied for:

- `users`
- `user_sessions`

RPC checks:

- `get_all_users` rejects an invalid session token.
- `reset_routes_id_sequence` is not callable by anon in the live project.
- `execute_sql` is not exposed in the live project.

After the write-hardening SQL run, live verification showed:

- new RPC functions exist and reject invalid sessions,
- direct writes to `driver_trips`, `daily_costs`, `cost_settings`,
  `app_settings`, and `logs` are denied.

## High Priority Findings

1. Direct table reads bypass app login

   Login controls the UI, but not all database reads. Anyone with the anon key
   can query many operational tables directly through Supabase REST until reads
   are moved behind session-token RPCs and `select` is revoked.

2. Session token is stored in `localStorage`

   This is practical for the current SPA, but any XSS would expose the custom
   session token. The app should avoid rendering unsanitized user-controlled
   HTML and keep a strict Content Security Policy in deployment.

3. First-password flow allows account claiming by username

   `set_first_password(username, password)` allows setting a password for any
   existing account that has no password. This works for the current onboarding
   flow, but it means an unclaimed account can be claimed by anyone who knows
   or guesses the username.

4. Operational RODO/EU compliance is not complete

   Technical hardening does not replace required documentation, provider/DPA
   checks, breach procedure, retention rules and access reviews.

## Progress

- Added RPC migration for `driver_trips` writes:
  `db/migrations/driver_trips_rpc.sql`.
- Updated the frontend so `driver_trips` writes go through session-token RPCs.
- Added RPC migration for `daily_costs`, `cost_settings`, and `app_settings`
  writes: `db/migrations/admin_costs_settings_rpc.sql`.
- Updated the frontend so writes to `daily_costs`, `cost_settings`, and
  `app_settings` go through admin session-token RPCs.
- Added RPC migration for `logs` inserts: `db/migrations/logs_rpc.sql`.
- Updated the frontend logger so log inserts go through
  `insert_log(p_session_token, ...)`; the database now derives `user_name`
  from the session instead of trusting the browser.
- A source scan now shows no direct Supabase `insert`, `update`, `upsert`, or
  `delete` calls in `src`; only direct reads remain.
- Added hardening migration `db/migrations/revoke_direct_table_writes.sql` to
  revoke direct `insert`, `update`, and `delete` on the formerly writable
  tables.
- Added deployment order checklist: `SECURITY_DEPLOYMENT_CHECKLIST.md`.
- Added Vercel security headers, including CSP, Referrer-Policy,
  X-Content-Type-Options, X-Frame-Options and Permissions-Policy.
- Added RODO/EU compliance working documents in `docs/compliance`.
- Added first read-hardening migration for log reads:
  `db/migrations/logs_read_rpc.sql`.
- Updated admin log list and entry change history to read logs through
  session-token RPCs instead of direct `select` on `logs`.
- Added delayed migration `db/migrations/revoke_logs_direct_reads.sql` to
  revoke direct `select` on `logs` after the RPC frontend is deployed and
  smoke-tested.
- Live verification after running `revoke_logs_direct_reads.sql` showed direct
  anon `select` on `logs` is denied while admin logs and entry history still
  load through RPC.
- Added privacy notice acknowledgement flow:
  `db/migrations/privacy_notice_ack.sql`, a post-login RODO modal and admin
  acknowledgement status on the user list.
- Added main app data read RPC: `db/migrations/app_data_read_rpc.sql`.
  Updated `useAppData` so the shared clients/routes/entries/laundry_receipts
  load goes through `get_app_data(p_session_token, p_last_week_key)` instead
  of direct browser table reads.
- Added history entries read RPC: `db/migrations/history_entries_read_rpc.sql`.
  Updated `HistoryView` so history rows load through
  `get_history_entries(p_session_token, p_limit)` instead of a direct browser
  `select` on `entries`.
- Added schedule driver trip read RPC:
  `db/migrations/schedule_driver_trips_read_rpc.sql`. Updated `ScheduleView`
  so driver trip assignment labels load through
  `get_schedule_driver_trips(p_session_token, p_limit)` instead of a direct
  browser `select` on `driver_trips`.
- Added remaining read-hardening RPC migration:
  `db/migrations/remaining_read_rpc.sql`. Updated the remaining frontend
  reads in admin users/groups/employees, work schedule, timeline, costs,
  driver route runtime data, WinWash bag status and client delete checks to
  use session-token RPCs.
- Replaced `get_app_data` in `remaining_read_rpc.sql` with a role-scoped
  version: regular drivers receive route/client/entry/receipt data limited to
  assigned or active-trip-related work instead of the full operational dataset.
- Replaced `get_schedule_driver_trips` in `remaining_read_rpc.sql` so regular
  drivers receive their own trip rows while admin-like roles retain the full
  schedule label data.
- A source scan now shows no direct browser `supabase.from(...).select(...)`
  calls in `src`; table reads are routed through RPCs. The final revoke step is
  `db/migrations/revoke_remaining_direct_reads.sql` after deployment and smoke
  testing.

## Remaining Hardening Plan

1. Deploy and smoke-test final read hardening

   Run `db/migrations/remaining_read_rpc.sql`, deploy the matching frontend,
   and smoke-test the app. The frontend source no longer performs direct table
   reads, but the live database should not revoke `select` until the deployed
   app is verified.

2. Revoke table read access from anon/authenticated

   After the frontend uses read RPCs in production, run:

   ```sql
   db/migrations/revoke_remaining_direct_reads.sql
   ```

3. Tighten password onboarding

   Replace public first-password setup with one-time invite/reset tokens
   generated by admin RPC.

4. Add operational compliance

   Complete and adopt the documents in `docs/compliance`, especially:

   - privacy notice,
   - record of processing activities,
   - breach procedure,
   - processor/DPA list,
   - retention policy.

5. Track privacy notice versions

   The app now stores acknowledgement of `privacy_notice_v1`. When the privacy
   notice text materially changes, increment `PRIVACY_NOTICE_VERSION` in
   `src/context/AuthContext.jsx` so users see the notice again.

6. Add retention automation

   Once retention periods are approved, add database cleanup/anonymization for
   expired sessions, logs, inactive users and old operational records.
