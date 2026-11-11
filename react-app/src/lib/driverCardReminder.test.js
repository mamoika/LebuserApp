import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addDriverCardHistoryEvent,
  applyDriverCardDownload,
  DRIVER_CARD_DOWNLOAD_INTERVAL_DAYS,
  driverCardBadgeText,
  getDriverCardDueDate,
  getDriverCardReminder,
  groupDriverCardHistoryByEmployeeDay,
  groupDriverCardsByEmployeeDueDay,
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

test('driver card reminders are placed in the exact employee day cell', () => {
  const grouped = groupDriverCardsByEmployeeDueDay([
    { employee_id: 'a', name: 'Anna', last_downloaded_on: '2026-10-10' },
    { employee_id: 'b', name: 'Jan', last_downloaded_on: '2026-10-11' },
  ], 2026, 11);
  assert.equal(grouped.get('a_7').name, 'Anna');
  assert.equal(grouped.get('b_8').name, 'Jan');
  assert.equal(grouped.has('a_8'), false);
});

test('driver card history is placed in the employee cell where it was recorded', () => {
  const grouped = groupDriverCardHistoryByEmployeeDay([
    { id: 'event-1', employee_id: 'a', downloaded_on: '2026-11-04' },
    { id: 'event-2', employee_id: 'a', downloaded_on: '2026-10-07' },
  ], 2026, 11);
  assert.equal(grouped.get('a_4').id, 'event-1');
  assert.equal(grouped.has('a_7'), false);
});

test('driver card download updates live state without moving the last date backwards', () => {
  const event = { id: 'new', employee_id: 'a', downloaded_on: '2026-11-04' };
  const history = addDriverCardHistoryEvent([
    { id: 'old-same-day', employee_id: 'a', downloaded_on: '2026-11-04' },
    { id: 'older', employee_id: 'a', downloaded_on: '2026-10-07' },
  ], event);
  assert.deepEqual(history.map(item => item.id), ['new', 'older']);

  assert.equal(
    applyDriverCardDownload([{ employee_id: 'a', last_downloaded_on: '2026-10-07' }], 'a', '2026-11-04')[0].last_downloaded_on,
    '2026-11-04',
  );
  assert.equal(
    applyDriverCardDownload([{ employee_id: 'a', last_downloaded_on: '2026-11-04' }], 'a', '2026-10-07')[0].last_downloaded_on,
    '2026-11-04',
  );
});

test('driver card badge text formats missing, due today, tomorrow, remaining and overdue days', () => {
  const mockT = (key, params) => {
    if (key === 'course.driverCard.missing') return 'Brak';
    if (key === 'course.driverCard.dueToday') return 'Dziś';
    if (key === 'course.driverCard.dueTomorrow') return '1 dzień';
    if (key === 'course.driverCard.dueDays') return `${params.count} dni`;
    if (key === 'course.driverCard.overdueDays') return `-${params.count} d.`;
    return key;
  };
  assert.equal(driverCardBadgeText(null, mockT), '');
  assert.equal(driverCardBadgeText({ state: 'missing' }, mockT), 'Brak');
  assert.equal(driverCardBadgeText({ state: 'dueSoon', daysRemaining: 0 }, mockT), 'Dziś');
  assert.equal(driverCardBadgeText({ state: 'dueSoon', daysRemaining: 1 }, mockT), '1 dzień');
  assert.equal(driverCardBadgeText({ state: 'dueSoon', daysRemaining: 5 }, mockT), '5 dni');
  assert.equal(driverCardBadgeText({ state: 'ok', daysRemaining: 21 }, mockT), '21 dni');
  assert.equal(driverCardBadgeText({ state: 'overdue', daysRemaining: -3 }, mockT), '-3 d.');
});
