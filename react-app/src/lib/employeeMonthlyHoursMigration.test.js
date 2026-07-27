import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../db/migrations/monthly_employee_work_hours.sql', import.meta.url),
  'utf8',
);

test('employee month snapshots store their own default shift hours', () => {
  assert.match(migration, /add column if not exists default_start text/i);
  assert.match(migration, /add column if not exists default_end text/i);
  assert.match(
    migration,
    /update public\.employee_months em[\s\S]*set default_start =[\s\S]*default_end =/i,
  );
  assert.match(migration, /before insert on public\.employee_months/i);
  assert.match(migration, /function private\.employee_month_inherit_hours\(\)/i);
});

test('a newly opened month inherits hours from the previous month', () => {
  assert.match(
    migration,
    /select[\s\S]*em\.employee_id, p_year, p_month, true, em\.group_name, em\.sort_order,[\s\S]*em\.default_start, em\.default_end[\s\S]*where em\.year = v_prev_year/i,
  );
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /employee_month_roster_state/i);
  assert.match(
    migration,
    /select state\.year, state\.month[\s\S]*from public\.employee_month_roster_state state/i,
  );
  assert.match(
    migration,
    /insert into public\.employee_month_roster_state \(year, month\)[\s\S]*values \(p_year, p_month\)/i,
  );
});

test('editing an existing employee saves hours only in the selected month', () => {
  const existingEmployeeUpdate = migration.match(
    /else\s+-- Dane osobowe[\s\S]*?update public\.employees([\s\S]*?)where id = p_employee_id/i,
  );
  assert.ok(existingEmployeeUpdate, 'existing employee update block is present');
  assert.doesNotMatch(existingEmployeeUpdate[1], /default_start\s*=/i);
  assert.doesNotMatch(existingEmployeeUpdate[1], /default_end\s*=/i);
  assert.match(
    migration,
    /insert into public\.employee_months \([\s\S]*default_start, default_end[\s\S]*v_default_start,[\s\S]*v_default_end/i,
  );
});

test('roster and driver work time return the selected month hours', () => {
  assert.match(
    migration,
    /coalesce\(nullif\(trim\(em\.default_start\), ''\)[\s\S]*as default_start/i,
  );
  assert.match(
    migration,
    /join public\.get_month_roster\(p_year, p_month, true\) mr on mr\.id = u\.employee_id/i,
  );
  assert.match(
    migration,
    /function public\.get_my_work_time\(\s*p_session_token text,\s*p_year integer,\s*p_month integer\s*\)/i,
  );
});
