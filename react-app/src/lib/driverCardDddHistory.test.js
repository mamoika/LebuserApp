import assert from 'node:assert/strict';
import test from 'node:test';
import { partitionDriverCardDddImports } from './driverCardDddHistory.js';

test('shows the newest card download separately and keeps older reads in the archive', () => {
  const result = partitionDriverCardDddImports([
    { id: 'old', downloaded_at: '2026-09-01T08:00:00Z', imported_at: '2026-11-10T10:00:00Z' },
    { id: 'new', downloaded_at: '2026-11-03T16:50:13Z', imported_at: '2026-11-03T17:00:00Z' },
    { id: 'middle', downloaded_at: '2026-10-02T08:00:00Z', imported_at: '2026-10-02T09:00:00Z' },
  ]);

  assert.equal(result.latestImport.id, 'new');
  assert.deepEqual(result.olderImports.map(item => item.id), ['middle', 'old']);
});

test('removes duplicate archive rows without deleting distinct reads', () => {
  const duplicate = { id: 'same', downloaded_at: '2026-11-03T16:50:13Z' };
  const result = partitionDriverCardDddImports([duplicate, duplicate, { id: 'older', downloaded_at: '2026-10-01T08:00:00Z' }]);

  assert.equal(result.latestImport.id, 'same');
  assert.deepEqual(result.olderImports.map(item => item.id), ['older']);
});
