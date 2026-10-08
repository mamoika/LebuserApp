import assert from 'node:assert/strict';
import test from 'node:test';

import { deliveryTrolleyChoices } from './deliveryTrolleyChoices.js';

test('delivery uses every active cycle linked to the delivered entries', () => {
  const tasks = [{
    entry_id: 'entry-1',
    laundry_trolley_cycle_id: 'cycle-2',
    laundry_trolley_no: '1, 2',
  }];
  const workflow = [
    { id: 'cycle-1', trolley_no: '1', entry_ids: ['entry-1'], status: 'released', returned_at: null },
    { id: 'cycle-2', trolley_no: '2', entry_ids: ['entry-1'], status: 'released', returned_at: null },
  ];

  assert.deepEqual(deliveryTrolleyChoices(tasks, workflow), [
    { cycleId: 'cycle-1', trolleyNo: '1', choice: 'return' },
    { cycleId: 'cycle-2', trolleyNo: '2', choice: 'return' },
  ]);
});

test('delivery keeps a previous per-trolley choice after workflow refresh', () => {
  const tasks = [{ entry_id: 'entry-1' }];
  const workflow = [
    { id: 'cycle-1', trolley_no: '1', entry_ids: ['entry-1'], status: 'released', returned_at: null },
  ];

  assert.deepEqual(deliveryTrolleyChoices(tasks, workflow, [
    { cycleId: 'cycle-1', trolleyNo: '1', choice: 'leave' },
  ]), [
    { cycleId: 'cycle-1', trolleyNo: '1', choice: 'leave' },
  ]);
});
