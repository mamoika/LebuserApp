import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./DriverCoursePlanning.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../mockups/mockups.css', import.meta.url), 'utf8');

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

test('choosing a dirty-only client adds the stop immediately without a separate button', () => {
  assert.match(
    source,
    /const handleDirtyClientChange = event => \{[\s\S]*?void addDirtyStop\(candidate\)/,
    'selecting a candidate must immediately start adding the stop',
  );
  assert.match(
    source,
    /className="ap-input live-dirty-plan-select"[\s\S]*?value=""[\s\S]*?onChange=\{handleDirtyClientChange\}/,
    'the selector must reset to its placeholder and own the add interaction',
  );
  assert.doesNotMatch(
    source,
    /onClick=\{addDirtyStop\}/,
    'there must not be a redundant add button',
  );
});

test('dirty-stop actions stay aligned in one row with accessible touch targets', () => {
  assert.match(
    source,
    /className="live-dirty-plan-actions"[\s\S]*?live-stop-nav[\s\S]*?live-dirty-plan-remove/,
    'navigation and removal must share one action group',
  );
  assert.match(
    styles,
    /\.live-dirty-plan-item\s*\{[\s\S]*?grid-template-columns:\s*40px minmax\(0, 1fr\) auto;/,
    'the stop card must reserve one adaptive column for its actions',
  );
  assert.match(
    styles,
    /\.live-dirty-plan-remove\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/,
    'remove buttons must retain a 44px touch target',
  );
});
