import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { operationalCourseStops } from './courseStopVisibility.js';

const dispatchProgressMigration = await readFile(
  new URL('../../db/migrations/20261116120000_ignore_removed_scheduled_stops.sql', import.meta.url),
  'utf8',
);
const tripCourseStopsSource = await readFile(
  new URL('../components/courses/TripCourseStops.jsx', import.meta.url),
  'utf8',
);

test('a scheduled stop removed during planning does not count in the active course', () => {
  const stops = [
    {
      id: 'green',
      client_name: 'Hotel Green',
      stop_kind: 'scheduled',
      status: 'skipped',
      tasks: [],
    },
    {
      id: 'radisson',
      client_name: 'Radisson',
      stop_kind: 'client',
      status: 'pending',
      tasks: [],
    },
  ];

  assert.deepEqual(
    operationalCourseStops(stops).map(stop => stop.client_name),
    ['Radisson'],
  );
});

test('a stop skipped during the drive remains part of the operational history', () => {
  const stops = [{
    id: 'unavailable-client',
    client_name: 'Hotel Today',
    stop_kind: 'client',
    status: 'skipped',
    tasks: [],
  }];

  assert.deepEqual(operationalCourseStops(stops), stops);
});

test('dispatch progress excludes a scheduled stop removed during planning', () => {
  assert.match(
    dispatchProgressMigration,
    /not \(s\.stop_kind = 'scheduled' and s\.status = 'skipped'\)/,
  );
});

test('course details hide a scheduled stop removed during planning', () => {
  assert.match(tripCourseStopsSource, /setStops\(operationalCourseStops\(data\.stops \|\| \[\]\)\)/);
});
