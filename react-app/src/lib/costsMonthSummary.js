import {
  DEFAULT_GAS_PROD_KWH_PER_M3,
  DEFAULT_GAS_PROD_PRICE_KWH,
  electricityMonthlyFees,
  gasProductionDailyCost,
  gasProductionKwh,
  meterUsageSeries,
} from './costEngine.js';
import { parseHours } from './rosterHelpers.js';

// Wspólne obliczenia kosztów miesiąca dla modułu Koszty i Panelu sterującego,
// żeby obie strony zawsze pokazywały tę samą kwotę i ten sam tonaż.

export const DEFAULT_COST_SETTINGS = {
  fiat_l_100km: 9.01, isuzu_l_100km: 10.88, merc_l_100km: 13.04, iveco_l_100km: 12.25,
  fuel_price: 4.85,
  elec_multiplier: 80, elec_fixed_monthly: 3562.12, elec_price_kwh: 0.6823,
  elec_power_fee_monthly: 0, elec_reactive_monthly: 0,
  elec_invoice_kwh: null, elec_invoice_net: null,
  gas_prod_price_m3: 1.95, gas_prod_fixed_daily: 173.51,
  gas_prod_kwh_per_m3: DEFAULT_GAS_PROD_KWH_PER_M3,
  gas_prod_price_kwh: DEFAULT_GAS_PROD_PRICE_KWH,
  gas_prod_fixed_monthly: 5205.24,
  gas_prod_invoice_kwh: null, gas_prod_invoice_net: null,
  gas_heat_price_m3: 6.15, gas_heat_fixed_monthly: 49.78,
  water_price_m3: 16.25, water_fixed_monthly: 20.10,
  worker_hourly_rate: 45.82,
  target_cost_per_kg: null,
};

export const COST_METER_BASES = ['fiat', 'isuzu', 'merc', 'iveco', 'elec', 'gas_prod', 'gas_heat', 'water'];

export function parseDecimalInput(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let s = String(value).trim();
  if (!s) return null;
  s = s.replace(/\s/g, '').replace(/[^\d,.-]/g, '');
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    const dotParts = s.split('.');
    if (dotParts.length > 2) {
      s = `${dotParts.slice(0, -1).join('')}.${dotParts.at(-1)}`;
    }
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export const decimalValue = (value) => parseDecimalInput(value) ?? 0;

function dateKey(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Stawki: własne miesiąca, inaczej odziedziczone z ostatniego zapisanego miesiąca, inaczej domyślne.
export function resolveMonthCostSettings(monthData, monthKey) {
  const sets = monthData?.settings || null;
  const prevSet = monthData?.previous_settings || null;
  if (sets) return { ...DEFAULT_COST_SETTINGS, ...sets };
  if (prevSet) {
    // odrzucamy id (i znacznik czasu), żeby zapis utworzył NOWY wiersz dla tego miesiąca, nie nadpisał poprzedni
    const rates = { ...prevSet };
    ['id', 'updated_at', 'elec_invoice_kwh', 'elec_invoice_net', 'gas_prod_invoice_kwh', 'gas_prod_invoice_net']
      .forEach(field => delete rates[field]);
    return {
      ...rates,
      month_key: monthKey,
      elec_invoice_kwh: null,
      elec_invoice_net: null,
      gas_prod_invoice_kwh: null,
      gas_prod_invoice_net: null,
    };
  }
  return { month_key: monthKey, ...DEFAULT_COST_SETTINGS };
}

// Ostatnie odczyty liczników sprzed miesiąca (baza dla zużycia w dniu 1).
export function compositePreviousReadings(prevRows = []) {
  const composite = {};
  (prevRows || []).forEach(row => {
    COST_METER_BASES.map(base => `${base}_end`).forEach(field => {
      if (composite[field] === undefined && row[field] != null && row[field] !== '') {
        composite[field] = row[field];
      }
    });
  });
  return composite;
}

// Łączne godziny z Grafiku pracy per dzień (suma wszystkich osób) — podstawa kosztu pracowników.
export function laborHoursByDate(scheduleEntries = [], year, month) {
  const labor = {};
  (scheduleEntries || []).forEach(entry => {
    const key = dateKey(year, month, entry.day);
    labor[key] = (labor[key] || 0) + parseHours(entry.value);
  });
  return labor;
}

// Koszt jednego dnia. `usageOf(base)` zwraca zużycie licznika w tym dniu.
export function costDay({ day = {}, usageOf, settings, daysInMonth, gasProdUsageForMonth, laborHours = 0, suppressed = false }) {
  const usage = base => (suppressed ? 0 : usageOf(base));
  const fiat_km = usage('fiat');
  const isuzu_km = usage('isuzu');
  const merc_km = usage('merc');
  const iveco_km = usage('iveco');
  const total_km = fiat_km + isuzu_km + merc_km + iveco_km;

  const transportCost = suppressed ? 0 : ((fiat_km * settings.fiat_l_100km) + (isuzu_km * settings.isuzu_l_100km) + (merc_km * settings.merc_l_100km) + (iveco_km * settings.iveco_l_100km)) / 100 * settings.fuel_price;
  const elec_usage = usage('elec') * settings.elec_multiplier;
  const elecMonthlyFees = electricityMonthlyFees(settings);
  const elec_cost = elec_usage * settings.elec_price_kwh + (suppressed ? 0 : (elecMonthlyFees / daysInMonth));
  const gas_prod_usage = usage('gas_prod');
  const gas_prod_kwh = suppressed ? 0 : gasProductionKwh(gas_prod_usage, settings);
  const gas_prod_cost = suppressed
    ? 0
    : gasProductionDailyCost(gas_prod_usage, gasProdUsageForMonth, settings, daysInMonth);
  const gas_heat_usage = usage('gas_heat');
  const gas_heat_cost = gas_heat_usage * settings.gas_heat_price_m3 + (suppressed ? 0 : (settings.gas_heat_fixed_monthly / daysInMonth));
  const water_usage = usage('water');
  const water_cost = water_usage * settings.water_price_m3 + (suppressed ? 0 : (settings.water_fixed_monthly / daysInMonth));
  const worker_cost = suppressed ? 0 : laborHours * settings.worker_hourly_rate;
  const other_cost = suppressed ? 0 : decimalValue(day.other_costs);
  const total_cost = transportCost + elec_cost + gas_prod_cost + gas_heat_cost + water_cost + worker_cost + other_cost;
  const ton = suppressed ? 0 : decimalValue(day.ton_zd1) + decimalValue(day.ton_zd2) + decimalValue(day.ton_pralki);
  const pln_kg = ton > 0 ? total_cost / ton : 0;

  return { fiat_km, isuzu_km, merc_km, iveco_km, total_km, elec_usage, gas_prod_usage, gas_prod_kwh, gas_heat_usage, water_usage, transportCost, elec_cost, gas_prod_cost, gas_heat_cost, water_cost, worker_cost, total_cost, other_cost, ton, pln_kg };
}

// Podsumowanie miesiąca do dziś włącznie — te same liczby co KPI w module Koszty.
export function summarizeCostsMonth({ monthData, year, month, todayKey }) {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const settings = resolveMonthCostSettings(monthData, monthKey);
  const prevReadings = compositePreviousReadings(monthData?.previous_daily_costs || []);
  const labor = laborHoursByDate(monthData?.schedule_entries || [], year, month);
  const dailyData = {};
  (monthData?.daily_costs || []).forEach(row => { dailyData[row.entry_date] = row; });

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, index) => dateKey(year, month, index + 1));
  const reading = (day, base) => {
    const value = dailyData[day]?.[`${base}_end`];
    return (value === 0 || value) ? value : null;
  };
  const series = Object.fromEntries(COST_METER_BASES.map(base => [
    base,
    meterUsageSeries(
      days.map(day => reading(day, base)),
      prevReadings?.[`${base}_end`],
      days.map(day => Boolean(dailyData[day]?.[`${base}_reset`])),
    ),
  ]));
  const gasProdUsageForMonth = series.gas_prod.reduce((sum, item) => sum + (item.usage || 0), 0);

  let total = 0;
  let kg = 0;
  let accruedDays = 0;
  days.forEach((day, index) => {
    const suppressed = day > todayKey;
    if (!suppressed) accruedDays += 1;
    const result = costDay({
      day: dailyData[day] || {},
      usageOf: base => series[base]?.[index]?.usage || 0,
      settings,
      daysInMonth,
      gasProdUsageForMonth,
      laborHours: labor[day] || 0,
      suppressed,
    });
    total += result.total_cost;
    kg += result.ton;
  });

  kg = +kg.toFixed(10);
  return {
    total,
    kg,
    plnPerKg: kg > 0 ? total / kg : 0,
    accruedDays,
    avgPerDay: accruedDays > 0 ? total / accruedDays : 0,
    targetCostPerKg: parseDecimalInput(settings.target_cost_per_kg),
  };
}
