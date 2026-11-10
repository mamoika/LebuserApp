import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../db/migrations/20261110143000_admin_force_release_trolley.sql', import.meta.url),
  'utf8',
);

test('forced trolley correction is admin-only, transactional and keeps immutable history', () => {
  assert.match(migration, /v_user\.role <> 'admin'/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /private\.record_trolley_event/);
  assert.match(migration, /'forced_empty'/);
  assert.match(migration, /'converted_to_loose'/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.laundry_trolley_events/i);
});

test('loose conversion preserves laundry in a virtual cycle while force-empty recalculates packing', () => {
  assert.match(migration, /insert into public\.laundry_trolley_cycles[\s\S]*?'brak'/);
  assert.match(migration, /perform public\.recalculate_laundry_status_for_entries/);
  assert.match(migration, /arrival_trolley_nos = affected\.remaining_nos/);
  assert.match(migration, /status = 'canceled'/);
});
