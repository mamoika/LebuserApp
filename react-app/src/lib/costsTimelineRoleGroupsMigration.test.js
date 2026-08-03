import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../db/migrations/costs_timeline_role_groups.sql', import.meta.url),
  'utf8',
);

test('cost month timeline rows include the painted station group', () => {
  assert.match(migration, /left join public\.roles r on r\.code = t\.role/i);
  assert.match(migration, /left join public\.groups g on g\.id = r\.group_id/i);
  assert.match(migration, /g\.name as role_group_name/i);
});
