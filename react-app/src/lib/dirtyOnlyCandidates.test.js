import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDirtyOnlyCandidates } from './dirtyOnlyCandidates.js';

test('dirty-only candidates include other routes after clients from the trip routes', () => {
  const trip = { routes: '2' };
  const clients = [
    { id: 'other', name: 'Ten sam hotel', route_id: 7, sort_order: 1 },
    { id: 'own', name: 'Ten sam hotel', route_id: 2, sort_order: 2 },
    { id: 'existing', name: 'Już w kursie', route_id: 7, sort_order: 3 },
    { id: 'clean', name: 'Ma czyste', route_id: 8, sort_order: 4 },
  ];
  const stops = [{
    client_id: 'existing',
    client_name: 'Już w kursie',
    status: 'pending',
    stop_kind: 'dirty_only',
    tasks: [],
  }];

  const candidates = buildDirtyOnlyCandidates({
    clients,
    stops,
    trip,
    cleanClients: [{ client_name: 'Ma czyste', route_id: 8 }],
  });

  assert.deepEqual(candidates, [
    { client_id: 'own', client_name: 'Ten sam hotel', route_id: 2, is_other_route: false },
    { client_id: 'other', client_name: 'Ten sam hotel', route_id: 7, is_other_route: true },
  ]);
});

test('ready clean laundry excludes only the matching client route', () => {
  const candidates = buildDirtyOnlyCandidates({
    trip: { routes: '2' },
    clients: [
      { id: 'own', name: 'Wspólna nazwa', route_id: 2 },
      { id: 'other', name: 'Wspólna nazwa', route_id: 7 },
    ],
    cleanClients: [{ client_name: 'Wspólna nazwa', route_id: 7 }],
  });

  assert.deepEqual(candidates, [
    { client_id: 'own', client_name: 'Wspólna nazwa', route_id: 2, is_other_route: false },
  ]);
});

test('an existing stop hides another client with the same name because a trip name must stay unique', () => {
  const candidates = buildDirtyOnlyCandidates({
    trip: { routes: '2' },
    clients: [
      { id: 'own', name: 'Wspólna nazwa', route_id: 2 },
      { id: 'other', name: 'Wspólna nazwa', route_id: 7 },
    ],
    stops: [{
      client_id: 'own',
      client_name: 'Wspólna nazwa',
      status: 'pending',
      stop_kind: 'dirty_only',
    }],
  });

  assert.deepEqual(candidates, []);
});
