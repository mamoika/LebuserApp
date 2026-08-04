import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pickerSource = await readFile(new URL('./ArrivalTrolleyPicker.jsx', import.meta.url), 'utf8');
const entryModalsSource = await readFile(new URL('./EntryModals.jsx', import.meta.url), 'utf8');

test('arrival form defaults to no trolley and shows that option first', () => {
  const modeControlStart = pickerSource.indexOf('className="segmented-control live-arrival-trolley-mode"');
  const modeControlEnd = pickerSource.indexOf("\n      {mode === 'trolley' ?", modeControlStart);
  const modeControlSource = pickerSource.slice(modeControlStart, modeControlEnd);

  assert.match(entryModalsSource, /const \[trolleyMode, setTrolleyMode\] = useState\('none'\)/);
  assert.match(entryModalsSource, /setTrolleyMode\('none'\)/);
  assert.ok(
    modeControlSource.indexOf("t('entry.trolleyModeNone')")
      < modeControlSource.indexOf("t('entry.trolleyModeNumbered')"),
    'the no-trolley option must be rendered before the with-trolley option',
  );
});
