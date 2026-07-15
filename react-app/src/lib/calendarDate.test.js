import assert from 'node:assert/strict';
import test from 'node:test';
import { isFutureCalendarDate } from './calendarDate.js';

test('today is not treated as a future calendar date', () => {
  assert.equal(isFutureCalendarDate('2026-07-15', '2026-07-15'), false);
});

test('only a later YYYY-MM-DD date is treated as future', () => {
  assert.equal(isFutureCalendarDate('2026-07-14', '2026-07-15'), false);
  assert.equal(isFutureCalendarDate('2026-07-16', '2026-07-15'), true);
});
