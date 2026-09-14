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

test('the scheduled-stops module stays hidden until planned points exist', () => {
  assert.match(
    source,
    /const isDispatcherPlanned = trip\?\.planning_source === 'dispatcher'/,
    'dispatcher origin must be explicit and must not be inferred from the planned hour',
  );
  assert.match(
    source,
    /\(\) => isDispatcherPlanned[\s\S]*?stop\.stop_kind === 'scheduled'/,
    'driver-created courses must not expose schedule-only stops',
  );
  assert.match(
    source,
    /\{scheduledStops\.length > 0 && \([\s\S]*?course\.planning\.scheduledTitle[\s\S]*?scheduledStops\.map/,
    'the whole module should only render when at least one planned stop exists',
  );
  assert.doesNotMatch(
    source,
    /scheduledStops\.length === 0[\s\S]*?course\.planning\.noScheduled/,
    'an empty scheduled-stops card should not be rendered',
  );
  assert.doesNotMatch(
    source,
    /trip\?\.driver_name && trip\?\.planned_start/,
    'dispatcher planning must never be guessed from the informational start hour',
  );
});
