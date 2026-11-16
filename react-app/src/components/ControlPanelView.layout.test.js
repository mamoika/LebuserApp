import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const viewSource = await readFile(new URL('./ControlPanelView.jsx', import.meta.url), 'utf8');
const pl = JSON.parse(await readFile(new URL('../i18n/locales/pl.json', import.meta.url), 'utf8'));
const de = JSON.parse(await readFile(new URL('../i18n/locales/de.json', import.meta.url), 'utf8'));

test('team card shows planned absences after today\'s absences', () => {
  assert.match(
    viewSource,
    /buildUpcomingAbsences\(\{ \.\.\.input, fromDay: day \+ 1, days: 7 \}\)/,
    'the control panel should load planned absences from the next seven days',
  );
  assert.match(
    viewSource,
    /controlPanel\.team\.absentToday[\s\S]*controlPanel\.team\.planned[\s\S]*team\?\.upcoming\.length/,
    'planned absences should follow the current-day absence section',
  );
  assert.equal(pl.controlPanel.team.planned, 'Zaplanowane');
  assert.equal(de.controlPanel.team.planned, 'Geplant');
  assert.ok(pl.controlPanel.team.noPlanned);
  assert.ok(de.controlPanel.team.noPlanned);
});
