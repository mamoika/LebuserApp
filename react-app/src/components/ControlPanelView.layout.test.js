import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const viewSource = await readFile(new URL('./ControlPanelView.jsx', import.meta.url), 'utf8');
const pl = JSON.parse(await readFile(new URL('../i18n/locales/pl.json', import.meta.url), 'utf8'));
const de = JSON.parse(await readFile(new URL('../i18n/locales/de.json', import.meta.url), 'utf8'));

test('team cards distinguish planned employees from employees in work', () => {
  assert.match(
    viewSource,
    /plannedProgress=\{team \? percent\(team\.day\.planned, team\.day\.total\) : undefined\}/,
    'the KPI should render planned employees separately from working employees',
  );
  assert.match(
    viewSource,
    /controlPanel\.team\.groupSummary[\s\S]*planned=\{percent\(group\.planned, group\.total\)\}/,
    'every team group should expose its planned count and planned progress segment',
  );
  assert.match(pl.controlPanel.kpi.teamDetail, /zaplanowani: \{\{planned\}\}/);
  assert.match(de.controlPanel.kpi.teamDetail, /geplant: \{\{planned\}\}/);
  assert.ok(pl.controlPanel.team.groupSummary);
  assert.ok(de.controlPanel.team.groupSummary);
});
