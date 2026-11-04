import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../db/migrations/20261104203000_employee_employment_periods.sql', import.meta.url),
  'utf8',
);
const grafik = await readFile(new URL('../components/GrafikView.jsx', import.meta.url), 'utf8');

test('employment periods preserve rehire history and exact first and last working dates', () => {
  assert.match(migration, /create table if not exists public\.employee_employment_periods/i);
  assert.match(migration, /employment_started_on date/i);
  assert.match(migration, /employment_last_working_on date/i);
  assert.match(migration, /create or replace function public\.admin_save_employee_employment_profile/i);
  assert.match(migration, /'employment_restarted'/i);
  assert.doesNotMatch(migration, /delete from public\.employee_employment_periods/i);
});

test('schedule writes are rejected outside every recorded employment period', () => {
  assert.match(migration, /admin_save_schedule_entry[\s\S]*employee_employment_periods[\s\S]*Nie można wpisać obecności poza okresem zatrudnienia/i);
  assert.match(migration, /admin_save_timeline_entry[\s\S]*employee_employment_periods[\s\S]*Nie można wpisać pracy poza okresem zatrudnienia/i);
  assert.match(migration, /'employment_periods', v_employment_periods/i);
});

test('the schedule UI renders days outside employment as disabled', () => {
  assert.match(grafik, /isEmploymentDay/);
  assert.match(grafik, /isOutsideEmployment/);
  assert.match(grafik, /aria-disabled=\{isOutsideEmployment/);
  assert.match(grafik, /outsideEmploymentPeriod/);
});
