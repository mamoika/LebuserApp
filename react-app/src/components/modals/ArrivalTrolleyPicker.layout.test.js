import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pickerSource = await readFile(new URL('./ArrivalTrolleyPicker.jsx', import.meta.url), 'utf8');
const entryModalsSource = await readFile(new URL('./EntryModals.jsx', import.meta.url), 'utf8');
const planPickupSource = await readFile(new URL('../courses/sheets/PlanPickupSheet.jsx', import.meta.url), 'utf8');
const pl = JSON.parse(await readFile(new URL('../../i18n/locales/pl.json', import.meta.url), 'utf8'));
const de = JSON.parse(await readFile(new URL('../../i18n/locales/de.json', import.meta.url), 'utf8'));

test('new arrival form defaults to with trolley while preserving the option order', () => {
  const modeControlStart = pickerSource.indexOf('className="segmented-control live-arrival-trolley-mode"');
  const modeControlEnd = pickerSource.indexOf("\n      {mode === 'trolley' ?", modeControlStart);
  const modeControlSource = pickerSource.slice(modeControlStart, modeControlEnd);

  assert.match(entryModalsSource, /const \[trolleyMode, setTrolleyMode\] = useState\('trolley'\)/);
  assert.match(entryModalsSource, /setTrolleyMode\('trolley'\)/);
  assert.ok(
    modeControlSource.indexOf("t('entry.trolleyModeNone')")
      < modeControlSource.indexOf("t('entry.trolleyModeNumbered')"),
    'the no-trolley option must be rendered before the with-trolley option',
  );
});

test('the trolley grid shows occupied numbers as unavailable until washing', () => {
  assert.match(pickerSource, /filterTab === 'busy'/);
  assert.match(pickerSource, /visibleTrolleyNumbers\.map\(no =>/);
  assert.match(pickerSource, /disabled=\{disabled \|\| state === 'busy'\}/);
  assert.match(pickerSource, /t\('entry\.trolleyLegendBusy'\)/);
  assert.match(pickerSource, /t\('entry\.trolleyOccupiedCount'/);
});

test('every arrival picker receives the exact dirty-arrival date', () => {
  assert.match(entryModalsSource, /arrivalDate=\{ymd\(dateForDay\(resolvedWeekKey, arrDay\)\)\}/);
  assert.match(entryModalsSource, /arrivalDate=\{ymd\(dateForDay\(targetEntry\.week_key, arrDay\)\)\}/);
  assert.match(planPickupSource, /arrivalDate=\{draft\.dirtyDate\}/);
});

test('trolley picker opens on free trolleys by default and allows saving zero trolleys', () => {
  assert.match(pickerSource, /useState\('free'\)/);
  assert.match(pickerSource, /setFilterTab\('free'\)/);
  assert.match(pickerSource, /t\('entry\.trolleyDoneEmpty'\)/);
  assert.match(pickerSource, /disabled=\{disabled\}/);
  assert.doesNotMatch(pickerSource, /disabled=\{disabled \|\| draftSelected\.length === 0\}/);

  assert.equal(pl.entry.trolleyDoneEmpty, 'Gotowe (bez wózka)');
  assert.equal(de.entry.trolleyDoneEmpty, 'Fertig (ohne Wagen)');
});
