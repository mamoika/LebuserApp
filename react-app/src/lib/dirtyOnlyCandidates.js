import { parseRouteIds } from './routeIds.js';

export function buildDirtyOnlyCandidates({
  clients = [],
  stops = [],
  trip,
  cleanClients = [],
}) {
  if (!trip) return [];
  const routeIds = parseRouteIds(trip.routes);
  const existingStops = stops.filter(stop =>
    stop.status === 'pending'
    && (
      stop.stop_kind === 'dirty_only'
      || (stop.tasks || []).some(task => task.task_type === 'pickup_dirty' && task.status === 'pending')
    )
  );
  const existingClientIds = new Set(existingStops.map(stop => stop.client_id).filter(Boolean));
  const existingClientNames = new Set(existingStops.map(stop => stop.client_name));
  const cleanClientKeys = new Set(
    cleanClients.map(client => `${client.route_id ?? ''}:${client.client_name}`),
  );

  return clients
    .filter(client =>
      !cleanClientKeys.has(`${client.route_id ?? ''}:${client.name}`)
      && !existingClientIds.has(client.id)
      && !existingClientNames.has(client.name)
    )
    .map(client => ({
      client_id: client.id,
      client_name: client.name,
      route_id: client.route_id,
      sort_order: client.sort_order,
      is_other_route: routeIds.size > 0 && !routeIds.has(client.route_id),
    }))
    .sort((a, b) =>
      Number(a.is_other_route) - Number(b.is_other_route)
      || (a.route_id || 0) - (b.route_id || 0)
      || (a.sort_order ?? 9999) - (b.sort_order ?? 9999)
      || a.client_name.localeCompare(b.client_name, 'pl')
    )
    .map(({ client_id, client_name, route_id, is_other_route }) => ({
      client_id,
      client_name,
      route_id,
      is_other_route,
    }));
}
