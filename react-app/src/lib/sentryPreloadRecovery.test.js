import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { shouldIgnoreRecoveredPreloadError } from './sentryPreloadRecovery.js';

const sentrySource = await readFile(new URL('./sentry.js', import.meta.url), 'utf8');

test('Sentry ignores a recovered Vite CSS preload error while the one-time reload is pending', () => {
  assert.match(sentrySource, /beforeSend/);
  assert.match(sentrySource, /shouldIgnoreRecoveredPreloadError/);
  assert.match(sentrySource, /chunkReloadIsPending/);
});

test('matches the exact recovered CSS error without hiding unrelated failures', () => {
  const error = new Error('Unable to preload CSS for https://lebuser.vercel.app/assets/mockups-Dutdj7GS.css');

  assert.equal(shouldIgnoreRecoveredPreloadError({}, { originalException: error }, true), true);
  assert.equal(shouldIgnoreRecoveredPreloadError({}, { originalException: error }, false), false);
  assert.equal(shouldIgnoreRecoveredPreloadError({}, { originalException: new Error('Database write failed') }, true), false);
});
