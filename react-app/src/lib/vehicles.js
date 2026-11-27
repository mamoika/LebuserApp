// Stałe 4 auta floty. `key` odpowiada kolumnie odczytu licznika w daily_costs:
// fiat_end / isuzu_end / merc_end / iveco_end.
export const VEHICLES = [
  { key: 'fiat',  label: 'Fiat' },
  { key: 'isuzu', label: 'Isuzu' },
  { key: 'merc',  label: 'Mercedes' },
  { key: 'iveco', label: 'Iveco' },
];

export const VEHICLE_LABELS = Object.fromEntries(VEHICLES.map(v => [v.key, v.label]));

// Kolumna w daily_costs z końcowym odczytem licznika danego auta
export function vehicleEndColumn(carKey) {
  return `${carKey}_end`;
}

// Klucz w app_settings, pod którym trzymamy przypisania domyślnych aut kierowców
export const DRIVER_CARS_KEY = 'driver_cars';

export function activeTripsByVehicle(trips, currentTripId) {
  const result = new Map();
  for (const trip of trips) {
    const car = trip.car?.trim().toLowerCase();
    if (car && trip.id !== currentTripId && ['active', 'handover'].includes(trip.status)) {
      result.set(car, trip);
    }
  }
  return result;
}

export function courseVehicleErrorMessage(error, t, car) {
  if (error.message === 'course_vehicle_in_use' || error.message.startsWith('To auto jest już na trasie')
    || (error.code === '23505' && error.message.includes('driver_trips_running_vehicle_uidx'))) {
    return t('course.start.carInUse', { car: VEHICLE_LABELS[car] || car, driver: error.details || t('course.start.otherDriver') });
  }
  if (error.message === 'course_vehicle_required') return t('course.start.selectCar');
  if (error.message === 'course_vehicle_plan_changed') return t('course.planning.vehiclePlanChanged');
  return error.message;
}

export function weeklyVehicleErrorMessage(error, t) {
  return error.message === 'weekly_plan_vehicle_start_conflict'
    ? t('weeklyPlan.vehicleStartConflict', { driver: error.details || t('course.start.otherDriver') })
    : error.message;
}
