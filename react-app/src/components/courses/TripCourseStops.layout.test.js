import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('./TripCourseStops.jsx', import.meta.url), 'utf8');

test('trip stop laundry chip receives the frotte category flag', () => {
  assert.match(source, /<LaundryTypeChip[\s\S]*?hasF=\{meta\.hasF\}/);
});
