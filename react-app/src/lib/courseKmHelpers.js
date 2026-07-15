import { approveCourseKm } from './courseRpc';
export { pendingKmTrips, tripKmApproval } from './courseKmStatus';

export async function bulkApprovePendingKm(sessionToken, pendingTrips) {
  await Promise.all(pendingTrips.map(trip => (
    approveCourseKm(sessionToken, trip.id, trip.end_km, true)
  )));
}
