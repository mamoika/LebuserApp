import assert from 'node:assert/strict';
import test from 'node:test';
import {
  firstAllowedLaundryType,
  laundryCategoriesForClient,
  laundryTypeFlags,
  laundryTypeTranslationKey,
  normalizeLaundryCategories,
} from './laundryCategories.js';

test('client categories are normalized in the canonical display order', () => {
  assert.deepEqual(normalizeLaundryCategories(['R', 'P', 'F', 'P', 'bad']), ['P', 'F', 'R']);
});

test('an explicit empty category list stays empty', () => {
  assert.deepEqual(laundryCategoriesForClient({ laundry_categories: [] }), []);
});

test('legacy clients inherit a safe fallback from the former route flag', () => {
  const clients = [{ id: 'hotel', route_id: 1 }, { id: 'factory', route_id: 2 }];
  const routes = [{ id: 1, is_workwear: false }, { id: 2, is_workwear: true }];

  assert.deepEqual(laundryCategoriesForClient(clients[0], routes), ['P', 'O']);
  assert.deepEqual(laundryCategoriesForClient(clients[1], routes), ['R']);
});

test('the first allowed type keeps a valid preference and handles disabled clients', () => {
  assert.equal(firstAllowedLaundryType({ laundry_categories: ['O', 'F'] }, [], 'F'), 'F');
  assert.equal(firstAllowedLaundryType({ laundry_categories: ['O', 'F'] }, [], 'P'), 'O');
  assert.equal(firstAllowedLaundryType({ laundry_categories: [] }), null);
});

test('frotte has its own translation key', () => {
  assert.equal(laundryTypeTranslationKey('F'), 'entry.terry');
});

test('laundry type flags preserve frotte in mixed stop metadata', () => {
  assert.deepEqual(laundryTypeFlags(['P', 'F']), {
    hasP: true,
    hasO: false,
    hasF: true,
    hasR: false,
  });
});
