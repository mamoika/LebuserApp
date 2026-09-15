import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const stopSource = await readFile(new URL('./CourseCurrentStop.jsx', import.meta.url), 'utf8');
const courseSource = await readFile(new URL('./DriverCourse.jsx', import.meta.url), 'utf8');

test('dirty pickup keeps the category code and always shows kilograms', () => {
  assert.match(stopSource, /live-dirty-entry-summary/);
  assert.match(stopSource, /\{typeCode\}/);
  assert.match(stopSource, /formatKg\(entry\.weight\).*kg/);
  assert.match(stopSource, /entry\.arrival_trolley_nos/);
  assert.doesNotMatch(stopSource, /laundryTypeLabel\(typeCode, t\)/);
  assert.doesNotMatch(stopSource, /live-dirty-entry-transport/);
});

test('dirty pickup heading does not repeat an arrival count or category code', () => {
  assert.doesNotMatch(stopSource, /course\.currentStop\.dirtyPickupCount/);
});

test('course stop numbers have an explicit progress label', () => {
  assert.match(courseSource, /course\.driver\.stopPickerLabel/);
  assert.match(courseSource, /course\.driver\.stopProgressSummary/);
});
