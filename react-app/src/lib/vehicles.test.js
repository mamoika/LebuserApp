import assert from 'node:assert/strict';
import test from 'node:test';
import { activeTripsByVehicle, courseVehicleErrorMessage, weeklyVehicleErrorMessage } from './vehicles.js';

test('only courses using a vehicle now block another course from starting', () => {
  const running = { id: 'a', car: ' Fiat ', status: 'active', driver_name: 'First driver' };
  const handover = { id: 'b', car: 'merc', status: 'handover' };
  const trips = [
    running,
    { id: 'second-shift', car: 'fiat', status: 'planned' },
    handover,
    { id: 'returned', car: 'isuzu', status: 'finished' },
    { id: 'no-vehicle', car: '', status: 'active' },
  ];
  assert.deepEqual([...activeTripsByVehicle(trips)], [['fiat', running], ['merc', handover]]);
  assert.deepEqual([...activeTripsByVehicle(trips, 'a')], [['merc', handover]]);
});

test('vehicle conflict feedback includes the driver reported by the database', () => {
  const translate = (key, options) => [key, options];
  assert.deepEqual(
    weeklyVehicleErrorMessage({ message: 'weekly_plan_vehicle_start_conflict', details: 'First driver' }, translate),
    ['weeklyPlan.vehicleStartConflict', { driver: 'First driver' }],
  );
  assert.deepEqual(
    courseVehicleErrorMessage({ message: 'course_vehicle_in_use', details: 'First driver' }, translate, 'fiat'),
    ['course.start.carInUse', { car: 'Fiat', driver: 'First driver' }],
  );
});
