import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const grafikSource = readFileSync(new URL('../GrafikView.jsx', import.meta.url), 'utf8');
const dialogSource = readFileSync(new URL('./DriverCardDddDialog.jsx', import.meta.url), 'utf8');

test('work schedule viewers can open DDD archives while only editors can import files', () => {
  assert.match(grafikSource, /const canViewWorkSchedule = canViewModule\('work_schedule'\)/);
  assert.match(grafikSource, /canOpenDdd=\{canViewWorkSchedule\}/);
  assert.match(grafikSource, /canImportDdd=\{canEditWorkSchedule\}/);
  assert.match(dialogSource, /canImportDdd && !file && !archivedImport/);
  assert.match(dialogSource, /\{canImportDdd && <input/);
  assert.match(dialogSource, /if \(!canImportDdd \|\| !file/);
});
