# Security Deployment Checklist

Use this order to avoid breaking the live app.

## Phase 1: Add RPCs

Run these SQL files in Supabase:

1. `db/migrations/driver_trips_rpc.sql`
2. `db/migrations/admin_costs_settings_rpc.sql`
3. `db/migrations/logs_rpc.sql`

Then deploy the frontend that uses those RPCs.

For the costs-table integrity fixes, run after the course-dispatch migrations are present:

4. `db/migrations/costs_meter_integrity.sql`

Smoke-test two finished courses using the same car on one day and a course that changes cars; the daily costs row must retain the greatest reported meter for every involved vehicle. Also verify:

- historical approved-course readings are backfilled and the costs integrity warning is empty or actionable,
- marking a meter reset gives zero usage on the reset day and a correct delta on the next day,
- the overview separates costs to date, planned costs and the full-month forecast,
- two simultaneous edits of the same costs row do not silently overwrite one another.

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

Do not revoke `select` on `driver_trips` yet: legacy route views were removed in favor of `DriverCourse` / `DispatchBoard`.
remaining direct reads that must be migrated first.

Final remaining read-hardening migration:

1. `db/migrations/remaining_read_rpc.sql`

After deploying the frontend that uses it, verify:

- Admin panel users load, edit, reset password and save default driver car.
- Admin panel groups load, create, edit and delete with employee-count guard.
- Admin panel employees load by month, add existing employees, save employees
  and remove employees from a month.
- Work schedule loads, saves cells, exports and prints.
- Timeline loads, paints cells and copies day assignments.
- Costs load current month, history and performance thresholds; admin saves
  costs, rates and thresholds.
- Clients/routes can still block deletion when a client has history.
- Driver route view loads active/planned/history trips, default car, KM
  resolved state and the blocking picked-laundry guard.
- Wash/WinWash view loads tunnel bags through `get_tunnel_bags`.
- Schedule, map, clients/routes, history and logs still load through the
  earlier read RPCs.
- Realtime refreshes still work for schedule/driver route views, or the team
  accepts manual refresh as a fallback before revoking direct reads.

Then run:

1. `db/migrations/revoke_remaining_direct_reads.sql`

Repeat the same smoke test. If a realtime subscription stops firing after
`select` is revoked, keep the RPC data path and replace the affected realtime
trigger with a polling/manual refresh fallback.

## Phase 5: RODO/EU Operations

The operational compliance pack in `docs/compliance` is prepared (operational
drafts, not empty templates). Start from `docs/compliance/RODO_READINESS.md`
for current status, owners and operating cadence.

Before the pack can be treated as formally adopted, confirm the open items from
its "Must Confirm Before Treating As Adopted" section:

- controller identity and legal bases (`PRIVACY_NOTICE_TEMPLATE.md`,
  `RECORD_OF_PROCESSING.md`),
- provider DPA/processing terms (`PROCESSORS_AND_TRANSFERS.md`),
- approved retention periods (`RETENTION_POLICY.md`).

Then add database/app automation for the approved retention periods.

Ongoing controls already defined in the pack:

- monthly admin-access review (`ACCESS_CONTROL_CHECKLIST.md`),
- breach logging within 24h of a suspected incident
  (`DATA_BREACH_PROCEDURE.md`, `BREACH_REGISTER.md`).

## Phase 6: Privacy Notice Acknowledgement

Run:

1. `db/migrations/privacy_notice_ack.sql`

Then deploy the frontend and verify:

- users who have not acknowledged the current notice version see the RODO modal after login,
- clicking `Potwierdzam zapoznanie się` saves the acknowledgement,
- the modal does not return after refresh/login for the same version,
- Panel Admina shows the RODO acknowledgement status for each user.
