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
