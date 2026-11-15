import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compositePreviousReadings,
  costDay,
  DEFAULT_COST_SETTINGS,
  laborHoursByDate,
  parseDecimalInput,
  resolveMonthCostSettings,
  summarizeCostsMonth,
} from './costsMonthSummary.js';

const flatSettings = {
  ...DEFAULT_COST_SETTINGS,
  fiat_l_100km: 10, isuzu_l_100km: 0, merc_l_100km: 0, iveco_l_100km: 0,
  fuel_price: 5,
  elec_multiplier: 1, elec_price_kwh: 1, elec_fixed_monthly: 0, elec_power_fee_monthly: 0, elec_reactive_monthly: 0,
  gas_prod_price_m3: 0, gas_prod_fixed_daily: 0, gas_prod_fixed_monthly: 0, gas_prod_price_kwh: 0,
  gas_heat_price_m3: 0, gas_heat_fixed_monthly: 0,
  water_price_m3: 0, water_fixed_monthly: 0,
  worker_hourly_rate: 50,
};

test('decimal input accepts Polish and English formats', () => {
  assert.equal(parseDecimalInput('1 234,5'), 1234.5);
  assert.equal(parseDecimalInput('12.5'), 12.5);
  assert.equal(parseDecimalInput(''), null);
});

test('month settings fall back to the previous month without invoice fields', () => {
  const own = resolveMonthCostSettings({ settings: { fuel_price: 6 } }, '2026-11');
  assert.equal(own.fuel_price, 6);
  assert.equal(own.worker_hourly_rate, DEFAULT_COST_SETTINGS.worker_hourly_rate);

  const inherited = resolveMonthCostSettings({ previous_settings: { id: 4, fuel_price: 7, elec_invoice_kwh: 900 } }, '2026-11');
  assert.equal(inherited.fuel_price, 7);
  assert.equal(inherited.month_key, '2026-11');
  assert.equal(inherited.elec_invoice_kwh, null);
  assert.equal('id' in inherited, false);
});

test('previous readings take the latest non-empty value per meter', () => {
  const composite = compositePreviousReadings([
    { fiat_end: 1200, elec_end: '' },
    { fiat_end: 1100, elec_end: 500 },
  ]);
  assert.equal(composite.fiat_end, 1200);
  assert.equal(composite.elec_end, 500);
});

test('labor hours are summed per date from the schedule', () => {
  const labor = laborHoursByDate([
    { day: 3, value: '8' },
    { day: 3, value: '05:00-13:30' },
    { day: 4, value: 'L4' },
  ], 2026, 11);
  assert.equal(labor['2026-11-03'], 16.5);
  assert.equal(labor['2026-11-04'], 0);
});

test('a suppressed future day costs nothing', () => {
  const result = costDay({
    day: { other_costs: '100', ton_zd1: 50 },
    usageOf: () => 10,
    settings: flatSettings,
    daysInMonth: 30,
    gasProdUsageForMonth: 0,
    laborHours: 8,
    suppressed: true,
  });
  assert.equal(result.total_cost, 0);
  assert.equal(result.ton, 0);
});

test('month summary counts costs and tonnage only up to today', () => {
  const summary = summarizeCostsMonth({
    year: 2026,
    month: 11,
    todayKey: '2026-11-02',
    monthData: {
      settings: flatSettings,
      previous_daily_costs: [{ fiat_end: 1000, elec_end: 100 }],
      daily_costs: [
        { entry_date: '2026-11-01', fiat_end: 1100, elec_end: 110, ton_zd1: 400, other_costs: '20' },
        { entry_date: '2026-11-02', fiat_end: 1150, elec_end: 115, ton_zd2: 300 },
        { entry_date: '2026-11-03', fiat_end: 1300, elec_end: 200, ton_zd1: 999 },
      ],
      schedule_entries: [
        { day: 1, value: '8' },
        { day: 2, value: '8' },
        { day: 3, value: '8' },
      ],
    },
  });
  // Dzień 1: 100 km → 50 zł paliwa, 10 kWh → 10 zł, 8 h → 400 zł, inne 20 zł.
  // Dzień 2: 50 km → 25 zł, 5 kWh → 5 zł, 8 h → 400 zł.
  assert.equal(Math.round(summary.total * 100) / 100, 910);
  assert.equal(summary.kg, 700);
  assert.equal(summary.accruedDays, 2);
  assert.equal(Math.round(summary.plnPerKg * 1000) / 1000, 1.3);
});
