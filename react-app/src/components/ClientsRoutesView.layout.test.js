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
const printLayoutSource = await readFile(
  new URL('../lib/routePrintLayout.js', import.meta.url),
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
    /\.route-header-actions\s*\{[\s\S]*?margin-left:\s*auto[\s\S]*?border-radius:\s*10px/,
  );
});

test('route header is a distinct cap with a prominent name and compact days badge', () => {
  assert.match(componentSource, /'--route-color':\s*routeColor/);
  assert.match(
    stylesSource,
    /\.route-card-header\s*\{[\s\S]*?margin:\s*-16px -16px 10px[\s\S]*?background:\s*linear-gradient/,
  );
  assert.match(
    stylesSource,
    /\.route-card-heading \.route-title\s*\{[\s\S]*?font-size:\s*15px[\s\S]*?font-weight:\s*800/,
  );
  assert.match(
    stylesSource,
    /\.route-service-summary\s*\{[\s\S]*?display:\s*inline-flex[\s\S]*?border-radius:\s*999px[\s\S]*?font-size:\s*11px/,
  );
});

test('routes render in a four-column visual grid without legacy schedule groups', () => {
  const routeGridStyle = stylesSource.slice(
    stylesSource.indexOf('.clients-route-grid {'),
    stylesSource.indexOf('.route-card-header {'),
  );
  assert.match(
    componentSource,
    /className=\{`grid clients-route-grid[\s\S]*?routeGridPages\.map\(\(pageSlots, pageIndex\) => \{[\s\S]*?pageSlots\.map\(slot => \(/,
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

test('route printout uses one four-route row per landscape A4 page', () => {
  assert.match(componentSource, /const routeGridPages = paginateRouteGridSlots\(routeGridSlots\)/);
  assert.match(componentSource, /className=\{`route-grid-page[\s\S]*?is-print-empty[\s\S]*?is-last-print-page/);
  assert.match(stylesSource, /@page\s*\{[\s\S]*?size:\s*A4 landscape[\s\S]*?margin:\s*0/);
  assert.match(
    stylesSource,
    /\.clients-routes-view \.route-grid-page\s*\{[\s\S]*?width:\s*297mm[\s\S]*?height:\s*auto[\s\S]*?padding:\s*8mm[\s\S]*?grid-template-columns:\s*repeat\(var\(--print-route-count\),minmax\(0,1fr\)\)[\s\S]*?align-items:\s*start[\s\S]*?break-after:\s*page/,
  );
  assert.match(stylesSource, /\.route-grid-page\.is-print-empty\s*\{[\s\S]*?display:\s*none/);
  assert.match(componentSource, /className="route-print-header"[\s\S]*?LEBUSER App[\s\S]*?window\.location\.href/);
  assert.match(componentSource, /Data:[\s\S]*?Wydrukował:/);
  assert.match(
    stylesSource,
    /\.clients-routes-view \.route-print-header\s*\{[\s\S]*?width:\s*100%[\s\S]*?grid-template-columns:\s*minmax\(0,1fr\) auto/,
  );
  assert.match(
    stylesSource,
    /\.clients-routes-view \.route-print-meta\s*\{[\s\S]*?justify-self:\s*end[\s\S]*?margin-left:\s*auto[\s\S]*?text-align:\s*right/,
  );
  assert.match(componentSource, /const maxClientsOnPage = pageSlots\.reduce/);
  assert.match(componentSource, /maxClientsOnPage > 18 \? 'is-print-dense'/);
  assert.match(componentSource, /maxClientsOnPage > 26 \? 'is-print-extra-dense'/);
  assert.match(componentSource, /data-print-max-clients=\{maxClientsOnPage\}/);
  assert.match(printLayoutSource, /function fitRoutePagesForPrint\(root = document\)/);
  assert.match(printLayoutSource, /safeA4Height = pageRect\.width \* \(209 \/ 297\)/);
  assert.match(componentSource, /window\.addEventListener\('beforeprint', preparePrintLayout\)/);
  assert.match(componentSource, /window\.matchMedia\?\.\('print'\)/);
  assert.match(printLayoutSource, /if \(!fitsOnA4\(\)\)[\s\S]*?PRINT_DENSE_CLASS[\s\S]*?if \(!fitsOnA4\(\)\)[\s\S]*?PRINT_EXTRA_DENSE_CLASS[\s\S]*?if \(!fitsOnA4\(\)\)[\s\S]*?PRINT_ULTRA_DENSE_CLASS/);
  assert.match(stylesSource, /\.route-grid-page\.is-print-ultra-dense \.tag-client\s*\{[\s\S]*?padding:\s*\.2mm \.6mm/);
  assert.match(stylesSource, /\.route-grid-slot\.is-print-empty-slot\s*\{[\s\S]*?display:\s*none/);
  assert.match(stylesSource, /\.clients-routes-view \.route-card\s*\{[\s\S]*?height:\s*auto[\s\S]*?min-height:\s*45mm/);
  assert.match(stylesSource, /\.clients-routes-view \.route-card\s*\{[\s\S]*?transition:\s*none !important/);
  assert.match(stylesSource, /\.clients-routes-view \.tag-client\s*\{[\s\S]*?transition:\s*none !important/);
  assert.match(
    stylesSource,
    /\.clients-routes-view \.route-grid-page\.is-print-dense \.tag-client\s*\{[\s\S]*?padding:\s*1\.2mm/,
  );
  assert.match(
    stylesSource,
    /\.clients-routes-view \.client-details\s*\{[\s\S]*?overflow:\s*hidden[\s\S]*?flex-direction:\s*column/,
  );
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
