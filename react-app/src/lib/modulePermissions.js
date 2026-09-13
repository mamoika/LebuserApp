export const MODULE_ACCESS = Object.freeze({ hidden: 0, view: 1, edit: 2 });

export const APP_MODULES = Object.freeze([
  { key: 'route', path: '/route', icon: '🚐' },
  { key: 'clients', path: '/clients', icon: '🗂' },
  { key: 'route_plan', path: '/route-plan', icon: '🗓️' },
  { key: 'map', path: '/map', icon: '🗺' },
  { key: 'schedule', path: '/schedule', icon: '📅' },
  { key: 'wash', path: '/wash', icon: '🧺' },
  { key: 'warehouse', path: '/warehouse', icon: '📦' },
  { key: 'history', path: '/history', icon: '📋' },
  { key: 'live_routes', path: '/routes', icon: '📍' },
  { key: 'work_schedule', path: '/grafik', icon: '📊' },
  { key: 'costs', path: '/costs', icon: '💰' },
  { key: 'admin', path: '/admin', icon: '⚙️' },
]);

const BASE_ACCESS = Object.freeze({
  admin: Object.fromEntries(APP_MODULES.map(module => [module.key, MODULE_ACCESS.edit])),
  admin_viewer: {
    clients: 1, map: 1, schedule: 1, wash: 1, warehouse: 1, history: 1,
    live_routes: 1, work_schedule: 1, costs: 1,
  },
  admin_viewer_driver: {
    route: 2, clients: 1, map: 1, schedule: 2, wash: 2, warehouse: 2,
    history: 1, live_routes: 1, work_schedule: 1, costs: 1,
  },
  driver: { route: 2, clients: 1, map: 1, schedule: 2, wash: 1, warehouse: 1, history: 1 },
  tunnel: { clients: 1, map: 1, schedule: 1, wash: 2, warehouse: 2, history: 1 },
  packer: { clients: 1, map: 1, schedule: 1, wash: 2, warehouse: 2, history: 1 },
  viewer: { clients: 1, map: 1, schedule: 1, history: 1 },
});

export function defaultModuleAccess(role) {
  const defaults = BASE_ACCESS[role] || {};
  return Object.fromEntries(APP_MODULES.map(module => [module.key, defaults[module.key] || 0]));
}

export function normalizeModuleAccess(role, value) {
  const defaults = defaultModuleAccess(role);
  if (role === 'admin') return defaults;
  return Object.fromEntries(APP_MODULES.map(module => {
    const requested = Number(value?.[module.key]);
    return [module.key, Number.isInteger(requested)
      ? Math.max(0, Math.min(defaults[module.key], requested))
      : defaults[module.key]];
  }));
}
