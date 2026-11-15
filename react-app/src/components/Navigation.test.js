import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('./Navigation.jsx', import.meta.url), 'utf8');

test('admin route plan appears directly after clients in navigation', () => {
  const clientsIndex = source.indexOf("navItems.push({ to: '/clients'");
  const routePlanIndex = source.indexOf("navItems.push({ to: '/route-plan'");
  const mapIndex = source.indexOf("{ to: '/map'");

  assert.ok(clientsIndex >= 0);
  assert.ok(routePlanIndex > clientsIndex);
  assert.ok(mapIndex > routePlanIndex);
  assert.match(source.slice(clientsIndex, routePlanIndex), /if \(canViewModule\('route_plan'\)\)/);
});

test('navigation uses grouped CRM sidebar semantics and lucide icons', () => {
  assert.match(source, /<aside className=\{`app-navigation\$\{isMenuOpen \? ' is-menu-open' : ''\}\$\{isCollapsed \? ' is-collapsed' : ''\}`\} aria-label=\{t\('nav\.primary'\)\}>/);
  assert.match(source, /const NAV_GROUPS = \['transport', 'laundry', 'management'\]/);
  assert.match(source, /icon: WashingMachine/);
  assert.doesNotMatch(source, /icon: '[^']*[\u{1F300}-\u{1FAFF}]/u);
});

test('navigation exposes an accessible responsive menu', () => {
  assert.match(source, /aria-controls=\{menuPanelId\}/);
  assert.match(source, /aria-expanded=\{isMenuOpen\}/);
  assert.match(source, /'nav\.closeMenu' : 'nav\.openMenu'/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /className="app-navigation-panel" id=\{menuPanelId\}/);
});

test('desktop sidebar can be collapsed to icons and remembers the choice', () => {
  assert.match(source, /COLLAPSE_KEY/);
  assert.match(source, /aria-pressed=\{isCollapsed\}/);
  assert.match(source, /title=\{isCollapsed \? label : undefined\}/);
  assert.match(source, /'nav\.expand' : 'nav\.collapse'/);
});
