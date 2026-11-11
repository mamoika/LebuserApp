import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const packingModal = await readFile(new URL('./PackingModal.jsx', import.meta.url), 'utf8');
const trolleyPicker = await readFile(new URL('./ArrivalTrolleyPicker.jsx', import.meta.url), 'utf8');
const trolleyPickerCss = await readFile(new URL('./ArrivalTrolleyPicker.css', import.meta.url), 'utf8');
const pl = JSON.parse(await readFile(new URL('../../i18n/locales/pl.json', import.meta.url), 'utf8'));
const de = JSON.parse(await readFile(new URL('../../i18n/locales/de.json', import.meta.url), 'utf8'));

test('PackingModal automatically enables barcode scanner on open with live indicator', () => {
  assert.match(packingModal, /useBarcodeScanner\(\{\s*enabled:\s*packMode === 'trolley'/);
  assert.match(packingModal, /wash\.packing\.scannerReady/);
  assert.match(packingModal, /wash\.packing\.scannerLive/);
  assert.match(packingModal, /wash\.packing\.scannerInstruction/);
});

test('PackingModal offers manual trolley selection for users without a scanner', () => {
  assert.match(packingModal, /handleAddManual/);
  assert.match(packingModal, /wash\.packing\.manualTrolleyAdd/);
  assert.match(packingModal, /wash\.packing\.addTrolleyBtn/);
  assert.match(packingModal, /<ArrivalTrolleyPicker/);
});

test('ArrivalTrolleyPicker uses createPortal to prevent modal clipping and includes trigger styles', () => {
  assert.match(trolleyPicker, /createPortal\(/);
  assert.match(trolleyPickerCss, /\.live-arrival-trolley-trigger\s*\{/);
  assert.match(trolleyPickerCss, /\.live-arrival-trolley-trigger-icon\s*\{/);
  assert.match(trolleyPickerCss, /\.live-arrival-trolley-trigger-copy\s*\{/);
});

test('packing translations are complete in Polish and German simultaneously', () => {
  const keys = [
    'scannerReady',
    'scannerLive',
    'scannerInstruction',
    'manualTrolleyAdd',
    'addTrolleyBtn',
    'batchEmpty',
    'scannedTrolleyTag',
    'chooseTrolleysButton',
    'chooseTrolleysSubtitle',
    'continuePacking',
    'continueHint',
    'finishPacking',
    'finishHint',
  ];

  for (const key of keys) {
    assert.ok(pl.wash.packing[key], `Missing pl.json key: wash.packing.${key}`);
    assert.ok(de.wash.packing[key], `Missing de.json key: wash.packing.${key}`);
  }
});
