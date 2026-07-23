import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const originalMigration = await readFile(
  new URL('../../db/migrations/route_grid_positions.sql', import.meta.url),
  'utf8',
);
const correctiveMigration = await readFile(
  new URL('../../db/migrations/route_grid_constraint_search_path_fix.sql', import.meta.url),
  'utf8',
);

test('route-card swap schema-qualifies its deferred constraint with an empty search path', () => {
  for (const migration of [originalMigration, correctiveMigration]) {
    assert.match(migration, /set search_path\s*=\s*''/i);
    assert.match(
      migration,
      /set constraints public\.routes_grid_position_unique deferred/i,
    );
    assert.doesNotMatch(
      migration,
      /set constraints routes_grid_position_unique deferred/i,
    );
  }
});
