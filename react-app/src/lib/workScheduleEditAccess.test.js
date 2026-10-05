import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../db/migrations/zzzzzzzzzzzzzzz_thomas_muller_work_schedule_access.sql', import.meta.url),
  'utf8',
);
const permissions = await readFile(new URL('./modulePermissions.js', import.meta.url), 'utf8');
const grafikView = await readFile(new URL('../components/GrafikView.jsx', import.meta.url), 'utf8');
const timelineView = await readFile(new URL('../components/TimelineView.jsx', import.meta.url), 'utf8');
const auditMigration = await readFile(
  new URL('../../db/migrations/zzzzzz_comprehensive_system_audit.sql', import.meta.url),
  'utf8',
);

test('Thomas Muller receives edit access through the existing module permission matrix', () => {
  assert.match(migration, /lower\(trim\(app_user\.username\)\) = 'muller'[\s\S]*p_module = 'work_schedule'/i);
  assert.match(migration, /select id, 'work_schedule', 2, role/i);
  assert.doesNotMatch(migration, /set role\s*=\s*'admin'/i);
  assert.match(migration, /private\.max_module_access\(app_user\.id, app_user\.role, modules\.module\)/i);
});

test('client accepts server-authorized edit overrides without changing role defaults', () => {
  assert.match(permissions, /maximum\.work_schedule = MODULE_ACCESS\.edit/);
  assert.match(permissions, /Math\.min\(maximum\[module\.key\], requested\)/);
  assert.match(permissions, /const defaults = defaultModuleAccess\(role\)/);
  assert.match(grafikView, /const canEditWorkSchedule = canEditModule\('work_schedule'\)/);
  assert.match(timelineView, /const canEditWorkSchedule = canEditModule\('work_schedule'\)/);
});

test('schedule write RPCs enforce module edit access and derive the actor from the session', () => {
  assert.equal((migration.match(/private\.user_module_access\(v_user\.id, 'work_schedule'\) < 2/gi) || []).length, 2);
  assert.equal((migration.match(/v_user\.name/gi) || []).length >= 2, true);
  assert.match(migration, /errcode = '42501'/i);
});

test('database audit triggers cover every monthly and hourly schedule change', () => {
  assert.match(auditMigration, /create trigger audit_schedule_entries after insert or update or delete on public\.schedule_entries/i);
  assert.match(auditMigration, /create trigger audit_timeline_entries after insert or update or delete on public\.timeline_entries/i);
  assert.match(auditMigration, /'before', nullif\(v_before, '\{\}'::jsonb\)/i);
  assert.match(auditMigration, /'after', nullif\(v_after, '\{\}'::jsonb\)/i);
});
