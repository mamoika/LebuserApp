import assert from 'node:assert/strict';
import test from 'node:test';
import { isAbsent } from './scheduleStatus.js';

test('isAbsent counts only actual absence codes', () => {
  ['UW', 'L4', 'NU', 'NN', ' uw '].forEach(value => assert.equal(isAbsent(value), true));
  ['', 'W', 'I', 'END', '8', '6-14'].forEach(value => assert.equal(isAbsent(value), false));
});
