import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./CourseCurrentStop.jsx', import.meta.url), 'utf8');

test('dirty-laundry heading uses a descriptive icon while plus remains an action icon', () => {
  assert.match(
    source,
    /live-stop-task-icon tone-dirty[\s\S]*?<WashingMachine size=\{18\}/,
    'the section heading must not look like an add control',
  );
  assert.match(
    source,
    /live-task-action is-secondary[\s\S]*?<Plus size=\{16\}[\s\S]*?addDirtyArrival/,
    'plus should remain attached to the actual add action',
  );
});

test('dirty-laundry count says what is being counted', () => {
  assert.match(source, /t\('entry\.arrivalsCount', \{ count: dirtyToday\.length \}\)/);
  assert.doesNotMatch(source, />\{dirtyToday\.length\}<\/span>/);
});
