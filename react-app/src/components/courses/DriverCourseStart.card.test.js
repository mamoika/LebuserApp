import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const startSource = await readFile(new URL('./DriverCourseStart.jsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../mockups/mockups.css', import.meta.url), 'utf8');
const migration = await readFile(new URL('../../../db/migrations/20261111190000_driver_card_ddd_read_access.sql', import.meta.url), 'utf8');
const plJson = JSON.parse(await readFile(new URL('../../i18n/locales/pl.json', import.meta.url), 'utf8'));
const deJson = JSON.parse(await readFile(new URL('../../i18n/locales/de.json', import.meta.url), 'utf8'));

test('driver course start renders driver card button with badge and opens read-only DDD dialog', () => {
  assert.match(startSource, /getDriverCardReminders\(sessionToken\)/);
  assert.match(startSource, /className=\{`live-start-card-btn state-\$\{driverCard\.state\}`\}/);
  assert.match(startSource, /driverCardBadgeText\(driverCard, t\)/);
  assert.match(startSource, /<DriverCardDddDialog[\s\S]*?canImportDdd=\{false\}[\s\S]*?presetDriver=\{driverCard\}/);
  assert.match(styles, /\.live-start-card-btn/);
  assert.match(styles, /\.live-start-card-badge/);
  assert.match(styles, /\.live-start-card-btn\.state-ok/);
  assert.match(styles, /\.live-start-card-btn\.state-dueSoon/);
  assert.match(styles, /\.live-start-card-btn\.state-overdue/);
});

test('translations for driverCard button and states exist in pl and de', () => {
  assert.ok(plJson.course.driverCard.button);
  assert.ok(deJson.course.driverCard.button);
  assert.ok(plJson.course.driverCard.dueDays);
  assert.ok(deJson.course.driverCard.dueDays);
  assert.ok(plJson.course.driverCard.overdueDays);
  assert.ok(deJson.course.driverCard.overdueDays);
  assert.ok(plJson.course.driverCard.dueToday);
  assert.ok(deJson.course.driverCard.dueToday);
  assert.ok(plJson.course.driverCard.missing);
  assert.ok(deJson.course.driverCard.missing);
  assert.ok(plJson.course.driverCard.tooltip);
  assert.ok(deJson.course.driverCard.tooltip);
});

test('database migration allows drivers to view their own card reminder and DDD archive', () => {
  assert.match(migration, /create or replace function public\.get_driver_card_reminders/);
  assert.match(migration, /create or replace function public\.get_work_schedule_ddd_context/);
  assert.match(migration, /create or replace function public\.get_work_schedule_ddd_import_detail/);
  assert.match(migration, /p_employee_id <> v_user_employee_id/);
});
