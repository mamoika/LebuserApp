import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARCHIVE_STATUS,
  archiveStatusCounts,
  archiveTripMatches,
  groupArchiveTripsByDate,
} from './dispatchArchiveHelpers.js';

const trips = [
  { id: 'a', trip_date: '2026-07-13', status: 'active', driver_name: 'Jan Kowalski', car: 'mercedes', routes: '1', route_name: 'Centrum' },
  { id: 'b', trip_date: '2026-07-12', status: 'finished', driver_name: 'Anna Nowak', car: 'isuzu', routes: '2,3', route_name: 'Hotele' },
  { id: 'c', trip_date: '2026-07-14', status: 'planned', driver_name: 'Jan Kowalski', car: 'mercedes', routes: '4', route_name: 'Północ' },
  { id: 'd', trip_date: '2026-07-14', status: 'finished', driver_name: 'Anna Nowak', car: 'isuzu', routes: '2', route_name: 'Hotele' },
];

test('filters archive courses by status, route and free-text query', () => {
  assert.equal(archiveTripMatches(trips[0], { status: ARCHIVE_STATUS.LIVE, query: 'kowal' }), true);
  assert.equal(archiveTripMatches(trips[1], { route: '3', query: 'hotele' }), true);
  assert.equal(archiveTripMatches(trips[1], { route: '1' }), false);
  assert.equal(archiveTripMatches({ status: 'finished', routes: '' }, { route: '1' }), false);
  assert.equal(archiveTripMatches(trips[2], { status: ARCHIVE_STATUS.FINISHED }), false);
  assert.equal(archiveTripMatches({ _archiveDriverName: 'Nieznany' }, { driver: 'Nieznany' }), true);
});

test('groups newest course dates first and keeps trips from the same day together', () => {
  const grouped = groupArchiveTripsByDate(trips);
  assert.deepEqual(grouped.map(([date]) => date), ['2026-07-14', '2026-07-13', '2026-07-12']);
  assert.deepEqual(grouped[0][1].map(trip => trip.id), ['c', 'd']);
  assert.equal(groupArchiveTripsByDate([...trips, { id: 'unknown' }]).at(-1)[0], 'unknown');
});

test('counts every archive status including virtual planned courses', () => {
  const counts = archiveStatusCounts([...trips, { id: 'virtual', isVirtual: true }]);
  assert.deepEqual(counts, { all: 5, live: 1, planned: 2, finished: 2 });
});
