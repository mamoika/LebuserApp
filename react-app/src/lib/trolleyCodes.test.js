import assert from 'node:assert/strict';
import test from 'node:test';
import { formatTrolleyCode, parseTrolleyCode } from './trolleyCodes.js';

test('parses the new LEB label and legacy TRL labels', () => {
  assert.equal(parseTrolleyCode('LEB-#07'), '7');
  assert.equal(parseTrolleyCode('LEB-7'), '7');
  assert.equal(parseTrolleyCode('TRL-7'), '7');
  assert.equal(parseTrolleyCode('7'), '7');
  assert.equal(parseTrolleyCode('hotel-7'), null);
});

test('formats canonical trolley labels', () => {
  assert.equal(formatTrolleyCode('1'), 'LEB-#01');
  assert.equal(formatTrolleyCode('TRL-25'), 'LEB-#25');
});
