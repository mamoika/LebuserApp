import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLaundryHistoryDays } from './laundryHistory.js';

test('groups by the actual Warsaw wash day and includes collected entries', () => {
  const radisson = {
    client_name: 'Radisson',
    route_id: 3,
    laundry_planned_date: '2026-11-20',
    washed_at: '2026-11-19T14:25:00Z',
    washed_by: 'Pracownik A',
    laundry_packed_at: '2026-11-20T08:56:00Z',
    laundry_packed_by: 'Pracownik B',
    picked_at: '2026-11-23T08:00:00Z',
    picked_by: 'Kierowca',
    done: true,
  };
  const history = buildLaundryHistoryDays([
    { ...radisson, id: 'sheets', weight: 490 },
    { ...radisson, id: 'towels', weight: 12 },
    { ...radisson, id: 'deleted', weight: 100, deleted_at: '2026-11-19T18:00:00Z' },
    { ...radisson, id: 'late-hour', washed_at: '2026-11-19T23:30:00Z', weight: 69, done: false, picked_at: null, picked_by: null },
    { ...radisson, id: 'unwashed', washed_at: null },
  ], entry => entry.laundry_planned_date);

  assert.deepEqual(history.map(day => day.date), ['2026-11-20', '2026-11-19']);
  const [batch] = history[1].batches;
  assert.equal(batch.weight, 502);
  assert.equal(batch.washDate, '2026-11-20');
  assert.equal(batch.collected, true);
  assert.deepEqual(batch.washed.map(event => event.person), ['Pracownik A']);
  assert.deepEqual(batch.packed.map(event => event.person), ['Pracownik B']);
  assert.deepEqual(batch.picked.map(event => event.person), ['Kierowca']);
  assert.equal(history[0].batches[0].collected, false);
});

test('keeps batches with different departures separate and preserves partial weight information', () => {
  const entry = {
    client_name: 'LAT Hotel',
    route_id: 3,
    washed_at: '2026-11-20T08:55:00Z',
    laundry_planned_date: '2026-11-23',
    pick_week_key: '2026-11-23',
    pick_day: 2,
  };
  const [day] = buildLaundryHistoryDays([
    { ...entry, id: 'weighted', weight: 69 },
    { ...entry, id: 'unknown', weight: null },
    { ...entry, id: 'other-departure', weight: 40, pick_day: 3 },
  ], item => item.laundry_planned_date);

  assert.equal(day.batches.length, 2);
  assert.equal(day.batches[0].weight, 69);
  assert.equal(day.batches[0].hasUnknownWeight, true);
  assert.equal(day.batches[1].hasUnknownWeight, false);
});
