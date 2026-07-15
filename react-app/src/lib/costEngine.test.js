import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDailyCostPatches,
  countAccruedDays,
  invalidCostSettingFields,
  meterUsageSeries,
  parseMeterReading,
} from './costEngine.js';

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
    gas_prod_price_m3: 2, gas_prod_fixed_daily: 3, gas_heat_price_m3: 4,
    gas_heat_fixed_monthly: -1, water_fixed_monthly: 2, water_price_m3: 3,
    worker_hourly_rate: 40,
  };

  assert.deepEqual(invalidCostSettingFields(settings), ['elec_fixed_monthly', 'gas_heat_fixed_monthly']);
});
