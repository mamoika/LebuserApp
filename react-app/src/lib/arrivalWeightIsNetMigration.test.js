import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../db/migrations/20261117140000_arrival_weight_is_net.sql', import.meta.url),
  'utf8',
);
const editFixMigration = await readFile(
  new URL('../../db/migrations/20261117160000_edit_entry_preserve_trolleys.sql', import.meta.url),
  'utf8',
);
const modals = await readFile(new URL('../components/modals/EntryModals.jsx', import.meta.url), 'utf8');
const pl = JSON.parse(await readFile(new URL('../i18n/locales/pl.json', import.meta.url), 'utf8'));
const de = JSON.parse(await readFile(new URL('../i18n/locales/de.json', import.meta.url), 'utf8'));

test('entered arrival weight is stored as net without trolley tare', () => {
  assert.match(migration, /create or replace function public\.admin_insert_entry/);
  assert.match(migration, /create or replace function public\.admin_update_entry/);
  assert.doesNotMatch(migration, /arrival_tare_kg\(/);
  assert.doesNotMatch(migration, /p_weight - v_tare/);
  assert.match(migration, /round\(greatest\(0, p_weight\), 2\)/);
});

test('entry forms ask for net weight and do not preview tare', () => {
  assert.doesNotMatch(modals, /tareWeight|grossWeight|arrival_gross_kg/);
  assert.match(modals, /setWeight\(entry\.weight \?\? ''\)/);
  for (const locale of [pl, de]) {
    assert.ok(locale.entry.netWeightOptional);
    assert.ok(locale.entry.netWeightLabel);
    assert.equal(locale.entry.tareWeight, undefined);
  }
});

test('editing only the net weight does not reserve the same trolleys again', () => {
  assert.match(editFixMigration, /select \* into v_existing[\s\S]*where id = p_id[\s\S]*for update/);
  assert.match(editFixMigration, /v_nos is not distinct from v_existing_nos[\s\S]*p_client_name is not distinct from v_existing\.client_name/);
  assert.match(editFixMigration, /v_added_nos[\s\S]*except[\s\S]*v_existing\.arrival_trolley_nos/);
  assert.match(
    editFixMigration,
    /resolve_arrival_trolleys\(p_client_name, v_added_nos, v_user\.name\)/,
  );
});
