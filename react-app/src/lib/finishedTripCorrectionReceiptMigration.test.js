import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../db/migrations/20261117120000_receive_dirty_on_finished_trip_correction.sql', import.meta.url),
  'utf8',
);

test('dirty laundry added in a finished course correction is received at the laundry', () => {
  assert.match(migration, /create or replace function private\.receive_dirty_entry_from_finished_trip\(p_entry_id text\)/);
  assert.match(migration, /trip\.status = 'finished'/);
  assert.match(migration, /set dirty_received_at = v_received_at/);
  assert.match(migration, /private\.record_trolley_event/);
  assert.match(migration, /'source', 'finished_trip_correction'/);
  assert.match(migration, /revoke execute on function private\.receive_dirty_entry_from_finished_trip\(text\)\s+from public, anon, authenticated/);
});

test('both correction paths trigger the receipt', () => {
  // Edycja wpisu: dodanie wózków do wpisu w zakończonym kursie.
  assert.match(migration, /after update of arrival_trolley_nos on public\.entries/);
  // Nowy wpis dopięty do zakończonego kursu przez sync_trip_course.
  assert.match(migration, /after insert or update of entry_id, stop_id on public\.trip_stop_tasks/);
});

test('entries already stuck in the vehicle after a finished course are backfilled', () => {
  assert.match(migration, /do \$\$[\s\S]*receive_dirty_entry_from_finished_trip\(v_entry_id\)[\s\S]*\$\$;/);
});
