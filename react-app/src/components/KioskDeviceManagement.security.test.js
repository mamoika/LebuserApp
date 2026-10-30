import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL('../../db/migrations/20261030130000_kiosk_device_admin_management.sql', import.meta.url),
  'utf8',
);
const dashboard = fs.readFileSync(new URL('./AdminDashboard.jsx', import.meta.url), 'utf8');
const adminRpc = fs.readFileSync(new URL('../lib/adminRpc.js', import.meta.url), 'utf8');

test('kiosk device management requires an administrator session for every mutation and read', () => {
  assert.equal((migration.match(/public\.require_admin\(p_session_token\)/g) || []).length, 3);
  assert.match(migration, /admin_get_kiosk_devices/);
  assert.match(migration, /admin_rename_kiosk_device/);
  assert.match(migration, /admin_revoke_kiosk_device/);
  assert.doesNotMatch(migration, /token_hash[^\n]*json/i);
});

test('revoking a kiosk disables its secret and immediately revokes kiosk sessions', () => {
  assert.match(migration, /set is_active = false/);
  assert.match(migration, /where kiosk_device_id = p_device_id[\s\S]*and revoked_at is null/);
  assert.match(migration, /'kiosk_device_revoked'/);
  assert.match(migration, /'device_inactive'/);
});

test('settings exposes explicit rename and revoke actions through admin RPC wrappers', () => {
  assert.match(adminRpc, /admin_get_kiosk_devices/);
  assert.match(adminRpc, /admin_rename_kiosk_device/);
  assert.match(adminRpc, /admin_revoke_kiosk_device/);
  assert.match(dashboard, /kioskRevokeConfirm/);
  assert.match(dashboard, /active_driver_name/);
});
