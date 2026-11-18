import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { operationalCourseStops } from './courseStopVisibility.js';
import { canCompleteStop, dirtyEntriesForStop, statsFromCourseStops, stopLaundryMeta } from './courseTaskHelpers.js';

const dispatchProgressMigration = await readFile(
  new URL('../../db/migrations/20261118130000_preserve_course_stop_outcomes.sql', import.meta.url),
  'utf8',
);
const tripCourseStopsSource = await readFile(
  new URL('../components/courses/TripCourseStops.jsx', import.meta.url),
  'utf8',
);

test('an explicitly assigned dirty pickup belongs only to its course', () => {
  const legacy = { id: 'legacy', client_name: 'Radisson', week_key: '2026-11-16', arr_day: 3 };
  const assigned = { ...legacy, id: 'assigned', dirty_pickup_trip_id: 'course-1' };
  const removed = { ...assigned, id: 'removed', deleted_at: '2026-11-18T09:00:00Z' };
  const entries = [legacy, assigned, removed];

  assert.deepEqual(dirtyEntriesForStop(entries, 'Radisson', '2026-11-18', 'course-1'), [legacy, assigned]);
  assert.deepEqual(dirtyEntriesForStop(entries, 'Radisson', '2026-11-18', 'course-2'), [legacy]);
});

test('a scheduled stop removed during planning does not count in the active course', () => {
  const stops = [
    {
      id: 'green',
      client_name: 'Hotel Green',
      stop_kind: 'scheduled',
      status: 'skipped',
      completed_at: '2026-11-18T07:05:00Z',
      tasks: [],
    },
    { id: 'not-loaded', stop_kind: 'client', status: 'skipped', completed_at: null, tasks: [] },
    {
      id: 'radisson',
      client_name: 'Radisson',
      stop_kind: 'client',
      status: 'pending',
      tasks: [],
    },
  ];

  assert.deepEqual(
    operationalCourseStops(stops, '2026-11-18T07:08:00Z').map(stop => stop.client_name),
    ['Radisson'],
  );
});

test('a stop skipped during the drive remains part of the operational history', () => {
  const stops = [{
    id: 'unavailable-client',
    client_name: 'Hotel Today',
    stop_kind: 'scheduled',
    status: 'skipped',
    completed_at: '2026-11-18T08:00:00Z',
    tasks: [],
  }];

  assert.deepEqual(operationalCourseStops(stops, '2026-11-18T07:08:00Z'), stops);
});

test('dispatch progress excludes a scheduled stop removed during planning', () => {
  assert.match(
    dispatchProgressMigration,
    /s\.status = 'skipped' and \(\s*s\.completed_at is null\s*or \(dt\.started_at is not null and s\.completed_at < dt\.started_at\)/,
  );
});

test('course details hide a scheduled stop removed during planning', () => {
  assert.match(tripCourseStopsSource, /operationalCourseStops\(stops, trip\.started_at\)\.sort\(buildCourseStopComparator\(clients, routes\)\)/);
});

test('synchronizing a finished course preserves skipped visits and unfinished clean delivery tasks', () => {
  assert.match(dispatchProgressMigration, /where stop\.trip_id = v_trip\.id\s+and stop\.status <> 'skipped'/);
  assert.match(dispatchProgressMigration, /and v_trip\.status = 'finished'\s+and stop\.status = 'pending'\s+and not exists/);
  assert.match(dispatchProgressMigration, /and stop\.status = 'completed'\s+and task\.task_type = 'pickup_dirty'/);
});

test('one load has the same weight in the stop and course summary', () => {
  const load = { entry_id: 'load', quantity: 1205, unit: 'kg', status: 'completed' };
  const tasks = [
    { ...load, task_type: 'pickup_clean', done: true },
    { ...load, task_type: 'deliver_clean', delivered: true },
    { entry_id: 'dirty', task_type: 'pickup_dirty', quantity: 3, unit: 'wózki', status: 'pending' },
  ];
  const stop = { client_name: 'Radisson', stop_kind: 'client', status: 'pending', tasks };

  assert.equal(stopLaundryMeta(tasks).kg, 1205);
  const stats = statsFromCourseStops([stop]);
  assert.equal(stats.kg, 1205);
  assert.equal(stats.delivered, 1);
  assert.equal(canCompleteStop(stop), true);
});

test('undoing a delivery takes precedence over a stale completed task status', () => {
  const stop = {
    stop_kind: 'client',
    status: 'pending',
    tasks: [{ task_type: 'deliver_clean', status: 'completed', delivered: false }],
  };

  assert.equal(statsFromCourseStops([stop]).delivered, 0);
  assert.equal(canCompleteStop(stop), false);
});
