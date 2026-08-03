import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDailyCostPatches,
  buildTimelineStats,
  countAccruedDays,
  electricityMonthlyCost,
  electricityReconciliation,
  invalidCostSettingFields,
  meterUsageSeries,
  parseMeterReading,
} from './costEngine.js';

test('timeline hours follow the station group, not the employee home group', () => {
  const date = '2026-08-03';
  const stats = buildTimelineStats([
    { employee_id: 7, entry_date: date, hour: 8, role: 'R', role_group_name: 'ZD 2' },
  ], {
    workingMap: { [`7_${date}`]: true },
    startFor: () => 7,
    employeeBuckets: { 7: 'ZD1' },
  });

  assert.equal(stats[date].roles.ZD1.hrs, 0);
  assert.equal(stats[date].roles.ZD2.hrs, 1);
  assert.equal(stats[date].roles.ZD2.emp.has(7), true);
});

test('a decreased meter reading is flagged and does not become the next baseline', () => {
  const series = meterUsageSeries(['100', '10', '110'], '90');

  assert.deepEqual(series.map(day => day.usage), [10, 0, 10]);
  assert.equal(series[1].status, 'decreased');
});

test('an explicit meter reset starts a new baseline without creating negative usage', () => {
  const series = meterUsageSeries(['110', '5', '15'], '100', [false, true, false]);

  assert.deepEqual(series.map(day => day.usage), [10, 0, 10]);
  assert.deepEqual(series.map(day => day.status), ['ok', 'reset', 'ok']);
});

test('meter parser rejects partially numeric and negative values', () => {
  assert.deepEqual(parseMeterReading('00105,5'), { value: 105.5, status: 'ok' });
  assert.equal(parseMeterReading('-').status, 'missing');
  assert.equal(parseMeterReading('—').status, 'missing');
  assert.equal(parseMeterReading('105abc').status, 'invalid');
  assert.equal(parseMeterReading('-10').status, 'invalid');
});

test('daily cost autosave sends only fields edited by the user', () => {
  const dailyData = {
    '2026-07-15': { entry_date: '2026-07-15', fiat_end: '385360', other_costs: '120', updated_at: '2026-07-15T08:00:00Z' },
  };

  assert.deepEqual(
    buildDailyCostPatches(dailyData, [['2026-07-15', ['other_costs']]]),
    [{ entry_date: '2026-07-15', expected_updated_at: '2026-07-15T08:00:00Z', other_costs: '120' }],
  );
});

test('month-to-date day count excludes future dates', () => {
  const days = ['2026-07-14', '2026-07-15', '2026-07-16'];
  assert.equal(countAccruedDays(days, '2026-07-15'), 2);
});

test('cost settings reject empty, negative and non-numeric values', () => {
  const settings = {
    fiat_l_100km: 9, isuzu_l_100km: 10, merc_l_100km: 11, iveco_l_100km: 12,
    fuel_price: 5, elec_multiplier: 80, elec_fixed_monthly: null, elec_price_kwh: 1,
    elec_power_fee_monthly: 0, elec_reactive_monthly: 0,
    gas_prod_price_m3: 2, gas_prod_fixed_daily: 3, gas_heat_price_m3: 4,
    gas_heat_fixed_monthly: -1, water_fixed_monthly: 2, water_price_m3: 3,
    worker_hourly_rate: 40,
  };

  assert.deepEqual(invalidCostSettingFields(settings), ['elec_fixed_monthly', 'gas_heat_fixed_monthly']);
});

test('electricity cost includes all monthly invoice components', () => {
  const cost = electricityMonthlyCost(9833, {
    elec_price_kwh: 0.6823,
    elec_fixed_monthly: 3562.12,
    elec_power_fee_monthly: 1875.43,
    elec_reactive_monthly: 470.55,
  });

  assert.equal(Math.round(cost * 10000) / 10000, 12617.1559);
});

test('electricity reconciliation compares meter calculation with invoice values', () => {
  const result = electricityReconciliation({
    elec_invoice_kwh: 9833,
    elec_invoice_net: 12577.83,
  }, 9188.4, 12176.47);

  assert.equal(result.calculatedKwh, 9188.4);
  assert.equal(result.calculatedNet, 12176.47);
  assert.equal(result.usageDifference, 644.6000000000004);
  assert.equal(Math.round(result.costDifference * 100) / 100, 401.36);
  assert.equal(Math.round(result.usageDifferencePct * 100) / 100, 6.56);
  assert.equal(Math.round(result.costDifferencePct * 100) / 100, 3.19);
});

test('invoice fields are optional but reject negative values', () => {
  const settings = {
    fiat_l_100km: 9, isuzu_l_100km: 10, merc_l_100km: 11, iveco_l_100km: 12,
    fuel_price: 5, elec_multiplier: 80, elec_fixed_monthly: 1, elec_price_kwh: 1,
    elec_power_fee_monthly: 0, elec_reactive_monthly: 0,
    elec_invoice_kwh: null, elec_invoice_net: -1,
    gas_prod_price_m3: 2, gas_prod_fixed_daily: 3, gas_heat_price_m3: 4,
    gas_heat_fixed_monthly: 1, water_fixed_monthly: 2, water_price_m3: 3,
    worker_hourly_rate: 40,
  };

  assert.deepEqual(invalidCostSettingFields(settings), ['elec_invoice_net']);
});
