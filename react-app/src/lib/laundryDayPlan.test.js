import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateLaundryDayMetrics, effectiveLaundryWashDate, laundryBatchKey } from './laundryDayPlan.js';
import { departureDateOf, plannedWashDateOf } from './laundryWashDates.js';

test('separates batches for one client by wash and departure dates', () => {
  const yesterdayBatch = laundryBatchKey({
    clientName: 'Radisson', routeId: 3, washDate: '2026-11-05', departureDate: '2026-11-06',
  });
  const todayBatch = laundryBatchKey({
    clientName: 'Radisson', routeId: 3, washDate: '2026-11-06', departureDate: '2026-11-09',
  });

  assert.notEqual(yesterdayBatch, todayBatch);
});

test('keeps wash plan progress and clean departure as separate daily weights', () => {
  const entries = [
    { id: 'yesterday', weight: 267, washDate: '2026-11-05', departureDate: '2026-11-06', washed_at: '2026-11-05T12:00:00+01:00' },
    { id: 'today', weight: 385, washDate: '2026-11-06', departureDate: '2026-11-09', washed_at: '2026-11-06T12:00:00+01:00' },
  ];

  assert.deepEqual(
    calculateLaundryDayMetrics(entries, '2026-11-06', entry => entry.washDate, entry => entry.departureDate),
    { plannedKg: 385, washedKg: 385, packedKg: 0, departureKg: 267 },
  );
});

test('credits early washing to the Friday and Monday plans for the correct batches', () => {
  const entries = [
    {
      id: 'motel-one', weight: 557, arr_day: 4, week_key: '2026-11-16', pick_day: 6, pick_week_key: '2026-11-16',
      washed: true, washed_at: '2026-11-20T09:30:00+01:00',
    },
    {
      id: 'radisson', weight: 502, arr_day: 4, week_key: '2026-11-16', pick_day: 1, pick_week_key: '2026-11-23',
      washed: true, washed_at: '2026-11-19T15:25:00+01:00',
    },
    {
      id: 'lat-hotel', weight: 69, arr_day: 5, week_key: '2026-11-16', pick_day: 2, pick_week_key: '2026-11-23',
      washed: true, washed_at: '2026-11-20T09:55:00+01:00',
    },
  ];
  const getWashDate = entry => plannedWashDateOf(entry, new Map(), new Map());
  const friday = calculateLaundryDayMetrics(entries, '2026-11-20', getWashDate, departureDateOf);
  const monday = calculateLaundryDayMetrics(entries, '2026-11-23', getWashDate, departureDateOf);

  assert.deepEqual(
    [friday.plannedKg, friday.washedKg, monday.plannedKg, monday.washedKg],
    [1059, 1059, 69, 69],
  );
});

test('uses the current wash status of active entries in the selected plan', () => {
  const selectedDate = '2026-11-23';
  const entries = [
    { id: 'packed', weight: 40, washDate: selectedDate, laundry_status: 'packed' },
    { id: 'washed', weight: 20, washDate: selectedDate, washed: true, laundry_status: 'washed' },
    { id: 'pending', weight: 10, washDate: selectedDate, washed: false, laundry_status: 'pending' },
    { id: 'deleted', weight: 70, washDate: selectedDate, laundry_status: 'packed', deleted_at: '2026-11-20T10:00:00+01:00' },
  ];

  const metrics = calculateLaundryDayMetrics(entries, selectedDate, entry => entry.washDate, () => null);
  assert.equal(metrics.plannedKg, 70);
  assert.equal(metrics.washedKg, 60);
  assert.equal(metrics.packedKg, 40);
});

test('counts only ready entries from the selected wash plan, including early packing', () => {
  const entries = [
    { id: 'packed-early', weight: 47, washDate: '2026-11-27', laundry_packed_at: '2026-11-23T14:01:00+01:00' },
    { id: 'packed-today', weight: 574, washDate: '2026-11-27', laundry_ready_at: '2026-11-27T12:04:00+01:00' },
    { id: 'other-plan', weight: 135, washDate: '2026-11-26', departureDate: '2026-11-27', laundry_packed_at: '2026-11-27T09:00:00+01:00' },
  ];

  const metrics = calculateLaundryDayMetrics(entries.slice(0, 2), '2026-11-27', entry => entry.washDate, entry => entry.departureDate);
  assert.deepEqual(metrics, { plannedKg: 621, washedKg: 621, packedKg: 621, departureKg: 0 });
  assert.deepEqual(
    calculateLaundryDayMetrics(entries, '2026-11-27', entry => entry.washDate, entry => entry.departureDate),
    { ...metrics, departureKg: 135 },
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
    { plannedKg: 0, washedKg: 0, packedKg: 0, departureKg: 0 },
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
