export function operationalCourseStops(stops = []) {
  return stops.filter(stop => !(
    stop?.stop_kind === 'scheduled'
    && stop?.status === 'skipped'
  ));
}
