export const GOOGLE_MAPS_MAX_WAYPOINTS = 9;

const MAX_NEW_STOPS_PER_SEGMENT = GOOGLE_MAPS_MAX_WAYPOINTS + 1;

function coordinates(point) {
  return `${point.lat},${point.lng}`;
}

function buildDirectionsUrl(origin, destination, waypoints) {
  const url = new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api', '1');
  url.searchParams.set('origin', coordinates(origin));
  url.searchParams.set('destination', coordinates(destination));
  if (waypoints.length > 0) {
    url.searchParams.set('waypoints', waypoints.map(coordinates).join('|'));
  }
  return url.toString();
}

/**
 * Google Maps accepts at most nine intermediary waypoints in a Maps URL.
 * Each next segment therefore starts at the preceding segment's destination
 * and adds at most ten new client stops.
 */
export function buildGoogleMapsRouteSegments(origin, stops = []) {
  if (!origin || stops.length === 0) return [];

  const segments = [];
  for (let offset = 0; offset < stops.length; offset += MAX_NEW_STOPS_PER_SEGMENT) {
    const segmentStops = stops.slice(offset, offset + MAX_NEW_STOPS_PER_SEGMENT);
    const segmentOrigin = offset === 0 ? origin : stops[offset - 1];
    const destination = segmentStops[segmentStops.length - 1];
    const waypoints = segmentStops.slice(0, -1);

    segments.push({
      origin: segmentOrigin,
      destination,
      waypoints,
      stops: segmentStops,
      firstStopNumber: offset + 1,
      lastStopNumber: offset + segmentStops.length,
      url: buildDirectionsUrl(segmentOrigin, destination, waypoints),
    });
  }

  return segments;
}
