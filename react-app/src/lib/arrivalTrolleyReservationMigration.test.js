import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const reservationsMigration = await readFile(
  new URL('../../db/migrations/20260915103000_arrival_trolley_daily_reservations.sql', import.meta.url),
  'utf8',
);
const guardMigration = await readFile(
  new URL('../../db/migrations/20260915103100_guard_daily_trolley_reservations.sql', import.meta.url),
  'utf8',
);
const washLifecycleMigration = await readFile(
  new URL('../../db/migrations/20260916090000_hold_arrival_trolleys_until_washed.sql', import.meta.url),
  'utf8',
);

test('daily trolley reservations are exposed to the picker', () => {
  assert.match(reservationsMigration, /get_arrival_trolley_reservations/);
  assert.match(
    reservationsMigration,
    /private\.entry_arrival_date\(entry\.week_key, entry\.arr_day\) = p_arrival_date/,
  );
});

test('entry writes lock and reject a trolley reserved by another client', () => {
  assert.match(guardMigration, /pg_advisory_xact_lock/);
  assert.match(guardMigration, /reservation\.client_name is distinct from new\.client_name/);
  assert.match(guardMigration, /before insert or update of[\s\S]*arrival_trolley_nos/);
});

test('an arrival trolley stays globally reserved until laundry marks the entry washed', () => {
  assert.match(washLifecycleMigration, /private\.active_arrival_trolley_reservations\(\)/);
  assert.match(washLifecycleMigration, /not coalesce\(entry\.washed, false\)/);
  assert.doesNotMatch(washLifecycleMigration, /entry_arrival_date/);
  assert.doesNotMatch(washLifecycleMigration, /laundry_ready_at|laundry_packed_at/);
  assert.match(washLifecycleMigration, /concat\('arrival-trolley\|', lower\(v_no\)\)/);
  assert.doesNotMatch(washLifecycleMigration, /reservation\.client_name is distinct from new\.client_name/);
});
