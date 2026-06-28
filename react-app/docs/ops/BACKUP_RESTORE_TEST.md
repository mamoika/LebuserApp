# Backup And Restore Test

Status: passed on 2026-06-28 08:03 Europe/Warsaw.

The operational requirement is a real restore test, not only confirming that
Supabase backups exist. A test passes only when a production backup/dump is
restored into a separate database and the restored data is smoke-checked.

## Required Inputs

- A read-only production database connection string or Supabase dump access.
- A separate restore target database, never the production database.
- `pg_dump`, `pg_restore` and `psql`, or a working `supabase db dump` plus a
  disposable Supabase/Postgres restore target.

## Test Procedure

1. Create a timestamped dump from production.
2. Restore it into the isolated target database.
3. Run smoke checks on restored data:
   - key operational tables exist,
   - row counts are non-zero for active business tables,
   - recent `entries`, `clients`, `routes`, `driver_trips`, `users` and
     `app_settings` records are present,
   - critical RPC functions can be created or already exist in the restored
     schema.
4. Record dump time, restore time, target database, row-count summary and any
   restore errors.
5. Delete the restore target or rotate access credentials after the test.

## Latest Test Result

Environment:

- Source: linked Supabase project `suvyqbyrcpzrtxbnuunu`.
- Dump method: Supabase CLI `supabase-go` temporary login role plus local
  `pg_dump`.
- Restore target: disposable local PostgreSQL 18 cluster on port `55432`.
- Dump files: temporary files under `/tmp`, removed after the test and not
  committed to the repository.

Result:

- Schema dump: 239024 bytes.
- Data dump: 704386 bytes.
- Schema restore: ok, 0 errors.
- Data restore: ok, 0 errors.

Smoke checks on restored data:

- `app_settings`: 3 rows.
- `clients`: 87 rows.
- `driver_trips`: 30 rows.
- `entries`: 383 rows.
- `routes`: 10 rows.
- `users`: 8 rows.

Critical restored RPC functions found:

- `auto_start_due_trips`
- `get_app_data`
- `get_driver_app_settings`
- `list_drivers`
- `session_user`

## Local Notes

- The Homebrew `supabase` wrapper still exits with code `137` on this machine.
  Use the extracted `supabase-go` binary until the wrapper/CLT issue is fixed.
- Docker is not required for this logical restore path.
- `libpq` and `postgresql@18` were installed locally through Homebrew to provide
  `pg_dump`, `psql`, `pg_restore` and a disposable restore target.

This validates logical dump and restore of the public application schema/data.
It does not replace Supabase managed PITR/fire-drill testing for the whole
project, storage buckets or auth-managed internals.
