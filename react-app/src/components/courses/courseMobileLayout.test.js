import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../mockups/mockups.css', import.meta.url), 'utf8');

test('mobile current-stop header keeps space for the client name next to navigation', () => {
  const genericMobileFullWidth = css.indexOf('.driver-nav-btn { width: 100%; justify-content: center; }');
  const currentStopOverride = css.indexOf('.live-stop-title-row .driver-nav-btn { width: auto;');

  assert.notEqual(genericMobileFullWidth, -1, 'expected the generic mobile navigation rule');
  assert.ok(
    currentStopOverride > genericMobileFullWidth,
    'current-stop navigation must override the generic 100% width after the mobile rule',
  );
});
