import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../db/migrations/20261110153000_enable_rls_private_planning_tables.sql', import.meta.url),
  'utf8',
);

test('internal planning tables enable deny-by-default RLS and keep direct API grants revoked', () => {
  assert.match(migration, /alter table public\.employee_month_roster_state enable row level security/i);
  assert.match(migration, /alter table public\.driver_route_plan_assignments enable row level security/i);
  assert.match(migration, /revoke all on table public\.employee_month_roster_state[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /revoke all on table public\.driver_route_plan_assignments[\s\S]*from public, anon, authenticated/i);
  assert.doesNotMatch(migration, /create\s+policy/i);
  assert.doesNotMatch(migration, /grant\s+(select|insert|update|delete)/i);
});
