import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../db/migrations/20260914194958_driver_trip_planning_source.sql', import.meta.url),
  'utf8',
);

test('course planning source is stored explicitly for driver and dispatcher flows', () => {
  assert.match(migration, /add column if not exists planning_source text/);
  assert.match(migration, /check \(planning_source in \('driver', 'dispatcher', 'legacy'\)\)/);
  assert.match(migration, /'driver', v_user\.id, v_user\.name/);
  assert.match(migration, /'dispatcher', v_admin\.id, v_admin\.name/);
});

test('only dispatcher courses receive empty stops from the recurring service schedule', () => {
  assert.match(migration, /v_trip\.planning_source is distinct from 'dispatcher'/);
  assert.match(migration, /where v_trip\.planning_source = 'dispatcher'[\s\S]*?private\.client_service_is_due/);
});
