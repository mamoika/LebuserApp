import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const timelineView = await readFile(
  new URL('../components/TimelineView.jsx', import.meta.url),
  'utf8',
);

test('a successful timeline paste consumes the selected copy source', () => {
  assert.match(
    timelineView,
    /if \(results\.some[\s\S]*?else\s*\{\s*setCopySource\(null\);[\s\S]*?toastSuccess\(t\('timeline\.copied'/,
  );
});
