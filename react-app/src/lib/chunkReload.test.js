import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as chunkReload from './chunkReload.js';

const dashboardSource = await readFile(new URL('../pages/Dashboard.jsx', import.meta.url), 'utf8');

test('a rejected dynamic chunk import requests one reload without reaching the error boundary', async () => {
  assert.equal(typeof chunkReload.importWithChunkReload, 'function');

  const values = new Map();
  let reloads = 0;
  const storage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
  const failedImport = chunkReload.importWithChunkReload(
    () => Promise.reject(new TypeError('Failed to fetch dynamically imported module: /assets/DriverCourse-old.js')),
    { storage, reload: () => { reloads += 1; } },
  );

  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(reloads, 1);

  const outcome = await Promise.race([
    failedImport.then(() => 'resolved', () => 'rejected'),
    new Promise(resolve => setTimeout(() => resolve('pending'), 10)),
  ]);
  assert.equal(outcome, 'pending');
});

test('route chunks use the guarded dynamic import path', () => {
  assert.match(dashboardSource, /importWithChunkReload/);
  assert.doesNotMatch(dashboardSource, /lazy\(\(\) => import\(/);
});

test('a second chunk failure is reported instead of causing a reload loop', async () => {
  const storage = {
    getItem: () => '1',
    setItem: () => assert.fail('the existing guard must not be overwritten'),
  };
  let reloads = 0;
  const error = new TypeError('Failed to fetch dynamically imported module: /assets/still-missing.js');

  await assert.rejects(
    chunkReload.importWithChunkReload(
      () => Promise.reject(error),
      { storage, reload: () => { reloads += 1; } },
    ),
    error,
  );
  assert.equal(reloads, 0);
});

test('ordinary module errors are not hidden by the chunk recovery', async () => {
  const error = new Error('module initialization failed');
  await assert.rejects(
    chunkReload.importWithChunkReload(
      () => Promise.reject(error),
      { storage: { getItem: () => null, setItem: () => {} }, reload: () => {} },
    ),
    error,
  );
});
