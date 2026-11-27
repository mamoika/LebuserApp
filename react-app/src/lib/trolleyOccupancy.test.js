import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activePhysicalTrolleyCycles,
  buildTrolleyOccupancy,
  canUseFreeTrolley,
  trolleyFleetStatus,
  trolleyInventoryFoundCount,
  trolleyInventoryRoundStatus,
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

test('inventory keeps unchecked and conflicting carts out of free availability', () => {
  const occupancy = buildTrolleyOccupancy([{ trolley_no: '3', status: 'packed', client_name: 'Motel One' }]);
  const inventory = {
    trolley_nos: ['1', '2', '3', '4'],
    checks: { '2': { status: 'free_at_laundry' }, '3': { status: 'free_at_laundry' }, '4': { status: 'in_use' } },
  };

  assert.deepEqual(['1', '2', '3', '4', '5'].map(no => (
    canUseFreeTrolley(no, occupancy.get(no), inventory)
  )), [false, true, false, false, true]);
  assert.deepEqual(['1', '2', '3', '4', '5'].map(no => (
    trolleyFleetStatus(no, occupancy.get(no), inventory).status
  )), ['review', 'free', 'conflict', 'inUse', 'free']);
  assert.equal(trolleyFleetStatus('3', occupancy.get('3'), inventory).recorded, 'inUse');
});

test('a movement after a check resumes normal tracking for that trolley', () => {
  const inventory = {
    trolley_nos: ['1', '2'],
    checks: {
      '1': { status: 'in_use', movement_since_check: true },
      '2': { status: 'free_at_laundry', movement_since_check: true },
    },
  };
  const arrival = buildTrolleyOccupancy([], [{ trolley_no: '2', entry_id: 'dirty-2' }]).get('2');
  assert.equal(trolleyFleetStatus('1', null, inventory).status, 'free');
  assert.equal(canUseFreeTrolley('1', null, inventory), true);
  assert.equal(trolleyFleetStatus('2', arrival, inventory).status, 'dirty');
  assert.equal(canUseFreeTrolley('2', arrival, inventory), false);
});

test('presence inventory preserves unconfirmed free trolleys and explicitly blocks missing ones', () => {
  const inventory = {
    expected_trolley_nos: ['1', '2'],
    observations: { '2': { status: 'missing' } },
    packing_holds: ['2'],
  };
  assert.equal(trolleyInventoryRoundStatus('1', null, inventory), 'review');
  assert.equal(trolleyInventoryRoundStatus('2', null, inventory), 'missing');
  assert.equal(trolleyInventoryRoundStatus('3', null, inventory), 'outside');
  assert.equal(canUseFreeTrolley('1', null, inventory), true);
  assert.equal(canUseFreeTrolley('2', null, inventory), false);
  assert.equal(trolleyFleetStatus('2', null, inventory).status, 'missing');
  assert.equal(canUseFreeTrolley('2', null, { ...inventory, packing_holds: [] }), true);
});

test('presence counts occupied carts and flags a conflict only until a later movement', () => {
  const packed = { status: 'packed' };
  const atClient = { status: 'at_client' };
  const inventory = {
    expected_trolley_nos: ['1'],
    observations: { '1': { status: 'present' }, '2': { status: 'present' } },
    packing_holds: [],
  };
  assert.equal(trolleyInventoryRoundStatus('1', packed, inventory), 'present');
  assert.equal(trolleyInventoryRoundStatus('2', atClient, inventory), 'conflict');
  assert.equal(trolleyInventoryFoundCount(inventory), 2);
  assert.equal(canUseFreeTrolley('1', packed, inventory), false);
  assert.equal(canUseFreeTrolley('2', atClient, inventory), false);
  inventory.observations['2'].movement_since_check = true;
  assert.equal(trolleyInventoryRoundStatus('2', atClient, inventory), 'present');
  assert.equal(trolleyFleetStatus('2', atClient, inventory).status, 'atClient');
  assert.equal(trolleyInventoryFoundCount(inventory), 2);
});
