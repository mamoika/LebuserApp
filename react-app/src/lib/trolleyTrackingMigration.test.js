import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const occupancyMigration = await readFile(
  new URL('../../db/migrations/20261008143044_unify_trolley_occupancy_tracking.sql', import.meta.url),
  'utf8',
);
const correctionMigration = await readFile(
  new URL('../../db/migrations/20261008143052_reconcile_current_trolley_locations.sql', import.meta.url),
  'utf8',
);

test('packing and dirty arrival use one physical trolley lock and occupancy guard', () => {
  assert.match(occupancyMigration, /physical-trolley\|/);
  assert.match(occupancyMigration, /private\.active_arrival_trolley_reservations\(\)/);
  assert.match(occupancyMigration, /Wózek %s jest zajęty przez brudne pranie klienta/);
  assert.match(occupancyMigration, /private\.active_laundry_trolley_cycle/);
});

test('laundry workflow exposes dirty arrival reservations', () => {
  assert.match(occupancyMigration, /'arrival_reservations', v_arrival_reservations/);
});

test('returning a packed trolley before delivery clears the stale entry reference', () => {
  assert.match(occupancyMigration, /clear_left_laundry_trolley_reference/);
  assert.match(occupancyMigration, /laundry_trolley_no = 'brak'/);
});

test('data correction closes old reservations and restores only Motel One trolleys 1 and 2', () => {
  assert.match(correctionMigration, /washed = true/);
  assert.match(correctionMigration, /added_at <= timestamptz '2026-10-08 14:30:00\+02'/);
  assert.match(correctionMigration, /client_name = 'Motel One'/);
  assert.match(correctionMigration, /trolley_no in \('1', '2'\)/);
  assert.match(correctionMigration, /status = 'at_client'/);
});
