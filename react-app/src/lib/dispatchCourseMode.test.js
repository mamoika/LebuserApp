import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchCourseMode } from './dispatchCourseMode.js';

test('planned dispatch course opens the driver planning screen', () => {
  assert.equal(dispatchCourseMode({ status: 'planned' }), 'planning');
});

test('started dispatch course opens administrative editing', () => {
  assert.equal(dispatchCourseMode({ status: 'active' }), 'editing');
  assert.equal(dispatchCourseMode({ status: 'handover' }), 'editing');
});

test('finished dispatch course stays in history mode', () => {
  assert.equal(dispatchCourseMode({ status: 'finished' }), 'history');
});
