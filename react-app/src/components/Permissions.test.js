import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { defaultModuleAccess, normalizeModuleAccess } from '../lib/modulePermissions.js';

const authSource = await readFile(new URL('../context/AuthContext.jsx', import.meta.url), 'utf8');
const navigationSource = await readFile(new URL('./Navigation.jsx', import.meta.url), 'utf8');
const dashboardSource = await readFile(new URL('../pages/Dashboard.jsx', import.meta.url), 'utf8');
const adminSource = await readFile(new URL('./AdminDashboard.jsx', import.meta.url), 'utf8');
const washSource = await readFile(new URL('./WashView.jsx', import.meta.url), 'utf8');
const warehouseSource = await readFile(new URL('./WarehouseView.jsx', import.meta.url), 'utf8');
const clientsRoutesSource = await readFile(new URL('./ClientsRoutesView.jsx', import.meta.url), 'utf8');
const migrationSource = await readFile(new URL('../../db/migrations/user_module_permissions.sql', import.meta.url), 'utf8');
const routePlanAdminMigrationSource = await readFile(new URL('../../db/migrations/zzzzzzzzzzzz_route_plan_admin_roles.sql', import.meta.url), 'utf8');
const clientsRoutesAdminMigrationSource = await readFile(new URL('../../db/migrations/zzzzzzzzzzzzz_clients_routes_admin_roles.sql', import.meta.url), 'utf8');

test('role defaults preserve current access and custom values can only restrict it', () => {
  assert.equal(defaultModuleAccess('driver').route, 2);
  assert.equal(defaultModuleAccess('driver').costs, 0);
  assert.equal(defaultModuleAccess('admin_viewer').route_plan, 2);
  assert.equal(defaultModuleAccess('admin_viewer_driver').route_plan, 2);
  assert.equal(defaultModuleAccess('admin_viewer').clients, 2);
  assert.equal(defaultModuleAccess('admin_viewer_driver').clients, 2);
  assert.equal(defaultModuleAccess('packer').warehouse, 2);
  assert.equal(normalizeModuleAccess('viewer', { costs: 2 }).costs, 0);
  assert.equal(normalizeModuleAccess('packer', { warehouse: 1 }).warehouse, 1);
  assert.equal(normalizeModuleAccess('admin', { admin: 0 }).admin, 2);
});

test('module permissions control navigation and direct page routes', () => {
  assert.match(authSource, /get_my_module_permissions/);
  assert.match(authSource, /canViewModule/);
  assert.match(authSource, /canEditModule/);
  assert.match(navigationSource, /canViewModule\('clients'\)/);
  assert.match(navigationSource, /canViewModule\('warehouse'\)/);
  assert.match(dashboardSource, /canViewModule\('route_plan'\)/);
  assert.match(dashboardSource, /canViewModule\('costs'\)/);
});

test('admin has a per-user hidden, view and edit permissions matrix', () => {
  assert.match(adminSource, /function PermissionsSection/);
  assert.match(adminSource, /ACCESS_LEVELS = \[0, 1, 2\]/);
  assert.match(adminSource, /adminProtected/);
  assert.match(adminSource, /saveAdminUserModulePermissions/);
});

test('permission storage is private, role-bounded and administrator managed', () => {
  assert.match(migrationSource, /alter table public\.user_module_permissions enable row level security/);
  assert.match(migrationSource, /revoke all on table public\.user_module_permissions from public, anon, authenticated/);
  assert.match(migrationSource, /least\([\s\S]*private\.default_module_access/);
  assert.match(migrationSource, /if v_role = 'admin'/);
  assert.match(migrationSource, /perform public\.insert_log/);
  assert.match(migrationSource, /perform public\.require_admin/);
});

test('view-only laundry and warehouse permissions remove operational controls', () => {
  assert.match(washSource, /canEditModule\('wash'\)/);
  assert.match(washSource, /const isReadOnly = !canEditWash/);
  assert.match(warehouseSource, /canEditModule\('warehouse'\)/);
  assert.match(warehouseSource, /const canManage = canEditModule/);
});

test('all administrative roles can edit the route plan through module-bounded RPCs', () => {
  assert.match(routePlanAdminMigrationSource, /'admin', 'admin_viewer', 'admin_viewer_driver'/);
  assert.match(routePlanAdminMigrationSource, /private\.user_module_access\(v_user\.id, 'route_plan'\) < 2/);
  assert.match(routePlanAdminMigrationSource, /admin_upsert_weekly_route_assignment/);
  assert.match(routePlanAdminMigrationSource, /admin_remove_weekly_route_assignment/);
  assert.match(routePlanAdminMigrationSource, /admin_copy_weekly_route_plan/);
  assert.match(routePlanAdminMigrationSource, /admin_save_weekly_route_plan_visibility/);
});

test('all administrative roles can edit clients and routes through module-bounded RPCs', () => {
  assert.match(clientsRoutesSource, /canEditModule\('clients'\)/);
  assert.doesNotMatch(clientsRoutesSource, /\bisAdmin\b/);
  assert.match(clientsRoutesAdminMigrationSource, /'admin', 'admin_viewer', 'admin_viewer_driver'/);
  assert.match(clientsRoutesAdminMigrationSource, /private\.user_module_access\(v_user\.id, 'clients'\) < 2/);
  assert.match(clientsRoutesAdminMigrationSource, /admin_create_route/);
  assert.match(clientsRoutesAdminMigrationSource, /admin_update_client/);
  assert.match(clientsRoutesAdminMigrationSource, /admin_archive_client/);
  assert.match(clientsRoutesAdminMigrationSource, /admin_reorder_clients/);
});
