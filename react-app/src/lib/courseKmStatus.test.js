import assert from 'node:assert/strict';
import test from 'node:test';
import { pendingKmTrips, tripKmApproval } from './courseKmStatus.js';

test('an approved earlier course stays approved when the daily row has a later higher reading', () => {
  const trip = {
    id: 'trip-1', status: 'finished', km_approval_status: 'approved',
    trip_date: '2026-07-15', car: 'fiat', end_km: 385300,
  };
  const dailyCosts = [{ entry_date: '2026-07-15', fiat_end: '385360' }];

  assert.equal(tripKmApproval(trip, dailyCosts).approved, true);
  assert.deepEqual(pendingKmTrips([trip], dailyCosts), []);
});
