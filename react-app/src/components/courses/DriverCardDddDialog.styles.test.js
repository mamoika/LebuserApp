import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('./DriverCardDddDialog.jsx', import.meta.url), 'utf8');

test('DDD dialog owns the stylesheet required outside DispatchBoard', () => {
  assert.match(source, /import ['"]\.\.\/mockups\/mockups\.css['"]/);
});
