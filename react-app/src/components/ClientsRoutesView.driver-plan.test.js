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
  assert.match(weeklyPlanSource, /onRouteSelect\?\.\(route\)/);
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

test('driver uses a responsive day-card agenda while admin keeps the planning table', () => {
  const agendaStart = weeklyPlanSource.indexOf('function DriverWeeklyAgenda');
  const agendaEnd = weeklyPlanSource.indexOf('export default function WeeklyRoutePlanView');
  const agendaSource = weeklyPlanSource.slice(agendaStart, agendaEnd);

  assert.ok(agendaStart >= 0);
  assert.ok(agendaEnd > agendaStart);
  assert.match(weeklyPlanSource, /!isAdmin \? \(\s*<DriverWeeklyAgenda/);
  assert.match(weeklyPlanSource, /: \(\s*<div className="weekly-plan-table-wrap">/);
  assert.match(agendaSource, /className="driver-week-grid"/);
  assert.match(agendaSource, /weeklyPlan\.noRouteForDay/);
  assert.doesNotMatch(agendaSource, /trip\.driver_name/);
  assert.match(stylesSource, /\.driver-week-grid\{display:grid;grid-template-columns:repeat\(3/);
  assert.match(stylesSource, /@media\(max-width:640px\)\{\.driver-week-grid\{grid-template-columns:1fr/);
});
