import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const viewSource = await readFile(new URL('./WorkScheduleView.jsx', import.meta.url), 'utf8');
const pl = JSON.parse(await readFile(new URL('../i18n/locales/pl.json', import.meta.url), 'utf8'));
const de = JSON.parse(await readFile(new URL('../i18n/locales/de.json', import.meta.url), 'utf8'));
const removalMigration = await readFile(
  new URL('../../db/migrations/remove_workforce_planning.sql', import.meta.url),
  'utf8',
);

test('work schedule no longer exposes hall planning', () => {
  assert.doesNotMatch(viewSource, /WorkforcePlanningView|#planowanie|planningTab|MapPinned/);
  assert.equal(pl.workSchedule.planningTab, undefined);
  assert.equal(de.workSchedule.planningTab, undefined);
  assert.equal(pl.workforcePlanning, undefined);
  assert.equal(de.workforcePlanning, undefined);
  assert.match(removalMigration, /drop function if exists public\.get_workforce_floor_plan\(text\)/i);
  assert.match(removalMigration, /drop function if exists public\.admin_save_workforce_floor_plan\(text, jsonb, timestamptz\)/i);
  assert.match(removalMigration, /key like 'workforce_plan_%'/i);
});
