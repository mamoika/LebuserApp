import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMyMonthHours,
  buildTeamDay,
  buildUpcomingAbsences,
  classifyScheduleValue,
  collectApprovals,
  percentChange,
  prettyGroupName,
  previousMonthSameDay,
  workingDaysInMonth,
  workingDaysUpTo,
} from './controlPanelMetrics.js';

const periods = [
  { employee_id: 1, started_on: '2026-01-01', ended_on: null },
  { employee_id: 2, started_on: '2026-01-01', ended_on: null },
  { employee_id: 3, started_on: '2026-01-01', ended_on: null },
  { employee_id: 4, started_on: '2026-12-01', ended_on: null },
];

const roster = [
  { id: 1, name: 'Anna', group_name: 'Kierowcy' },
  { id: 2, name: 'Bartek', group_name: 'Kierowcy' },
  { id: 3, name: 'Celina', group_name: 'Pralnia' },
  { id: 4, name: 'Darek', group_name: 'Pralnia' },
];

test('schedule values are classified like the work schedule grid', () => {
  assert.equal(classifyScheduleValue('8'), 'working');
  assert.equal(classifyScheduleValue('05:00-13:00'), 'working');
  assert.equal(classifyScheduleValue('I'), 'planned');
  assert.equal(classifyScheduleValue('L4'), 'absent');
  assert.equal(classifyScheduleValue('uw'), 'absent');
  assert.equal(classifyScheduleValue('W'), 'off');
  assert.equal(classifyScheduleValue(''), 'outside');
});

test('team day counts working, absent and skips people outside employment', () => {
  // 2026-11-16 is a Monday.
  const day = buildTeamDay({
    roster,
    employmentPeriods: periods,
    scheduleEntries: [
      { employee_id: 1, day: 16, value: '8' },
      { employee_id: 2, day: 16, value: 'L4' },
    ],
    year: 2026,
    month: 11,
    day: 16,
  });
  assert.equal(day.total, 3);
  assert.equal(day.working, 1);
  assert.equal(day.planned, 1);
  assert.equal(day.absentCount, 1);
  assert.deepEqual(day.absent.map(item => [item.name, item.value]), [['Bartek', 'L4']]);
  assert.deepEqual(day.groups.find(group => group.name === 'Kierowcy'), {
    name: 'Kierowcy', working: 1, planned: 0, total: 2,
  });
  assert.deepEqual(day.groups.find(group => group.name === 'Pralnia'), {
    name: 'Pralnia', working: 0, planned: 1, total: 1,
  });
});

test('team groups and absences follow the work schedule group order', () => {
  const day = buildTeamDay({
    roster: [
      { id: 1, name: 'Anna', group_name: 'Kierowcy' },
      { id: 2, name: 'Bartek', group_name: 'Kierowcy' },
      { id: 3, name: 'Celina', group_name: 'Pralnia' },
      { id: 5, name: 'Ewa', group_name: 'Biuro' },
      { id: 6, name: 'Adam', group_name: 'Techniczny' },
    ],
    employmentPeriods: [1, 2, 3, 5, 6].map(id => ({ employee_id: id, started_on: '2026-01-01', ended_on: null })),
    groupOrder: [{ name: 'Biuro' }, { name: 'Pralnia' }, { name: 'Kierowcy' }],
    scheduleEntries: [
      { employee_id: 1, day: 16, value: 'L4' },
      { employee_id: 5, day: 16, value: 'UW' },
      { employee_id: 6, day: 16, value: 'L4' },
    ],
    year: 2026,
    month: 11,
    day: 16,
  });
  assert.deepEqual(day.groups.map(group => group.name), ['Biuro', 'Pralnia', 'Kierowcy', 'Techniczny']);
  assert.deepEqual(day.absent.map(item => item.name), ['Ewa', 'Anna', 'Adam']);
});

test('weekend days default to off', () => {
  // 2026-11-15 is a Sunday.
  const day = buildTeamDay({ roster, employmentPeriods: periods, scheduleEntries: [], year: 2026, month: 11, day: 15 });
  assert.equal(day.working, 0);
  assert.equal(day.planned, 0);
  assert.equal(day.off, 3);
});

test('upcoming absences merge consecutive days across weekends', () => {
  const list = buildUpcomingAbsences({
    roster,
    employmentPeriods: periods,
    scheduleEntries: [
      { employee_id: 3, day: 19, value: 'UW' },
      { employee_id: 3, day: 20, value: 'UW' },
      { employee_id: 3, day: 21, value: 'W' },
      { employee_id: 3, day: 23, value: 'UW' },
    ],
    year: 2026,
    month: 11,
    fromDay: 17,
    days: 7,
  });
  assert.deepEqual(list.map(item => [item.name, item.value, item.firstDay, item.lastDay]), [
    ['Celina', 'UW', 19, 20],
    ['Celina', 'UW', 23, 23],
  ]);
});

test('my month hours match grid totals and UoP norm', () => {
  const result = buildMyMonthHours({
    employee: { id: 1, contract_type: 'UoP' },
    scheduleEntries: [
      { day: 2, value: '8' },
      { day: 3, value: '7,5' },
      { day: 4, value: 'UW' },
    ],
    year: 2026,
    month: 11,
  });
  const baseNorm = workingDaysInMonth(2026, 11) * 8;
  assert.equal(result.hours, 15.5);
  assert.equal(result.norm, baseNorm - 8);
  assert.equal(result.diff, Math.round((15.5 - (baseNorm - 8)) * 10) / 10);
  assert.equal(buildMyMonthHours({ employee: null, year: 2026, month: 11 }), null);
});

test('approvals collect settlements, pending hours, missing drivers and driver cards', () => {
  const items = collectApprovals({
    boardTrips: [
      { id: 1, board_status: 'settlement', end_km: 120, km_approval_status: 'pending', hours_status: 'approved', reported_hours: '8' },
      { id: 2, board_status: 'settlement', end_km: 90, km_approval_status: 'approved', hours_status: 'approved', reported_hours: '8' },
      { id: 3, board_status: 'planning', driver_id: null },
      { id: 4, board_status: 'planning', driver_id: null, isVirtual: true },
      { id: 5, board_status: 'active', driver_id: 7 },
    ],
    workTimeReports: [
      { id: 10, status: 'pending' },
      { id: 11, status: 'approved' },
    ],
    driverCardReminders: [
      { employee_id: 1, state: 'overdue' },
      { employee_id: 2, state: 'dueSoon' },
      { employee_id: 3, state: 'ok' },
    ],
  });
  assert.deepEqual(items.map(item => item.id), ['trip-1', 'report-10', 'card-1', 'nodriver-3', 'card-2']);
  assert.equal(items[0].kmPending, true);
  assert.equal(items[0].hoursPending, false);
});

test('hours to date are compared with a pro-rata norm', () => {
  const result = buildMyMonthHours({
    employee: { id: 1, contract_type: 'UoP' },
    scheduleEntries: [{ day: 2, value: '8' }, { day: 3, value: '8' }, { day: 20, value: '8' }],
    year: 2026,
    month: 11,
    uptoDay: 3,
  });
  assert.equal(result.hoursToDate, 16);
  const expected = Math.round(result.norm * (workingDaysUpTo(2026, 11, 3) / workingDaysInMonth(2026, 11)) * 10) / 10;
  assert.equal(result.normToDate, expected);
  assert.equal(result.diffToDate, Math.round((16 - expected) * 10) / 10);
});

test('month comparison helpers', () => {
  assert.deepEqual(previousMonthSameDay(2026, 3, 31), { year: 2026, month: 2, day: 28, ymd: '2026-02-28' });
  assert.deepEqual(previousMonthSameDay(2026, 1, 15).ymd, '2025-12-15');
  assert.equal(percentChange(110, 100), 10);
  assert.equal(percentChange(5, 0), null);
});

test('group names are normalized only when shouted', () => {
  assert.equal(prettyGroupName('KIEROWCY'), 'Kierowcy');
  assert.equal(prettyGroupName('ZD 2'), 'ZD 2');
  assert.equal(prettyGroupName('Biuro'), 'Biuro');
  assert.equal(prettyGroupName('TECHNICZNY'), 'Techniczny');
});
