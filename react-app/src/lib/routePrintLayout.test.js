import test from 'node:test';
import assert from 'node:assert/strict';
import { fitRoutePagesForPrint } from './routePrintLayout.js';

function createPage({ maxClients = 14, baseHeight, denseHeight, extraDenseHeight, width = 794 }) {
  const classes = new Set();
  return {
    dataset: { printMaxClients: String(maxClients) },
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
      contains: name => classes.has(name),
    },
    getBoundingClientRect: () => ({
      width,
      height: classes.has('is-print-extra-dense')
        ? classes.has('is-print-ultra-dense')
          ? extraDenseHeight * 0.75
          : extraDenseHeight
        : classes.has('is-print-dense')
          ? denseHeight
          : baseHeight,
    }),
  };
}

function createRoot(...pages) {
  return { querySelectorAll: () => pages };
}

test('print fitting compacts a page whose real content height exceeds A4', () => {
  const page = createPage({
    baseHeight: 1160,
    denseHeight: 1080,
    extraDenseHeight: 900,
  });

  fitRoutePagesForPrint(createRoot(page));

  assert.equal(page.classList.contains('is-print-dense'), true);
  assert.equal(page.classList.contains('is-print-extra-dense'), false);
});

test('print fitting uses the extra-dense fallback when the middle density still overflows', () => {
  const page = createPage({
    baseHeight: 1300,
    denseHeight: 1200,
    extraDenseHeight: 1000,
  });

  fitRoutePagesForPrint(createRoot(page));

  assert.equal(page.classList.contains('is-print-dense'), true);
  assert.equal(page.classList.contains('is-print-extra-dense'), true);
});

test('print fitting preserves the readable layout when the page already fits', () => {
  const page = createPage({
    baseHeight: 1000,
    denseHeight: 850,
    extraDenseHeight: 700,
  });

  fitRoutePagesForPrint(createRoot(page));

  assert.equal(page.classList.contains('is-print-dense'), false);
  assert.equal(page.classList.contains('is-print-extra-dense'), false);
});

test('print fitting uses the ultra-dense safety net when even extra density overflows', () => {
  const page = createPage({
    baseHeight: 1500,
    denseHeight: 1350,
    extraDenseHeight: 1200,
  });

  fitRoutePagesForPrint(createRoot(page));

  assert.equal(page.classList.contains('is-print-dense'), true);
  assert.equal(page.classList.contains('is-print-extra-dense'), true);
  assert.equal(page.classList.contains('is-print-ultra-dense'), true);
});
