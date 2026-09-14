import assert from 'node:assert/strict';
import test from 'node:test';
import { visibleArrivalTrolleyNumbers } from './arrivalTrolleyAvailability.js';

test('occupied trolleys are hidden from the arrival picker', () => {
  const active = new Map([
    ['2', { trolley_no: '2', status: 'packed', client_name: 'Alfa' }],
    ['3', { trolley_no: '3', status: 'released', client_name: 'Beta' }],
    ['4', { trolley_no: '4', status: 'at_client', client_name: 'Inny klient' }],
  ]);

  assert.deepEqual(
    visibleArrivalTrolleyNumbers(['1', '2', '3', '4', '5'], [], active, 'Aktualny klient'),
    ['1', '5'],
  );
});

test('returning and already selected trolleys remain visible', () => {
  const active = new Map([
    ['2', { trolley_no: '2', status: 'at_client', client_name: 'Aktualny klient' }],
    ['3', { trolley_no: '3', status: 'packed', client_name: 'Beta' }],
  ]);

  assert.deepEqual(
    visibleArrivalTrolleyNumbers(['1', '2', '3'], ['3'], active, 'Aktualny klient'),
    ['1', '2', '3'],
  );
});
