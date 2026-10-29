import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [indexHtml, mapView] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/MapView.jsx', import.meta.url), 'utf8'),
]);

assert.match(
  indexHtml,
  /<html lang="pl">/,
  'The document language must match the default Polish interface.',
);

assert.match(
  indexHtml,
  /<div id="root"[^>]*translate="no"[^>]*class="notranslate"[^>]*>/,
  'Browser translation must not mutate the React-managed application root.',
);

assert.match(
  indexHtml,
  /<body[^>]*translate="no"[^>]*class="notranslate"[^>]*>/,
  'Browser translation must not mutate React portals rendered into document.body.',
);

assert.doesNotMatch(
  mapView,
  /<span key=\{route\.id\}>/,
  'Leaflet route layers must be grouped with a Fragment, not a DOM element.',
);

assert.doesNotMatch(
  mapView,
  /<UserLocationButton[^>]*\/>[\s\S]*<\/MapContainer>/,
  'The location button DOM must remain outside the Leaflet-owned map container.',
);

console.log('DOM ownership checks passed.');
