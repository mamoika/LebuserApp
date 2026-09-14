import { parseRouteIds } from './routeIds.js';

/** Trasy przypisane kierowcy w informacyjnym planie na wskazany dzień. */
export function assignedRouteIdsForDate(assignments = [], userId, userName = null, date) {
  const routeIds = new Set();
  assignments.forEach(assignment => {
    if (assignment.trip_date !== date) return;
    const belongsToDriver = (
      (userId && assignment.driver_id != null && String(assignment.driver_id) === String(userId))
      || Boolean(userName && assignment.driver_name === userName)
    );
    if (!belongsToDriver) return;
    parseRouteIds(assignment.routes).forEach(routeId => routeIds.add(routeId));
  });
  return routeIds;
}
