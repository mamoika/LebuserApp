import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getIntervalUnionHours,
  getProductiveTimelineHours,
  getShiftHourOverlap,
  getShiftHourSegment,
} from './timelineHours.js';

test('counts only the part of an hourly station cell inside the current shift', () => {
  assert.equal(getShiftHourOverlap(5, 6.5, 14.5), 0);
  assert.equal(getShiftHourOverlap(6, 6.5, 14.5), 0.5);
  assert.equal(getShiftHourOverlap(7, 6.5, 14.5), 1);
  assert.equal(getShiftHourOverlap(14, 6.5, 14.5), 0.5);
  assert.equal(getShiftHourOverlap(15, 6.5, 14.5), 0);
});

test('matches early clock hours to the next day for an overnight shift', () => {
  assert.deepEqual(getShiftHourSegment(0, 22, 30), { start: 24, end: 25 });
  assert.equal(getShiftHourOverlap(5, 22, 30), 1);
  assert.equal(getShiftHourOverlap(6, 22, 30), 0);
});

test('deducts 15 minute breaks only from the actually overlapped station interval', () => {
  assert.equal(getProductiveTimelineHours(6, 6.5, 14.5), 0.5);
  assert.equal(getProductiveTimelineHours(9, 6.5, 14.5), 0.75);
  assert.equal(getProductiveTimelineHours(12, 6.5, 14.5), 0.75);
});

test('production clock time is the exact union instead of a sum of employees', () => {
  assert.equal(getIntervalUnionHours([
    { start: 6, end: 6.5 },
    { start: 6.5, end: 7 },
    { start: 6.75, end: 7 },
  ]), 1);
});
