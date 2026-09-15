import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const stopSource = await readFile(new URL('./CourseCurrentStop.jsx', import.meta.url), 'utf8');
const courseSource = await readFile(new URL('./DriverCourse.jsx', import.meta.url), 'utf8');

test('dirty pickup presents operational details instead of unexplained abbreviations', () => {
  assert.match(stopSource, /laundryTypeLabel\(typeCode, t\)/);
  assert.match(stopSource, /entry\.arrival_trolley_nos/);
  assert.match(stopSource, /course\.currentStop\.dirtyPickupCount/);
  assert.match(stopSource, /live-dirty-entry-transport/);
});

test('course stop numbers have an explicit progress label', () => {
  assert.match(courseSource, /course\.driver\.stopPickerLabel/);
  assert.match(courseSource, /course\.driver\.stopProgressSummary/);
});
