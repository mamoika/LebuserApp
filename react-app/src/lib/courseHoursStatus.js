export function courseHoursStatus(trip) {
  if (trip.hours_status === 'approved' || trip.hours_status === 'rejected') return trip.hours_status;
  return trip.work_time_report_id || trip.reported_hours ? 'pending' : 'missing';
}
