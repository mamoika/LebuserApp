import { vehicleEndColumn } from './vehicles.js';

export function tripKmApproval(sourceTrip, dailyCosts = [], kmResolvedIds = []) {
  if (!sourceTrip?.end_km) return { approved: false, currentValue: null, field: null };
  const field = vehicleEndColumn(sourceTrip.car);
  if (sourceTrip.km_approval_status === 'approved') {
    return { approved: true, currentValue: null, field };
  }
  if (kmResolvedIds.includes(sourceTrip.id)) {
    return { approved: true, currentValue: null, field, resolvedNoCost: true };
  }
  const row = dailyCosts.find(item => item.entry_date === sourceTrip.trip_date);
  const currentValue = row?.[field];
  const approved = String(currentValue ?? '').trim() === String(sourceTrip.end_km ?? '').trim();
  return { approved, currentValue, field };
}

export function pendingKmTrips(allTrips = [], dailyCosts = [], kmResolvedIds = []) {
  return allTrips.filter(trip => (
    trip.status === 'finished'
    && trip.end_km
    && !tripKmApproval(trip, dailyCosts, kmResolvedIds).approved
  ));
}
