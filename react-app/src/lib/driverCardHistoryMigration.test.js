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
const revocationMigration = readFileSync(
  new URL('../../db/migrations/20261127090000_revoke_driver_card_download.sql', import.meta.url),
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

test('driver card revocation targets the original event and recalculates the latest read', () => {
  const [confirmation, revocation] = revocationMigration.split('create or replace function public.revoke_driver_card_download');
  assert.match(confirmation, /on conflict \(employee_id, downloaded_on\) do nothing/i);
  assert.match(confirmation, /'id', v_event\.id/i);
  assert.match(revocation, /private\.user_module_access\(v_user\.id, 'work_schedule'\), 0\) < 2/i);
  assert.match(revocation, /from public\.driver_card_ddd_imports[\s\S]*return json_build_object\('status', 'ddd'\)[\s\S]*delete from public\.driver_card_download_events where id = v_event\.id/i);
  assert.match(revocation, /select max\(h\.downloaded_on\)[\s\S]*e\.driver_card_last_downloaded_on = v_event\.downloaded_on/i);
  assert.match(revocation, /public\.insert_log\([\s\S]*'driver_card_download_revoked'/i);
});
