import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activePhysicalTrolleyCycles,
  buildTrolleyOccupancy,
} from './trolleyOccupancy.js';

test('dirty arrival reservations occupy physical trolleys in the laundry fleet', () => {
  const occupancy = buildTrolleyOccupancy([], [
    { trolley_no: '4', client_name: 'Długie', entry_id: 'dirty-4' },
  ]);

  assert.equal(occupancy.size, 1);
  assert.deepEqual(occupancy.get('4'), {
    trolley_no: '4',
    client_name: 'Długie',
    entry_ids: ['dirty-4'],
    status: 'returning_to_laundry',
    dirty_received_at: null,
    occupancy_source: 'arrival',
  });
});

test('finished-course arrival is shown as dirty in the laundry', () => {
  const occupancy = buildTrolleyOccupancy([], [{
    trolley_no: '4', client_name: 'Długie', entry_id: 'dirty-4', dirty_received_at: '2026-11-05T12:00:00Z',
  }]);
  assert.equal(occupancy.get('4').status, 'dirty_in_laundry');
});

test('active clean cycle stays authoritative and exposes a collision', () => {
  const cycle = {
    id: 'cycle-1',
    trolley_no: '1',
    client_name: 'Motel One',
    status: 'at_client',
    returned_at: null,
  };
  const occupancy = buildTrolleyOccupancy([cycle], [
    { trolley_no: '1', client_name: 'LAT Hotel klucz', entry_id: 'dirty-1' },
  ]);

  assert.equal(occupancy.size, 1);
  assert.equal(occupancy.get('1').client_name, 'Motel One');
  assert.equal(occupancy.get('1').occupancy_conflict, true);
  assert.equal(occupancy.get('1').arrival_reservations.length, 1);
});

test('returned and virtual cycles do not occupy the physical fleet', () => {
  assert.deepEqual(activePhysicalTrolleyCycles([
    { trolley_no: '1', status: 'returned', returned_at: '2026-10-08T07:43:00Z' },
    { trolley_no: 'brak', status: 'packed', returned_at: null },
    { trolley_no: '2', status: 'at_client', returned_at: null },
  ]).map(cycle => cycle.trolley_no), ['2']);
});
