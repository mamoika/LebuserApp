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

First read-hardening migration:

1. `db/migrations/logs_read_rpc.sql`

Status: run in Supabase and smoke-tested.

After deploying the frontend that uses it, verify:

- Admin panel log list loads.
- Entry history change log opens.
- No frontend direct reads from `logs` remain.

Then run:

1. `db/migrations/revoke_logs_direct_reads.sql`

Repeat the same smoke test.

Status: run in Supabase and smoke-tested.

Next shared app-data read-hardening migration:

1. `db/migrations/app_data_read_rpc.sql`

After deploying the frontend that uses it, verify:

- Schedule loads current and next week.
- Map loads routes and client markers.
- Clients/routes view loads and reorder/edit flows still refresh data.
- Driver route view loads entries and route list.
- Laundry receipt list/links still appear where expected.

Do not revoke `select` on `clients`, `routes`, `entries`, or
`laundry_receipts` yet: other views still have direct reads that must be moved
behind RPCs first.

Next history read-hardening migration:

1. `db/migrations/history_entries_read_rpc.sql`

After deploying the frontend that uses it, verify:

- History loads recent entries.
- Admin can use client, route, driver and status filters.
- Driver accounts see only entries for assigned routes.
- A driver with no assigned routes does not see all history.
- Entry change log still opens through `get_entry_logs`.

Do not revoke `select` on `entries` yet: schedule, driver route and other
views still need their remaining direct reads migrated or covered by RPCs.

Next schedule driver-trip label migration:

1. `db/migrations/schedule_driver_trips_read_rpc.sql`

After deploying the frontend that uses it, verify:

- Schedule still shows trip assignment labels such as `Przywiezie`, `Wiezie`
  and `Przywiózł`.
- Labels update after starting/finishing/changing a driver trip.
- Realtime refresh still triggers without a page reload.

Do not revoke `select` on `driver_trips` yet: `DriverRouteView` still has
remaining direct reads that must be migrated first.

## Phase 5: RODO/EU Operations

Complete the operational documents in `docs/compliance`:

- `PRIVACY_NOTICE_TEMPLATE.md`
- `RECORD_OF_PROCESSING.md`
- `DATA_BREACH_PROCEDURE.md`
- `PROCESSORS_AND_TRANSFERS.md`
- `RETENTION_POLICY.md`
- `ACCESS_CONTROL_CHECKLIST.md`

Then add database/app automation for the approved retention periods.

## Phase 6: Privacy Notice Acknowledgement

Run:

1. `db/migrations/privacy_notice_ack.sql`

Then deploy the frontend and verify:

- users who have not acknowledged the current notice version see the RODO modal after login,
- clicking `Potwierdzam zapoznanie się` saves the acknowledgement,
- the modal does not return after refresh/login for the same version,
- Panel Admina shows the RODO acknowledgement status for each user.
