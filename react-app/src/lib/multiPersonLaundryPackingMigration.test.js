import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../db/migrations/20261111180000_multi_person_laundry_packing.sql', import.meta.url),
  'utf8',
);

test('multi-person packing migration supports finish flag and dedicated finish function', () => {
  assert.match(migration, /admin_pack_laundry_trolley/);
  assert.match(migration, /p_finish boolean default null/);
  assert.match(migration, /if p_finish is not null then/);
  assert.match(migration, /v_is_ready := p_finish;/);
  assert.match(migration, /create or replace function public\.admin_finish_laundry_packing/);
  assert.match(migration, /grant execute on function public\.admin_finish_laundry_packing/);
});

test('finish packing sets entries status to packed and timestamps them for driver pickup', () => {
  assert.match(migration, /laundry_status = 'packed'/);
  assert.match(migration, /laundry_ready_at = coalesce\(laundry_ready_at, now\(\)\)/);
  assert.match(migration, /laundry_trolley_no = coalesce\(v_trolley_list, laundry_trolley_no\)/);
});
