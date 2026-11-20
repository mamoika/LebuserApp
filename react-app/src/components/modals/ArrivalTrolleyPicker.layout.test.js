import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pickerSource = await readFile(new URL('./ArrivalTrolleyPicker.jsx', import.meta.url), 'utf8');
const entryModalsSource = await readFile(new URL('./EntryModals.jsx', import.meta.url), 'utf8');
const workflowSource = await readFile(new URL('../../hooks/useLaundryWorkflow.js', import.meta.url), 'utf8');
const pl = JSON.parse(await readFile(new URL('../../i18n/locales/pl.json', import.meta.url), 'utf8'));
const de = JSON.parse(await readFile(new URL('../../i18n/locales/de.json', import.meta.url), 'utf8'));

test('new arrivals default to the first option, with trolley', () => {
  const modeControlStart = pickerSource.indexOf('className="live-arrival-trolley-mode"');
  const modeControlEnd = pickerSource.indexOf("\n      {mode === 'trolley' ?", modeControlStart);
  const modeControlSource = pickerSource.slice(modeControlStart, modeControlEnd);
  const numberedOption = modeControlSource.indexOf("t('entry.trolleyModeNumbered')");
  const noTrolleyOption = modeControlSource.indexOf("t('entry.trolleyModeNone')");

  assert.match(entryModalsSource, /const \[trolleyMode, setTrolleyMode\] = useState\('trolley'\)/);
  assert.match(entryModalsSource, /setTrolleyMode\('trolley'\)/);
  assert.ok(numberedOption >= 0 && numberedOption < noTrolleyOption);
  assert.match(modeControlSource, /aria-pressed=\{mode === 'trolley'\}/);
  assert.match(modeControlSource, /aria-pressed=\{mode === 'none'\}/);
});

test('the trolley grid shows occupied numbers as unavailable until washing', () => {
  assert.match(pickerSource, /stateByNo\.get\(no\) === filterTab/);
  assert.match(pickerSource, /visibleTrolleyNumbers\.map\(no =>/);
  assert.match(pickerSource, /disabled=\{disabled \|\| state === 'busy'\}/);
  assert.match(pickerSource, /t\('entry\.trolleyLegendBusy'\)/);
  assert.match(pickerSource, /t\('entry\.trolleyOccupiedCount'/);
});

test('arrival pickers use the live global reservation pool and keep their own reservation when editing', () => {
  assert.match(pickerSource, /useLaundryWorkflow\(sessionToken, pickerOpen\)/);
  assert.match(workflowSource, /table: 'laundry_trolley_cycles'/);
  assert.match(workflowSource, /setInterval\(refreshWhenVisible, REFRESH_INTERVAL_MS\)/);
  assert.match(entryModalsSource, /entryId=\{targetEntry\.id\}/);
  assert.match(pickerSource, /reservation\.entry_id\) !== String\(entryId\)/);
});

test('an unavailable snapshot blocks trolley selection and offers a retry', () => {
  assert.match(pickerSource, /disabled=\{disabled \|\| !availabilityReady \|\| hasConflictingSelection\}/);
  assert.match(pickerSource, /t\('entry\.trolleyAvailabilityError'\)/);
  assert.match(pickerSource, /onClick=\{refresh\}/);
});

test('pickup opens on registered trolleys when present, otherwise on free trolleys', () => {
  assert.match(pickerSource, /purpose === 'pack' \|\| counts\.returning === 0 \? 'free' : 'returning'/);
  assert.match(pickerSource, /t\('entry\.trolleyAtClientCount'/);
  assert.match(pickerSource, /t\('entry\.trolleyAddOther'/);
});

test('trolley picker allows saving zero trolleys', () => {
  assert.match(pickerSource, /t\('entry\.trolleyDoneEmpty'\)/);
  assert.match(pickerSource, /disabled=\{disabled\}/);
  assert.doesNotMatch(pickerSource, /disabled=\{disabled \|\| draftSelected\.length === 0\}/);
  assert.match(pickerSource, /if \(!hideModeSwitch && draftSelected\.length === 0\) onModeChange\('none'\)/);

  assert.equal(pl.entry.trolleyDoneEmpty, 'Gotowe (bez wózka)');
  assert.equal(de.entry.trolleyDoneEmpty, 'Fertig (ohne Wagen)');
});
