import { parseRouteIds } from './routeIds.js';

function belongsToDriver(assignment, userId, userName) {
  return (
    (userId && assignment.driver_id != null && String(assignment.driver_id) === String(userId))
    || Boolean(userName && assignment.driver_name === userName)
  );
}

/** Trasy przypisane kierowcy w informacyjnym planie na wskazany dzień. */
export function assignedRouteIdsForDate(assignments = [], userId, userName = null, date) {
  const routeIds = new Set();
  assignments.forEach(assignment => {
    if (assignment.trip_date !== date) return;
    if (!belongsToDriver(assignment, userId, userName)) return;
    parseRouteIds(assignment.routes).forEach(routeId => routeIds.add(routeId));
  });
  return routeIds;
}

/** Auto przypisane kierowcy w informacyjnym planie na wskazany dzień. */
export function assignedCarForDate(assignments = [], userId, userName = null, date) {
  const assignment = assignments.find(item => (
    item.trip_date === date
    && belongsToDriver(item, userId, userName)
    && String(item.car || '').trim()
  ));
  return assignment ? String(assignment.car).trim() : null;
}
