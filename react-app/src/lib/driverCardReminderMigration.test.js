import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync(
  new URL('../../db/migrations/20261104090000_driver_card_download_reminders.sql', import.meta.url),
  'utf8'
);

test('driver card migration stores settings and exposes secured reminder RPCs', () => {
  assert.match(migration, /add column if not exists driver_card_required boolean not null default false/i);
  assert.match(migration, /add column if not exists driver_card_last_downloaded_on date/i);
  assert.match(migration, /create or replace function public\.admin_save_driver_card_settings/i);
  assert.match(migration, /perform public\.require_admin\(p_session_token\)/i);
  assert.match(migration, /create or replace function public\.get_driver_card_reminders/i);
  assert.match(migration, /private\.user_module_access\(v_user\.id, 'work_schedule'\)[\s\S]*< 1/i);
  assert.match(migration, /create or replace function public\.mark_driver_card_downloaded/i);
  assert.match(migration, /private\.user_module_access\(v_user\.id, 'work_schedule'\)[\s\S]*< 2/i);
  assert.match(migration, /revoke all on function public\.mark_driver_card_downloaded/i);
});
