import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCourseStopComparator } from './courseStopOrder.js';
import { buildVirtualPlannedTrips } from './tripUiHelpers.js';

test('course stops follow client order even when dirty-only stop was appended later', () => {
  const routes = [{ id: 8, sort_order: 8 }];
  const clients = [
    { id: 'client-1', name: 'Hotel 1', route_id: 8, sort_order: 1 },
    { id: 'client-2', name: 'Hotel 2', route_id: 8, sort_order: 2 },
  ];
  const stops = [
    { id: 'stop-2', client_id: 'client-2', client_name: 'Hotel 2', route_id: 8, position: 1, stop_kind: 'client' },
    { id: 'stop-1', client_id: 'client-1', client_name: 'Hotel 1', route_id: 8, position: 2, stop_kind: 'dirty_only' },
  ];

  assert.deepEqual(
    [...stops].sort(buildCourseStopComparator(clients, routes)).map(stop => stop.client_name),
    ['Hotel 1', 'Hotel 2'],
  );
});

test('course stops follow route order before client order', () => {
  const routes = [
    { id: 20, sort_order: 2 },
    { id: 10, sort_order: 1 },
  ];
  const clients = [
    { name: 'Route two first client', route_id: 20, sort_order: 1 },
    { name: 'Route one second client', route_id: 10, sort_order: 2 },
  ];
  const stops = [
    { client_name: 'Route two first client', route_id: 20, position: 1 },
    { client_name: 'Route one second client', route_id: 10, position: 2 },
  ];

  assert.deepEqual(
    [...stops].sort(buildCourseStopComparator(clients, routes)).map(stop => stop.client_name),
    ['Route one second client', 'Route two first client'],
  );
});

test('weekly route assignment enriches a virtual dispatch course', () => {
  const trips = buildVirtualPlannedTrips({
    entries: [{
      route_id: 5,
      week_key: '2026-11-16',
      arr_day: 1,
      pick_week_key: '2026-11-16',
      pick_day: 1,
    }],
    allTrips: [],
    routePlanTrips: [{
      id: 'assignment-1',
      trip_date: '2026-11-16',
      routes: '5',
      driver_id: 'driver-1',
      driver_name: 'Henryk Ulatowski',
      car: 'fiat',
      planned_start: '2026-11-16T08:00:00+00:00',
    }],
    tripDate: '2026-11-16',
    horizonDays: 30,
  });

  assert.equal(trips.length, 1);
  assert.deepEqual(trips[0], {
    id: 'virtual_2026-11-16_5',
    status: 'planned',
    trip_date: '2026-11-16',
    driver_name: 'Henryk Ulatowski',
    driver_id: 'driver-1',
    car: 'fiat',
    routes: '5',
    planned_start: '2026-11-16T08:00:00+00:00',
    plan_assignment_id: 'assignment-1',
    isVirtual: true,
    board_status: 'ready',
    stops_total: 0,
    stops_completed: 0,
  });
});

test('weekly route assignment creates a dispatch course without laundry entries', () => {
  const trips = buildVirtualPlannedTrips({
    entries: [],
    allTrips: [],
    routePlanTrips: [{
      id: 'assignment-2',
      trip_date: '2026-11-16',
      routes: '6',
      driver_id: 'driver-2',
      driver_name: 'Paweł Tałajczyk',
      car: 'isuzu',
    }],
    tripDate: '2026-11-16',
    horizonDays: 30,
  });

  assert.equal(trips.length, 1);
  assert.equal(trips[0].routes, '6');
  assert.equal(trips[0].driver_name, 'Paweł Tałajczyk');
  assert.equal(trips[0].board_status, 'ready');
});

test('operational course replaces the weekly-plan virtual course', () => {
  const trips = buildVirtualPlannedTrips({
    entries: [{
      route_id: 5,
      week_key: '2026-11-16',
      arr_day: 1,
      pick_week_key: '2026-11-16',
      pick_day: 1,
    }],
    allTrips: [{ trip_date: '2026-11-16', routes: '5' }],
    routePlanTrips: [{ trip_date: '2026-11-16', routes: '5', driver_id: 'driver-1' }],
    tripDate: '2026-11-16',
    horizonDays: 30,
  });

  assert.deepEqual(trips, []);
});
