import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { normalizeModuleAccess } from './modulePermissions.js';

const migration = await readFile(
  new URL('../../db/migrations/zzzzzzzzzzzzzzzz_thomas_muller_costs_access.sql', import.meta.url),
  'utf8',
);
const costsView = await readFile(new URL('../components/CostsView.jsx', import.meta.url), 'utf8');
const adminRpc = await readFile(new URL('./adminRpc.js', import.meta.url), 'utf8');
const auditMigration = await readFile(
  new URL('../../db/migrations/zzzzzz_comprehensive_system_audit.sql', import.meta.url),
  'utf8',
);

test('Thomas Muller receives costs edit access without a broader admin role', () => {
  assert.equal(normalizeModuleAccess('admin_viewer_driver', { costs: 2 }, 'muller').costs, 2);
  assert.equal(normalizeModuleAccess('admin_viewer_driver', { costs: 2 }, 'someone-else').costs, 1);
  assert.match(migration, /p_module in \('work_schedule', 'costs'\)/i);
  assert.match(migration, /select id, 'costs', 2, role/i);
  assert.doesNotMatch(migration, /set role\s*=\s*'admin'/i);
});

test('cost controls use module edit access instead of full administrator access', () => {
  assert.match(costsView, /const canEditCosts = canEditModule\('costs'\)/);
  assert.match(costsView, /readOnly=\{!canEditCosts\}/);
  assert.match(costsView, /\{canEditCosts && <button onClick=\{saveAll\}/);
  assert.match(adminRpc, /save_costs_performance_progi/);
  assert.doesNotMatch(costsView, /upsertAppSetting/);
});

test('every costs write RPC enforces costs edit access and initializes audit actor context', () => {
  assert.match(migration, /select \* into v_user from public\.session_user\(p_session_token\)/i);
  assert.equal((migration.match(/private\.require_module_editor\(p_session_token, 'costs'\)/gi) || []).length, 3);
  assert.match(migration, /admin_upsert_cost_settings/);
  assert.match(migration, /admin_upsert_daily_costs/);
  assert.match(migration, /save_costs_performance_progi/);
  assert.match(migration, /errcode = '42501'/i);
});

test('database audit triggers cover costs, rates and performance thresholds', () => {
  assert.match(auditMigration, /create trigger audit_daily_costs after insert or update or delete on public\.daily_costs/i);
  assert.match(auditMigration, /create trigger audit_cost_settings after insert or update or delete on public\.cost_settings/i);
  assert.match(auditMigration, /create trigger audit_app_settings after insert or update or delete on public\.app_settings/i);
  assert.match(auditMigration, /'before', nullif\(v_before, '\{\}'::jsonb\)/i);
  assert.match(auditMigration, /'after', nullif\(v_after, '\{\}'::jsonb\)/i);
});
