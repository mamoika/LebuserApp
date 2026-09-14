export function upsertCourseStop(stops = [], nextStop) {
  if (!nextStop) return stops;

  const existingIndex = stops.findIndex(stop => (
    stop.id === nextStop.id
    || (nextStop.client_id != null && stop.client_id === nextStop.client_id)
    || stop.client_name === nextStop.client_name
  ));

  if (existingIndex === -1) return [...stops, nextStop];

  return stops.map((stop, index) => (
    index === existingIndex ? { ...stop, ...nextStop } : stop
  ));
}
