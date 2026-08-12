import assert from 'node:assert/strict';
import test from 'node:test';
import { getShiftEndMarker } from './timelineShiftEnd.js';

test('places the scheduled shift end at the exact position within an hour cell', () => {
  assert.deepEqual(getShiftEndMarker(14.5), {
    label: '14:30',
    decimalHour: 14.5,
    cellHour: 14,
    offset: 0.5,
    outside: null,
  });
});

test('formats full-hour shift ends consistently', () => {
  assert.equal(getShiftEndMarker(14).label, '14:00');
  assert.equal(getShiftEndMarker(14).cellHour, 14);
  assert.equal(getShiftEndMarker(14).offset, 0);
});

test('keeps scheduled ends outside the timeline visible at its edges', () => {
  assert.equal(getShiftEndMarker(4.5).outside, 'before');
  assert.equal(getShiftEndMarker(4.5).cellHour, 5);
  assert.equal(getShiftEndMarker(23.25).outside, 'after');
  assert.equal(getShiftEndMarker(23.25).cellHour, 21);
});

test('shows an overnight shift end on the right edge with the next-day clock time', () => {
  const marker = getShiftEndMarker(28);
  assert.equal(marker.label, '04:00');
  assert.equal(marker.outside, 'after');
  assert.equal(marker.cellHour, 21);
});
