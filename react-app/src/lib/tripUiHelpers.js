import { formatWeekKey } from './dateUtils';

export function ymd(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseRouteIds(routesStr) {
  return new Set((routesStr || '').split(',').map(s => Number(s.trim())).filter(Boolean));
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

export function workDateOptions(days = 14) {
  const opts = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const wd = (d.getDay() + 6) % 7 + 1;
    if (wd > 5) continue;
    opts.push({
      value: ymd(d),
      label: d.toLocaleDateString('pl-PL', { weekday: 'short', day: '2-digit', month: '2-digit' }),
    });
  }
  return opts;
}

export function nextWorkDateAfter(dateStr) {
  const d = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
  d.setDate(d.getDate() + 1);
  for (let i = 0; i < 10; i += 1) {
    const wd = (d.getDay() + 6) % 7 + 1;
    if (wd <= 5) return ymd(d);
    d.setDate(d.getDate() + 1);
  }
  return ymd(d);
}

export function formatKg(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return Number(n.toFixed(1)).toLocaleString('pl-PL');
}

export function trolleyLabel(count) {
  const n = Number(count);
  if (!Number.isFinite(n)) return '0 wózków';
  if (n === 1) return '1 wózek';
  if (n >= 2 && n <= 4) return `${n} wózki`;
  return `${n} wózków`;
}

export function daysSinceDate(dateStr) {
  if (!dateStr) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const then = new Date(dateStr);
  then.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today - then) / (1000 * 60 * 60 * 24)));
}

export function daysAtClientLabel(days) {
  if (days === 0) return 'zostawiony dzisiaj';
  if (days === 1) return 'zostawiony wczoraj';
  return `zostawiony ${days} dni temu`;
}

export function describeTrolleyActions(deliverPrompt) {
  if (!deliverPrompt) return '';
  const leaving = deliverPrompt.trolleys.filter(t => t.choice === 'leave').map(t => t.trolleyNo);
  const returning = deliverPrompt.trolleys.filter(t => t.choice === 'return').map(t => t.trolleyNo);
  const pickedUpOld = deliverPrompt.oldTrolleys.filter(t => t.take).map(t => t.trolleyNo);
  const parts = [];
  if (returning.length) parts.push(`wózek ${returning.join(', ')} wraca z kierowcą`);
  if (leaving.length) parts.push(`wózek ${leaving.join(', ')} zostaje u klienta`);
  if (pickedUpOld.length) parts.push(`zabrano też wcześniej zostawiony wózek ${pickedUpOld.join(', ')}`);
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
  const dt = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
  const day = Math.min(5, Math.max(1, (dt.getDay() + 6) % 7 + 1));
  const monday = new Date(dt);
  monday.setDate(dt.getDate() - (day - 1));
  return { arrDay: day, weekKey: formatWeekKey(monday) };
}

export function routeNamesForTrip(sourceTrip, routeMap = {}) {
  const ids = [...parseRouteIds(sourceTrip?.routes)];
  if (ids.length === 0) return 'Wszystkie trasy';
  return ids.map(id => {
    const info = routeMap[id];
    return info ? `T${info.num}` : `T${id}`;
  }).join(', ');
}

export function buildVirtualPlannedTrips({ entries, allTrips, horizonDays = 14, tripDate = null }) {
  const horizonSet = new Set();
  for (let i = 0; i < horizonDays; i += 1) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    const wd = (d.getDay() + 6) % 7 + 1;
    if (wd <= 5) horizonSet.add(ymd(d));
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

  const coveredByDate = new Map();
  allTrips.forEach(trip => {
    if (!trip.trip_date) return;
    if (!coveredByDate.has(trip.trip_date)) coveredByDate.set(trip.trip_date, new Set());
    parseRouteIds(trip.routes).forEach(id => coveredByDate.get(trip.trip_date).add(id));
  });

  const virtualPlannedTrips = [];
  [...plannedByDate.keys()].sort().forEach(ds => {
    const covered = coveredByDate.get(ds) || new Set();
    [...plannedByDate.get(ds)].sort((a, b) => a - b).forEach(routeId => {
      if (covered.has(routeId)) return;
      virtualPlannedTrips.push({
        id: `virtual_${ds}_${routeId}`,
        status: 'planned',
        trip_date: ds,
        driver_name: null,
        driver_id: null,
        car: null,
        routes: String(routeId),
        isVirtual: true,
        board_status: 'planning',
        stops_total: 0,
        stops_completed: 0,
      });
    });
  });

  return virtualPlannedTrips;
}
