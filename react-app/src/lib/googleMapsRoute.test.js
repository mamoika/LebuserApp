import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GOOGLE_MAPS_MAX_WAYPOINTS,
  buildGoogleMapsRouteSegments,
} from './googleMapsRoute.js';

const BASE = { lat: 52.7229319, lng: 15.2520164 };

function stops(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `client-${index + 1}`,
    name: `Client ${index + 1}`,
    lat: 52 + (index / 100),
    lng: 15 + (index / 100),
  }));
}

test('keeps a route with up to ten clients in one Google Maps segment', () => {
  const segments = buildGoogleMapsRouteSegments(BASE, stops(10));

  assert.equal(GOOGLE_MAPS_MAX_WAYPOINTS, 9);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].firstStopNumber, 1);
  assert.equal(segments[0].lastStopNumber, 10);
  assert.equal(segments[0].waypoints.length, 9);
  assert.equal(segments[0].destination.id, 'client-10');
});

test('splits twelve clients after stop ten and repeats the handoff as the next origin', () => {
  const segments = buildGoogleMapsRouteSegments(BASE, stops(12));

  assert.equal(segments.length, 2);
  assert.equal(segments[0].origin, BASE);
  assert.equal(segments[0].destination.id, 'client-10');
  assert.equal(segments[1].origin.id, 'client-10');
  assert.equal(segments[1].destination.id, 'client-12');
  assert.deepEqual(
    segments.map(segment => [segment.firstStopNumber, segment.lastStopNumber]),
    [[1, 10], [11, 12]],
  );
});

test('splits sixteen clients into two links without dropping or reordering a client', () => {
  const input = stops(16);
  const segments = buildGoogleMapsRouteSegments(BASE, input);

  assert.equal(segments.length, 2);
  assert.deepEqual(
    segments.flatMap(segment => segment.stops.map(stop => stop.id)),
    input.map(stop => stop.id),
  );
  assert.ok(segments.every(segment => segment.waypoints.length <= GOOGLE_MAPS_MAX_WAYPOINTS));
});

test('builds encoded Google Maps URLs in the requested stop order', () => {
  const [segment] = buildGoogleMapsRouteSegments(BASE, stops(3));
  const url = new URL(segment.url);

  assert.equal(url.origin, 'https://www.google.com');
  assert.equal(url.pathname, '/maps/dir/');
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(url.searchParams.get('origin'), `${BASE.lat},${BASE.lng}`);
  assert.equal(url.searchParams.get('waypoints'), '52,15|52.01,15.01');
  assert.equal(url.searchParams.get('destination'), '52.02,15.02');
  assert.equal(url.searchParams.has('travelmode'), false);
});

test('returns no segments when the route has no clients', () => {
  assert.deepEqual(buildGoogleMapsRouteSegments(BASE, []), []);
});
