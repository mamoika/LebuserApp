# Backup And Restore Test

Status: not passed yet.

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

## Current Local Blockers

- `DATABASE_URL`/Postgres password is not present in the local environment.
- The local `supabase` CLI starts and exits with code `137`, so it cannot be
  used here for a reliable dump/restore run.
- No local Docker/Postgres restore target is available from the current shell.

Until those blockers are removed, backup/restore remains an open production
readiness item.
