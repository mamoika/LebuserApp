import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../db/migrations/20261104180000_employee_roster_inheritance.sql', import.meta.url),
  'utf8',
);

test('future automatic rosters inherit the immediately preceding month', () => {
  assert.match(migration, /add column if not exists is_manual boolean/i);
  assert.match(migration, /make_date\(p_year, p_month, 1\)\s*-\s*interval '1 month'/i);
  assert.match(
    migration,
    /update public\.employee_months em[\s\S]*set active = false[\s\S]*em\.year = p_year[\s\S]*em\.month = p_month[\s\S]*insert into public\.employee_months/i,
  );
  assert.match(migration, /is_manual = false/i);
});

test('employees who ended work cannot be copied into later months', () => {
  assert.match(migration, /add column if not exists employment_ended_on date/i);
  assert.match(
    migration,
    /e\.employment_ended_on is null[\s\S]*e\.employment_ended_on > make_date\(p_year, p_month, 1\)/i,
  );
  assert.match(migration, /create or replace function public\.admin_end_employee_from_month/i);
  assert.match(migration, /set active = false,[\s\S]*employment_ended_on =/i);
  assert.doesNotMatch(migration, /delete from public\.schedule_entries/i);
});

test('monthly removal remains local while ending work deactivates future roster rows', () => {
  assert.match(
    migration,
    /function public\.admin_remove_employee_from_month[\s\S]*set active = false[\s\S]*employee_id = p_employee_id[\s\S]*year = p_year[\s\S]*month = p_month/i,
  );
  assert.match(
    migration,
    /function public\.admin_end_employee_from_month[\s\S]*update public\.employee_months[\s\S]*set active = false[\s\S]*year > p_year[\s\S]*year = p_year and month >= p_month[\s\S]*return json_build_object\('ok'/i,
  );
  assert.doesNotMatch(migration, /delete from public\.employee_months/i);
});

test('the corrective data step retires Helak Wiktor without deleting history', () => {
  assert.match(migration, /lower\(trim\(name\)\) = 'helak wiktor'/i);
  assert.match(migration, /update public\.employee_months em[\s\S]*set active = false/i);
  assert.match(migration, /set_config\('lebuser\.auto_roster_refresh', 'on', true\)/i);
});
