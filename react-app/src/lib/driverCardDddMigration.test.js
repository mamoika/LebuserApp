import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../db/migrations/20261110123000_driver_card_ddd_imports.sql', import.meta.url),
  'utf8',
);
const detailsMigration = readFileSync(
  new URL('../../db/migrations/20261110153000_driver_card_ddd_details.sql', import.meta.url),
  'utf8',
);

test('DDD archive is private and protected by RLS', () => {
  assert.match(migration, /alter table public\.driver_card_ddd_imports enable row level security/i);
  assert.match(migration, /revoke all on table public\.driver_card_ddd_imports from public, anon, authenticated/i);
  assert.match(migration, /security definer[\s\S]+set search_path = ''/i);
});

test('DDD import requires dispatcher edit access and complete signatures', () => {
  assert.match(migration, /user_module_access\(v_user\.id, 'live_routes'\), 0\) < 2/i);
  assert.match(migration, /p_signature_status <> 'verified'/i);
  assert.match(migration, /p_signatures_verified, 0\) <> coalesce\(p_signatures_total, 0\)/i);
});

test('DDD import is deduplicated and updates the card download history', () => {
  assert.match(migration, /unique \(file_sha256\)/i);
  assert.match(migration, /insert into public\.driver_card_download_events/i);
  assert.match(migration, /driver_card_last_downloaded_on = greatest/i);
});

test('DDD archive exposes details without exposing the full card number or file hash', () => {
  assert.match(detailsMigration, /i\.summary - 'card_number' - 'sha256' as summary/i);
  assert.match(detailsMigration, /user_module_access\(v_user\.id, 'live_routes'\), 0\) < 1/i);
});
