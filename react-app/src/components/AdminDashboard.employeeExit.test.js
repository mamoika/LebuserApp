import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dashboard = await readFile(new URL('./AdminDashboard.jsx', import.meta.url), 'utf8');
const pl = JSON.parse(await readFile(new URL('../i18n/locales/pl.json', import.meta.url), 'utf8'));
const de = JSON.parse(await readFile(new URL('../i18n/locales/de.json', import.meta.url), 'utf8'));

test('employee editor exposes separate monthly removal and employment ending actions', () => {
  assert.match(dashboard, /onRemoveFromMonth/);
  assert.match(dashboard, /onEndEmployment/);
  assert.match(dashboard, /admin_end_employee_from_month/);
  assert.equal(pl.admin.removeFromMonth, 'Nie pracuje w tym miesiącu');
  assert.equal(pl.admin.endEmploymentFromMonth, 'Zakończył pracę od tego miesiąca');
  assert.ok(de.admin.removeFromMonth);
  assert.ok(de.admin.endEmploymentFromMonth);
});

test('driver card settings are limited to the drivers group and former employees can return', () => {
  assert.match(dashboard, /const isDriversGroup/);
  assert.match(dashboard, /driverGroupSelected && <fieldset/);
  assert.match(dashboard, /admin_rehire_employee_from_month/);
  assert.match(dashboard, /employee_employment_events|restoreEmployeeHint/);
  assert.equal(pl.admin.restoreFromMonth, 'Przywróć od tego miesiąca');
  assert.ok(de.admin.restoreFromMonth);
});

test('employee profile captures an exact employment period', () => {
  assert.match(dashboard, /employmentStartedOn/);
  assert.match(dashboard, /currentlyEmployed/);
  assert.match(dashboard, /employmentLastWorkingOn/);
  assert.match(dashboard, /admin_save_employee_employment_profile/);
  assert.equal(pl.admin.employedSince, 'Zatrudniony od');
  assert.equal(pl.admin.lastWorkingDay, 'Ostatni dzień pracy');
});
