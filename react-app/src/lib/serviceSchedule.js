export const SERVICE_WEEKDAYS = [1, 2, 3, 4, 5];
export const SERVICE_SCHEDULE_MODES = ['inherit', 'custom', 'disabled'];
export const SERVICE_PRESETS = {
  monThu: [1, 4],
  tueFri: [2, 5],
  tueOnly: [2],
  friBiweekly: [5],
};

const LEGACY_DAYS = {
  daily: [1, 2, 3, 4, 5],
  mwf: [1, 3, 5],
  tth: [2, 4],
  other: [],
};

function parseDateKey(value) {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function mondayKey(value = new Date()) {
  const date = parseDateKey(value);
  if (!date) return null;
  const isoDay = date.getDay() || 7;
  date.setDate(date.getDate() - (isoDay - 1));
  return formatDateKey(date);
}

export function normalizeServiceRules(rules = [], fallbackAnchor = mondayKey()) {
  const byDay = new Map();
  (Array.isArray(rules) ? rules : []).forEach(raw => {
    const weekday = Number(raw?.weekday);
    const intervalWeeks = Number(raw?.interval_weeks ?? 1);
    const anchorWeek = mondayKey(raw?.anchor_week || fallbackAnchor);
    if (!SERVICE_WEEKDAYS.includes(weekday) || ![1, 2].includes(intervalWeeks) || !anchorWeek) return;
    byDay.set(weekday, {
      weekday,
      interval_weeks: intervalWeeks,
      anchor_week: anchorWeek,
    });
  });
  return [...byDay.values()].sort((a, b) => a.weekday - b.weekday);
}

export function legacyScheduleRules(schedule = 'other', anchorWeek = '2026-01-05') {
  return (LEGACY_DAYS[schedule] || []).map(weekday => ({
    weekday,
    interval_weeks: 1,
    anchor_week: mondayKey(anchorWeek),
  }));
}

export function effectiveRouteServiceRules(route) {
  const explicitRules = normalizeServiceRules(route?.service_rules);
  return explicitRules.length ? explicitRules : legacyScheduleRules(route?.schedule);
}

export function effectiveServiceRules(client, routes = []) {
  const mode = SERVICE_SCHEDULE_MODES.includes(client?.service_schedule_mode)
    ? client.service_schedule_mode
    : 'inherit';
  if (mode === 'disabled') return [];
  if (mode === 'custom') return normalizeServiceRules(client?.service_rules);

  const route = routes.find(item => Number(item.id) === Number(client?.route_id));
  return effectiveRouteServiceRules(route);
}

export function isEveryWorkdayService(rules) {
  const normalized = normalizeServiceRules(rules);
  return normalized.length === SERVICE_WEEKDAYS.length
    && normalized.every((rule, index) => (
      rule.weekday === SERVICE_WEEKDAYS[index] && rule.interval_weeks === 1
    ));
}

export function isRuleScheduledOnDate(rule, value) {
  const date = parseDateKey(value);
  const anchor = parseDateKey(rule?.anchor_week);
  const weekday = Number(rule?.weekday);
  const intervalWeeks = Number(rule?.interval_weeks || 1);
  if (!date || !anchor || !SERVICE_WEEKDAYS.includes(weekday) || intervalWeeks < 1) return false;
  const isoDay = date.getDay() || 7;
  if (isoDay !== weekday) return false;
  const weeksSinceAnchor = Math.floor((date.getTime() - anchor.getTime()) / (7 * 86400000));
  return weeksSinceAnchor >= 0 && weeksSinceAnchor % intervalWeeks === 0;
}

export function isClientScheduledOnDate(client, routes, value) {
  return effectiveServiceRules(client, routes).some(rule => isRuleScheduledOnDate(rule, value));
}

export function nextServiceSlot(rules, weekKey, arrivalDay) {
  const monday = parseDateKey(mondayKey(weekKey));
  const day = Number(arrivalDay);
  if (!monday || !SERVICE_WEEKDAYS.includes(day)) return null;
  const normalized = normalizeServiceRules(rules, mondayKey(monday));
  if (!normalized.length) return null;

  const arrival = new Date(monday);
  arrival.setDate(arrival.getDate() + day - 1);
  for (let offset = 1; offset <= 35; offset += 1) {
    const candidate = new Date(arrival);
    candidate.setDate(candidate.getDate() + offset);
    const candidateKey = formatDateKey(candidate);
    if (!normalized.some(rule => isRuleScheduledOnDate(rule, candidateKey))) continue;
    const candidateMonday = parseDateKey(mondayKey(candidate));
    const pickWeek = Math.round((candidateMonday.getTime() - monday.getTime()) / (7 * 86400000));
    return { pickDay: candidate.getDay() || 7, pickWeek };
  }
  return null;
}

export function scheduleCodeForRules(rules) {
  const normalized = normalizeServiceRules(rules);
  if (normalized.some(rule => rule.interval_weeks !== 1)) return 'other';
  const days = normalized.map(rule => rule.weekday).join(',');
  if (days === '1,2,3,4,5') return 'daily';
  if (days === '1,3,5') return 'mwf';
  if (days === '2,4') return 'tth';
  return 'other';
}

export function rulesForPreset(preset, anchorWeek = mondayKey()) {
  const weekdays = SERVICE_PRESETS[preset] || [];
  const intervalWeeks = preset === 'friBiweekly' ? 2 : 1;
  return weekdays.map(weekday => ({
    weekday,
    interval_weeks: intervalWeeks,
    anchor_week: mondayKey(anchorWeek),
  }));
}
