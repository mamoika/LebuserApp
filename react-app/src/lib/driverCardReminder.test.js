import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DRIVER_CARD_DOWNLOAD_INTERVAL_DAYS,
  getDriverCardDueDate,
  getDriverCardReminder,
  groupDriverCardsByDueDay,
} from './driverCardReminder.js';

test('driver card due date is 28 calendar days after the confirmed download', () => {
  assert.equal(DRIVER_CARD_DOWNLOAD_INTERVAL_DAYS, 28);
  assert.equal(getDriverCardDueDate('2026-10-10'), '2026-11-07');
  assert.equal(getDriverCardDueDate('2026-02-10'), '2026-03-10');
  assert.equal(getDriverCardDueDate(''), null);
});

test('driver card reminder distinguishes missing, upcoming and overdue dates', () => {
  const today = new Date(2026, 10, 4);
  assert.equal(getDriverCardReminder({ last_downloaded_on: null }, today).state, 'missing');
  assert.deepEqual(
    getDriverCardReminder({ last_downloaded_on: '2026-10-10' }, today),
    { last_downloaded_on: '2026-10-10', state: 'dueSoon', dueOn: '2026-11-07', daysRemaining: 3 }
  );
  assert.equal(getDriverCardReminder({ last_downloaded_on: '2026-10-01' }, today).state, 'overdue');
  assert.equal(getDriverCardReminder({ last_downloaded_on: '2026-10-20' }, today).state, 'ok');
});

test('driver cards are placed above their exact due day in the selected month', () => {
  const cards = [
    { employee_id: 'a', name: 'Anna', last_downloaded_on: '2026-10-10' },
    { employee_id: 'b', name: 'Jan', last_downloaded_on: '2026-10-10' },
    { employee_id: 'c', name: 'Ola', last_downloaded_on: '2026-09-10' },
  ];
  const grouped = groupDriverCardsByDueDay(cards, 2026, 11);
  assert.equal(grouped.get(7).length, 2);
  assert.equal(grouped.has(8), false);
});
