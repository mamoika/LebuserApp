export const COST_METER_FIELDS = [
  'fiat_end',
  'isuzu_end',
  'merc_end',
  'iveco_end',
  'elec_end',
  'gas_prod_end',
  'gas_heat_end',
  'water_end',
];

export const COST_METER_RESET_FIELDS = COST_METER_FIELDS.map(field => field.replace(/_end$/, '_reset'));

export const COST_SETTING_FIELDS = [
  'fiat_l_100km', 'isuzu_l_100km', 'merc_l_100km', 'iveco_l_100km', 'fuel_price',
  'elec_multiplier', 'elec_fixed_monthly', 'elec_price_kwh',
  'gas_prod_price_m3', 'gas_prod_fixed_daily',
  'gas_heat_price_m3', 'gas_heat_fixed_monthly',
  'water_fixed_monthly', 'water_price_m3', 'worker_hourly_rate',
];

export function parseMeterReading(raw) {
  const trimmed = raw == null ? '' : String(raw).trim();
  if (trimmed === '' || trimmed === '-' || trimmed === '—') return { value: null, status: 'missing' };
  const normalized = trimmed.replace(',', '.');
  if (!/^\d+(?:\.\d*)?$/.test(normalized)) return { value: null, status: 'invalid' };
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0
    ? { value, status: 'ok' }
    : { value: null, status: 'invalid' };
}

export function meterUsageSeries(readings, baselineRaw = null, resets = []) {
  const baseline = parseMeterReading(baselineRaw);
  let previous = baseline.status === 'ok' ? baseline.value : null;

  return readings.map((raw, index) => {
    const parsed = parseMeterReading(raw);
    if (parsed.status !== 'ok') return { usage: 0, status: parsed.status };
    if (resets[index]) {
      previous = parsed.value;
      return { usage: 0, status: 'reset' };
    }
    if (previous == null) {
      previous = parsed.value;
      return { usage: 0, status: 'missing_baseline' };
    }
    if (parsed.value < previous) {
      return { usage: 0, status: 'decreased', previous, current: parsed.value };
    }
    const usage = parsed.value - previous;
    previous = parsed.value;
    return { usage, status: 'ok' };
  });
}

export function buildDailyCostPatches(dailyData, dirtyEntries) {
  return dirtyEntries.flatMap(([dateStr, fields]) => {
    const source = dailyData[dateStr];
    if (!source) return [];
    const patch = { entry_date: dateStr, expected_updated_at: source.updated_at ?? null };
    fields.forEach(field => { patch[field] = source[field] ?? null; });
    return Object.keys(patch).length > 1 ? [patch] : [];
  });
}

export function countAccruedDays(days, todayKey) {
  return days.filter(day => day <= todayKey).length;
}

export function invalidCostSettingFields(settings) {
  return COST_SETTING_FIELDS.filter(field => {
    const value = settings[field];
    return typeof value !== 'number' || !Number.isFinite(value) || value < 0;
  });
}
