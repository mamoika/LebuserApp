import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('./DriverCourseStart.jsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../mockups/mockups.css', import.meta.url), 'utf8');

test('today route-plan assignment is preselected and highlighted with route color', () => {
  assert.match(source, /getWeeklyRoutePlan\(sessionToken, today\)/);
  assert.match(source, /assignedRouteIdsForDate\([\s\S]*?today,/);
  assert.match(source, /setSelectedRoutes\(routesAssignedToday\)/);
  assert.match(source, /style=\{active \? \{ borderColor: color, background: `\$\{color\}14` \}/);
  assert.doesNotMatch(source, /course\.start\.assignedBadge/);
  assert.doesNotMatch(styles, /\.live-start-assigned-badge/);
});

test('assignment matching does not depend on planned start time', () => {
  const matchingBlock = source.slice(
    source.indexOf('const routesAssignedToday'),
    source.indexOf('setDefaultCar'),
  );
  assert.doesNotMatch(matchingBlock, /planned_start/);
});
