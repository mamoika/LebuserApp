import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCourseStopComparator } from './courseStopOrder.js';

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
