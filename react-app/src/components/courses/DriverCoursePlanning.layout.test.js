import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./DriverCoursePlanning.jsx', import.meta.url), 'utf8');

test('an automatically scheduled stop can be removed during planning', () => {
  assert.match(
    source,
    /skipPlannedStop\(sessionToken, stop\.id, 'not_today'\)/,
    'scheduled-stop removal must use the existing planning skip RPC',
  );
  assert.match(
    source,
    /scheduledStops\.map\(stop => \([\s\S]*?onClick=\{\(\) => removeScheduledStop\(stop\)\}[\s\S]*?removeScheduledAria/,
    'each scheduled stop must expose a labelled remove control',
  );
});
