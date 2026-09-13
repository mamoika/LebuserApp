import assert from 'node:assert/strict';
import test from 'node:test';
import { getEmployeeMonthNorm, parseHours, formatDiff } from './rosterHelpers.js';

test('parseHours returns 0 for non-working symbols and correct numbers for hours', () => {
  assert.equal(parseHours('W'), 0);
  assert.equal(parseHours('UW'), 0);
  assert.equal(parseHours('L4'), 0);
  assert.equal(parseHours('NU'), 0);
  assert.equal(parseHours('8'), 8);
  assert.equal(parseHours('9'), 9);
  assert.equal(parseHours('6-14'), 8);
  assert.equal(parseHours('5+10'), 10);
});

test('getEmployeeMonthNorm reduces norm for UoP by 8h per working day of UW/L4/NU', () => {
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const baseNorm = 168; // August 2026: 21 working days * 8h

  // Oksana Borovyk: UoP with 2 days of UW (28th Friday, 31st Monday)
  const empUoP = { name: 'Borovyk Oksana', contract_type: 'UoP' };
  const scheduleOksana = {
    28: 'UW',
    31: 'UW',
  };
  const getValueOksana = (emp, day) => scheduleOksana[day] || '9';

  const normOksana = getEmployeeMonthNorm(empUoP, baseNorm, days, 2026, 8, getValueOksana);
  assert.equal(normOksana, 152); // 168 - 2 * 8 = 152

  // Total hours worked: 172
  const diff = 172 - normOksana;
  assert.equal(diff, 20);
  assert.equal(formatDiff(diff), '+20');
});

test('getEmployeeMonthNorm does not reduce norm on weekends or holidays', () => {
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const baseNorm = 168;

  // August 15 is holiday, August 16 is Sunday
  const emp = { name: 'Test', contract_type: 'UoP' };
  const schedule = {
    15: 'UW',
    16: 'UW',
  };
  const norm = getEmployeeMonthNorm(emp, baseNorm, days, 2026, 8, (e, d) => schedule[d] || '8');
  assert.equal(norm, baseNorm); // No reduction because 15 and 16 are non-working days
});

test('getEmployeeMonthNorm keeps baseNorm for UZ contract', () => {
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const baseNorm = 168;

  const empUZ = { name: 'Cherenkova Yana', contract_type: 'UZ' };
  const schedule = {
    28: 'NU',
    31: 'NU',
  };
  const norm = getEmployeeMonthNorm(empUZ, baseNorm, days, 2026, 8, (e, d) => schedule[d] || '9');
  assert.equal(norm, 168);
});
