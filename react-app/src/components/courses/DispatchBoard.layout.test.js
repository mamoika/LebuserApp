import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./DispatchBoard.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../mockups/mockups.css', import.meta.url), 'utf8');

test('dispatch controls and summary share one compact header surface', () => {
  assert.match(
    source,
    /className="live-board-header"[\s\S]*?className="live-board-toolbar"[\s\S]*?className="live-board-meta"[\s\S]*?className="dispatch-summary"/,
    'the date and daily summary should sit directly under the title instead of in a separate band',
  );
  assert.match(
    styles,
    /\.live-dispatch \.live-board-header\s*\{[\s\S]*?border-radius:\s*18px;[\s\S]*?background:\s*var\(--bg-card-solid\);/,
    'the header should use the shared raised Apple-style surface',
  );
});

test('daily toolbar aligns controls and offers one-click date navigation', () => {
  assert.match(
    source,
    /className="live-date-control"[\s\S]*?shiftYmd\(value, -1\)[\s\S]*?weekday: 'short'[\s\S]*?id="dispatch-date"[\s\S]*?shiftYmd\(value, 1\)/,
    'the date control should expose previous, direct-pick, and next navigation in one group',
  );
  assert.doesNotMatch(source, /className="live-date-today"/, 'date navigation should stay within one compact control');
  assert.match(
    styles,
    /\.live-dispatch \.live-board-actions\s*\{[\s\S]*?--dispatch-control-height:\s*44px;/,
    'the toolbar should own one shared control height',
  );
  assert.match(
    styles,
    /\.live-dispatch \.live-view-toggle\s*\{[\s\S]*?height:\s*var\(--dispatch-control-height\);[\s\S]*?\.live-dispatch \.live-board-actions \.driver-tool-btn\s*\{[\s\S]*?height:\s*var\(--dispatch-control-height\);/,
    'view and action controls should align to the same height',
  );
});

test('each workflow stage grows with its content instead of a fixed tall surface', () => {
  assert.match(
    source,
    /className=\{`dispatch-col is-\$\{column\.key\}`\}/,
    'each column should expose its workflow status to the stylesheet',
  );
  assert.match(
    styles,
    /\.live-dispatch \.dispatch-board\s*\{[\s\S]*?height:\s*auto;[\s\S]*?max-height:\s*clamp\(/,
    'the daily board should size to its cards and only cap at the viewport height',
  );
  assert.match(
    styles,
    /\.live-dispatch \.dispatch-col\s*\{[\s\S]*?display:\s*flex;[\s\S]*?overflow:\s*hidden;[\s\S]*?background:\s*#F7F7F9;/,
    'columns should be bounded surfaces instead of floating content on white',
  );
  assert.match(
    styles,
    /\.live-dispatch \.dispatch-col-drop\s*\{[\s\S]*?flex:\s*1;[\s\S]*?overflow-y:\s*auto;/,
    'long columns should scroll within the shared board height',
  );
});

test('dispatch board keeps usable columns on narrow screens', () => {
  assert.match(
    styles,
    /\.live-dispatch \.dispatch-board\s*\{[\s\S]*?min-width:\s*1120px;[\s\S]*?grid-template-columns:\s*repeat\(5, minmax\(216px, 1fr\)\);/,
    'desktop stages should not collapse below their readable width',
  );
  assert.match(
    styles,
    /@media \(max-width: 760px\)[\s\S]*?\.live-dispatch \.dispatch-board\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?flex-direction:\s*column;/,
    'mobile should turn the workflow into a vertical list',
  );
});

test('course cards preserve route, driver, vehicle, and ready metadata hierarchy', () => {
  assert.match(
    source,
    /className="kurs-card-top"[\s\S]*?className="kurs-driver-row"[\s\S]*?className="kurs-car-chip"[\s\S]*?className="kurs-progress-label is-ready"/,
    'vehicle information should sit with the driver while ready metadata forms a separate footer',
  );
  assert.match(
    source,
    /trip\.stops_total > 0 && <span><MapPin/,
    'plan-only courses should not show a misleading zero-stop label',
  );
  assert.match(
    styles,
    /\.live-dispatch \.kurs-car-chip\s*\{[\s\S]*?max-width:\s*none;[\s\S]*?white-space:\s*nowrap;/,
    'vehicle names should remain complete instead of being clipped',
  );
  assert.match(
    styles,
    /\.live-dispatch \.kurs-progress-label\s*\{[\s\S]*?background:\s*var\(--bg-secondary\);/,
    'operational metadata should be grouped in a quiet inset surface',
  );
});

test('cards are ordered by start time and keep the route identity color', () => {
  assert.match(source, /sortTripsByStart\(trips\.filter\(trip => trip\.board_status === column\.key\)\)/);
  assert.match(
    styles,
    /\.live-dispatch \.kurs-route-badge\s*\{[\s\S]*?color:\s*var\(--course-route-color\);[\s\S]*?background:\s*var\(--course-route-soft\);/,
    'route badges should use the shared per-route color',
  );
  assert.match(
    styles,
    /\.live-dispatch \.kurs-avatar\s*\{[\s\S]*?background:\s*rgba\(118, 118, 128, 0\.12\);/,
    'driver avatars should stay neutral so only the route carries color',
  );
});
