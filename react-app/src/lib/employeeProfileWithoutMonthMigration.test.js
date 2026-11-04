import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../db/migrations/20261104220000_employee_profile_without_month_assignment.sql', import.meta.url),
  'utf8',
);

test('profile-only update changes employee defaults without writing a monthly roster row', () => {
  assert.match(migration, /create or replace function public\.admin_update_employee_profile/i);
  assert.match(migration, /update public\.employees/i);
  assert.doesNotMatch(migration, /insert into public\.employee_months/i);
  assert.doesNotMatch(migration, /update public\.employee_months/i);
});
