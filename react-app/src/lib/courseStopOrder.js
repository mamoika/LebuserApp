/**
 * Porządek przystanków zgodny z konfiguracją „Klienci i Trasy”.
 * `position` jest tylko awaryjnym tie-breakerem dla klientów usuniętych z bazy.
 */
export function buildCourseStopComparator(clients = [], routes = []) {
  const sortedRoutes = [...routes].sort((a, b) =>
    (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER)
    || String(a.id).localeCompare(String(b.id))
  );
  const routeRanks = new Map(sortedRoutes.map((route, index) => [String(route.id), index]));
  const clientsById = new Map(clients.filter(client => client.id != null).map(client => [String(client.id), client]));
  const clientsByName = new Map(clients.filter(client => client.name).map(client => [client.name, client]));

  const details = stop => {
    const client = (stop?.client_id != null && clientsById.get(String(stop.client_id)))
      || clientsByName.get(stop?.client_name);
    const routeId = client?.route_id ?? stop?.route_id;
    return {
      routeRank: routeRanks.get(String(routeId)) ?? Number.MAX_SAFE_INTEGER,
      clientOrder: client?.sort_order ?? Number.MAX_SAFE_INTEGER,
      position: stop?.position ?? Number.MAX_SAFE_INTEGER,
      name: stop?.client_name || '',
    };
  };

  return (a, b) => {
    const left = details(a);
    const right = details(b);
    return left.routeRank - right.routeRank
      || left.clientOrder - right.clientOrder
      || left.position - right.position
      || left.name.localeCompare(right.name, 'pl');
  };
}
