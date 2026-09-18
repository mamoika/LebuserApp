import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const viewSource = await readFile(new URL('./GrafikView.jsx', import.meta.url), 'utf8');
const globalStyles = await readFile(new URL('../index.css', import.meta.url), 'utf8');

test('monthly schedule lets the page handle vertical scrolling', () => {
  const containerStart = viewSource.indexOf('className="grafik-scroll-container"');
  const containerEnd = viewSource.indexOf('<table className="grafik-modern-table"', containerStart);
  const containerSource = viewSource.slice(containerStart, containerEnd);

  assert.notEqual(containerStart, -1);
  assert.notEqual(containerEnd, -1);
  assert.doesNotMatch(containerSource, /maxHeight/);
  assert.doesNotMatch(containerSource, /overflow:\s*'auto'/);
  assert.match(globalStyles, /\.grafik-scroll-container\s*\{[^}]*overflow:\s*visible;/s);
  assert.doesNotMatch(globalStyles, /max-height:\s*68dvh\s*!important/);
});
