export const ROUTE_GRID_COLUMNS = 4;
export const ROUTE_GRID_MIN_ROWS = 3;
export const ROUTE_GRID_MIN_SLOTS = ROUTE_GRID_COLUMNS * ROUTE_GRID_MIN_ROWS;
export const ROUTE_GRID_PAGE_SLOTS = ROUTE_GRID_COLUMNS;

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function compareRouteNumber(a, b) {
  const orderDiff = (a.sort_order ?? 2147483647) - (b.sort_order ?? 2147483647);
  if (orderDiff !== 0) return orderDiff;
  return Number(a.id) - Number(b.id);
}

export function buildRouteGridSlots(routes = []) {
  const orderedRoutes = [...routes].sort(compareRouteNumber);
  const routePositions = new Map();
  const occupiedPositions = new Set();

  orderedRoutes.forEach(route => {
    const position = positiveInteger(route.grid_position);
    if (!position || occupiedPositions.has(position)) return;
    routePositions.set(route.id, position);
    occupiedPositions.add(position);
  });

  let firstFreePosition = 1;
  orderedRoutes.forEach(route => {
    if (routePositions.has(route.id)) return;
    while (occupiedPositions.has(firstFreePosition)) firstFreePosition += 1;
    routePositions.set(route.id, firstFreePosition);
    occupiedPositions.add(firstFreePosition);
  });

  const lastPosition = Math.max(
    ROUTE_GRID_MIN_SLOTS,
    ...routePositions.values(),
  );
  const slotCount = Math.ceil(lastPosition / ROUTE_GRID_COLUMNS) * ROUTE_GRID_COLUMNS;
  const routeByPosition = new Map(
    orderedRoutes.map(route => [routePositions.get(route.id), route]),
  );

  return Array.from({ length: slotCount }, (_, index) => ({
    position: index + 1,
    route: routeByPosition.get(index + 1) || null,
  }));
}

export function paginateRouteGridSlots(slots = []) {
  const pages = [];
  for (let index = 0; index < slots.length; index += ROUTE_GRID_PAGE_SLOTS) {
    pages.push(slots.slice(index, index + ROUTE_GRID_PAGE_SLOTS));
  }
  return pages;
}

export function moveRouteToGridPosition(routes, routeId, targetPosition) {
  const normalizedTarget = positiveInteger(targetPosition);
  if (!normalizedTarget) return routes;

  const slots = buildRouteGridSlots(routes);
  const sourceSlot = slots.find(slot => slot.route?.id === routeId);
  if (!sourceSlot || sourceSlot.position === normalizedTarget) return routes;

  const targetRoute = slots.find(slot => slot.position === normalizedTarget)?.route;
  return routes.map(route => {
    if (route.id === routeId) {
      return { ...route, grid_position: normalizedTarget };
    }
    if (targetRoute && route.id === targetRoute.id) {
      return { ...route, grid_position: sourceSlot.position };
    }
    return route;
  });
}
