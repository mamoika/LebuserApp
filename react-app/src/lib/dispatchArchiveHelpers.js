export const ARCHIVE_STATUS = Object.freeze({
  ALL: 'all',
  LIVE: 'live',
  PLANNED: 'planned',
  FINISHED: 'finished',
});

export function archiveTripStatus(trip) {
  if (trip?.isVirtual || trip?.status === 'planned') return ARCHIVE_STATUS.PLANNED;
  if (trip?.status === 'active' || trip?.status === 'handover') return ARCHIVE_STATUS.LIVE;
  return ARCHIVE_STATUS.FINISHED;
}

export function archiveTripMatches(trip, filters = {}) {
  const { driver = '', car = '', route = '', status = ARCHIVE_STATUS.ALL, query = '' } = filters;
  const normalizedQuery = query.trim().toLocaleLowerCase('pl-PL');
  const driverName = trip?._archiveDriverName || trip?.driver_name || '';
  const routeIds = String(trip?.routes || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

  if (driver && driverName !== driver) return false;
  if (car && trip?.car !== car) return false;
  if (route && !routeIds.includes(String(route))) return false;
  if (status !== ARCHIVE_STATUS.ALL && archiveTripStatus(trip) !== status) return false;

  if (!normalizedQuery) return true;
  return [driverName, trip?.car, trip?.route_name, trip?.trip_date, ...routeIds]
    .filter(Boolean)
    .some(value => String(value).toLocaleLowerCase('pl-PL').includes(normalizedQuery));
}

export function groupArchiveTripsByDate(trips = []) {
  return Object.entries(trips.reduce((groups, trip) => {
    const key = trip?.trip_date || 'unknown';
    if (!groups[key]) groups[key] = [];
    groups[key].push(trip);
    return groups;
  }, {})).sort(([dateA], [dateB]) => {
    if (dateA === 'unknown') return 1;
    if (dateB === 'unknown') return -1;
    return dateB.localeCompare(dateA);
  });
}

export function archiveStatusCounts(trips = []) {
  return trips.reduce((counts, trip) => {
    counts.all += 1;
    counts[archiveTripStatus(trip)] += 1;
    return counts;
  }, { all: 0, live: 0, planned: 0, finished: 0 });
}
