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

test('route header shows its service days below the route name without a client badge', () => {
  assert.match(
    routeHeaderSource,
    /className="route-title"[\s\S]*?className="route-service-summary"/,
  );
  assert.match(
    componentSource,
    /serviceScheduleSummary\(effectiveRouteServiceRules\(route\), t\)/,
  );
  assert.doesNotMatch(routeHeaderSource, /client-service-badge/);
});

test('routes render in one manually ordered grid without legacy schedule groups', () => {
  assert.match(
    componentSource,
    /className="grid clients-route-grid"[\s\S]*?sortedRoutes\.map\(route => renderRouteCol\(route\)\)/,
  );
  assert.doesNotMatch(componentSource, /const groups = SCHEDULE_VALUES|clients\.groups\./);
  assert.match(componentSource, /admin_reorder_routes/);
});

test('laundry offer is configured on clients instead of routes', () => {
  assert.doesNotMatch(componentSource, /Trasa dla Odzieży Roboczej|setIsWorkwear/);
  assert.match(componentSource, /function LaundryCategoryPicker/);
  assert.match(componentSource, /p_laundry_categories:/);
});
