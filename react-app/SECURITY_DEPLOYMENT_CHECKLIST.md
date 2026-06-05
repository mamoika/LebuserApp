# Security Deployment Checklist

Use this order to avoid breaking the live app.

## Phase 1: Add RPCs

Run these SQL files in Supabase:

1. `db/migrations/driver_trips_rpc.sql`
2. `db/migrations/admin_costs_settings_rpc.sql`
3. `db/migrations/logs_rpc.sql`

Then deploy the frontend that uses those RPCs.

## Phase 2: Smoke Test

Verify these flows in the app:

- Driver starts a trip.
- Driver finishes a trip.
- Driver changes car with and without progress.
- Admin plans a trip.
- Admin deletes a trip.
- Admin saves cost settings and daily costs.
- Admin saves default driver car.
- Logs appear after actions.

## Phase 3: Revoke Direct Writes

Only after Phase 2 passes, run:

1. `db/migrations/revoke_direct_table_writes.sql`

Then repeat the smoke test.

## Phase 4: Later Read Hardening

Direct table reads still exist and are intentionally not blocked yet. The next hardening phase should move reads behind session-token RPCs before revoking `select`.
