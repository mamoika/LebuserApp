import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const entryModalsSource = await readFile(new URL('./EntryModals.jsx', import.meta.url), 'utf8');
const washViewSource = await readFile(new URL('../WashView.jsx', import.meta.url), 'utf8');
const migrationSource = await readFile(
  new URL('../../../db/migrations/20261112120000_manual_laundry_plan_entries.sql', import.meta.url),
  'utf8',
);
const locationFixMigration = await readFile(
  new URL('../../../db/migrations/20261112130000_manual_laundry_location_fix.sql', import.meta.url),
  'utf8',
);

test('laundry admin uses the full driver add-entry modal', () => {
  assert.match(washViewSource, /<AddEntryModal/);
  assert.match(washViewSource, /laundryPlannedDate=\{selectedDate\}/);
  assert.match(entryModalsSource, /laundryPlannedDate = null/);
});

test('full entry payload is saved with the explicit laundry date', () => {
  assert.match(entryModalsSource, /'admin_add_laundry_plan_entry'/);
  assert.match(entryModalsSource, /rpcArgs\.p_planned_date = laundryPlannedDate/);
  assert.match(migrationSource, /v_result := public\.admin_insert_entry\(/);
  assert.match(migrationSource, /set laundry_planned_date = p_planned_date/);
  assert.match(migrationSource, /require_admin\(p_session_token\)/);
});

test('manual laundry is received at the laundry instead of being marked in transit', () => {
  assert.match(
    migrationSource,
    /set laundry_planned_date = p_planned_date,[\s\S]*dirty_received_at = coalesce\(dirty_received_at, now\(\)\)/,
  );
  assert.match(locationFixMigration, /before insert or update of laundry_planned_date/);
  assert.match(locationFixMigration, /where laundry_planned_date is not null[\s\S]*and dirty_received_at is null/);
  assert.match(locationFixMigration, /'dirty_received_at_laundry'/);
});
