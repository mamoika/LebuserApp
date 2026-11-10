import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../db/migrations/20261110190000_admin_assign_trolley_to_client.sql', import.meta.url),
  'utf8',
);

test('manual trolley assignment is admin-only and resolves an active client', () => {
  assert.match(migration, /v_user\.role <> 'admin'/);
  assert.match(migration, /client\.id = p_client_id/);
  assert.match(migration, /client\.archived_at is null/);
});

test('manual trolley assignment locks and rejects every existing occupancy source', () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /private\.active_laundry_trolley_cycle\(v_no\)/);
  assert.match(migration, /private\.active_arrival_trolley_reservations\(\)/);
  assert.match(migration, /Najpierw zwolnij jego obecne przypisanie/);
});

test('manual trolley assignment creates a current client cycle and history through the cycle trigger', () => {
  assert.match(migration, /'at_client', 'empty_transfer'/);
  assert.match(migration, /Ręczne przypisanie wózka do klienta/);
  assert.match(migration, /grant execute on function public\.admin_assign_trolley_to_client/);
});
