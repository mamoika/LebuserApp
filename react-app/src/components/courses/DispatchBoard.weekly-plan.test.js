import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const boardSource = readFileSync(new URL('./DispatchBoard.jsx', import.meta.url), 'utf8');
const assignmentSheetSource = readFileSync(new URL('./sheets/AssignTripSheet.jsx', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL('../../../db/migrations/20261115174250_sync_dispatch_with_weekly_route_plan.sql', import.meta.url),
  'utf8',
);

test('dispatch board merges weekly route assignments into virtual courses', () => {
  assert.match(boardSource, /getWeeklyRoutePlan\(sessionToken, tripDate\)/);
  assert.match(boardSource, /routePlanTrips:\s*routePlanData\?\.trips \|\| \[\]/);
});

test('assignment sheet preserves values imported from the weekly plan', () => {
  assert.match(assignmentSheetSource, /useState\(trip\?\.driver_id \|\| ''\)/);
  assert.match(assignmentSheetSource, /useState\(trip\?\.car \|\| VEHICLES\[0\]\.key\)/);
  assert.match(assignmentSheetSource, /localDateTimeInput\(trip\?\.planned_start\)/);
});

test('dispatch planning writes the weekly assignment and operational course atomically', () => {
  assert.match(migration, /insert into public\.driver_route_plan_assignments[\s\S]*?on conflict \(plan_date, route_id\) do update/);
  assert.match(migration, /insert into public\.driver_trips/);
  assert.match(migration, /set search_path = public, private, extensions/);
  assert.match(migration, /revoke all on function public\.admin_plan_driver_trip[\s\S]*?from public/);
});
