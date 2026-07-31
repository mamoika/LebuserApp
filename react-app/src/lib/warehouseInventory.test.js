import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clientItemBreakdown,
  clientStockCount,
  movementLinesFromCounts,
  totalLocationStock,
  validateMovementCounts,
  zoneTotals,
} from './warehouseInventory.js';

const locations = [
  { zone: 'ZD2', stock: { bedding: 3, sheet: 4 } },
  { zone: 'ZD2', stock: { bedding: 5, sheet: 1 } },
  { zone: 'ZD1', stock: { bedding: 99, sheet: 99 } },
];
const items = [{ id: 'bedding' }, { id: 'sheet' }];

test('warehouse helpers sum a location and zone without mixing zones', () => {
  assert.equal(totalLocationStock(locations[0], items), 7);
  assert.deepEqual(zoneTotals(locations, items, 'ZD2'), {
    bedding: 8,
    sheet: 5,
  });
});

test('warehouse helpers keep only positive whole-number movement lines', () => {
  assert.deepEqual(movementLinesFromCounts({
    bedding: '4',
    sheet: '0',
  }, items), [{ item_id: 'bedding', quantity: 4 }]);
});

test('warehouse helpers reject a movement larger than source stock', () => {
  assert.equal(validateMovementCounts({ bedding: '4' }, items, locations[0]), 'exceeds');
  assert.equal(validateMovementCounts({ bedding: '3' }, items, locations[0]), null);
});

test('warehouse helpers keep carton stock separated by client', () => {
  const carton = {
    stock: { bedding: 8 },
    client_stock: [
      { client_id: 'client-b', client_name: 'Hotel B', stock: { bedding: 5 } },
      { client_id: 'client-a', client_name: 'Hotel A', stock: { bedding: 3 } },
    ],
  };

  assert.equal(clientStockCount(carton, 'bedding', 'client-a'), 3);
  assert.equal(clientStockCount(carton, 'bedding', 'missing'), 0);
  assert.deepEqual(clientItemBreakdown(carton, 'bedding'), [
    { clientId: 'client-a', clientName: 'Hotel A', quantity: 3 },
    { clientId: 'client-b', clientName: 'Hotel B', quantity: 5 },
  ]);
});
