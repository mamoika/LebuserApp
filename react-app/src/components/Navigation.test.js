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
  assert.match(source.slice(clientsIndex, routePlanIndex), /if \(isAdmin\)/);
});
