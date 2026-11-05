import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../db/migrations/20261105120000_complete_trolley_tracking.sql', import.meta.url),
  'utf8',
);

test('creates a per-trolley registry and immutable domain history surface', () => {
  assert.match(migration, /create table if not exists public\.laundry_trolleys/);
  assert.match(migration, /tare_kg numeric/);
  assert.match(migration, /create table if not exists public\.laundry_trolley_events/);
  assert.match(migration, /get_trolley_history/);
  assert.match(migration, /revoke all on public\.laundry_trolleys, public\.laundry_trolley_events/);
});

test('calculates net arrival weight from gross weight and trolley tare', () => {
  assert.match(migration, /private\.arrival_tare_kg/);
  assert.match(migration, /arrival_gross_kg/);
  assert.match(migration, /arrival_tare_kg/);
  assert.match(migration, /greatest\(0, p_weight - v_tare\)/);
});

test('tracks the return trip, laundry receipt, wash release, and empty transfers', () => {
  assert.match(migration, /dirty_picked_up/);
  assert.match(migration, /dirty_received_at_laundry/);
  assert.match(migration, /released_after_wash/);
  assert.match(migration, /driver_deliver_entries_with_empty_trolleys/);
  assert.match(migration, /load_kind = 'empty_transfer'/);
});
