import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAutomaticCartonLayout,
  reconcileCartonLayout,
  warehouseStockAllocations,
} from './warehouseLayout.js';

const items = [
  { id: 'cover', name: 'Poszwa', variant: '140 x 200', unit: 'szt.' },
  { id: 'sheet', name: 'Prześcieradło', variant: null, unit: 'szt.' },
];

const carton = {
  id: 'carton-1',
  location_type: 'carton',
  stock: { cover: 38, sheet: 20 },
  client_stock: [
    {
      client_id: 'client-a',
      client_name: 'Hotel A',
      stock: { cover: 30, sheet: 20 },
    },
    {
      client_id: 'client-b',
      client_name: 'Hotel B',
      stock: { cover: 8 },
    },
  ],
};

test('carton layout allocations preserve client and item ownership', () => {
  assert.deepEqual(warehouseStockAllocations(carton, items), [
    {
      key: 'client-a:cover',
      clientId: 'client-a',
      clientName: 'Hotel A',
      itemId: 'cover',
      itemName: 'Poszwa',
      itemVariant: '140 x 200',
      unit: 'szt.',
      quantity: 30,
    },
    {
      key: 'client-a:sheet',
      clientId: 'client-a',
      clientName: 'Hotel A',
      itemId: 'sheet',
      itemName: 'Prześcieradło',
      itemVariant: null,
      unit: 'szt.',
      quantity: 20,
    },
    {
      key: 'client-b:cover',
      clientId: 'client-b',
      clientName: 'Hotel B',
      itemId: 'cover',
      itemName: 'Poszwa',
      itemVariant: '140 x 200',
      unit: 'szt.',
      quantity: 8,
    },
  ]);
});

test('carton layout reconciliation blocks legacy stock without a client', () => {
  const cartonWithUnassignedStock = {
    ...carton,
    stock: { cover: 40, sheet: 20 },
  };
  const result = reconcileCartonLayout([
    { client_id: 'client-a', item_id: 'cover', quantity: 30 },
    { client_id: 'client-a', item_id: 'sheet', quantity: 20 },
    { client_id: 'client-b', item_id: 'cover', quantity: 8 },
  ], cartonWithUnassignedStock, items);

  assert.equal(result.status, 'missing');
  assert.equal(result.availableTotal, 60);
  assert.equal(result.differences.find(entry => entry.key === 'unassigned:cover').missing, 2);
});

test('carton layout reconciliation accepts one stock allocation split across layers', () => {
  const placements = [
    { client_id: 'client-a', item_id: 'cover', quantity: 18, layer_index: 0 },
    { client_id: 'client-a', item_id: 'cover', quantity: 12, layer_index: 1 },
    { client_id: 'client-a', item_id: 'sheet', quantity: 20, layer_index: 0 },
    { client_id: 'client-b', item_id: 'cover', quantity: 8, layer_index: 1 },
  ];

  const result = reconcileCartonLayout(placements, carton, items);

  assert.equal(result.status, 'exact');
  assert.deepEqual(result.differences, []);
});

test('carton layout reconciliation normalizes quantities to whole pieces', () => {
  const result = reconcileCartonLayout([
    { client_id: 'client-a', item_id: 'cover', quantity: 14.5 },
    { client_id: 'client-a', item_id: 'cover', quantity: 14.5 },
    { client_id: 'client-a', item_id: 'sheet', quantity: 20 },
    { client_id: 'client-b', item_id: 'cover', quantity: 8 },
  ], carton, items);

  assert.equal(result.status, 'exact');
  assert.equal(result.assignedTotal, 58);
});

test('carton layout reconciliation reports missing and excess quantities', () => {
  const missing = reconcileCartonLayout([
    { client_id: 'client-a', item_id: 'cover', quantity: 25 },
  ], carton, items);
  assert.equal(missing.status, 'missing');
  assert.equal(missing.differences.find(entry => entry.key === 'client-a:cover').missing, 5);
  assert.equal(missing.differences.find(entry => entry.key === 'client-a:sheet').missing, 20);

  const excess = reconcileCartonLayout([
    { client_id: 'client-a', item_id: 'cover', quantity: 31 },
  ], carton, items);
  assert.equal(excess.status, 'excess');
  assert.equal(excess.differences.find(entry => entry.key === 'client-a:cover').excess, 1);
});

test('automatic layout covers the full stock and creates bounded placements on layers', () => {
  const placements = createAutomaticCartonLayout(carton, items, () => `stack-${Math.random()}`);
  const result = reconcileCartonLayout(placements, carton, items);

  assert.equal(result.status, 'exact');
  assert.equal(placements.length, 3);
  assert.deepEqual([...new Set(placements.map(entry => entry.layer_index))], [0, 1]);
  assert.ok(placements.every(entry => (
    entry.x >= 0
    && entry.y >= 0
    && entry.width > 0
    && entry.height > 0
    && entry.x + entry.width <= 100
    && entry.y + entry.height <= 100
  )));
});
