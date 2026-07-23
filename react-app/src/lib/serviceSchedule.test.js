import assert from 'node:assert/strict';
import test from 'node:test';
import {
  effectiveServiceRules,
  isClientScheduledOnDate,
  isEveryWorkdayService,
  legacyScheduleRules,
  nextServiceSlot,
  normalizeServiceRules,
  scheduleCodeForRules,
} from './serviceSchedule.js';

const route = (rules, schedule = 'other') => ({ id: 7, schedule, service_rules: rules });
const client = (mode = 'inherit', rules = [], routeId = 7) => ({
  id: 'client-1',
  route_id: routeId,
  service_schedule_mode: mode,
  service_rules: rules,
});
const rule = (weekday, intervalWeeks = 1, anchorWeek = '2026-07-20') => ({
  weekday,
  interval_weeks: intervalWeeks,
  anchor_week: anchorWeek,
});

test('client can run every Monday and Thursday', () => {
  const routes = [route([rule(1), rule(4)])];
  const inheritedClient = client();

  assert.equal(isClientScheduledOnDate(inheritedClient, routes, '2026-07-20'), true);
  assert.equal(isClientScheduledOnDate(inheritedClient, routes, '2026-07-23'), true);
  assert.equal(isClientScheduledOnDate(inheritedClient, routes, '2026-07-24'), false);
});

test('custom client plan replaces the route default', () => {
  const routes = [route([rule(1), rule(4)])];
  const tuesdayOnly = client('custom', [rule(2)]);

  assert.deepEqual(effectiveServiceRules(tuesdayOnly, routes).map(item => item.weekday), [2]);
  assert.equal(isClientScheduledOnDate(tuesdayOnly, routes, '2026-07-20'), false);
  assert.equal(isClientScheduledOnDate(tuesdayOnly, routes, '2026-07-21'), true);
});

test('Friday every two weeks is anchored to the selected cycle week', () => {
  const routes = [route([])];
  const biweeklyFriday = client('custom', [rule(5, 2, '2026-07-20')]);

  assert.equal(isClientScheduledOnDate(biweeklyFriday, routes, '2026-07-24'), true);
  assert.equal(isClientScheduledOnDate(biweeklyFriday, routes, '2026-07-31'), false);
  assert.equal(isClientScheduledOnDate(biweeklyFriday, routes, '2026-08-07'), true);
});

test('disabled client is not scheduled even when route has a default plan', () => {
  const routes = [route([rule(1), rule(4)])];
  assert.equal(isClientScheduledOnDate(client('disabled'), routes, '2026-07-20'), false);
});

test('next service slot crosses the week boundary and respects frequency', () => {
  const weekly = [rule(1), rule(4)];
  assert.deepEqual(nextServiceSlot(weekly, '2026-07-20', 1), { pickDay: 4, pickWeek: 0 });
  assert.deepEqual(nextServiceSlot(weekly, '2026-07-20', 4), { pickDay: 1, pickWeek: 1 });

  const biweekly = [rule(5, 2, '2026-07-20')];
  assert.deepEqual(nextServiceSlot(biweekly, '2026-07-20', 5), { pickDay: 5, pickWeek: 2 });
});

test('legacy route schedules remain compatible during migration', () => {
  assert.deepEqual(legacyScheduleRules('mwf').map(item => item.weekday), [1, 3, 5]);
  assert.deepEqual(legacyScheduleRules('tth').map(item => item.weekday), [2, 4]);
  assert.equal(scheduleCodeForRules(legacyScheduleRules('daily')), 'daily');
  assert.equal(scheduleCodeForRules([rule(1), rule(4)]), 'other');
});

test('daily laundry behavior follows the effective client plan', () => {
  assert.equal(isEveryWorkdayService(legacyScheduleRules('daily')), true);
  assert.equal(isEveryWorkdayService([rule(2)]), false);
  assert.equal(isEveryWorkdayService([
    rule(1), rule(2), rule(3), rule(4), rule(5, 2),
  ]), false);
});

test('constructor domain accepts only weekly and biweekly frequencies', () => {
  assert.deepEqual(normalizeServiceRules([rule(2, 3)]), []);
  assert.deepEqual(normalizeServiceRules([rule(5, 4)]), []);
});
