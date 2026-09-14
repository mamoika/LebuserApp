import assert from 'node:assert/strict';
import test from 'node:test';
import { assignedRouteIdsForDate } from './driverPlanAssignments.js';

test('assigned routes use driver and date but never the informational start hour', () => {
  const assignments = [
    { driver_id: 'driver-1', driver_name: 'Jan', trip_date: '2026-09-14', routes: '3', planned_start: '2026-09-14T23:30:00+02:00' },
    { driver_id: 'driver-1', driver_name: 'Jan', trip_date: '2026-09-15', routes: '4', planned_start: '2026-09-15T07:00:00+02:00' },
    { driver_id: 'driver-2', driver_name: 'Anna', trip_date: '2026-09-14', routes: '5', planned_start: null },
  ];

  assert.deepEqual(
    [...assignedRouteIdsForDate(assignments, 'driver-1', 'Jan', '2026-09-14')],
    [3],
  );
});
