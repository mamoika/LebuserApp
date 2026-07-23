import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const componentSource = await readFile(
  new URL('./ClientsRoutesView.jsx', import.meta.url),
  'utf8',
);
const stylesSource = await readFile(
  new URL('../index.css', import.meta.url),
  'utf8',
);
const routeHeaderStart = componentSource.indexOf('<div className="col-header route-card-header"');
const routeHeaderEnd = componentSource.indexOf('<Droppable', routeHeaderStart);
const routeHeaderSource = componentSource.slice(routeHeaderStart, routeHeaderEnd);

test('client name and service schedule share one flexible details column', () => {
  assert.match(
    componentSource,
    /className="client-details"[\s\S]*?className="client-name"[\s\S]*?className="client-service-badge"/,
  );
  assert.match(
    stylesSource,
    /\.client-details\s*\{[\s\S]*?flex:\s*1[\s\S]*?min-width:\s*0/,
  );
  assert.match(
    stylesSource,
    /\.client-details\s+\.client-service-badge\s*\{[\s\S]*?max-width:\s*100%/,
  );
});

test('inherited route schedule is not repeated on every client row', () => {
  assert.match(
    componentSource,
    /\(client\.service_schedule_mode \|\| 'inherit'\) !== 'inherit' && \(/,
  );
});

test('route header keeps service days on one line with number and edit controls', () => {
  assert.match(
    routeHeaderSource,
    /className="route-card-controls"[\s\S]*?className="route-service-summary"[\s\S]*?className="route-header-actions"/,
  );
  assert.match(
    componentSource,
    /compactServiceScheduleSummary\([\s\S]*?effectiveRouteServiceRules\(route\),[\s\S]*?t,[\s\S]*?\)/,
  );
  assert.doesNotMatch(routeHeaderSource, /client-service-badge/);
  assert.match(
    stylesSource,
    /\.route-header-actions\s*\{[\s\S]*?margin-left:\s*auto/,
  );
});

test('routes render in a four-column visual grid without legacy schedule groups', () => {
  const routeGridStyle = stylesSource.slice(
    stylesSource.indexOf('.clients-route-grid {'),
    stylesSource.indexOf('.route-card-header {'),
  );
  assert.match(
    componentSource,
    /className=\{`grid clients-route-grid[\s\S]*?routeGridSlots\.map\(slot => \(/,
  );
  assert.match(
    routeGridStyle,
    /grid-template-columns:\s*repeat\(4,minmax\(0,1fr\)\)\s*!important/,
  );
  assert.doesNotMatch(
    routeGridStyle,
    /grid-template-columns:\s*repeat\([123],/,
  );
  assert.match(
    stylesSource,
    /\.clients-route-grid-scroll\s*\{[\s\S]*?overflow-x:\s*auto/,
  );
  assert.doesNotMatch(componentSource, /const groups = SCHEDULE_VALUES|clients\.groups\./);
});

test('full route days and empty rows keep their visual grid positions', () => {
  const routeSummaryStyle = stylesSource.slice(
    stylesSource.indexOf('.route-service-summary {'),
    stylesSource.indexOf('.route-own-badge {'),
  );
  assert.match(routeSummaryStyle, /white-space:\s*nowrap/);
  assert.match(routeSummaryStyle, /min-width:\s*0/);
  assert.doesNotMatch(routeSummaryStyle, /text-overflow:\s*ellipsis|overflow:\s*hidden/);
  assert.match(
    stylesSource,
    /\.route-grid-spacer\s*\{\s*min-height:\s*300px/,
  );
});

test('route numbering and visual card positions use separate persistence actions', () => {
  assert.match(componentSource, /admin_reorder_routes/);
  assert.match(componentSource, /admin_move_route_card/);
  assert.match(componentSource, /moveRouteToGridPosition/);
  assert.match(componentSource, /p_target_position:\s*targetPosition/);
});

test('route cards are arranged by direct drag and drop without a layout selection mode', () => {
  assert.match(
    componentSource,
    /className="route-card-drag-handle"[\s\S]*?draggable=\{!savingLayout\}[\s\S]*?onDragStart=/,
  );
  assert.match(
    componentSource,
    /className=\{`route-grid-slot[\s\S]*?onDragOver=\{event => handleRouteDragOver\(event, slot\.position\)\}[\s\S]*?onDrop=\{event => handleRouteDrop\(event, slot\.position\)\}/,
  );
  assert.match(componentSource, /moveRouteCard\(draggedRoute\.id, position\)/);
  assert.doesNotMatch(componentSource, /layoutEditing|selectedLayoutRouteId|toggleLayoutEditing/);
  assert.doesNotMatch(componentSource, /clients\.layout\.edit|clients\.layout\.finish/);
});

test('laundry offer is configured on clients instead of routes', () => {
  assert.doesNotMatch(componentSource, /Trasa dla Odzieży Roboczej|setIsWorkwear/);
  assert.match(componentSource, /function LaundryCategoryPicker/);
  assert.match(componentSource, /p_laundry_categories:/);
});
