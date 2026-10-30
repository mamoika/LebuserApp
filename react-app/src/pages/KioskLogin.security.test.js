import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pageSource = fs.readFileSync(new URL('./KioskLogin.jsx', import.meta.url), 'utf8');
const authSource = fs.readFileSync(new URL('../context/AuthContext.jsx', import.meta.url), 'utf8');
const migrationSource = fs.readFileSync(
  new URL('../../db/migrations/20261030120000_driver_kiosk_login.sql', import.meta.url),
  'utf8',
);

test('kiosk quick login never sends a driver password', () => {
  assert.match(authSource, /kiosk_login_driver/);
  assert.match(authSource, /p_device_token: device\.token/);
  assert.match(authSource, /p_user_id: userId/);
  assert.doesNotMatch(pageSource, /type=["']password["']/);
});

test('database limits passwordless kiosk login to active driver accounts', () => {
  assert.match(migrationSource, /role = 'driver'/);
  assert.match(migrationSource, /coalesce\(is_archived, false\) = false/);
  assert.match(migrationSource, /token_hash = public\.session_hash\(p_device_token\)/);
  assert.match(migrationSource, /is_active = true/);
});

test('kiosk sessions are short-lived and identify their device', () => {
  assert.match(migrationSource, /now\(\) \+ interval '4 hours'/);
  assert.match(migrationSource, /kiosk_device_id/);
  assert.match(pageSource, /kiosk\.loggedInAs|chooseDriver/);
});
