import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildDailyCostPatches,
  buildTimelineStats,
  countAccruedDays,
  dailyPerformanceMetrics,
  electricityMonthlyCost,
  electricityReconciliation,
  gasProductionDailyCost,
  gasProductionMonthlyCost,
  gasProductionReconciliation,
  invalidCostSettingFields,
  meterUsageSeries,
  parseMeterReading,
  productionThroughput,
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

test('timeline tracks unique production clock hours and excludes driver-only hours', () => {
  const date = '2026-08-05';
  const entries = [
    { employee_id: 1, entry_date: date, hour: 6, role: 'R', role_group_name: 'ZD 1' },
    { employee_id: 1, entry_date: date, hour: 7, role: 'R', role_group_name: 'ZD 1' },
    { employee_id: 2, entry_date: date, hour: 7, role: 'R', role_group_name: 'ZD 2' },
    { employee_id: 2, entry_date: date, hour: 8, role: 'R', role_group_name: 'ZD 2' },
    { employee_id: 3, entry_date: date, hour: 5, role: 'K', role_group_name: 'Kierowcy' },
  ];
  const stats = buildTimelineStats(entries, {
    workingMap: Object.fromEntries(entries.map(entry => [`${entry.employee_id}_${date}`, true])),
    startFor: () => 6,
    employeeBuckets: {},
  });

  assert.deepEqual([...stats[date].productionClockHours].sort((a, b) => a - b), [6, 7, 8]);
});

test('performance translations distinguish labour productivity from plant throughput', async () => {
  for (const locale of ['pl', 'de']) {
    const raw = await readFile(new URL(`../i18n/locales/${locale}.json`, import.meta.url), 'utf8');
    const { costs } = JSON.parse(raw);
    const labourHeaders = costs.exportPerformanceHead.slice(10, 13);
    const screenLabourLabels = [
      costs.performanceKgPerLaborHour,
      costs.zd1KgPerLaborHour,
      costs.zd2WashersKgPerLaborHour,
      costs.overallKgPerLaborHour,
    ];

    assert.ok(labourHeaders.every(label => label.includes(costs.performanceUnit)), `${locale}: ${labourHeaders.join(', ')}`);
    assert.ok(screenLabourLabels.every(label => label.includes(costs.performanceUnit)), `${locale}: ${screenLabourLabels.join(', ')}`);
    assert.ok(costs.exportPerformanceHead.at(-1).includes('kg/h'));
    assert.ok(costs.performanceLegendHint.includes(costs.performanceUnit));
    assert.match(costs.throughputKgH, /kg\/h/);
  }
});

test('plant throughput divides tonnage by clock hours, not accumulated labour hours', () => {
  assert.equal(productionThroughput(2685, 8), 335.625);
  assert.equal(productionThroughput(2685, 0), 0);
});

test('daily performance derives labour productivity and plant throughput from one definition', () => {
  const metrics = dailyPerformanceMetrics({
    kgZd1: 217.2,
    kgZd2: 2445,
    kgWashers: 240,
    timelineDay: {
      productionClockHours: new Set([6, 7, 8, 9, 10, 11, 12, 13]),
      roles: {
        ZD1: { hrs: 15.8 },
        ZD2: { hrs: 110.5 },
        Kierowcy: { hrs: 22.5 },
      },
    },
  });

  assert.equal(metrics.totalKg, 2902.2);
  assert.equal(metrics.productionClockHourCount, 8);
  assert.equal(metrics.zd2WashersKgPerLaborHour, 2685 / 110.5);
  assert.equal(metrics.overallKgPerLaborHour, 2902.2 / 148.8);
  assert.equal(metrics.plantThroughputKgPerHour, 2902.2 / 8);
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

test('daily cost autosave preserves a dash used as a missing-reading marker', () => {
  const dailyData = {
    '2026-08-04': { entry_date: '2026-08-04', fiat_end: '-', updated_at: null },
  };

  assert.deepEqual(
    buildDailyCostPatches(dailyData, [['2026-08-04', ['fiat_end']]]),
    [{ entry_date: '2026-08-04', expected_updated_at: null, fiat_end: '-' }],
  );
});

test('database validator accepts both missing-reading dash markers', async () => {
  const sql = await readFile(
    new URL('../../db/migrations/costs_meter_missing_markers.sql', import.meta.url),
    'utf8',
  );

  assert.match(sql, /trim\(v_meter\) not in \('', '-', '—'\)/);
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

test('production gas reconciliation uses the net totals from the May and June invoices', () => {
  const may = gasProductionReconciliation({
    gas_prod_invoice_kwh: 79575,
    gas_prod_invoice_net: 26751.80,
    gas_prod_fixed_daily: 173.508,
  }, 7000, 24879.25, 31);
  const june = gasProductionReconciliation({
    gas_prod_invoice_kwh: 95698,
    gas_prod_invoice_net: 29858.96,
    gas_prod_fixed_daily: 173.508,
  }, 8500, 28000, 30);

  assert.equal(may.invoiceKwh, 79575);
  assert.equal(may.invoiceNet, 26751.80);
  assert.equal(Math.round(may.impliedKwhPerM3 * 1000) / 1000, 11.368);
  assert.equal(Math.round(may.invoiceDerivedPriceM3 * 1000) / 1000, 3.053);
  assert.equal(Math.round(may.costDifference * 100) / 100, 1872.55);
  assert.equal(june.invoiceKwh, 95698);
  assert.equal(june.invoiceNet, 29858.96);
  assert.equal(Math.round(june.costDifference * 100) / 100, 1858.96);
});

test('production gas invoice net is the authoritative monthly cost', () => {
  const settings = {
    gas_prod_price_m3: 1.95,
    gas_prod_fixed_daily: 173.508,
    gas_prod_invoice_net: 29858.96,
  };

  assert.equal(gasProductionMonthlyCost(16123, settings, 30), 29858.96);
  assert.equal(gasProductionMonthlyCost(16123, {
    gas_prod_price_m3: 1.95,
    gas_prod_fixed_daily: 173.508,
  }, 30), 36645.09);
});

test('production gas invoice cost is allocated exactly across days without meter readings', () => {
  const settings = { gas_prod_invoice_net: 26751.80, gas_prod_fixed_daily: 173.508 };
  const daily = Array.from({ length: 31 }, () => gasProductionDailyCost(0, 0, settings, 31));

  assert.equal(Math.round(daily.reduce((sum, value) => sum + value, 0) * 100) / 100, 26751.80);
});

test('invoice fields are optional but reject negative values', () => {
  const settings = {
    fiat_l_100km: 9, isuzu_l_100km: 10, merc_l_100km: 11, iveco_l_100km: 12,
    fuel_price: 5, elec_multiplier: 80, elec_fixed_monthly: 1, elec_price_kwh: 1,
    elec_power_fee_monthly: 0, elec_reactive_monthly: 0,
    elec_invoice_kwh: null, elec_invoice_net: -1,
    gas_prod_invoice_kwh: null, gas_prod_invoice_net: -1,
    gas_prod_price_m3: 2, gas_prod_fixed_daily: 3, gas_heat_price_m3: 4,
    gas_heat_fixed_monthly: 1, water_fixed_monthly: 2, water_price_m3: 3,
    worker_hourly_rate: 40,
  };

  assert.deepEqual(invalidCostSettingFields(settings), ['elec_invoice_net', 'gas_prod_invoice_net']);
});
