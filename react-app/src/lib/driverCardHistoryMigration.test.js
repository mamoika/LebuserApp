import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../db/migrations/20261104140000_driver_card_download_history.sql', import.meta.url),
  'utf8',
);
const immutableEventsMigration = readFileSync(
  new URL('../../db/migrations/20261104143000_driver_card_history_immutable_events.sql', import.meta.url),
  'utf8',
);

test('driver card history migration stores immutable events behind secured RPCs', () => {
  assert.match(migration, /create table if not exists public\.driver_card_download_events/i);
  assert.match(migration, /unique \(employee_id, downloaded_on\)/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.driver_card_download_events from public, anon, authenticated/i);
  assert.match(migration, /insert into public\.driver_card_download_events/i);
  assert.match(migration, /'history', v_history/i);
  assert.match(migration, /greatest\(/i);
  assert.match(immutableEventsMigration, /on conflict \(employee_id, downloaded_on\) do nothing/i);
});
