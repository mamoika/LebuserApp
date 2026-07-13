export function dispatchCourseMode(trip) {
  if (trip?.status === 'planned') return 'planning';
  if (trip?.status === 'active' || trip?.status === 'handover') return 'editing';
  return 'history';
}
