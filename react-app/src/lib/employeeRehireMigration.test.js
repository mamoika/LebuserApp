import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../db/migrations/20261104193000_employee_rehire_and_driver_card_scope.sql', import.meta.url),
  'utf8',
);

test('rehiring preserves employment events and reactivates only from the selected month', () => {
  assert.match(migration, /create table if not exists public\.employee_employment_events/i);
  assert.match(migration, /event_type in \('employment_ended', 'employment_restarted'\)/i);
  assert.match(migration, /create or replace function public\.admin_rehire_employee_from_month/i);
  assert.match(migration, /set active = true,\s*employment_ended_on = null/i);
  assert.match(migration, /'employment_restarted', v_restart_date/i);
  assert.doesNotMatch(migration, /delete from public\.employee_months/i);
});

test('driver card RPCs require an active monthly drivers-group membership', () => {
  assert.match(migration, /admin_save_driver_card_settings_for_month[\s\S]*upper\(trim\(coalesce\(em\.group_name, ''\)\)\) = 'KIEROWCY'/i);
  assert.match(migration, /get_driver_card_reminders[\s\S]*join public\.employee_months em[\s\S]*= 'KIEROWCY'/i);
  assert.match(migration, /mark_driver_card_downloaded[\s\S]*join public\.employee_months em[\s\S]*= 'KIEROWCY'/i);
});
