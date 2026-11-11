import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../db/migrations/20261111155857_guard_washing_until_laundry_receipt.sql', import.meta.url),
  'utf8',
);

test('washing requires dirty laundry to be physically received at the laundry', () => {
  assert.match(migration, /entry\.dirty_received_at is null/);
  assert.match(migration, /'error_code', 'laundry_not_at_laundry'/);
  assert.match(migration, /for update/);
  assert.match(migration, /revoke execute on function public\.admin_mark_laundry_washed[^;]+from public/s);
});

test('finished legacy courses are backfilled as received with trolley history', () => {
  assert.match(migration, /trip\.status = 'finished'/);
  assert.match(migration, /set dirty_received_at = v_entry\.received_at/);
  assert.match(migration, /private\.record_trolley_event/);
  assert.match(migration, /'source', 'receipt_backfill'/);
});
