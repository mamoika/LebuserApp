import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../db/migrations/20261106135000_reconcile_radisson_laundry_batches.sql', import.meta.url),
  'utf8',
);

test('Radisson correction keeps the 267 kg departure separate from the 385 kg wash batch', () => {
  assert.match(migration, /coalesce\(sum\(weight\), 0\) = 267/);
  assert.match(migration, /coalesce\(sum\(weight\), 0\) = 385/);
  assert.match(migration, /laundry_status = 'released'/);
  assert.match(migration, /driver_pickup_trip_id = v_trip_id/);
  assert.match(migration, /else 'washed'/);
  assert.match(migration, /'wash_date'.*'2026-11-05'.*'2026-11-06'/s);
  assert.match(migration, /'departure_date'.*'2026-11-06'.*'2026-11-09'/s);
});
