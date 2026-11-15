import i18n from '../i18n/index.js';
import { currentLocale, formatWeekKey, operationalDate, operationalYmd } from './dateUtils.js';
import { parseRouteIds } from './routeIds.js';

export { parseRouteIds };

export function ymd(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseExtraClients(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Aktywny kurs w fazie planowania kierowcy — toleruje różnicę daty kalendarzowej vs operacyjnej. */
export function findDriverPlannedTrip(trips = [], userId, userName = null) {
  if (!userId && !userName) return null;
  const preferredDates = new Set([operationalYmd(), ymd()]);
  const mine = trips.filter(trip => {
    if (trip.status !== 'planned') return false;
    if (userId && trip.driver_id != null && String(trip.driver_id) === String(userId)) return true;
    return Boolean(userName && trip.driver_name === userName);
  });
  if (!mine.length) return null;
  const preferred = mine.find(trip => preferredDates.has(trip.trip_date));
  if (preferred) return preferred;
  return [...mine].sort((a, b) => `${b.trip_date}`.localeCompare(`${a.trip_date}`))[0];
}

/** Numer kolejności klienta na trasie (sort_order), nie pozycja 1..n w kursie. */
export function stopDisplayOrder(stop, clients = []) {
  if (!stop) return null;
  const client = clients.find(item => (
    (stop.client_id && item.id === stop.client_id) || item.name === stop.client_name
  ));
  return client?.sort_order ?? stop.position ?? null;
}

export function workDateOptions(days = 14) {
  const opts = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const wd = (d.getDay() + 6) % 7 + 1;
    if (wd > 6) continue;
    opts.push({
      value: ymd(d),
      label: d.toLocaleDateString(currentLocale(), { weekday: 'short', day: '2-digit', month: '2-digit' }),
    });
  }
  return opts;
}

export function nextWorkDateAfter(dateStr) {
  const d = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
  d.setDate(d.getDate() + 1);
  for (let i = 0; i < 10; i += 1) {
    const wd = (d.getDay() + 6) % 7 + 1;
    if (wd <= 6) return ymd(d);
    d.setDate(d.getDate() + 1);
  }
  return ymd(d);
}

export function formatKg(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return Number(n.toFixed(1)).toLocaleString(currentLocale());
}

export function trolleyLabel(count) {
  const n = Number(count);
  if (!Number.isFinite(n)) return i18n.t('common.helpers.trolley', { count: 0 });
  return i18n.t('common.helpers.trolley', { count: n });
}

export function daysSinceDate(dateStr) {
  if (!dateStr) return 0;
  const today = operationalDate();
  const then = new Date(dateStr);
  then.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today - then) / (1000 * 60 * 60 * 24)));
}

export function daysAtClientLabel(days) {
  if (days === 0) return i18n.t('common.helpers.leftToday');
  if (days === 1) return i18n.t('common.helpers.leftYesterday');
  return i18n.t('common.helpers.leftDaysAgo', { count: days });
}

export function describeTrolleyActions(deliverPrompt) {
  if (!deliverPrompt) return '';
  const leaving = deliverPrompt.trolleys.filter(t => t.choice === 'leave').map(t => t.trolleyNo);
  const returning = deliverPrompt.trolleys.filter(t => t.choice === 'return').map(t => t.trolleyNo);
  const pickedUpOld = (deliverPrompt.oldTrolleys || []).filter(t => t.take).map(t => t.trolleyNo);
  const parts = [];
  if (returning.length) parts.push(i18n.t('common.helpers.trolleyReturns', { list: returning.join(', ') }));
  if (leaving.length) parts.push(i18n.t('common.helpers.trolleyStays', { list: leaving.join(', ') }));
  if (pickedUpOld.length) parts.push(i18n.t('common.helpers.oldTrolleyTaken', { list: pickedUpOld.join(', ') }));
  return parts.join('; ');
}

function parseMonday(weekKey) {
  const [y, m, d] = weekKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function pickupDateStr(entry) {
  const wk = entry.pick_week_key || entry.week_key;
  if (!wk) return null;
  const dt = parseMonday(wk);
  dt.setDate(dt.getDate() + ((entry.pick_day || 1) - 1));
  return ymd(dt);
}

export function arrivalDateStr(entry) {
  if (!entry.week_key) return null;
  const dt = parseMonday(entry.week_key);
  dt.setDate(dt.getDate() + ((entry.arr_day || 1) - 1));
  return ymd(dt);
}

export function tripDateInfo(dateStr) {
  const dt = dateStr ? new Date(`${dateStr}T00:00:00`) : operationalDate();
  const day = Math.min(6, Math.max(1, (dt.getDay() + 6) % 7 + 1));
  const monday = new Date(dt);
  monday.setDate(dt.getDate() - (day - 1));
  return { arrDay: day, weekKey: formatWeekKey(monday) };
}

export function routeNamesForTrip(sourceTrip, routeMap = {}) {
  const ids = [...parseRouteIds(sourceTrip?.routes)];
  if (ids.length === 0) return i18n.t('common.helpers.allRoutes');
  return ids.map(id => {
    const info = routeMap[id];
    return info ? `T${info.num}` : `T${id}`;
  }).join(', ');
}

export function buildVirtualPlannedTrips({
  entries,
  allTrips,
  routePlanTrips = [],
  horizonDays = 14,
  tripDate = null,
}) {
  const horizonSet = new Set();
  const anchor = operationalDate();
  for (let i = 0; i < horizonDays; i += 1) {
    const d = new Date(anchor);
    d.setDate(anchor.getDate() + i);
    const wd = (d.getDay() + 6) % 7 + 1;
    if (wd <= 6) horizonSet.add(ymd(d));
  }

  const plannedByDate = new Map();
  entries.forEach(entry => {
    if (!entry.route_id) return;
    [pickupDateStr(entry), arrivalDateStr(entry)].forEach(ds => {
      if (!ds || !horizonSet.has(ds)) return;
      if (tripDate && ds !== tripDate) return;
      if (!plannedByDate.has(ds)) plannedByDate.set(ds, new Set());
      plannedByDate.get(ds).add(entry.route_id);
    });
  });

  routePlanTrips.forEach(assignment => {
    const ds = assignment?.trip_date;
    if (!ds || !horizonSet.has(ds) || (tripDate && ds !== tripDate)) return;
    if (!plannedByDate.has(ds)) plannedByDate.set(ds, new Set());
    parseRouteIds(assignment.routes).forEach(routeId => plannedByDate.get(ds).add(routeId));
  });

  const coveredByDate = new Map();
  allTrips.forEach(trip => {
    if (!trip.trip_date) return;
    if (!coveredByDate.has(trip.trip_date)) coveredByDate.set(trip.trip_date, new Set());
    parseRouteIds(trip.routes).forEach(id => coveredByDate.get(trip.trip_date).add(id));
  });

  const routePlanByDateAndRoute = new Map();
  routePlanTrips.forEach(assignment => {
    if (!assignment?.trip_date) return;
    parseRouteIds(assignment.routes).forEach(routeId => {
      routePlanByDateAndRoute.set(`${assignment.trip_date}:${routeId}`, assignment);
    });
  });

  const virtualPlannedTrips = [];
  [...plannedByDate.keys()].sort().forEach(ds => {
    const covered = coveredByDate.get(ds) || new Set();
    [...plannedByDate.get(ds)].sort((a, b) => a - b).forEach(routeId => {
      if (covered.has(routeId)) return;
      const routePlanAssignment = routePlanByDateAndRoute.get(`${ds}:${routeId}`);
      const hasDriver = Boolean(routePlanAssignment?.driver_id);
      virtualPlannedTrips.push({
        id: `virtual_${ds}_${routeId}`,
        status: 'planned',
        trip_date: ds,
        driver_name: routePlanAssignment?.driver_name || null,
        driver_id: routePlanAssignment?.driver_id || null,
        car: routePlanAssignment?.car || null,
        routes: String(routeId),
        planned_start: routePlanAssignment?.planned_start || null,
        plan_assignment_id: routePlanAssignment?.id || null,
        isVirtual: true,
        board_status: hasDriver ? 'ready' : 'planning',
        stops_total: 0,
        stops_completed: 0,
      });
    });
  });

  return virtualPlannedTrips;
}
