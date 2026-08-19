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
  'elec_power_fee_monthly', 'elec_reactive_monthly',
  'gas_prod_price_m3', 'gas_prod_fixed_daily',
  'gas_heat_price_m3', 'gas_heat_fixed_monthly',
  'water_fixed_monthly', 'water_price_m3', 'worker_hourly_rate',
];

export const OPTIONAL_COST_SETTING_FIELDS = [
  'elec_invoice_kwh',
  'elec_invoice_net',
  'gas_prod_invoice_kwh',
  'gas_prod_invoice_net',
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
  const requiredInvalid = COST_SETTING_FIELDS.filter(field => {
    const value = settings[field];
    return typeof value !== 'number' || !Number.isFinite(value) || value < 0;
  });
  const optionalInvalid = OPTIONAL_COST_SETTING_FIELDS.filter(field => {
    const value = settings[field];
    return value != null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0);
  });
  return [...requiredInvalid, ...optionalInvalid];
}

export function electricityMonthlyCost(usageKwh, settings = {}) {
  const usage = Number.isFinite(usageKwh) && usageKwh >= 0 ? usageKwh : 0;
  return usage * (settings.elec_price_kwh || 0)
    + electricityMonthlyFees(settings);
}

export function electricityMonthlyFees(settings = {}) {
  return (settings.elec_fixed_monthly || 0)
    + (settings.elec_power_fee_monthly || 0)
    + (settings.elec_reactive_monthly || 0);
}

export function gasProductionMonthlyCost(usageM3, settings = {}, dayCount = 0) {
  const invoiceNet = settings.gas_prod_invoice_net;
  if (typeof invoiceNet === 'number' && Number.isFinite(invoiceNet) && invoiceNet >= 0) {
    return invoiceNet;
  }
  const usage = Number.isFinite(usageM3) && usageM3 >= 0 ? usageM3 : 0;
  return usage * (settings.gas_prod_price_m3 || 0)
    + (settings.gas_prod_fixed_daily || 0) * Math.max(0, dayCount || 0);
}

export function gasProductionDailyCost(usageM3, totalUsageM3, settings = {}, dayCount = 0) {
  const usage = Number.isFinite(usageM3) && usageM3 >= 0 ? usageM3 : 0;
  const totalUsage = Number.isFinite(totalUsageM3) && totalUsageM3 > 0 ? totalUsageM3 : 0;
  const days = Math.max(0, dayCount || 0);
  const invoiceNet = settings.gas_prod_invoice_net;

  if (typeof invoiceNet === 'number' && Number.isFinite(invoiceNet) && invoiceNet >= 0 && days > 0) {
    if (totalUsage === 0) return invoiceNet / days;
    const fixedTotal = Math.min(invoiceNet, (settings.gas_prod_fixed_daily || 0) * days);
    const variableTotal = invoiceNet - fixedTotal;
    return fixedTotal / days + (usage / totalUsage) * variableTotal;
  }

  return usage * (settings.gas_prod_price_m3 || 0)
    + (settings.gas_prod_fixed_daily || 0);
}

export function electricityReconciliation(settings = {}, calculatedKwh = 0, calculatedNet = 0) {
  const invoiceKwh = settings.elec_invoice_kwh;
  const invoiceNet = settings.elec_invoice_net;
  const hasInvoiceKwh = typeof invoiceKwh === 'number' && Number.isFinite(invoiceKwh) && invoiceKwh >= 0;
  const hasInvoiceNet = typeof invoiceNet === 'number' && Number.isFinite(invoiceNet) && invoiceNet >= 0;
  const usageDifference = hasInvoiceKwh ? invoiceKwh - calculatedKwh : null;
  const costDifference = hasInvoiceNet ? invoiceNet - calculatedNet : null;

  return {
    hasInvoiceKwh,
    hasInvoiceNet,
    calculatedKwh,
    calculatedNet,
    invoiceKwh: hasInvoiceKwh ? invoiceKwh : null,
    invoiceNet: hasInvoiceNet ? invoiceNet : null,
    usageDifference,
    usageDifferencePct: hasInvoiceKwh && invoiceKwh > 0 ? (usageDifference / invoiceKwh) * 100 : null,
    costDifference,
    costDifferencePct: hasInvoiceNet && invoiceNet > 0 ? (costDifference / invoiceNet) * 100 : null,
  };
}

export function gasProductionReconciliation(settings = {}, calculatedM3 = 0, calculatedNet = 0, dayCount = 0) {
  const invoiceKwh = settings.gas_prod_invoice_kwh;
  const invoiceNet = settings.gas_prod_invoice_net;
  const hasInvoiceKwh = typeof invoiceKwh === 'number' && Number.isFinite(invoiceKwh) && invoiceKwh >= 0;
  const hasInvoiceNet = typeof invoiceNet === 'number' && Number.isFinite(invoiceNet) && invoiceNet >= 0;
  const hasCalculatedM3 = typeof calculatedM3 === 'number' && Number.isFinite(calculatedM3) && calculatedM3 > 0;
  const fixedNet = (settings.gas_prod_fixed_daily || 0) * Math.max(0, dayCount || 0);
  const costDifference = hasInvoiceNet ? invoiceNet - calculatedNet : null;

  return {
    hasInvoiceKwh,
    hasInvoiceNet,
    calculatedM3,
    calculatedNet,
    invoiceKwh: hasInvoiceKwh ? invoiceKwh : null,
    invoiceNet: hasInvoiceNet ? invoiceNet : null,
    impliedKwhPerM3: hasInvoiceKwh && hasCalculatedM3 ? invoiceKwh / calculatedM3 : null,
    invoiceDerivedPriceM3: hasInvoiceNet && hasCalculatedM3 ? Math.max(0, invoiceNet - fixedNet) / calculatedM3 : null,
    costDifference,
    costDifferencePct: hasInvoiceNet && invoiceNet > 0 ? (costDifference / invoiceNet) * 100 : null,
  };
}

export function productionThroughput(totalKg, clockHours) {
  if (!Number.isFinite(totalKg) || !Number.isFinite(clockHours) || totalKg <= 0 || clockHours <= 0) return 0;
  return totalKg / clockHours;
}

export function dailyPerformanceMetrics({ kgZd1 = 0, kgZd2 = 0, kgWashers = 0, timelineDay = {} }) {
  const roles = timelineDay.roles || {};
  const zd2WashersKg = kgZd2 + kgWashers;
  const totalKg = kgZd1 + zd2WashersKg;
  const zd1LaborHours = roles.ZD1?.hrs || 0;
  const zd2LaborHours = roles.ZD2?.hrs || 0;
  const driverLaborHours = roles.Kierowcy?.hrs || 0;
  const totalLaborHours = zd1LaborHours + zd2LaborHours + driverLaborHours;
  const productionClockHourCount = timelineDay.productionClockHours?.size || 0;

  return {
    zd2WashersKg,
    totalKg,
    zd1LaborHours,
    zd2LaborHours,
    driverLaborHours,
    totalLaborHours,
    productionClockHourCount,
    zd1KgPerLaborHour: zd1LaborHours > 0 ? kgZd1 / zd1LaborHours : 0,
    zd2WashersKgPerLaborHour: zd2LaborHours > 0 ? zd2WashersKg / zd2LaborHours : 0,
    overallKgPerLaborHour: totalLaborHours > 0 ? totalKg / totalLaborHours : 0,
    plantThroughputKgPerHour: productionThroughput(totalKg, productionClockHourCount),
  };
}

export function buildTimelineStats(timelineEntries, { workingMap, startFor, employeeBuckets }) {
  const stats = {};

  const bucketForGroup = groupName => {
    const normalized = String(groupName || '').replace(/\s+/g, '').toUpperCase();
    if (normalized.startsWith('ZD1')) return 'ZD1';
    if (normalized.startsWith('ZD2')) return 'ZD2';
    if (normalized.includes('KIEROW')) return 'Kierowcy';
    return null;
  };

  (timelineEntries || []).forEach(entry => {
    if (!workingMap[`${entry.employee_id}_${entry.entry_date}`]) return;
    if (!stats[entry.entry_date]) {
      stats[entry.entry_date] = {
        productionClockHours: new Set(),
        roles: {
          ZD1: { hrs: 0, emp: new Set() },
          ZD2: { hrs: 0, emp: new Set() },
          Kierowcy: { hrs: 0, emp: new Set() },
        },
      };
    }

    const startHour = startFor(entry.employee_id, entry.entry_date);
    const firstBreakHour = Math.floor(startHour + 3);
    const secondBreakHour = Math.floor(startHour + 6);
    const weight = entry.hour === firstBreakHour || entry.hour === secondBreakHour ? 0.75 : 1;
    // Faktycznie malowane stanowisko decyduje o dziale. Grupa pracownika jest
    // wyłącznie zgodnością wsteczną dla starszych odpowiedzi RPC bez grupy roli.
    const bucket = bucketForGroup(entry.role_group_name)
      || (entry.role === 'K' ? 'Kierowcy' : null)
      || employeeBuckets[entry.employee_id]
      || null;

    if (bucket && stats[entry.entry_date].roles[bucket]) {
      stats[entry.entry_date].roles[bucket].hrs += weight;
      stats[entry.entry_date].roles[bucket].emp.add(entry.employee_id);
      if (bucket === 'ZD1' || bucket === 'ZD2') {
        const clockHour = Number(entry.hour);
        if (Number.isFinite(clockHour)) stats[entry.entry_date].productionClockHours.add(clockHour);
      }
    }
  });

  return stats;
}
