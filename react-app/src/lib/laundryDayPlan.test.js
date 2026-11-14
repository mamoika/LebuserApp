import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateLaundryDayMetrics, effectiveLaundryWashDate, laundryBatchKey } from './laundryDayPlan.js';

test('separates batches for one client by wash and departure dates', () => {
  const yesterdayBatch = laundryBatchKey({
    clientName: 'Radisson', routeId: 3, washDate: '2026-11-05', departureDate: '2026-11-06',
  });
  const todayBatch = laundryBatchKey({
    clientName: 'Radisson', routeId: 3, washDate: '2026-11-06', departureDate: '2026-11-09',
  });

  assert.notEqual(yesterdayBatch, todayBatch);
});

test('keeps planned wash, actual wash and clean departure as separate daily weights', () => {
  const entries = [
    { id: 'yesterday', weight: 267, washDate: '2026-11-05', departureDate: '2026-11-06', washed_at: '2026-11-05T12:00:00+01:00' },
    { id: 'today', weight: 385, washDate: '2026-11-06', departureDate: '2026-11-09', washed_at: '2026-11-06T12:00:00+01:00' },
  ];

  assert.deepEqual(
    calculateLaundryDayMetrics(entries, '2026-11-06', entry => entry.washDate, entry => entry.departureDate),
    { plannedKg: 385, washedKg: 385, departureKg: 267 },
  );
});

test('does not count completed entries that are hidden from the laundry work list', () => {
  const entries = [
    {
      id: 'completed',
      done: true,
      weight: 267,
      washDate: '2026-11-05',
      departureDate: '2026-11-06',
      washed_at: '2026-11-05T12:00:00+01:00',
    },
  ];

  assert.deepEqual(
    calculateLaundryDayMetrics(entries, '2026-11-05', entry => entry.washDate, entry => entry.departureDate),
    { plannedKg: 0, washedKg: 0, departureKg: 0 },
  );
});

test('manual laundry date overrides the date derived from logistics', () => {
  assert.equal(
    effectiveLaundryWashDate(
      { laundry_planned_date: '2026-11-12', derivedDate: '2026-11-13' },
      entry => entry.derivedDate,
    ),
    '2026-11-12',
  );
  assert.equal(
    effectiveLaundryWashDate({ derivedDate: '2026-11-13' }, entry => entry.derivedDate),
    '2026-11-13',
  );
});
