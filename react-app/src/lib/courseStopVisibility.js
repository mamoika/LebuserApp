export function operationalCourseStops(stops = [], startedAt) {
  return stops.filter(stop => {
    if (stop?.status !== 'skipped') return true;
    if (!stop.completed_at) return false;
    return startedAt
      ? Date.parse(stop.completed_at) >= Date.parse(startedAt)
      : stop.stop_kind !== 'scheduled';
  });
}
