import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dashboard = await readFile(new URL('./AdminDashboard.jsx', import.meta.url), 'utf8');
const pl = JSON.parse(await readFile(new URL('../i18n/locales/pl.json', import.meta.url), 'utf8'));
const de = JSON.parse(await readFile(new URL('../i18n/locales/de.json', import.meta.url), 'utf8'));

test('employee editor uses one monthly checkbox and exact employment dates without duplicate action cards', () => {
  assert.match(dashboard, /t\('admin\.monthSchedule'/);
  assert.match(dashboard, /checked=\{active\}/);
  assert.match(dashboard, /t\('admin\.employmentPeriod'\)/);
  assert.doesNotMatch(dashboard, /onRemoveFromMonth|onEndEmployment|employmentAction/);
  assert.equal(pl.admin.inactiveThisMonthHint, 'Ukrywa tylko w tym miesiącu. Nie kończy zatrudnienia.');
  assert.ok(de.admin.inactiveThisMonthHint);
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
  assert.match(dashboard, /employmentStatusEnded/);
  assert.equal(pl.admin.employmentStatusEnded, 'Zatrudnienie zakończone');
});

test('existing employee names open settings while add and rehire stay explicit actions', () => {
  assert.match(dashboard, /__profileOnly: true/);
  assert.match(dashboard, /else if \(isProfileOnly\) await onSaveProfile/);
  assert.match(dashboard, /admin_update_employee_profile/);
  assert.match(dashboard, /disabled=\{isRehire \|\| profileIsFormerEmployee\}/);
  assert.match(dashboard, /onClick=\{\(\) => handleAddExisting\(employee\)\}/);
  assert.match(dashboard, /onClick=\{\(\) => setModal\(\{ \.\.\.employee, __rehire: true \}\)\}/);
  assert.ok(pl.admin.openEmployeeSettings);
  assert.ok(de.admin.openEmployeeSettings);
});

test('employee ending during the selected month is shown as a former employee', () => {
  assert.match(dashboard, /selectedMonthEndExclusive/);
  assert.match(dashboard, /e\.employment_ended_on < selectedMonthEndExclusive/);
  assert.match(dashboard, /employee\.employment_last_working_on/);
  assert.equal(pl.admin.lastWorkedOn, 'ostatni dzień pracy: {{date}}');
  assert.ok(de.admin.lastWorkedOn);
});

test('employee groups use a responsive two-column layout with ZD 2 on the right', () => {
  assert.match(dashboard, /const isZd2Group/);
  assert.match(dashboard, /employee-groups-layout/);
  assert.match(dashboard, /employee-groups-zd2/);
  assert.match(dashboard, /otherEmployeeGroups\.map\(renderEmployeeGroup\)/);
  assert.equal(pl.admin.groupEmployeeCount, '{{count}} osób w grupie');
  assert.ok(de.admin.groupEmployeeCount);
});
