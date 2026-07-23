import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRouteGridSlots,
  moveRouteToGridPosition,
  ROUTE_GRID_MIN_SLOTS,
} from './routeGridLayout.js';

test('route board keeps a minimum four by three grid and preserves empty slots', () => {
  const slots = buildRouteGridSlots([
    { id: 1, sort_order: 1, grid_position: 1 },
    { id: 2, sort_order: 2, grid_position: 4 },
  ]);

  assert.equal(slots.length, ROUTE_GRID_MIN_SLOTS);
  assert.equal(slots[0].route.id, 1);
  assert.equal(slots[1].route, null);
  assert.equal(slots[3].route.id, 2);
});

test('legacy routes without a visual position fill the first free slots by route number', () => {
  const slots = buildRouteGridSlots([
    { id: 2, sort_order: 2, grid_position: null },
    { id: 1, sort_order: 1, grid_position: null },
  ]);

  assert.equal(slots[0].route.id, 1);
  assert.equal(slots[1].route.id, 2);
});

test('moving a route to an occupied slot swaps only visual positions', () => {
  const routes = [
    { id: 1, sort_order: 1, grid_position: 1 },
    { id: 2, sort_order: 2, grid_position: 5 },
  ];
  const moved = moveRouteToGridPosition(routes, 1, 5);

  assert.deepEqual(
    moved.map(route => ({
      id: route.id,
      sort_order: route.sort_order,
      grid_position: route.grid_position,
    })),
    [
      { id: 1, sort_order: 1, grid_position: 5 },
      { id: 2, sort_order: 2, grid_position: 1 },
    ],
  );
});

test('moving a route to an empty slot does not change its operational number', () => {
  const routes = [{ id: 7, sort_order: 3, grid_position: 2 }];
  const [moved] = moveRouteToGridPosition(routes, 7, 12);

  assert.equal(moved.grid_position, 12);
  assert.equal(moved.sort_order, 3);
});

test('the board adds complete rows when a route is placed beyond the first twelve slots', () => {
  const slots = buildRouteGridSlots([
    { id: 1, sort_order: 1, grid_position: 13 },
  ]);

  assert.equal(slots.length, 16);
  assert.equal(slots[12].route.id, 1);
});
