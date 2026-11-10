import assert from 'node:assert/strict';
import test from 'node:test';
import { lockPageScroll } from './modalScrollLock.js';

function fixture() {
  const style = { overflow: '', position: '', top: '', width: '', paddingRight: '4px' };
  const scrollCalls = [];
  return {
    body: { style },
    documentRef: { body: { style }, documentElement: { clientWidth: 1180 } },
    windowRef: {
      innerWidth: 1200,
      scrollY: 320,
      getComputedStyle: () => ({ paddingRight: '4px' }),
      scrollTo: (...args) => scrollCalls.push(args),
    },
    scrollCalls,
  };
}

test('locks the page behind a modal and restores its exact scroll position', () => {
  const { body, documentRef, windowRef, scrollCalls } = fixture();
  const unlock = lockPageScroll(documentRef, windowRef);

  assert.equal(body.style.overflow, 'hidden');
  assert.equal(body.style.position, 'fixed');
  assert.equal(body.style.top, '-320px');
  assert.equal(body.style.width, '100%');
  assert.equal(body.style.paddingRight, '24px');

  unlock();

  assert.deepEqual(body.style, { overflow: '', position: '', top: '', width: '', paddingRight: '4px' });
  assert.deepEqual(scrollCalls, [[0, 320]]);
});

test('keeps the page locked until the last overlapping modal releases it', () => {
  const { body, documentRef, windowRef } = fixture();
  const unlockFirst = lockPageScroll(documentRef, windowRef);
  const unlockSecond = lockPageScroll(documentRef, windowRef);

  unlockFirst();
  assert.equal(body.style.position, 'fixed');

  unlockSecond();
  assert.equal(body.style.position, '');
});
