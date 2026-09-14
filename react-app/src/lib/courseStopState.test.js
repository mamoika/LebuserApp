import assert from 'node:assert/strict';
import test from 'node:test';
import { upsertCourseStop } from './courseStopState.js';

test('a newly added course stop is appended without reloading the course', () => {
  const current = [{ id: 'stop-1', client_id: 'client-1', client_name: 'Alfa' }];
  const added = { id: 'stop-2', client_id: 'client-2', client_name: 'Beta', stop_kind: 'dirty_only' };

  assert.deepEqual(upsertCourseStop(current, added), [...current, added]);
  assert.equal(current.length, 1, 'the current state must remain immutable');
});

test('an existing scheduled stop is replaced by the dirty-only response', () => {
  const current = [{
    id: 'stop-1',
    client_id: 'client-1',
    client_name: 'Alfa',
    stop_kind: 'scheduled',
    tasks: [{ id: 'task-1' }],
  }];
  const updated = {
    id: 'stop-1',
    client_id: 'client-1',
    client_name: 'Alfa',
    stop_kind: 'dirty_only',
  };

  assert.deepEqual(upsertCourseStop(current, updated), [{
    ...current[0],
    ...updated,
  }]);
});
