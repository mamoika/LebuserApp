import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const clientsRoutesSource = await readFile(
  new URL('./ClientsRoutesView.jsx', import.meta.url),
  'utf8',
);
const weeklyPlanSource = await readFile(
  new URL('./WeeklyRoutePlanView.jsx', import.meta.url),
  'utf8',
);
const stylesSource = await readFile(
  new URL('../index.css', import.meta.url),
  'utf8',
);
const migrationSource = await readFile(
  new URL('../../db/migrations/driver_weekly_plan_route_directory.sql', import.meta.url),
  'utf8',
);
const vehicleGuardMigrationSource = await readFile(
  new URL('../../db/migrations/weekly_route_plan_vehicle_guard.sql', import.meta.url),
  'utf8',
);

test('driver sees the weekly plan followed by the complete read-only route directory', () => {
  const planIndex = clientsRoutesSource.indexOf('<WeeklyRoutePlanView');
  const directoryIndex = clientsRoutesSource.indexOf('<section className="driver-route-directory"');

  assert.ok(planIndex >= 0);
  assert.ok(directoryIndex > planIndex);
  assert.match(clientsRoutesSource, /onPlanLoad=\{handlePlanLoad\}/);
  assert.match(clientsRoutesSource, /dataOverride=\{driverDirectory/);
  assert.match(migrationSource, /from public\.routes route/);
  assert.match(migrationSource, /from public\.clients client[\s\S]*?client\.archived_at is null/);
  assert.doesNotMatch(migrationSource, /update public\.|insert into public\.|delete from public\./);
});

test('clicking an assigned route scrolls to and highlights its directory card', () => {
  assert.match(weeklyPlanSource, /onRouteSelect\(route\)/);
  assert.match(clientsRoutesSource, /document\.getElementById\(routeCardId\(route\.id\)\)/);
  assert.match(clientsRoutesSource, /scrollIntoView\(\{ behavior: 'smooth'/);
  assert.match(clientsRoutesSource, /id=\{routeCardId\(route\.id\)\}/);
  assert.match(stylesSource, /\.clients-routes-view \.route-card\.is-plan-target/);
});

test('assignment sheet keeps the selected plan day fixed and edits only the start time', () => {
  assert.match(weeklyPlanSource, /id="weekly-plan-start" type="time"/);
  assert.doesNotMatch(weeklyPlanSource, /type="datetime-local"/);
  assert.match(weeklyPlanSource, /localTimeValue\(trip\?\.planned_start\) \|\| '07:00'/);
  assert.match(weeklyPlanSource, /plannedStartIso\(selection\.date, startTime\)/);
  assert.match(weeklyPlanSource, /new Date\(`\$\{date\}T\$\{time\}:00`\)/);
});

test('a vehicle cannot be assigned to different drivers on the same day', () => {
  assert.match(weeklyPlanSource, /vehicleReservations\.get\(vehicle\.key\)/);
  assert.match(weeklyPlanSource, /disabled=\{occupiedByOtherDriver\}/);
  assert.match(weeklyPlanSource, /reservation\.driverId !== nextDriverId/);
  assert.match(vehicleGuardMigrationSource, /pg_advisory_xact_lock/);
  assert.match(vehicleGuardMigrationSource, /create trigger weekly_route_plan_vehicle_owner_guard/);
  assert.match(vehicleGuardMigrationSource, /assignment\.plan_date = p_trip_date/);
  assert.match(vehicleGuardMigrationSource, /assignment\.driver_id is distinct from p_driver_id/);
  assert.match(vehicleGuardMigrationSource, /assignment\.route_id is distinct from p_route_id/);
});

test('route schedule greys out non-service days but keeps them available as exceptions', () => {
  assert.match(weeklyPlanSource, /effectiveRouteServiceRules\(route\)/);
  assert.match(weeklyPlanSource, /isRuleScheduledOnDate\(rule, date\)/);
  assert.match(weeklyPlanSource, /!scheduledForDate \? 'is-off-schedule'/);
  assert.match(weeklyPlanSource, /weeklyPlan\.assignException/);
  assert.doesNotMatch(weeklyPlanSource, /disabled=\{[^}]*!scheduledForDate/);
  assert.match(weeklyPlanSource, /unassignedScheduledCount/);
  assert.match(stylesSource, /\.weekly-plan-table td\.is-off-schedule/);
});

test('driver keeps the weekly route table with a compact touch-friendly mobile layout', () => {
  assert.doesNotMatch(weeklyPlanSource, /DriverWeeklyAgenda/);
  assert.match(weeklyPlanSource, /weekly-plan-table-wrap \$\{!isAdmin \? 'is-driver-view'/);
  assert.match(weeklyPlanSource, /weeklyPlan\.swipeTable/);
  assert.match(weeklyPlanSource, /className="weekly-plan-driver-time"/);
  assert.match(weeklyPlanSource, /getRouteColorByDisplay\(routeNumber\.get\(route\.id\)\)/);
  assert.match(weeklyPlanSource, /ymd\(date\) === today \? t\('weeklyPlan\.today'\)/);
  assert.match(stylesSource, /\.weekly-plan-table-wrap\.is-driver-view\{[^}]*overscroll-behavior-x:contain/);
  assert.match(stylesSource, /scroll-snap-type:x proximity/);
  assert.match(stylesSource, /\.weekly-plan-table-wrap\.is-driver-view \.weekly-plan-table\{min-width:580px\}/);
  assert.match(stylesSource, /\.weekly-plan-route-link\{min-height:44px/);
  assert.match(stylesSource, /\.weekly-plan-table-wrap\.is-driver-view \.weekly-plan-cell\{min-height:50px/);
  assert.match(stylesSource, /\.weekly-plan-table tbody th\{[^}]*--route-color/);
  assert.match(stylesSource, /\.weekly-plan-table th\.is-today\{[^}]*inset 0 3px 0 var\(--accent\)/);
  assert.match(stylesSource, /\.driver-clients-routes-view\{[^}]*width:100%;[^}]*min-width:0/);
  assert.match(stylesSource, /\.weekly-route-plan\{[^}]*width:100%;[^}]*min-width:0/);
  assert.match(stylesSource, /\.weekly-plan-table-wrap\{[^}]*width:100%;[^}]*min-width:0;[^}]*max-width:100%;[^}]*overflow-x:auto/);
});
