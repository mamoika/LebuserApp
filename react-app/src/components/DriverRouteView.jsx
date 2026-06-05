import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../hooks/useAppData';
import { logAction } from '../lib/logger';
import { toastError, toastSuccess } from '../lib/toast';
import { routeBadgeStyle } from '../lib/visualSystem';
import { getCurrentMonday, formatWeekKey } from '../lib/dateUtils';
import { VEHICLES, VEHICLE_LABELS, vehicleEndColumn, DRIVER_CARS_KEY } from '../lib/vehicles';
import { AddEntryModal, ViewEditEntryModal } from './modals/EntryModals';

/* ── helpery dat ── */
function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function parseMonday(weekKey) {
  const [y, m, d] = weekKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function pickupDateStr(e) {
  const wk = e.pick_week_key || e.week_key;
  if (!wk) return null;
  const dt = parseMonday(wk);
  dt.setDate(dt.getDate() + ((e.pick_day || 1) - 1));
  return ymd(dt);
}
function arrivalDateStr(e) {
  if (!e.week_key) return null;
  const dt = parseMonday(e.week_key);
  dt.setDate(dt.getDate() + ((e.arr_day || 1) - 1));
  return ymd(dt);
}
function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtDuration(startIso, endIso) {
  if (!startIso) return '—';
  const end = endIso ? new Date(endIso) : new Date();
  const mins = Math.max(0, Math.round((end - new Date(startIso)) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}
function parseRouteIds(routesStr) {
  return new Set((routesStr || '').split(',').map(s => Number(s.trim())).filter(Boolean));
}
const sumWeight = arr => arr.reduce((s, e) => s + (parseFloat(e.weight) || 0), 0);
// Domyślny dzień odbioru dla nowego przyjazdu (jak w harmonogramie, wariant 'other')
function defaultPick(d) {
  if (d <= 3) return { pickDay: d + 2, pickWeek: 0 };
  if (d === 4) return { pickDay: 2, pickWeek: 1 };
  return { pickDay: 1, pickWeek: 1 };
}
function defaultPickForSchedule(arrDay, schedule = 'other') {
  const d = Number(arrDay);
  if (schedule === 'daily') {
    if (d <= 4) return { pickDay: d + 1, pickWeek: 0 };
    return { pickDay: 1, pickWeek: 1 };
  }
  if (schedule === 'mwf') {
    if (d <= 1) return { pickDay: 3, pickWeek: 0 };
    if (d <= 3) return { pickDay: 5, pickWeek: 0 };
    return { pickDay: 1, pickWeek: 1 };
  }
  if (schedule === 'tth') {
    if (d <= 2) return { pickDay: 4, pickWeek: 0 };
    return { pickDay: 2, pickWeek: 1 };
  }
  return defaultPick(d);
}
function nextWeekKey(wk) {
  const dt = parseMonday(wk);
  dt.setDate(dt.getDate() + 7);
  return formatWeekKey(dt);
}

const pfLabel = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)' };
// Liczniki "zatwierdzone bez zapisu do kosztów" — lista id tras w app_settings.
const KM_RESOLVED_KEY = 'km_resolved_trips';

function trolleyLabel(count) {
  const n = Number(count);
  if (!Number.isFinite(n)) return '0 wózków';
  if (n === 1) return '1 wózek';
  if (n >= 2 && n <= 4) return `${n} wózki`;
  return `${n} wózków`;
}

function parseExtraClients(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function tripDateInfo(dateStr) {
  const dt = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
  const day = Math.min(5, Math.max(1, (dt.getDay() + 6) % 7 + 1));
  const monday = new Date(dt);
  monday.setDate(dt.getDate() - (day - 1));
  return { arrDay: day, weekKey: formatWeekKey(monday) };
}

function workDateOptions(days = 14) {
  const opts = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
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

export default function DriverRouteView({ manageMode = false }) {
  const { user, isAdmin, canViewAdminData, sessionToken } = useAuth();
  const { entries, allRoutes, clients, loading, refetch } = useAppData();

  const [trip, setTrip] = useState(null);
  const [plannedTrip, setPlannedTrip] = useState(null); // zaplanowana przez admina trasa kierowcy (jeszcze nie ruszona)
  const [allTrips, setAllTrips] = useState([]);
  const [driverOptions, setDriverOptions] = useState([]); // lista kierowców do przypisania (admin)
  const [assignTrip, setAssignTrip] = useState(null); // wirtualna trasa, którą admin przypisuje
  const [assignDriverId, setAssignDriverId] = useState('');
  const [assignCar, setAssignCar] = useState(VEHICLES[0].key);
  const [addStopOpen, setAddStopOpen] = useState(false); // panel "dorzuć przystanek" w podglądzie trasy
  const [kmResolvedIds, setKmResolvedIds] = useState([]); // trasy z licznikiem zatwierdzonym bez wpisu do kosztów
  const [dailyCosts, setDailyCosts] = useState([]);
  const [, setClock] = useState(Date.now());
  const [tripLoading, setTripLoading] = useState(true);
  const [defaultCar, setDefaultCar] = useState(null);
  const [selectedCar, setSelectedCar] = useState(VEHICLES[0].key);
  const [selectedRoutes, setSelectedRoutes] = useState(() => parseRouteIds(user?.routes));
  const [busy, setBusy] = useState(false);
  // W trybie zarządzania (osobna zakładka) zawsze startujemy od dashboardu tras.
  // Na "Mojej trasie" admin — jak każdy — domyślnie widzi swój bieżący widok.
  const [routeView, setRouteView] = useState(manageMode ? 'history' : 'current');
  const [detailTrip, setDetailTrip] = useState(null); // trasa otwarta do podglądu progresu (read-only)

  // Filtry dla admina w historii
  const [filterDriver, setFilterDriver] = useState('');
  const [filterCar, setFilterCar] = useState('');
  const [filterRoute, setFilterRoute] = useState('');

  const [endOpen, setEndOpen] = useState(false);
  const [endKm, setEndKm] = useState('');
  const [changeCarOpen, setChangeCarOpen] = useState(false);
  const [changeCarTarget, setChangeCarTarget] = useState(null);
  const [changeCarKm, setChangeCarKm] = useState('');
  const [kmEditTrip, setKmEditTrip] = useState(null); // trasa, której licznik admin zatwierdza/koryguje
  const [kmEditValue, setKmEditValue] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [planPickupOpen, setPlanPickupOpen] = useState(false);
  const [planPickupDraft, setPlanPickupDraft] = useState({});
  const [addEntryFor, setAddEntryFor] = useState(null); // nazwa klienta, dla którego otwieramy AddEntryModal
  const [addDirtyTrip, setAddDirtyTrip] = useState(null); // trasa admina, do której dorzucamy odbiór brudnego
  const [viewEntry, setViewEntry] = useState(null); // wpis do podglądu/edycji w ViewEditEntryModal
  const [draft, setDraft] = useState({}); // { clientKey: { note } }
  const [noteEdit, setNoteEdit] = useState({}); // { clientName: value } — notatka klienta w trakcie edycji

  const today = ymd(new Date());
  const weekKey = formatWeekKey(getCurrentMonday());
  const todayArrDay = Math.min(5, Math.max(1, (new Date().getDay() + 6) % 7 + 1)); // 1=Pn…5=Pt
  const routeMap = Object.fromEntries(allRoutes.map((r, i) => [r.id, { name: r.name, num: i + 1 }]));

  const loadTrips = useCallback(async () => {
    let q = supabase.from('driver_trips').select('*').order('started_at', { ascending: false }).limit(60);
    if (!canViewAdminData) q = q.eq('driver_id', user?.id);
    const [{ data, error }, { data: costs }] = await Promise.all([
      q,
      supabase.from('daily_costs')
        .select('entry_date, fiat_end, isuzu_end, merc_end, iveco_end')
        .order('entry_date', { ascending: false })
        .limit(180),
    ]);
    if (error) {
      toastError('Błąd pobierania tras: ' + error.message);
      setAllTrips([]);
      return [];
    }
    const trips = data || [];
    setAllTrips(trips);
    setDailyCosts(costs || []);
    return trips;
  }, [canViewAdminData, user?.id]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setTripLoading(true);
      const [trips, { data: settings }] = await Promise.all([
        loadTrips(),
        supabase.from('app_settings').select('key, value').in('key', [DRIVER_CARS_KEY, KM_RESOLVED_KEY]),
      ]);
      if (cancelled) return;
      const carsSetting = (settings || []).find(s => s.key === DRIVER_CARS_KEY)?.value;
      const resolved = (settings || []).find(s => s.key === KM_RESOLVED_KEY)?.value;
      setKmResolvedIds(Array.isArray(resolved) ? resolved : []);
      const ownToday = (trips || []).filter(t => t.driver_id === user?.id && t.trip_date === today);
      const startedTrip = ownToday.find(t => t.status === 'active') || ownToday.find(t => t.status === 'finished') || null;
      const plannedOwn = ownToday.find(t => t.status === 'planned') || null;
      setTrip(startedTrip);
      setPlannedTrip(plannedOwn);
      const car = carsSetting?.[user?.id] || null;
      setDefaultCar(car);
      if (startedTrip) setSelectedCar(startedTrip.car);
      else if (plannedOwn) { setSelectedCar(plannedOwn.car || car || VEHICLES[0].key); setSelectedRoutes(parseRouteIds(plannedOwn.routes)); }
      else if (car) setSelectedCar(car);
      setTripLoading(false);
    };
    if (user?.id) load();
    return () => { cancelled = true; };
  }, [user?.id, today, canViewAdminData, loadTrips]);

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60000);
    const channel = supabase.channel('driver-trips-route-view')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_trips' }, loadTrips)
      .subscribe();
    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [loadTrips]);

  // Przełączenie zakładki "Moja trasa" ↔ "Trasy na żywo" (zmiana manageMode
  // bez remountu) — czyścimy stan przejściowy, by widok nie był "zaklejony".
  useEffect(() => {
    setDetailTrip(null);
    setRouteView(manageMode ? 'history' : 'current');
  }, [manageMode]);

  // Lista kierowców do przypisywania planowanych tras (tylko panel zarządzania).
  useEffect(() => {
    if (!manageMode || !sessionToken) return;
    supabase.rpc('get_all_users', { p_session_token: sessionToken }).then(({ data }) => {
      setDriverOptions((data || []).filter(u => u.role === 'driver' || u.role === 'admin'));
    });
  }, [manageMode, sessionToken]);

  /* ── przystanki = klienci z ODBIOREM dziś (wg harmonogramu) ──
     Każdy taki wpis ma dziś 2 czynności kierowcy: odbiór czystego z pralni
     (done) i dostawę do klienta (delivered). Dodatkowo przy kliencie można
     dorzucić "przyjazd" brudnego (nowy wpis w grafiku). */
  const activeRouteIds = trip ? parseRouteIds(trip.routes) : selectedRoutes;
  const extraClients = parseExtraClients(trip?.extra_clients);
  const extraSet = new Set(extraClients);
  const includeEntry = e => activeRouteIds.size === 0 || activeRouteIds.has(e.route_id) || extraSet.has(e.client_name);
  const includeCleanEntryForCurrentTrip = e => {
    if (!includeEntry(e)) return false;
    // Po odebraniu z pralni punkt należy już do kierowcy z picked_by.
    // Dzięki temu przejęty punkt znika z pierwotnej trasy i nie psuje progresu.
    if (e.done && e.picked_by && e.picked_by !== user?.name) return false;
    return true;
  };

  const stopsMap = new Map();
  const ensureStop = (e) => {
    const key = e.client_name || '—';
    if (!stopsMap.has(key)) {
      stopsMap.set(key, { key, client_name: e.client_name, route_id: e.route_id, entries: [], dirtyEntries: [] });
    }
    const stop = stopsMap.get(key);
    if (!stop.route_id && e.route_id) stop.route_id = e.route_id;
    return stop;
  };

  entries.filter(includeCleanEntryForCurrentTrip).forEach(e => {
    if (pickupDateStr(e) !== today) return;
    ensureStop(e).entries.push(e);
  });
  entries.forEach(e => {
    if (arrivalDateStr(e) !== today) return;
    if (!includeEntry(e) && e.added_by !== user?.name) return;
    ensureStop(e).dirtyEntries.push(e);
  });
  const driverRouteIds = parseRouteIds(user?.routes);
  const stops = [...stopsMap.values()].sort((a, b) => {
    // Trasy kierowcy zawsze pierwsze
    const aOwn = driverRouteIds.has(a.route_id) ? 0 : 1;
    const bOwn = driverRouteIds.has(b.route_id) ? 0 : 1;
    if (aOwn !== bOwn) return aOwn - bOwn;
    return (a.route_id || 0) - (b.route_id || 0) || String(a.client_name).localeCompare(String(b.client_name), 'pl');
  });
  const pickedNotDeliveredStops = stops.filter(s =>
    (s.entries || []).some(e => e.done && e.picked_by === user?.name && !e.delivered)
  );
  const pickedNotDeliveredNames = pickedNotDeliveredStops.map(s => s.client_name).filter(Boolean);
  // Ekran startowy ma pokazywać tylko CZYSTE do rozwiezienia dziś (pick_day),
  // jeszcze nie dostarczone. Brudne (arr_day) nie należy do tego widoku.
  const previewStops = stops
    .map(s => ({ ...s, pendingClean: (s.entries || []).filter(e => !e.delivered) }))
    .filter(s => s.pendingClean.length > 0);
  // Trasa w toku: przystanek widoczny, gdy ma czyste do dowiezienia dla tego
  // kierowcy (entries po filtrze własności) LUB brudne dodane przez niego.
  // Przystanki w całości obsłużone przez innego kierowcę (jego czyste + jego
  // brudne) znikają — nowe brudne dodaje się dolnym przyciskiem.
  const visibleTripStops = stops.filter(s =>
    (s.entries || []).length > 0 ||
    (s.dirtyEntries || []).some(e => e.added_by === user?.name)
  );
  // Czy na trasie w toku cokolwiek zrobiono (odbiór z pralni lub dostawa przez
  // tego kierowcę). Steruje dostępnością „Anuluj trasę".
  const tripHasProgress = !!trip && stops.some(s =>
    (s.entries || []).some(e =>
      (e.done && e.picked_by === user?.name) ||
      (e.delivered && e.delivered_by === user?.name)
    )
  );

  // Kandydaci do dorzucenia: klienci z odbiorem dziś, których nie ma na liście.
  // Wzbogacamy o kg i typ (P/O), żeby kierowca widział to samo co na przystanku.
  const shownClients = new Set(stops.map(s => s.client_name));
  const candMap = new Map();
  entries.forEach(e => {
    if (pickupDateStr(e) === today && !e.done && !shownClients.has(e.client_name)) {
      if (!candMap.has(e.client_name)) candMap.set(e.client_name, { route_id: e.route_id, entries: [] });
      candMap.get(e.client_name).entries.push(e);
    }
  });
  const candidates = [...candMap.entries()].map(([client_name, v]) => ({
    client_name,
    route_id: v.route_id,
    kg: Number(sumWeight(v.entries).toFixed(1)),
    hasP: v.entries.some(e => (e.type || 'P') === 'P'),
    hasO: v.entries.some(e => e.type === 'O'),
  }));

  const getTripStops = (sourceTrip) => {
    if (!sourceTrip) return [];
    const routeIds = parseRouteIds(sourceTrip.routes);
    const extras = parseExtraClients(sourceTrip.extra_clients);
    const extrasSet = new Set(extras);
    const tripIncludesCleanEntry = (e) => {
      const includedByRoute = routeIds.size === 0 || routeIds.has(e.route_id) || extrasSet.has(e.client_name);
      if (!includedByRoute) return false;
      if (e.done && e.picked_by && e.picked_by !== sourceTrip.driver_name) return false;
      return true;
    };
    const map = new Map();
    const ensureTripStop = (e) => {
      const key = e.client_name || '—';
      if (!map.has(key)) map.set(key, { key, client_name: e.client_name, route_id: e.route_id, entries: [], dirtyEntries: [] });
      const stop = map.get(key);
      if (!stop.route_id && e.route_id) stop.route_id = e.route_id;
      return stop;
    };
    entries.forEach(e => {
      if (pickupDateStr(e) !== sourceTrip.trip_date) return;
      if (!tripIncludesCleanEntry(e)) return;
      ensureTripStop(e).entries.push(e);
    });
    entries.forEach(e => {
      if (arrivalDateStr(e) !== sourceTrip.trip_date) return;
      if (routeIds.size > 0 && !routeIds.has(e.route_id) && !extrasSet.has(e.client_name) && e.added_by !== sourceTrip.driver_name) return;
      ensureTripStop(e).dirtyEntries.push(e);
    });
    return [...map.values()].sort((a, b) => (a.route_id || 0) - (b.route_id || 0) || String(a.client_name).localeCompare(String(b.client_name), 'pl'));
  };

  const getPickedBaskets = (stop) => {
    const val = stop?.entries?.find(e => e.picked_baskets !== null && e.picked_baskets !== undefined)?.picked_baskets;
    const n = Number(val);
    return Number.isFinite(n) && n > 0 ? n : 1;
  };

  const stopPickedByCurrentUser = (stop) =>
    (stop?.entries?.length || 0) > 0 && stop.entries.every(e => e.done && e.picked_by === user?.name);

  const stopDeliveredByCurrentUser = (stop) =>
    (stop?.entries?.length || 0) > 0 && stop.entries.every(e => e.delivered && e.delivered_by === user?.name);

  const actionOwnerLabel = (stop, field) => {
    const names = [...new Set((stop?.entries || []).map(e => e[field]).filter(Boolean))];
    if (names.length === 0) return 'inny kierowca';
    if (names.length === 1) return names[0];
    return names.join(', ');
  };

  const getTripStats = (sourceTrip) => {
    const tripStops = getTripStops(sourceTrip);
    // Flow 1 — DOSTAWA CZYSTEGO: tylko przystanki z odbiorem czystego z pralni.
    // Postęp trasy liczymy WYŁĄCZNIE z tych punktów ("zawiezione czyste").
    const deliveryStops = tripStops.filter(s => s.entries.length > 0);
    const flat = deliveryStops.flatMap(s => s.entries);
    // Flow 2 — ODBIÓR BRUDNEGO: niezależny. Klient może mieć brudne bez dostawy,
    // brudne może być "z poza trasy" — liczy się do roboty kierowcy, który je dodał.
    const dirtyFlat = tripStops.flatMap(s => s.dirtyEntries || []);
    return {
      stops: deliveryStops.length,
      picked: deliveryStops.filter(s => s.entries.every(e => e.done)).length,
      delivered: deliveryStops.filter(s => s.entries.every(e => e.delivered)).length,
      kg: Number(sumWeight(flat).toFixed(1)),
      cleanTrolleys: deliveryStops.reduce((sum, s) => s.entries.every(e => e.done) ? sum + getPickedBaskets(s) : sum, 0),
      dirtyStops: tripStops.filter(s => (s.dirtyEntries?.length || 0) > 0).length,
      dirtyPickups: dirtyFlat.length,
      dirtyTrolleys: dirtyFlat.reduce((sum, e) => sum + (Number(e.trolleys) || 1), 0),
    };
  };

  const routeNamesForTrip = (sourceTrip) => {
    const ids = [...parseRouteIds(sourceTrip?.routes)];
    if (ids.length === 0) return 'Wszystkie trasy';
    return ids.map(id => {
      const info = routeMap[id];
      return info ? `T${info.num}` : `T${id}`;
    }).join(', ');
  };

  const clientByName = (name) => clients.find(c => c.name === name);
  const routeScheduleForId = (routeId) => allRoutes.find(r => Number(r.id) === Number(routeId))?.schedule || 'other';
  const plannedPickupDateFor = (dirtyDate, routeId) => {
    const dirty = tripDateInfo(dirtyDate);
    const rule = defaultPickForSchedule(dirty.arrDay, routeScheduleForId(routeId));
    const monday = parseMonday(rule.pickWeek ? nextWeekKey(dirty.weekKey) : dirty.weekKey);
    monday.setDate(monday.getDate() + (rule.pickDay - 1));
    return ymd(monday);
  };

  const distanceForTrip = (sourceTrip) => {
    if (!sourceTrip?.end_km) return null;
    const field = vehicleEndColumn(sourceTrip.car);
    const current = Number(sourceTrip.end_km);
    const prev = dailyCosts
      .filter(r => r.entry_date < sourceTrip.trip_date)
      .find(r => r[field] !== null && r[field] !== undefined && r[field] !== '');
    const prevVal = prev ? Number(String(prev[field]).replace(',', '.')) : NaN;
    if (!Number.isFinite(current) || !Number.isFinite(prevVal)) return null;
    const dist = current - prevVal;
    return dist >= 0 ? Number(dist.toFixed(1)) : null;
  };

  const tripKmApproval = (sourceTrip) => {
    if (!sourceTrip?.end_km) return { approved: false, currentValue: null, field: null };
    const field = vehicleEndColumn(sourceTrip.car);
    // Zatwierdzone bez zapisu do kosztów — uznajemy za załatwione (znika z oczekujących).
    if (kmResolvedIds.includes(sourceTrip.id)) return { approved: true, currentValue: null, field, resolvedNoCost: true };
    const row = dailyCosts.find(r => r.entry_date === sourceTrip.trip_date);
    const currentValue = row?.[field];
    const approved = String(currentValue ?? '').trim() === String(sourceTrip.end_km ?? '').trim();
    return { approved, currentValue, field };
  };

  // "Moja historia" = własne trasy zalogowanego (admin też może jeździć).
  // Panel zarządzania (wszystkie trasy) jest osobno, w zakładce "Trasy na żywo".
  const historyTrips = allTrips.filter(t => t.status === 'finished' && t.driver_id === user?.id).slice(0, 12);
  const pendingKmTrips = allTrips.filter(t => t.status === 'finished' && t.end_km && !tripKmApproval(t).approved);

  const draftVal = (key, field, fallback) => {
    const d = draft[key];
    if (d && d[field] !== undefined) return d[field];
    return fallback ?? '';
  };
  const setDraftVal = (key, field, value) =>
    setDraft(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));

  const toggleRoute = (id) => setSelectedRoutes(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const addExtraClient = async (clientName) => {
    if (!trip) return;
    const next = Array.from(new Set([...extraClients, clientName]));
    const { error } = await supabase.from('driver_trips').update({ extra_clients: JSON.stringify(next) }).eq('id', trip.id);
    if (error) { toastError('Błąd dodawania punktu: ' + error.message); return; }
    setTrip({ ...trip, extra_clients: JSON.stringify(next) });
    setAddOpen(false);
  };

  const attachClientToTrip = async (targetTrip, clientName) => {
    if (!targetTrip || !clientName) return;
    const extras = parseExtraClients(targetTrip.extra_clients);
    const next = Array.from(new Set([...extras, clientName]));
    const nextExtraClients = JSON.stringify(next);
    if (next.length !== extras.length) {
      const { error } = await supabase.from('driver_trips').update({ extra_clients: nextExtraClients }).eq('id', targetTrip.id);
      if (error) throw error;
    }
    const patchTrip = t => t && t.id === targetTrip.id ? { ...t, extra_clients: nextExtraClients } : t;
    setTrip(patchTrip);
    setDetailTrip(patchTrip);
  };

  /* ── akcje ── */
  const startTrip = async () => {
    try {
      setBusy(true);
      const payload = {
        car: selectedCar, routes: [...selectedRoutes].join(','),
        status: 'active', started_at: new Date().toISOString(),
      };
      // Jeśli admin zaplanował tę trasę — startujemy ją (update), zamiast tworzyć nową.
      const { data, error } = plannedTrip
        ? await supabase.from('driver_trips').update(payload).eq('id', plannedTrip.id).select().single()
        : await supabase.from('driver_trips').insert({ driver_id: user.id, driver_name: user.name, trip_date: today, ...payload }).select().single();
      if (error) throw error;
      setTrip(data);
      setPlannedTrip(null);
      await loadTrips();
      await logAction({ userName: user.name, action: 'trip_start', details: `Auto: ${VEHICLE_LABELS[selectedCar] || selectedCar}${plannedTrip ? ' (trasa zaplanowana)' : ''}` });
      toastSuccess('Trasa rozpoczęta');
    } catch (err) { toastError('Błąd startu trasy: ' + err.message); }
    finally { setBusy(false); }
  };

  // Przerzut (additive): admin dorzuca klienta do trasy innego kierowcy na żywo
  // przez extra_clients — bez zmian w schemacie. Klient pojawia się u kierowcy docelowego.
  const addClientToTrip = async (targetTrip, clientName) => {
    if (!isAdmin || !targetTrip) return;
    try {
      setBusy(true);
      await attachClientToTrip(targetTrip, clientName);
      await logAction({ userName: user.name, action: 'edited', details: `Dorzucono przystanek ${clientName} → trasa ${targetTrip.driver_name || 'kierowcy'} (${fmtDate(targetTrip.trip_date)})` });
      await loadTrips();
      setAddStopOpen(false);
      toastSuccess(`Dorzucono: ${clientName} → ${targetTrip.driver_name || 'kierowca'}`);
    } catch (err) { toastError('Błąd dorzucania: ' + err.message); }
    finally { setBusy(false); }
  };

  const addDirtyPickupToTrip = async (targetTrip, addedEntry) => {
    if (!isAdmin || !targetTrip || !addedEntry?.clientName) return;
    try {
      await attachClientToTrip(targetTrip, addedEntry.clientName);
      await logAction({
        userName: user.name,
        action: 'edited',
        details: `Dorzucono odbiór brudnego ${addedEntry.clientName} → trasa ${targetTrip.driver_name || 'kierowcy'} (${fmtDate(targetTrip.trip_date)})`,
      });
      await Promise.all([loadTrips(), refetch()]);
      toastSuccess(`Dodano odbiór brudnego: ${addedEntry.clientName}`);
    } catch (err) {
      toastError('Błąd dopinania odbioru do trasy: ' + err.message);
    } finally {
      setAddDirtyTrip(null);
    }
  };

  const openPlanPickup = () => {
    const dates = workDateOptions();
    const dirtyDate = dates[0]?.value || today;
    const firstClient = [...clients].filter(c => c.route_id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];
    const routeId = firstClient?.route_id || allRoutes[0]?.id || '';
    setPlanPickupDraft({
      dirtyDate,
      cleanDate: plannedPickupDateFor(dirtyDate, routeId),
      clientName: firstClient?.name || '',
      routeId: routeId ? String(routeId) : '',
      type: 'P',
      weight: '',
      trolleys: 1,
      urgent: false,
      driverId: '',
      car: '',
    });
    setPlanPickupOpen(true);
  };

  const setPlanField = (field, value) => {
    setPlanPickupDraft(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'clientName') {
        const c = clientByName(value);
        if (c?.route_id) next.routeId = String(c.route_id);
      }
      if (field === 'clientName' || field === 'dirtyDate' || field === 'routeId') {
        const routeId = field === 'routeId' ? value : next.routeId;
        const dirtyDate = field === 'dirtyDate' ? value : next.dirtyDate;
        if (dirtyDate && routeId) next.cleanDate = plannedPickupDateFor(dirtyDate, routeId);
      }
      return next;
    });
  };

  const createPlannedPickup = async () => {
    if (!isAdmin) return;
    const d = planPickupDraft;
    const client = clientByName(d.clientName);
    const routeId = Number(d.routeId || client?.route_id);
    if (!d.dirtyDate || !d.clientName || !routeId) { toastError('Wybierz datę, klienta i trasę'); return; }
    const dirty = tripDateInfo(d.dirtyDate);
    const clean = tripDateInfo(d.cleanDate || plannedPickupDateFor(d.dirtyDate, routeId));
    const driver = driverOptions.find(x => String(x.id) === String(d.driverId));
    try {
      setBusy(true);
      const entryId = 'ID_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const { data: plannedData, error: entryErr } = await supabase.rpc('admin_insert_entry', {
        p_session_token: sessionToken,
        p_id: entryId,
        p_week_key: dirty.weekKey,
        p_client_name: d.clientName,
        p_arr_day: dirty.arrDay,
        p_pick_day: clean.arrDay,
        p_pick_week_key: clean.weekKey,
        p_route_id: routeId,
        p_type: d.type || 'P',
        p_weight: d.weight ? parseFloat(String(d.weight).replace(',', '.')) : null,
        p_trolleys: d.trolleys !== '' ? Number(d.trolleys) : 1,
        p_urgent: !!d.urgent,
        p_added_by: user.name,
      });
      if (entryErr) throw entryErr;
      if (plannedData?.error) throw new Error(plannedData.error);

      const existingTrip = allTrips.find(t => {
        if (t.trip_date !== d.dirtyDate || t.status === 'finished') return false;
        const extras = parseExtraClients(t.extra_clients);
        return parseRouteIds(t.routes).has(routeId) || extras.includes(d.clientName);
      });
      if (existingTrip) {
        await attachClientToTrip(existingTrip, d.clientName);
      } else {
        const { error: tripErr } = await supabase.from('driver_trips').insert({
          driver_id: driver?.id || null,
          driver_name: driver?.name || null,
          trip_date: d.dirtyDate,
          car: d.car || '',
          routes: String(routeId),
          status: 'planned',
          extra_clients: JSON.stringify([d.clientName]),
        });
        if (tripErr) throw tripErr;
      }

      await logAction({
        userName: user.name,
        action: 'added',
        clientName: d.clientName,
        entryId,
        details: `Zlecono odbiór brudnego na ${fmtDate(d.dirtyDate)}${driver ? ` → ${driver.name}` : ' · trasa planowana bez kierowcy'}`,
      });
      await Promise.all([refetch(), loadTrips()]);
      setPlanPickupOpen(false);
      toastSuccess(`Zlecono odbiór: ${d.clientName} · ${fmtDate(d.dirtyDate)}`);
    } catch (err) {
      toastError('Błąd zlecania odbioru: ' + err.message);
    } finally {
      setBusy(false);
    }
  };

  // Admin przypisuje kierowcę+auto do planowanej (wirtualnej) trasy → tworzy
  // realną trasę status='planned', którą kierowca zobaczy gotową w "Mojej trasie".
  const assignPlannedTrip = async () => {
    if (!isAdmin || !assignTrip || !assignDriverId) return;
    try {
      setBusy(true);
      const drv = driverOptions.find(d => String(d.id) === String(assignDriverId));
      if (!drv) { toastError('Wybierz kierowcę'); setBusy(false); return; }
      const { error } = await supabase.from('driver_trips').insert({
        driver_id: drv.id, driver_name: drv.name, trip_date: assignTrip.trip_date,
        car: assignCar, routes: String(assignTrip.routes), status: 'planned',
      });
      if (error) throw error;
      await logAction({ userName: user.name, action: 'edited', details: `Przypisano trasę ${routeNamesForTrip(assignTrip)} (${fmtDate(assignTrip.trip_date)}) → ${drv.name}, ${VEHICLE_LABELS[assignCar] || assignCar}` });
      setAssignTrip(null); setAssignDriverId('');
      await loadTrips();
      toastSuccess(`Przypisano: ${drv.name} · ${fmtDate(assignTrip.trip_date)}`);
    } catch (err) { toastError('Błąd przypisania: ' + err.message); }
    finally { setBusy(false); }
  };

  // 1) Odbiór czystego z pralni
  const markPralnia = async (stop, baskets = 1) => {
    try {
      setBusy(true);
      const ids = stop.entries.map(e => e.id);
      const basketCount = Math.max(0, Number(baskets) || 1);
      const { data, error } = await supabase.rpc('driver_pickup_entries', {
        p_session_token: sessionToken,
        p_ids: ids,
        p_baskets: basketCount,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if ((data?.affected ?? 0) !== ids.length) throw new Error('Ten punkt jest już odebrany przez innego kierowcę. Odświeżam widok.');
      await logAction({ userName: user.name, action: 'done', clientName: stop.client_name, entryId: ids[0], details: `odbiór z pralni, ${Number(sumWeight(stop.entries).toFixed(1))} kg, ${trolleyLabel(basketCount)}` });
      await refetch();
    } catch (err) { toastError('Błąd: ' + err.message); }
    finally { setBusy(false); }
  };

  // 2) Dostawa do klienta
  const markDelivered = async (stop) => {
    if (!stopPickedByCurrentUser(stop)) {
      toastError(`Dostarczyć może tylko kierowca, który odebrał pranie z pralni (${actionOwnerLabel(stop, 'picked_by')})`);
      return;
    }
    try {
      setBusy(true);
      const ids = stop.entries.map(e => e.id);
      const { data, error } = await supabase.rpc('driver_deliver_entries', {
        p_session_token: sessionToken,
        p_ids: ids,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if ((data?.affected ?? 0) !== ids.length) throw new Error('Nie można dostarczyć prania odebranego przez innego kierowcę. Odświeżam widok.');
      await logAction({ userName: user.name, action: 'delivered', clientName: stop.client_name, entryId: ids[0], details: `dostawa do klienta` });
      await refetch();
    } catch (err) { toastError('Błąd: ' + err.message); }
    finally { setBusy(false); }
  };

  // Cofnij dostawę (np. klienta nie było, pranie wraca na pralnię)
  const undoDelivered = async (stop) => {
    if (!stopDeliveredByCurrentUser(stop)) {
      toastError(`Cofnąć dostawę może tylko kierowca, który ją oznaczył (${actionOwnerLabel(stop, 'delivered_by')})`);
      return;
    }
    try {
      setBusy(true);
      const ids = stop.entries.map(e => e.id);
      const { data, error } = await supabase.rpc('driver_undo_deliver', {
        p_session_token: sessionToken,
        p_ids: ids,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if ((data?.affected ?? 0) !== ids.length) throw new Error('Nie można cofnąć dostawy oznaczonej przez innego kierowcę. Odświeżam widok.');
      await logAction({ userName: user.name, action: 'undone', clientName: stop.client_name, entryId: ids[0], details: 'cofnięto dostawę' });
      await refetch();
    } catch (err) { toastError('Błąd: ' + err.message); }
    finally { setBusy(false); }
  };

  // Cofnij odbiór z pralni — dozwolone dopiero gdy dostawa jest cofnięta
  const undoPralnia = async (stop) => {
    if (stop.entries.some(e => e.delivered)) { toastError('Najpierw cofnij dostawę'); return; }
    if (!stopPickedByCurrentUser(stop)) {
      toastError(`Cofnąć odbiór może tylko kierowca, który odebrał pranie (${actionOwnerLabel(stop, 'picked_by')})`);
      return;
    }
    try {
      setBusy(true);
      const ids = stop.entries.map(e => e.id);
      const { data, error } = await supabase.rpc('driver_undo_pickup', {
        p_session_token: sessionToken,
        p_ids: ids,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if ((data?.affected ?? 0) !== ids.length) throw new Error('Nie można cofnąć odbioru oznaczonego przez innego kierowcę. Odświeżam widok.');
      await logAction({ userName: user.name, action: 'undone', clientName: stop.client_name, entryId: ids[0], details: 'cofnięto odbiór z pralni' });
      await refetch();
    } catch (err) { toastError('Błąd: ' + err.message); }
    finally { setBusy(false); }
  };
  // Notatka klienta — wspólna (clients.note), widoczna w harmonogramie i na trasie
  const saveClientNote = async (clientName, val) => {
    const { data, error } = await supabase.rpc('driver_set_client_note', {
      p_session_token: sessionToken,
      p_name: clientName,
      p_note: val || null,
    });
    if (error) { toastError('Błąd zapisu notatki: ' + error.message); return; }
    if (data?.error) { toastError('Błąd zapisu notatki: ' + data.error); return; }
    await refetch();
  };
  const toggleNoteEdit = (clientName, currentNote) => {
    setNoteEdit(prev => {
      if (clientName in prev) {
        const next = { ...prev }; delete next[clientName]; return next;
      }
      return { ...prev, [clientName]: currentNote || '' };
    });
  };

  const findBlockingPickedLaundry = async () => {
    if (!trip) return [];
    const routeIds = parseRouteIds(trip.routes);
    const extras = new Set(parseExtraClients(trip.extra_clients));
    const { data, error } = await supabase
      .from('entries')
      .select('*')
      .is('deleted_at', null)
      .eq('done', true)
      .eq('picked_by', user.name)
      .or('delivered.is.false,delivered.is.null');
    if (error) throw error;
    const blocking = (data || []).filter(e => {
      if (pickupDateStr(e) !== trip.trip_date) return false;
      return routeIds.size === 0 || routeIds.has(e.route_id) || extras.has(e.client_name);
    });
    return [...new Set(blocking.map(e => e.client_name).filter(Boolean))];
  };

  const endTrip = async () => {
    if (pickedNotDeliveredStops.length > 0) {
      toastError(`Nie możesz zakończyć trasy. Najpierw dostarcz albo cofnij do pralni: ${pickedNotDeliveredNames.join(', ')}`);
      return;
    }
    const km = parseFloat(String(endKm).replace(',', '.'));
    if (!endKm || isNaN(km)) { toastError('Podaj końcowy stan licznika (km)'); return; }
    try {
      setBusy(true);
      const freshBlockingNames = await findBlockingPickedLaundry();
      if (freshBlockingNames.length > 0) {
        toastError(`Nie możesz zakończyć trasy. Najpierw dostarcz albo cofnij do pralni: ${freshBlockingNames.join(', ')}`);
        await refetch();
        return;
      }
      const { error: tErr } = await supabase.from('driver_trips')
        .update({ ended_at: new Date().toISOString(), end_km: km, status: 'finished' }).eq('id', trip.id);
      if (tErr) throw tErr;
      await logAction({ userName: user.name, action: 'trip_end', details: `Auto: ${VEHICLE_LABELS[trip.car] || trip.car}, licznik do zatwierdzenia: ${km} km` });
      const finishedTrip = { ...trip, ended_at: new Date().toISOString(), end_km: km, status: 'finished' };
      setTrip(finishedTrip);
      await loadTrips();
      setEndOpen(false); setEndKm('');
      toastSuccess('Trasa zakończona, licznik czeka na zatwierdzenie admina');
    } catch (err) { toastError('Błąd zakończenia trasy: ' + err.message); }
    finally { setBusy(false); }
  };

  // Anuluje trasę w toku, gdy nic nie zostało zrobione (zero odbiorów/dostaw
  // przez tego kierowcę). Usuwa wpis driver_trips — nie zostaje w historii.
  const cancelTrip = async () => {
    if (!trip?.id || trip.status !== 'active' || tripHasProgress) return;
    if (!window.confirm('Anulować trasę? Zostanie usunięta — nic nie było zrobione.')) return;
    try {
      setBusy(true);
      const { error } = await supabase.from('driver_trips').delete().eq('id', trip.id);
      if (error) throw error;
      await logAction({ userName: user.name, action: 'deleted', details: `Anulowano trasę (nic nie zrobiono): ${trip.driver_name || user.name}, ${fmtDate(trip.trip_date)}, ${routeNamesForTrip(trip)}` });
      setTrip(null);
      setPlannedTrip(null);
      setSelectedRoutes(parseRouteIds(user?.routes));
      setSelectedCar(defaultCar || VEHICLES[0].key);
      await loadTrips();
      toastSuccess('Trasa anulowana');
    } catch (err) { toastError('Błąd anulowania: ' + err.message); }
    finally { setBusy(false); }
  };

  // Zmiana auta w trakcie trasy. Dwa przypadki (rozróżnik = tripHasProgress):
  //  - nic nie zrobiono: podmiana car w tym samym wierszu, bez licznika,
  //  - coś zrobiono: zamknięcie nogi starego auta z licznikiem (km → koszty),
  //    a potem ekran startowy z nowym autem (kierowca wybiera trasy nowej nogi).
  const changeCar = async () => {
    if (!trip?.id || trip.status !== 'active') return;
    const newCar = changeCarTarget;
    if (!newCar || newCar === trip.car) { toastError('Wybierz inne auto'); return; }

    // Przypadek B — nic nie zrobiono: tylko podmiana auta.
    if (!tripHasProgress) {
      try {
        setBusy(true);
        const { error } = await supabase.from('driver_trips').update({ car: newCar }).eq('id', trip.id);
        if (error) throw error;
        await logAction({ userName: user.name, action: 'edited', details: `Zmiana auta bez licznika: ${VEHICLE_LABELS[trip.car] || trip.car} → ${VEHICLE_LABELS[newCar] || newCar} (${fmtDate(trip.trip_date)})` });
        setTrip({ ...trip, car: newCar });
        setSelectedCar(newCar);
        setChangeCarOpen(false);
        await loadTrips();
        toastSuccess('Auto zmienione');
      } catch (err) { toastError('Błąd zmiany auta: ' + err.message); }
      finally { setBusy(false); }
      return;
    }

    // Przypadek A — coś zrobiono: zamknij nogę starego auta z licznikiem.
    const km = parseFloat(String(changeCarKm).replace(',', '.'));
    if (!changeCarKm || isNaN(km)) { toastError(`Podaj licznik auta ${VEHICLE_LABELS[trip.car] || trip.car}`); return; }
    try {
      setBusy(true);
      const freshBlockingNames = await findBlockingPickedLaundry();
      if (freshBlockingNames.length > 0) {
        toastError(`Najpierw dostarcz albo cofnij do pralni: ${freshBlockingNames.join(', ')}`);
        await refetch();
        return;
      }
      const oldCarLabel = VEHICLE_LABELS[trip.car] || trip.car;
      const { error } = await supabase.from('driver_trips')
        .update({ ended_at: new Date().toISOString(), end_km: km, status: 'finished' }).eq('id', trip.id);
      if (error) throw error;
      await logAction({ userName: user.name, action: 'trip_end', details: `Zmiana auta — zamknięto nogę ${oldCarLabel}, licznik ${km} km; dalej ${VEHICLE_LABELS[newCar] || newCar}` });
      await loadTrips();
      // Ekran startowy z nowym autem — kierowca wybiera trasy nowej nogi.
      setTrip(null);
      setPlannedTrip(null);
      setSelectedCar(newCar);
      setSelectedRoutes(parseRouteIds(user?.routes));
      setChangeCarOpen(false);
      setChangeCarKm('');
      toastSuccess(`Noga ${oldCarLabel} zamknięta — wybierz trasy i rusz autem ${VEHICLE_LABELS[newCar] || newCar}`);
    } catch (err) { toastError('Błąd zmiany auta: ' + err.message); }
    finally { setBusy(false); }
  };

  // Zatwierdza licznik trasy do kosztów. overrideKm — opcjonalna korekta admina.
  // Km ZAWSZE trafiają do dnia trasy (sourceTrip.trip_date), nie dnia zatwierdzenia.
  const approveTripKm = async (sourceTrip, overrideKm) => {
    if (!isAdmin || !sourceTrip?.end_km) return;
    try {
      setBusy(true);
      const col = vehicleEndColumn(sourceTrip.car);
      const hasOverride = overrideKm !== undefined && overrideKm !== null && String(overrideKm).trim() !== '';
      const km = hasOverride ? Number(String(overrideKm).replace(',', '.')) : Number(sourceTrip.end_km);
      if (!Number.isFinite(km)) { toastError('Nieprawidłowa wartość licznika'); setBusy(false); return; }
      const corrected = String(km) !== String(sourceTrip.end_km);
      // Korekta admina staje się źródłem prawdy — zapisujemy ją też na trasie.
      if (corrected) {
        const { error: tErr } = await supabase.from('driver_trips').update({ end_km: km }).eq('id', sourceTrip.id);
        if (tErr) throw tErr;
      }
      const { data: existing } = await supabase.from('daily_costs').select('entry_date').eq('entry_date', sourceTrip.trip_date).maybeSingle();
      const { error } = existing
        ? await supabase.from('daily_costs').update({ [col]: km }).eq('entry_date', sourceTrip.trip_date)
        : await supabase.from('daily_costs').insert({ entry_date: sourceTrip.trip_date, [col]: km });
      if (error) throw error;
      await logAction({ userName: user.name, action: 'edited', details: `Zatwierdzono licznik (${fmtDate(sourceTrip.trip_date)}): ${sourceTrip.driver_name || 'kierowca'}, ${VEHICLE_LABELS[sourceTrip.car] || sourceTrip.car}, ${km} km${corrected ? ` (korekta z ${sourceTrip.end_km})` : ''}` });
      await loadTrips();
      toastSuccess(`Licznik zatwierdzony — koszty dnia ${fmtDate(sourceTrip.trip_date)}`);
    } catch (err) {
      toastError('Błąd zatwierdzania licznika: ' + err.message);
    } finally {
      setBusy(false);
    }
  };

  // Zatwierdza licznik BEZ zapisu do kosztów — tylko zdejmuje status "czeka".
  // Zapisujemy id trasy w app_settings (bez zmian w schemacie).
  const resolveKmWithoutCost = async (sourceTrip) => {
    if (!isAdmin || !sourceTrip?.id) return;
    try {
      setBusy(true);
      const next = Array.from(new Set([...kmResolvedIds, sourceTrip.id]));
      const { error } = await supabase.from('app_settings').upsert({ key: KM_RESOLVED_KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
      setKmResolvedIds(next);
      await logAction({ userName: user.name, action: 'edited', details: `Licznik zatwierdzony bez wpisu do kosztów (${fmtDate(sourceTrip.trip_date)}): ${sourceTrip.driver_name || 'kierowca'}, ${sourceTrip.end_km} km` });
      toastSuccess('Licznik załatwiony — bez zapisu do kosztów');
    } catch (err) { toastError('Błąd: ' + err.message); }
    finally { setBusy(false); }
  };

  // Usuwa trasę (driver_trips). Km zapisane w kosztach zostają nietknięte.
  const deleteTrip = async (sourceTrip) => {
    if (!isAdmin || !sourceTrip?.id || sourceTrip.isVirtual) return;
    if (!window.confirm(`Usunąć trasę: ${sourceTrip.driver_name || 'kierowca'} · ${fmtDate(sourceTrip.trip_date)}?\nKm w kosztach zostaną nienaruszone.`)) return;
    try {
      setBusy(true);
      const { error } = await supabase.from('driver_trips').delete().eq('id', sourceTrip.id);
      if (error) throw error;
      await logAction({ userName: user.name, action: 'deleted', details: `Usunięto trasę: ${sourceTrip.driver_name || 'kierowca'}, ${fmtDate(sourceTrip.trip_date)}, ${routeNamesForTrip(sourceTrip)}` });
      setDetailTrip(null);
      if (trip?.id === sourceTrip.id) setTrip(null);
      if (plannedTrip?.id === sourceTrip.id) setPlannedTrip(null);
      await loadTrips();
      toastSuccess('Trasa usunięta');
    } catch (err) { toastError('Błąd usuwania trasy: ' + err.message); }
    finally { setBusy(false); }
  };

  const approvePendingTripKms = async () => {
    if (!isAdmin || pendingKmTrips.length === 0) return;
    try {
      setBusy(true);
      const rowsByDate = new Map();
      pendingKmTrips.forEach(t => {
        const row = rowsByDate.get(t.trip_date) || { entry_date: t.trip_date };
        row[vehicleEndColumn(t.car)] = t.end_km;
        rowsByDate.set(t.trip_date, row);
      });
      const rows = [...rowsByDate.values()];
      const { error } = await supabase.from('daily_costs').upsert(rows, { onConflict: 'entry_date' });
      if (error) throw error;
      await logAction({
        userName: user.name,
        action: 'edited',
        details: `Zatwierdzono zbiorczo liczniki tras: ${pendingKmTrips.length}`,
      });
      await loadTrips();
      toastSuccess(`Zatwierdzono liczniki: ${pendingKmTrips.length}`);
    } catch (err) {
      toastError('Błąd zbiorczego zatwierdzania liczników: ' + err.message);
    } finally {
      setBusy(false);
    }
  };

  /* ── wydruk karty ── */
  const printCard = (cardTrip = trip) => {
    const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    if (!cardTrip || cardTrip.status !== 'finished') {
      toastError('Karta jest dostępna po zakończeniu trasy');
      return;
    }
    const cardStops = getTripStops(cardTrip);
    const stopRows = cardStops.map((s, i) => {
      const hasPickupEntries = s.entries.length > 0;
      const pralnia = hasPickupEntries && s.entries.every(e => e.done);
      const delivered = hasPickupEntries && s.entries.every(e => e.delivered);
      const pickedTime = fmtTime(s.entries.find(e => e.picked_at)?.picked_at);
      const deliveredTime = fmtTime(s.entries.find(e => e.delivered_at)?.delivered_at);
      const kg = Number(sumWeight(s.entries).toFixed(1)) || '';
      const cleanBaskets = pralnia ? getPickedBaskets(s) : '';
      const dirtyEntries = s.dirtyEntries?.length
        ? s.dirtyEntries
        : entries.filter(e => e.client_name === s.client_name && arrivalDateStr(e) === cardTrip.trip_date);
      const dirtyBaskets = dirtyEntries.reduce((sum, e) => sum + (Number(e.trolleys) || 1), 0) || '';
      const dirtyTimes = [...new Set(dirtyEntries.map(e => fmtTime(e.added_at)).filter(Boolean))].join(', ');
      const note = s.entries[0]?.driver_note || '';
      return `<tr>
        <td>${i + 2}</td>
        <td class="l">${esc(s.client_name)}</td>
        <td>${pralnia ? pickedTime || '✓' : '—'}</td>
        <td>${delivered ? deliveredTime || '✓' : '—'}</td>
        <td>${kg}</td>
        <td>${cleanBaskets}</td>
        <td>${dirtyBaskets}</td>
        <td>${dirtyTimes || '—'}</td>
        <td class="l">${esc(note)}</td>
      </tr>`;
    }).join('');
    const startRow = `<tr class="route-marker">
        <td>1</td>
        <td class="l"><b>Pralnia</b></td>
        <td>${esc(fmtTime(cardTrip.started_at) || '—')}</td>
        <td>Start trasy</td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td class="l">Wyjazd z pralni</td>
      </tr>`;
    const endRowNumber = cardStops.length + 2;
    const endRow = `<tr class="route-marker">
        <td>${endRowNumber}</td>
        <td class="l"><b>Pralnia</b></td>
        <td></td>
        <td>${esc(fmtTime(cardTrip.ended_at) || '—')}</td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td class="l">Koniec trasy / powrót do pralni</td>
      </tr>`;
    const rows = `${startRow}${stopRows}${endRow}`;
    const distance = distanceForTrip(cardTrip);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Karta pracy kierowcy</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#000}
        h1{font-size:18px;text-align:center;margin:0 0 14px}
        .head{display:flex;flex-wrap:wrap;gap:6px 24px;font-size:13px;margin-bottom:14px}
        .head div{min-width:160px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #000;padding:5px 6px;text-align:center}
        td.l,th.l{text-align:left}
        thead{background:#eee}
        .route-marker{background:#f3f3f3}
        @media print{button{display:none}}
      </style></head><body>
      <h1>KARTA PRACY KIEROWCY</h1>
      <div class="head">
        <div><b>Kierowca:</b> ${esc(cardTrip.driver_name || user?.name)}</div>
        <div><b>Data:</b> ${esc(cardTrip.trip_date)}</div>
        <div><b>Samochód:</b> ${esc(VEHICLE_LABELS[cardTrip.car] || cardTrip.car || '')}</div>
        <div><b>Start:</b> ${esc(fmtTime(cardTrip.started_at) || '')}</div>
        <div><b>Koniec:</b> ${esc(fmtTime(cardTrip.ended_at) || '')}</div>
        <div><b>Czas trasy:</b> ${esc(fmtDuration(cardTrip.started_at, cardTrip.ended_at))}</div>
        <div><b>KM zgłoszony:</b> ${cardTrip.end_km ?? ''}</div>
        <div><b>Przejazd:</b> ${distance !== null ? `${distance} km` : '—'}</div>
      </div>
      <table>
        <thead><tr><th>Lp.</th><th class="l">Hotel/Klient</th><th>Z pralni godz.</th><th>Dostarczono godz.</th><th>Kg</th><th>Wózki z pralni</th><th>Brudne wózki</th><th>Brudne godz.</th><th class="l">Uwagi</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:40px;font-size:13px">Podpis kierowcy: ______________________</p>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { toastError('Wyłącz blokadę wyskakujących okienek, aby wydrukować'); return; }
    w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => w.print(), 300);
  };

  if (loading || tripLoading) return <div className="loader">Ładowanie trasy…</div>;

  const RouteBadge = ({ id }) => {
    const info = routeMap[id];
    if (!info) return null;
    return <span className="rt-badge" style={routeBadgeStyle(info.num)}>T{info.num}</span>;
  };

  const ActionRow = ({ icon, label, tone, done, at, extra, btnLabel, onClick, onUndo, undoDisabled, undoHint, actionDisabled, actionHint, quantityValue, onQuantityChange }) => (
    <div className={`driver-action-row driver-action-${tone}`}>
      <span className="driver-action-label">{icon} {label}</span>
      {done ? (
        <div className="driver-action-meta">
          <span className="driver-action-time">✓ {fmtTime(at)}</span>
          {extra && <span className="driver-action-extra">{extra}</span>}
          {onUndo && trip?.status === 'active' && (
            <button className="driver-undo-btn" onClick={onUndo} disabled={busy || undoDisabled} title={undoDisabled ? undoHint : 'Cofnij'}>↩︎ cofnij</button>
          )}
        </div>
      ) : trip?.status === 'active' ? (
        <div className="driver-action-pending">
          {onQuantityChange && (
            <label className="driver-trolley-inline">
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={quantityValue}
                onChange={e => onQuantityChange(e.target.value)}
              />
              <span>{trolleyLabel(quantityValue).replace(/^\S+\s+/, '')}</span>
            </label>
          )}
          <button className="driver-action-btn" onClick={onClick} disabled={busy || actionDisabled} title={actionDisabled ? actionHint : undefined}>{btnLabel}</button>
        </div>
      ) : <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>—</span>}
    </div>
  );

  // Pojedyncza metryka: duża wartość + mała etykieta (czytelniej niż "2/3 z pralni").
  const Metric = ({ value, label, tone }) => (
    <div className={`trip-metric ${tone ? 'tone-' + tone : ''}`}>
      <span className="trip-metric-val">{value}</span>
      <span className="trip-metric-label">{label}</span>
    </div>
  );

  // Pasek postępu: jaśniejszy = odebrane z pralni, pełny = dostarczone do klienta.
  const TripProgress = ({ stats }) => {
    const total = stats.stops || 0;
    if (!total) return null;
    const pctPicked = Math.round((stats.picked / total) * 100);
    const pctDelivered = Math.round((stats.delivered / total) * 100);
    return (
      <div className="trip-progress" title={`${stats.delivered}/${total} dostarczone · ${stats.picked}/${total} odebrane`}>
        <div className="trip-progress-picked" style={{ width: `${pctPicked}%` }} />
        <div className="trip-progress-delivered" style={{ width: `${pctDelivered}%` }} />
      </div>
    );
  };

  // Dwa rozdzielone flow: dostawa czystego (postęp trasy) + odbiór brudnego (osobno).
  const TripMetrics = ({ stats }) => (
    <div className="trip-metric-groups">
      <div className="trip-metric-group">
        <div className="trip-metric-grouplabel">📦 Dostawa czystego</div>
        <div className="trip-card-metrics">
          <Metric value={`${stats.delivered}/${stats.stops}`} label="dostarczone" tone="delivered" />
          <Metric value={`${stats.picked}/${stats.stops}`} label="z pralni" tone="picked" />
          <Metric value={stats.kg || 0} label="kg" />
          <Metric value={stats.cleanTrolleys} label="wózki" />
        </div>
      </div>
      {(stats.dirtyStops > 0 || stats.dirtyTrolleys > 0) && (
        <div className="trip-metric-group">
          <div className="trip-metric-grouplabel">🧺 Odbiór brudnego</div>
          <div className="trip-card-metrics">
            <Metric value={stats.dirtyStops} label="punkty" tone="dirty" />
            <Metric value={stats.dirtyTrolleys} label="wózki" tone="dirty" />
          </div>
        </div>
      )}
    </div>
  );

  const renderTripRow = (t) => {
    const stats = getTripStats(t);
    const kmApproval = tripKmApproval(t);
    const routeIds = [...parseRouteIds(t.routes)];
    const statusClass = t.isVirtual ? 'is-planned' : t.status === 'active' ? 'is-live' : t.status === 'finished' ? 'is-finished' : 'is-planned';
    const canAssign = manageMode && t.isVirtual;
    const showFoot = t.end_km || t.status === 'finished' || canAssign;
    return (
      <div
        key={t.id}
        className={`trip-card ${statusClass}`}
        role="button"
        tabIndex={0}
        onClick={() => { setDetailTrip(t); setAddStopOpen(false); }}
        title="Pokaż progres trasy"
      >
        <div className="trip-card-head">
          <span className={`trip-dot ${t.status === 'active' ? 'live' : ''}`} />
          <div className="trip-card-headtext">
            <div className="trip-card-driver">{t.driver_name || 'Brak kierowcy'}</div>
            <div className="trip-card-meta">
              {t.car ? (VEHICLE_LABELS[t.car] || t.car) : (t.isVirtual ? 'nieprzypisana' : '—')}
              {!t.isVirtual && t.started_at ? ` · ${fmtTime(t.started_at)}` : ''}
              {t.ended_at ? `–${fmtTime(t.ended_at)} · ${fmtDuration(t.started_at, t.ended_at)}` : (t.status === 'active' ? ` · ${fmtDuration(t.started_at, null)}` : '')}
            </div>
          </div>
          <span className="trip-card-date">{fmtDate(t.trip_date)}</span>
        </div>

        <div className="trip-card-routes">
          {routeIds.length > 0
            ? routeIds.map(id => <RouteBadge key={id} id={id} />)
            : <span className="trip-card-allroutes">Wszystkie trasy</span>}
        </div>

        <TripProgress stats={stats} />

        <TripMetrics stats={stats} />

        {showFoot && (
          <div className="trip-card-foot">
            <span className="trip-km">
              {t.end_km ? `${kmApproval.approved ? '✓' : '⏳'} licznik ${t.end_km} km${kmApproval.resolvedNoCost ? ' (bez kosztów)' : ''}` : ''}
            </span>
            <div className="trip-card-actions">
              {canAssign && (
                <button className="driver-mini-card-btn" onClick={(e) => { e.stopPropagation(); setAssignTrip(t); setAssignDriverId(''); setAssignCar(VEHICLES[0].key); }} disabled={busy}>👤 Przypisz</button>
              )}
              {isAdmin && t.end_km && !kmApproval.approved && (
                <button className="driver-mini-card-btn" onClick={(e) => { e.stopPropagation(); setKmEditTrip(t); setKmEditValue(String(t.end_km ?? '')); }} disabled={busy}>Zatwierdź km</button>
              )}
              {t.status === 'finished' && <button className="driver-mini-card-btn" onClick={(e) => { e.stopPropagation(); printCard(t); }}>Karta</button>}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Podgląd progresu konkretnej trasy (read-only) — admin wchodzi i widzi co zrobione.
  const renderTripDetail = (t) => {
    const tripStops = getTripStops(t);
    const stats = getTripStats(t);
    const statusLabel = t.isVirtual ? 'Planowana' : t.status === 'active' ? 'Na żywo' : t.status === 'finished' ? 'Zakończona' : 'Planowana';
    const muted = { fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600 };
    // Kandydaci do dorzucenia: klienci z robotą tego dnia, których nie ma jeszcze na tej trasie.
    const onTrip = new Set(tripStops.map(s => s.client_name));
    const candMap = new Map();
    entries.forEach(e => {
      if (!e.client_name || !e.route_id || onTrip.has(e.client_name)) return;
      if (e.done) return;
      if (pickupDateStr(e) !== t.trip_date && arrivalDateStr(e) !== t.trip_date) return;
      if (!candMap.has(e.client_name)) candMap.set(e.client_name, { route_id: e.route_id, entries: [] });
      candMap.get(e.client_name).entries.push(e);
    });
    const addCandidates = [...candMap.entries()].map(([client_name, v]) => ({
      client_name,
      route_id: v.route_id,
      kg: Number(sumWeight(v.entries).toFixed(1)),
      hasP: v.entries.some(e => (e.type || 'P') === 'P'),
      hasO: v.entries.some(e => e.type === 'O'),
    }));
    const canAddStop = isAdmin && t.status === 'active' && !t.isVirtual;
    return (
      <div className="admin-dashboard-shell">
        <div className="driver-history-header">
          <div>
            <div className="driver-trip-kicker">Podgląd trasy · {statusLabel}</div>
            <div className="driver-trip-title">
              {t.driver_name || 'Kierowca'}{t.car ? ` · ${VEHICLE_LABELS[t.car] || t.car}` : ''}
            </div>
            <div className="driver-trip-subtitle">
              {fmtDate(t.trip_date)} · {routeNamesForTrip(t)}
              {!t.isVirtual && t.started_at ? ` · Start ${fmtTime(t.started_at)} · ${fmtDuration(t.started_at, t.ended_at)}` : ''}
              {t.end_km ? ` · licznik ${t.end_km} km` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            {isAdmin && !t.isVirtual && (
              <button className="driver-tool-btn" onClick={() => deleteTrip(t)} disabled={busy} style={{ color: 'var(--accent-red)', borderColor: 'var(--accent-red)' }}>🗑 Usuń trasę</button>
            )}
            <button className="driver-tool-btn" onClick={() => setDetailTrip(null)}>← Wróć do listy</button>
          </div>
        </div>

        <div style={{ margin: '4px 0 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <TripProgress stats={stats} />
          <TripMetrics stats={stats} />
        </div>

        {canAddStop && (
          <div style={{ marginBottom: '14px' }}>
            <button onClick={() => setAddStopOpen(o => !o)} disabled={busy} style={{
              width: '100%', padding: '11px', borderRadius: '11px', cursor: 'pointer',
              border: '1px dashed var(--accent)', background: 'var(--accent-light)',
              color: 'var(--accent)', fontWeight: 700, fontSize: '13px',
            }}>➕ Dorzuć przystanek do tej trasy (inny kierowca)</button>
            {addStopOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                {addCandidates.length === 0 && <div className="driver-empty-row">Brak klientów do dorzucenia na ten dzień</div>}
                {addCandidates.map(c => (
                  <button key={c.client_name} onClick={() => addClientToTrip(t, c.client_name)} disabled={busy} style={{
                    display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left',
                    padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                    border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: '13px', fontWeight: 600,
                  }}>
                    <RouteBadge id={c.route_id} />
                    <span style={{ flex: 1 }}>{c.client_name}</span>
                    {(c.hasP || c.hasO) && (
                      <span className={`laundry-type-badge ${c.hasO && !c.hasP ? 'type-O' : 'type-P'}`}>
                        {c.hasP && c.hasO ? 'P/O' : c.hasO ? 'O' : 'P'}
                      </span>
                    )}
                    {c.kg > 0 && <span className="kg-badge">{c.kg} kg</span>}
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setAddDirtyTrip(t)} disabled={busy} style={{
              width: '100%',
              padding: '11px',
              borderRadius: '11px',
              cursor: 'pointer',
              border: '1px dashed rgba(255,149,0,0.45)',
              background: 'rgba(255,149,0,0.12)',
              color: '#B45309',
              fontWeight: 700,
              fontSize: '13px',
              marginTop: '10px',
            }}>🧺 Dodaj odbiór brudnego do tej trasy</button>
          </div>
        )}

        <div className="driver-stops-list">
          {tripStops.length === 0 && <div className="driver-empty-row">Brak przystanków dla tej trasy</div>}
          {tripStops.map(stop => {
            const pickupEntries = stop.entries || [];
            const hasPickup = pickupEntries.length > 0;
            const pralniaDone = hasPickup && pickupEntries.every(e => e.done);
            const deliveredDone = hasPickup && pickupEntries.every(e => e.delivered);
            const kg = Number(sumWeight(pickupEntries).toFixed(1));
            const arrivals = stop.dirtyEntries || [];
            return (
              <div key={stop.key} className={`driver-stop-card ${deliveredDone ? 'is-delivered' : ''}`}>
                <div className="driver-stop-header">
                  <div className="driver-stop-title-row">
                    <RouteBadge id={stop.route_id} />
                    <span className="driver-client-name">{stop.client_name}</span>
                    {kg > 0 && <span className="kg-badge driver-kg-badge">{kg} kg</span>}
                  </div>
                </div>

                {hasPickup && (
                  <>
                    <div className="driver-action-row driver-action-laundry">
                      <span className="driver-action-label">🏭 Odbiór z pralni</span>
                      {pralniaDone
                        ? <span className="driver-action-meta"><span className="driver-action-time">✓ {fmtTime(pickupEntries[0]?.picked_at)}</span><span className="driver-action-extra">{trolleyLabel(getPickedBaskets(stop))}</span></span>
                        : <span style={muted}>oczekuje</span>}
                    </div>
                    <div className="driver-action-row driver-action-delivered">
                      <span className="driver-action-label">📦 Dostarczono</span>
                      {deliveredDone
                        ? <span className="driver-action-meta"><span className="driver-action-time">✓ {fmtTime(pickupEntries[0]?.delivered_at)}</span></span>
                        : <span style={muted}>oczekuje</span>}
                    </div>
                  </>
                )}

                {arrivals.length > 0 && (
                  <div className="driver-arrivals-section">
                    <div className="driver-dirty-heading">Brudne pranie do pralni</div>
                    <div className="driver-dirty-list">
                      {arrivals.map(a => (
                        <div key={a.id} className={`driver-arrival-chip ${a.type === 'O' ? 'type-O' : 'type-P'}`}>
                          <span className="driver-arrival-label">
                            <span className={`laundry-type-badge ${a.type === 'O' ? 'type-O' : 'type-P'}`}>{a.type === 'O' ? 'O' : 'P'}</span>
                            {a.type === 'O' ? 'Obrusy' : 'Pościel'}{a.weight ? ` · ${a.weight} kg` : ''} · {trolleyLabel(a.trolleys ?? 1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Modal zatwierdzania/korekty licznika (admin). Renderowany w gałęziach,
  // które pokazują przycisk "Zatwierdź km".
  const renderKmApproveModal = () => {
    if (!kmEditTrip) return null;
    const t = kmEditTrip;
    const v = Number(String(kmEditValue).replace(',', '.'));
    const previewDist = Number.isFinite(v) ? distanceForTrip({ ...t, end_km: v }) : null;
    return (
      <div className="ap-overlay" style={{ display: 'flex' }} onClick={() => !busy && setKmEditTrip(null)}>
        <div className="ap-sheet" onClick={e => e.stopPropagation()}>
          <div className="ap-handle"></div>
          <div className="ap-content">
            <div className="ap-title" style={{ textAlign: 'left', fontSize: '18px', marginBottom: '4px' }}>Zatwierdź licznik</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              {t.driver_name || 'Kierowca'} · {VEHICLE_LABELS[t.car] || t.car} · <strong>{fmtDate(t.trip_date)}</strong>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '10px' }}>
              Zgłoszony przez kierowcę: <strong>{t.end_km} km</strong>
            </div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Stan licznika (km) — możesz skorygować</label>
            <input className="ap-input" type="text" inputMode="decimal" autoFocus value={kmEditValue}
              onChange={e => setKmEditValue(e.target.value)} style={{ marginTop: '6px', marginBottom: '10px' }} />
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '16px' }}>
              Trafi do kosztów na dzień <strong>{fmtDate(t.trip_date)}</strong>{previewDist !== null ? ` · przejazd ${previewDist} km` : ''}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setKmEditTrip(null)} disabled={busy} style={{ flex: 1, padding: '13px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', fontWeight: 600 }}>Anuluj</button>
              <button onClick={async () => { await approveTripKm(t, kmEditValue); setKmEditTrip(null); }} disabled={busy} style={{ flex: 2, padding: '13px', borderRadius: '12px', border: 'none', background: 'var(--accent-green)', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>{busy ? 'Zapisywanie…' : 'Zatwierdź i zapisz'}</button>
            </div>
            <button onClick={async () => { await resolveKmWithoutCost(t); setKmEditTrip(null); }} disabled={busy} style={{ width: '100%', marginTop: '8px', padding: '11px', borderRadius: '12px', border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
              Zatwierdź bez zapisu do kosztów
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Modal przypisania kierowcy do planowanej (wirtualnej) trasy.
  const renderAssignModal = () => {
    if (!assignTrip) return null;
    const t = assignTrip;
    return (
      <div className="ap-overlay" style={{ display: 'flex' }} onClick={() => !busy && setAssignTrip(null)}>
        <div className="ap-sheet" onClick={e => e.stopPropagation()}>
          <div className="ap-handle"></div>
          <div className="ap-content">
            <div className="ap-title" style={{ textAlign: 'left', fontSize: '18px', marginBottom: '4px' }}>Przypisz trasę</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              {routeNamesForTrip(t)} · <strong>{fmtDate(t.trip_date)}</strong>
            </div>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Kierowca</label>
            <select className="ap-input" value={assignDriverId} onChange={e => setAssignDriverId(e.target.value)} style={{ marginTop: '6px', marginBottom: '14px', padding: '12px 14px' }}>
              <option value="">— wybierz kierowcę —</option>
              {driverOptions.map(d => <option key={d.id} value={d.id}>{d.name}{d.role === 'admin' ? ' (admin)' : ''}</option>)}
            </select>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Auto</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px', marginBottom: '18px' }}>
              {VEHICLES.map(v => {
                const active = assignCar === v.key;
                return <button key={v.key} type="button" onClick={() => setAssignCar(v.key)} style={{ flex: '1 1 100px', padding: '10px', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '13px', border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'var(--accent-light)' : 'var(--bg-card)', color: active ? 'var(--accent)' : 'var(--text-secondary)' }}>{v.label}</button>;
              })}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setAssignTrip(null)} disabled={busy} style={{ flex: 1, padding: '13px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', fontWeight: 600 }}>Anuluj</button>
              <button onClick={assignPlannedTrip} disabled={busy || !assignDriverId} style={{ flex: 2, padding: '13px', borderRadius: '12px', border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 700, opacity: assignDriverId ? 1 : 0.5 }}>{busy ? 'Zapisywanie…' : 'Przypisz'}</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderPlanPickupModal = () => {
    if (!planPickupOpen) return null;
    const d = planPickupDraft;
    const dates = workDateOptions();
    const selectedRouteId = Number(d.routeId || clientByName(d.clientName)?.route_id);
    const existingTrip = allTrips.find(t => {
      if (t.trip_date !== d.dirtyDate || t.status === 'finished') return false;
      const extras = parseExtraClients(t.extra_clients);
      return parseRouteIds(t.routes).has(selectedRouteId) || extras.includes(d.clientName);
    });
    const sortedRoutes = [...allRoutes].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const sortedClients = [...clients].filter(c => c.route_id).sort((a, b) => {
      const ar = routeMap[a.route_id]?.num || 999;
      const br = routeMap[b.route_id]?.num || 999;
      return ar - br || (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'pl');
    });
    return (
      <div className="ap-overlay" style={{ display: 'flex' }} onClick={() => !busy && setPlanPickupOpen(false)}>
        <div className="ap-sheet" onClick={e => e.stopPropagation()}>
          <div className="ap-handle"></div>
          <div className="ap-content">
            <div className="ap-title" style={{ textAlign: 'left', fontSize: '18px', marginBottom: '4px' }}>Zleć nowy odbiór</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              Planowanie odbioru brudnego i trasy w oknie 14 dni
            </div>

            <label style={pfLabel}>Data odbioru brudnego</label>
            <select className="ap-input" value={d.dirtyDate || ''} onChange={e => setPlanField('dirtyDate', e.target.value)} style={{ marginBottom: '12px' }}>
              {dates.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>

            <label style={pfLabel}>Klient</label>
            <select className="ap-input" value={d.clientName || ''} onChange={e => setPlanField('clientName', e.target.value)} style={{ marginBottom: '12px' }}>
              {sortedRoutes.map(r => (
                <optgroup key={r.id} label={`T${routeMap[r.id]?.num || r.sort_order || r.id} · ${r.name}`}>
                  {sortedClients
                    .filter(c => c.route_id === r.id)
                    .map(c => <option key={c.id || c.name} value={c.name}>{c.name}</option>)}
                </optgroup>
              ))}
            </select>

            <label style={pfLabel}>Trasa</label>
            <select className="ap-input" value={d.routeId || ''} onChange={e => setPlanField('routeId', e.target.value)} style={{ marginBottom: '12px' }}>
              {sortedRoutes.map(r => <option key={r.id} value={r.id}>T{routeMap[r.id]?.num || r.sort_order || r.id} · {r.name}</option>)}
            </select>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label style={pfLabel}>Rodzaj</label>
                <select className="ap-input" value={d.type || 'P'} onChange={e => setPlanField('type', e.target.value)}>
                  <option value="P">Pościel</option>
                  <option value="O">Obrusy</option>
                </select>
              </div>
              <div>
                <label style={pfLabel}>Wózki</label>
                <input className="ap-input" type="number" min="0" value={d.trolleys ?? 1} onChange={e => setPlanField('trolleys', e.target.value ? Number(e.target.value) : '')} />
              </div>
            </div>

            <label style={pfLabel}>Waga (kg) — opcjonalnie</label>
            <input className="ap-input" type="text" inputMode="decimal" value={d.weight || ''} onChange={e => setPlanField('weight', e.target.value)} placeholder="np. 150.5" style={{ marginBottom: '12px' }} />

            <label style={pfLabel}>Odbiór czystego z pralni</label>
            <select className="ap-input" value={d.cleanDate || ''} onChange={e => setPlanField('cleanDate', e.target.value)} style={{ marginBottom: '12px' }}>
              {workDateOptions(21).filter(opt => !d.dirtyDate || opt.value >= d.dirtyDate).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label style={pfLabel}>Kierowca</label>
                <select className="ap-input" value={d.driverId || ''} onChange={e => setPlanField('driverId', e.target.value)}>
                  <option value="">Brak przypisania</option>
                  {driverOptions.map(x => <option key={x.id} value={x.id}>{x.name}{x.role === 'admin' ? ' (admin)' : ''}</option>)}
                </select>
              </div>
              <div>
                <label style={pfLabel}>Auto</label>
                <select className="ap-input" value={d.car || ''} onChange={e => setPlanField('car', e.target.value)}>
                  <option value="">Brak przypisania</option>
                  {VEHICLES.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
                </select>
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 650, marginBottom: '12px', cursor: 'pointer' }}>
              <input type="checkbox" style={{ width: '18px', height: '18px' }} checked={!!d.urgent} onChange={e => setPlanField('urgent', e.target.checked)} />
              <span style={{ color: 'var(--accent-red)' }}>Pilne</span>
            </label>

            <div style={{
              fontSize: '12px',
              color: existingTrip ? 'var(--accent)' : 'var(--text-secondary)',
              background: existingTrip ? 'var(--accent-light)' : 'var(--bg-secondary)',
              border: `1px solid ${existingTrip ? 'rgba(0,122,255,0.2)' : 'var(--border)'}`,
              borderRadius: '10px',
              padding: '9px 11px',
              marginBottom: '14px',
              fontWeight: 650,
              lineHeight: 1.4,
            }}>
              {existingTrip
                ? `Zostanie dopięte do istniejącej trasy: ${existingTrip.driver_name || 'bez kierowcy'} · ${existingTrip.car ? (VEHICLE_LABELS[existingTrip.car] || existingTrip.car) : 'bez auta'}`
                : 'Powstanie nowa trasa planowana na wybrany dzień.'}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setPlanPickupOpen(false)} disabled={busy} style={{ flex: 1, padding: '13px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', fontWeight: 600 }}>Anuluj</button>
              <button onClick={createPlannedPickup} disabled={busy || !d.clientName || !d.dirtyDate} style={{ flex: 2, padding: '13px', borderRadius: '12px', border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 750 }}>{busy ? 'Zapisywanie…' : 'Zleć odbiór'}</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Podgląd progresu wybranej trasy (read-only) — wspólny dla obu trybów.
  if (detailTrip) {
    const live = allTrips.find(t => t.id === detailTrip.id) || detailTrip;
    return renderTripDetail(live);
  }

  // Zakładka "Trasy na żywo" — panel zarządzania. Sterowany WYŁĄCZNIE propsem
  // manageMode (nie stanem routeView), dzięki czemu przełączanie zakładek
  // "Moja trasa" ↔ "Trasy na żywo" działa od razu, bez remountu i zaklejonego stanu.
  if (manageMode) {
      const uniqueDrivers = [...new Set(allTrips.map(t => t.driver_name || 'Nieznany').filter(Boolean))].sort();
      const uniqueCars = [...new Set(allTrips.map(t => t.car).filter(Boolean))].sort();

      const filteredTrips = allTrips.filter(t => {
        if (filterDriver && (t.driver_name || 'Nieznany') !== filterDriver) return false;
        if (filterCar && t.car !== filterCar) return false;
        if (filterRoute) {
          const rIds = parseRouteIds(t.routes);
          if (rIds.size > 0 && !rIds.has(Number(filterRoute))) return false;
        }
        return true;
      });

      // Okno planowania: dziś + kolejne dni robocze (Pn–Pt) do ~2 tygodni w przód.
      const horizonSet = new Set();
      for (let i = 0; i < 14; i++) {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + i);
        const wd = (d.getDay() + 6) % 7 + 1; // Pn=1 … Nd=7
        if (wd <= 5) horizonSet.add(ymd(d));
      }

      // (data → zbiór tras mających tego dnia robotę: czyste LUB brudne)
      const plannedByDate = new Map();
      entries.forEach(e => {
        if (!e.route_id) return;
        [pickupDateStr(e), arrivalDateStr(e)].forEach(ds => {
          if (!ds || !horizonSet.has(ds)) return;
          if (!plannedByDate.has(ds)) plannedByDate.set(ds, new Set());
          plannedByDate.get(ds).add(e.route_id);
        });
      });

      // (data → zbiór tras już objętych JAKĄKOLWIEK trasą tego dnia:
      //  aktywną, skończoną lub zaplanowaną/przypisaną). Przypisana planowana
      //  trasa pokaże się jako realny kafelek (dbPlannedTrips), więc wirtualnej
      //  już nie generujemy — żeby nie dublować.
      const coveredByDate = new Map();
      allTrips.forEach(t => {
        if (!t.trip_date) return;
        if (!coveredByDate.has(t.trip_date)) coveredByDate.set(t.trip_date, new Set());
        parseRouteIds(t.routes).forEach(id => coveredByDate.get(t.trip_date).add(id));
      });

      const virtualPlannedTrips = [];
      [...plannedByDate.keys()].sort().forEach(ds => {
        const covered = coveredByDate.get(ds) || new Set();
        [...plannedByDate.get(ds)].sort((a, b) => a - b).forEach(rId => {
          if (covered.has(rId)) return;
          virtualPlannedTrips.push({
            id: `virtual_${ds}_${rId}`,
            status: 'planned',
            trip_date: ds,
            driver_name: 'Brak przypisania',
            car: null,
            routes: String(rId),
            isVirtual: true,
          });
        });
      });

      const filteredVirtual = virtualPlannedTrips.filter(t => {
        if (filterDriver && filterDriver !== 'Brak przypisania') return false;
        if (filterCar) return false;
        if (filterRoute && !parseRouteIds(t.routes).has(Number(filterRoute))) return false;
        return true;
      });

      const liveTrips = filteredTrips.filter(t => t.status === 'active');
      const dbPlannedTrips = filteredTrips.filter(t => t.status === 'planned');
      const plannedTrips = [...filteredVirtual, ...dbPlannedTrips];
      const finTrips = filteredTrips.filter(t => t.status === 'finished').slice(0, 100);

      // ── Podsumowanie dnia (KPI) ──
      const todaysStarted = filteredTrips.filter(t => t.trip_date === today && t.status !== 'planned');
      const dayAgg = todaysStarted.reduce((a, t) => {
        const s = getTripStats(t);
        a.delivered += s.delivered; a.stops += s.stops; a.kg += s.kg; a.dirtyTrolleys += s.dirtyTrolleys;
        return a;
      }, { delivered: 0, stops: 0, kg: 0, dirtyTrolleys: 0 });

      // ── Alerty (coś wymaga uwagi) ──
      const todayUnassigned = filteredVirtual.filter(t => t.trip_date === today).length;
      const stalledTrips = liveTrips.filter(t => {
        const s = getTripStats(t);
        const mins = t.started_at ? (Date.now() - new Date(t.started_at).getTime()) / 60000 : 0;
        return mins > 180 && s.stops > 0 && s.delivered < s.stops;
      });
      const alerts = [];
      if (todayUnassigned > 0) alerts.push({ tone: 'warn', text: `⚠️ ${todayUnassigned} tras na dziś bez kierowcy / nieruszonych` });
      if (stalledTrips.length > 0) alerts.push({ tone: 'warn', text: `🐌 ${stalledTrips.length} tras stoi (ponad 3h, niedokończone)` });
      if (pendingKmTrips.length > 0) alerts.push({ tone: 'info', text: `⏳ ${pendingKmTrips.length} liczników czeka na zatwierdzenie` });

      // Dodajemy "Brak przypisania" do opcji kierowców jeśli są wirtualne trasy
      if (virtualPlannedTrips.length > 0 && !uniqueDrivers.includes('Brak przypisania')) {
        uniqueDrivers.push('Brak przypisania');
        uniqueDrivers.sort();
      }

      return (
        <div className="admin-dashboard-shell">
          {renderKmApproveModal()}
          {renderAssignModal()}
          {renderPlanPickupModal()}
          <div className="driver-history-header">
            <div>
              <div className="driver-trip-kicker">Panel Administratora</div>
              <div className="driver-trip-title">{manageMode ? 'Trasy na żywo' : 'Zarządzanie Trasami'}</div>
              <div className="driver-trip-subtitle">{manageMode ? 'Kliknij trasę, aby zobaczyć progres' : `Sortowanie i grupowanie tras (${allTrips.length} w historii)`}</div>
            </div>
            {!manageMode && <button className="driver-tool-btn" onClick={() => setRouteView('current')}>← Wróć do widoku</button>}
          </div>

          {/* Podsumowanie dnia */}
          <div className="kpi-bar">
            <Metric value={todaysStarted.length} label="tras dziś" />
            <Metric value={`${dayAgg.delivered}/${dayAgg.stops}`} label="dostarczone" tone="delivered" />
            <Metric value={Number(dayAgg.kg.toFixed(1))} label="kg dziś" />
            <Metric value={dayAgg.dirtyTrolleys} label="brudne wózki" tone="dirty" />
            <Metric value={pendingKmTrips.length} label="km do zatw." tone="picked" />
          </div>

          {/* Alerty */}
          {alerts.length > 0 && (
            <div className="route-alerts">
              {alerts.map((a, i) => <div key={i} className={`route-alert ${a.tone}`}>{a.text}</div>)}
            </div>
          )}

          <div className="admin-filters-bar">
            <div className="filter-group">
              <span className="filter-label">Kierowca</span>
              <select value={filterDriver} onChange={e => setFilterDriver(e.target.value)}>
                <option value="">Wszyscy kierowcy</option>
                {uniqueDrivers.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="filter-group">
              <span className="filter-label">Samochód</span>
              <select value={filterCar} onChange={e => setFilterCar(e.target.value)}>
                <option value="">Wszystkie auta</option>
                {uniqueCars.map(c => <option key={c} value={c}>{VEHICLE_LABELS[c] || c}</option>)}
              </select>
            </div>
            <div className="filter-group">
              <span className="filter-label">Trasa</span>
              <select value={filterRoute} onChange={e => setFilterRoute(e.target.value)}>
                <option value="">Wszystkie trasy</option>
                {allRoutes.map(r => <option key={r.id} value={r.id}>T{routeMap[r.id]?.num} - {r.name}</option>)}
              </select>
            </div>
            
            {/* Przycisk Ad-hoc Zlecenie */}
            <button className="driver-add-primary" style={{ marginLeft: 'auto', padding: '10px 16px', borderRadius: '8px', minWidth: 'auto', width: 'auto', fontSize: '13px' }} onClick={openPlanPickup}>
              ➕ Zleć nowy odbiór
            </button>

            {pendingKmTrips.length > 0 && (
              <button className="driver-tool-btn" onClick={approvePendingTripKms} disabled={busy} style={{ background: 'var(--accent-green)', color: '#fff', border: 'none' }}>
                ✓ Zatwierdź kilometry ({pendingKmTrips.length})
              </button>
            )}
          </div>

          <div className="admin-section-grid">
            <div className="admin-trip-group live">
              <div className="admin-trip-group-header">
                Trasy na żywo
                <span className="count-badge">{liveTrips.length}</span>
              </div>
              <div className="admin-trip-list-inner">
                {liveTrips.length === 0 && <div className="driver-empty-row">Brak tras na żywo</div>}
                {liveTrips.map(t => renderTripRow(t))}
              </div>
            </div>

            <div className="admin-trip-group planned">
              <div className="admin-trip-group-header">
                Planowane trasy
                <span className="count-badge">{plannedTrips.length}</span>
              </div>
              <div className="admin-trip-list-inner">
                {plannedTrips.length === 0 && <div className="driver-empty-row">Brak planowanych tras</div>}
                {plannedTrips.map(t => renderTripRow(t))}
              </div>
            </div>

            <div className="admin-trip-group finished">
              <div className="admin-trip-group-header">
                Skończone trasy
                <span className="count-badge">{finTrips.length}</span>
              </div>
              <div className="admin-trip-list-inner">
                {finTrips.length === 0 && <div className="driver-empty-row">Brak skończonych tras</div>}
                {finTrips.map(t => renderTripRow(t))}
              </div>
            </div>
          </div>
        </div>
      );
  }

  // "Moja trasa" — historia własnych zakończonych tras zalogowanego.
  if (routeView === 'history') {
    return (
      <div className="driver-route-shell">
        {renderKmApproveModal()}
        <div className="driver-history-header">
          <div>
            <div className="driver-trip-kicker">Kierowca</div>
            <div className="driver-trip-title">Moja historia tras</div>
            <div className="driver-trip-subtitle">{user?.name}</div>
          </div>
          <button className="driver-tool-btn" onClick={() => setRouteView('current')}>← Wróć</button>
        </div>

        <section className="driver-history-panel">
          <div className="driver-section-toolbar" style={{ marginBottom: '10px' }}>
            <div className="driver-section-title">Moja historia tras</div>
          </div>
          <div className="driver-trip-list">
            {historyTrips.length === 0 && <div className="driver-empty-row">Brak zakończonych tras</div>}
            {historyTrips.map(t => renderTripRow(t))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="driver-route-shell">
      {/* START / STATUS */}
      {!trip ? (
        <div className="driver-start-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '12px' }}>
            <div style={{ fontWeight: 700, fontSize: '16px' }}>Rozpocznij trasę</div>
            <button className="driver-tool-btn" onClick={() => setRouteView('history')}>Historia tras</button>
          </div>

          {(() => {
            const doneToday = allTrips.filter(t => t.driver_id === user?.id && t.trip_date === today && t.status === 'finished');
            return doneToday.length > 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', background: 'var(--accent-green-light)', border: '1px solid rgba(52,199,89,0.25)', borderRadius: '10px', padding: '9px 12px', marginBottom: '16px', fontWeight: 600 }}>
                ✓ Dziś zakończone trasy: {doneToday.length} — rozpoczynasz kolejną
              </div>
            ) : null;
          })()}

          {plannedTrip && (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '12px 14px', borderRadius: '12px', background: 'var(--accent-light)', border: '1px solid var(--accent)', marginBottom: '16px' }}>
              <span style={{ fontSize: '18px' }}>📋</span>
              <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600, lineHeight: 1.4 }}>
                Admin zaplanował Ci trasę na dziś — auto i trasy są już wybrane. Sprawdź i kliknij „Rozpocznij".
              </div>
            </div>
          )}

          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>Auto na dziś</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
            {VEHICLES.map(v => {
              const active = selectedCar === v.key;
              return (
                <button key={v.key} onClick={() => setSelectedCar(v.key)} style={{
                  flex: '1 1 110px', padding: '12px', borderRadius: '12px', cursor: 'pointer', fontWeight: 700, fontSize: '14px',
                  border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  background: active ? 'var(--accent-light)' : 'var(--bg-card)',
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                }}>{v.label}{defaultCar === v.key ? ' ★' : ''}</button>
              );
            })}
          </div>

          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>Trasy na dziś (możesz dodać/odjąć)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
            {allRoutes.map((r, i) => {
              const active = selectedRoutes.has(r.id);
              return (
                <button key={r.id} onClick={() => toggleRoute(r.id)} style={{
                  padding: '8px 12px', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
                  border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  background: active ? 'var(--accent-light)' : 'var(--bg-card)',
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                }}>T{i + 1} {r.name}</button>
              );
            })}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '8px', fontWeight: 700 }}>
              Punkty na wybranych trasach ({previewStops.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {previewStops.length === 0 && (
                <div className="driver-empty-row">Brak czystego do rozwiezienia na wybranych trasach</div>
              )}
              {previewStops.map(stop => {
                const pickupEntries = stop.pendingClean || [];
                const kg = Number(sumWeight(pickupEntries).toFixed(1));
                return (
                  <div key={stop.key} style={{
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    background: 'var(--bg-card)',
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '7px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <RouteBadge id={stop.route_id} />
                      <span style={{ flex: 1, minWidth: 0, color: 'var(--text-primary)', fontSize: '14px', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {stop.client_name}
                      </span>
                      {kg > 0 && <span className="kg-badge">{kg} kg</span>}
                    </div>
                    {pickupEntries.length > 0 && (
                      <div style={{ fontSize: '12px', color: 'var(--accent-green)', fontWeight: 700 }}>
                        🏭 Odbiór z pralni · {pickupEntries.length} {pickupEntries.length === 1 ? 'wpis' : 'wpisy'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <button onClick={startTrip} disabled={busy} style={{
            width: '100%', padding: '14px', borderRadius: '12px', border: 'none', cursor: 'pointer',
            background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: '15px',
          }}>▶ Rozpocznij trasę</button>
        </div>
      ) : (
        <div className={`driver-trip-panel ${trip.status === 'finished' ? 'is-finished' : ''}`}>
          <div className="driver-trip-copy">
            <div className="driver-trip-kicker">{trip.status === 'finished' ? 'Trasa zakończona' : 'Trasa w toku'}</div>
            <div className="driver-trip-title">🚐 {VEHICLE_LABELS[trip.car] || trip.car}</div>
            <div className="driver-trip-subtitle">
              Start: {fmtTime(trip.started_at)}
              {trip.ended_at ? ` · Koniec: ${fmtTime(trip.ended_at)}` : ` · Czas: ${fmtDuration(trip.started_at)}`}
              {trip.end_km ? ` · zgłoszony licznik ${trip.end_km} km${tripKmApproval(trip).approved ? '' : ' · czeka na zatwierdzenie'}` : ''}
            </div>
          </div>
          <div className="driver-trip-actions">
            <button className="driver-tool-btn" onClick={() => setRouteView('history')}>Historia tras</button>
            {trip.status === 'finished' && <button className="driver-tool-btn" onClick={() => printCard(trip)}>🖨 Pobierz kartę</button>}
            {trip.status === 'finished' && (
              <button className="driver-end-btn driver-next-trip-btn" style={{ background: 'var(--accent)' }} onClick={() => { setTrip(null); setPlannedTrip(null); setSelectedRoutes(parseRouteIds(user?.routes)); setSelectedCar(defaultCar || VEHICLES[0].key); }}>▶ Rozpocznij kolejną trasę</button>
            )}
            {trip.status === 'active' && (
              <button className="driver-tool-btn" onClick={() => { setChangeCarTarget(VEHICLES.find(v => v.key !== trip.car)?.key || null); setChangeCarKm(''); setChangeCarOpen(true); }} disabled={busy}>🚐 Zmień auto</button>
            )}
            {trip.status === 'active' && !tripHasProgress && (
              <button className="driver-tool-btn" onClick={cancelTrip} disabled={busy} style={{ color: 'var(--danger, #DC2626)', borderColor: 'var(--danger, #DC2626)' }}>Anuluj trasę</button>
            )}
            {trip.status === 'active' && <button className="driver-end-btn" onClick={() => { setEndOpen(true); setEndKm(''); }}>■ Zakończ</button>}
          </div>
        </div>
      )}

      {/* PRZYSTANKI */}
      {trip && (
        <>
          <div className="driver-section-toolbar">
            <div className="driver-section-title">
              Przystanki dziś ({visibleTripStops.length})
            </div>
            {trip.status === 'active' && <button className="driver-link-btn" onClick={() => setAddEntryFor('')}>
              🧺 Dodaj brudne
            </button>}
          </div>
          <div className="driver-stops-list">
            {visibleTripStops.length === 0 && <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', padding: '8px 0' }}>Brak przystanków dla wybranych tras</div>}
            {visibleTripStops.map(stop => {
              const pickupEntries = stop.entries || [];
              const dirtyEntries = stop.dirtyEntries || [];
              const hasPickupEntries = pickupEntries.length > 0;
              const pralniaDone = hasPickupEntries && pickupEntries.every(e => e.done);
              const deliveredDone = hasPickupEntries && pickupEntries.every(e => e.delivered);
              const pickedByMe = stopPickedByCurrentUser(stop);
              const deliveredByMe = stopDeliveredByCurrentUser(stop);
              const pickupOwner = actionOwnerLabel(stop, 'picked_by');
              const deliveryOwner = actionOwnerLabel(stop, 'delivered_by');
              const kg = Number(sumWeight(pickupEntries).toFixed(1));
              // Przyjazdy brudnego dodane dziś dla tego klienta
              const todayArrivals = dirtyEntries.length > 0
                ? dirtyEntries
                : entries.filter(e => e.client_name === stop.client_name && arrivalDateStr(e) === today);
              const isDirtyOnlyStop = !hasPickupEntries && todayArrivals.length > 0;
              // Notatka klienta (wspólna)
              const clientObj = clients.find(c => c.name === stop.client_name);
              const clientNote = clientObj?.note || '';
              const isNoteEditing = stop.client_name in noteEdit;
              return (
                <div key={stop.key} className={`driver-stop-card ${deliveredDone ? 'is-delivered' : ''}`}>
                  {/* Nagłówek klienta */}
                  <div className="driver-stop-header">
                    <div className="driver-stop-title-row">
                      <RouteBadge id={stop.route_id} />
                      <span className="driver-client-name">{stop.client_name}</span>
                      {/* Przycisk notatki */}
                      <button
                        onClick={() => toggleNoteEdit(stop.client_name, clientNote)}
                        title={clientNote ? 'Edytuj komentarz' : 'Dodaj komentarz'}
                        className={`driver-note-btn ${clientNote || isNoteEditing ? 'is-active' : ''}`}
                      >💬</button>
                      {kg > 0 && <span className="kg-badge driver-kg-badge">{kg} kg</span>}
                    </div>
                    {/* Tekst notatki — zawsze widoczny jeśli istnieje */}
                    {clientNote && !isNoteEditing && (
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', paddingLeft: '24px', marginTop: '3px', lineHeight: 1.4, fontStyle: 'italic' }}>
                        {clientNote}
                      </div>
                    )}
                    {/* Edytor notatki inline */}
                    {isNoteEditing && (
                      <textarea
                        autoFocus
                        rows={2}
                        value={noteEdit[stop.client_name]}
                        onChange={e => setNoteEdit(prev => ({ ...prev, [stop.client_name]: e.target.value }))}
                        onBlur={async (e) => {
                          await saveClientNote(stop.client_name, e.target.value);
                          setNoteEdit(prev => { const next = { ...prev }; delete next[stop.client_name]; return next; });
                        }}
                        placeholder="Komentarz do klienta (widoczny wszędzie)…"
                        style={{ width: '100%', marginTop: '6px', padding: '7px 10px', borderRadius: '9px', border: '1px solid var(--accent)', fontSize: '12px', resize: 'none', fontFamily: 'var(--font)', outline: 'none', boxSizing: 'border-box' }}
                      />
                    )}
                  </div>

                  {hasPickupEntries && (
                    <>
                      <ActionRow icon="🏭" label="Odbiór z pralni" tone="laundry" done={pralniaDone} at={pickupEntries[0]?.picked_at} extra={pralniaDone ? trolleyLabel(getPickedBaskets(stop)) : null} btnLabel="Odbierz z pralni"
                        quantityValue={draftVal(stop.key, 'pickedBaskets', 1)}
                        onQuantityChange={value => setDraftVal(stop.key, 'pickedBaskets', value)}
                        onClick={() => markPralnia(stop, draftVal(stop.key, 'pickedBaskets', 1))}
                        onUndo={() => undoPralnia(stop)}
                        undoDisabled={deliveredDone || !pickedByMe}
                        undoHint={deliveredDone ? 'Najpierw cofnij dostawę' : `Odbiór oznaczył: ${pickupOwner}`} />
                      <ActionRow icon="📦" label="Dostarczono" tone="delivered" done={deliveredDone} at={pickupEntries[0]?.delivered_at} btnLabel="Dostarczono"
                        onClick={() => markDelivered(stop)} onUndo={() => undoDelivered(stop)}
                        undoDisabled={!deliveredByMe}
                        undoHint={`Dostawę oznaczył: ${deliveryOwner}`}
                        actionDisabled={!pralniaDone || !pickedByMe}
                        actionHint={!pralniaDone ? 'Najpierw odbierz pranie z pralni' : `Dostarczyć może: ${pickupOwner}`} />
                    </>
                  )}

                  {/* Przyjazd brudnego → nowy wpis w harmonogramie */}
                  <div className={`driver-arrivals-section ${isDirtyOnlyStop ? 'is-dirty-only' : ''}`}>
                    <div className="driver-dirty-heading">Brudne pranie do pralni</div>

                    {/* ── Lista już dodanych dziś przyjazdów (zawsze widoczna) ── */}
                    {todayArrivals.length > 0 && (
                      <div className="driver-dirty-list">
                        {todayArrivals.map(a => {
                          return (
                            <div key={a.id}>
                              {/* wiersz: label + przyciski edycja/usuń */}
                              <div className={`driver-arrival-chip ${a.type === 'O' ? 'type-O' : 'type-P'}`}>
                                <span className="driver-arrival-label">
                                  <span className={`laundry-type-badge ${a.type === 'O' ? 'type-O' : 'type-P'}`}>{a.type === 'O' ? 'O' : 'P'}</span>
                                  {a.type === 'O' ? 'Obrusy' : 'Pościel'}{a.weight ? ` · ${a.weight} kg` : ''} · {trolleyLabel(a.trolleys ?? 1)}
                                </span>
                                {/* Edytuj */}
                                <button
                                  onClick={() => setViewEntry(a)}
                                  title="Szczegóły / Edytuj"
                                  className="edit-icon driver-edit-icon"
                                >Edytuj</button>
                                {/* Usuń */}
                                <button
                                  onClick={async () => {
                                    if (!window.confirm(`Usunąć: ${a.type === 'O' ? 'Obrusy' : 'Pościel'}${a.weight ? ' ' + a.weight + ' kg' : ''}?`)) return;
                                    try {
                                      setBusy(true);
                                      const { data, error } = await supabase.rpc('driver_soft_delete_entry', {
                                        p_session_token: sessionToken,
                                        p_id: a.id,
                                      });
                                      if (error) throw error;
                                      if (data?.error) throw new Error(data.error);
                                      await logAction({ userName: user.name, action: 'deleted', clientName: stop.client_name, entryId: a.id, details: 'cofnięto przyjazd brudnego' });
                                      await refetch();
                                      toastSuccess('Usunięto przyjazd');
                                    } catch (err) {
                                      toastError('Błąd: ' + err.message);
                                    } finally {
                                      setBusy(false);
                                    }
                                  }}
                                  disabled={busy}
                                  title="Usuń"
                                  className="driver-chip-icon-btn"
                                >×</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* ── Formularz nowego przyjazdu ── */}
                      {trip.status === 'active' && <button className="driver-add-inline" onClick={() => setAddEntryFor(stop.client_name)}>➕ Dodaj</button>}
                  </div>


                </div>
              );
            })}
          </div>

          {trip.status === 'active' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '18px' }}>

              {/* ODBIÓR CZYSTEGO — punkt z innej trasy (zielony) */}
              {candidates.length > 0 && (
                <div>
                  <button onClick={() => setAddOpen(o => !o)} style={{
                    width: '100%', padding: '13px', borderRadius: '12px', cursor: 'pointer',
                    border: '1px solid rgba(52,199,89,0.4)', background: 'var(--accent-green-light)',
                    color: '#1F7A36', fontWeight: 700, fontSize: '14px',
                  }}>🏭 Odbiór czystego — dodaj punkt z innej trasy</button>
                  {addOpen && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                      {candidates.map(c => (
                        <button key={c.client_name} onClick={() => addExtraClient(c.client_name)} style={{
                          display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left',
                          padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                          border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: '13px', fontWeight: 600,
                        }}>
                          <RouteBadge id={c.route_id} />
                          <span style={{ flex: 1 }}>{c.client_name}</span>
                          {(c.hasP || c.hasO) && (
                            <span className={`laundry-type-badge ${c.hasO && !c.hasP ? 'type-O' : 'type-P'}`}>
                              {c.hasP && c.hasO ? 'P/O' : c.hasO ? 'O' : 'P'}
                            </span>
                          )}
                          {c.kg > 0 && <span className="kg-badge">{c.kg} kg</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* DODANIE BRUDNEGO PRANIA (pomarańczowy) */}
              <button onClick={() => setAddEntryFor('')} style={{
                width: '100%', padding: '14px', borderRadius: '12px', cursor: 'pointer',
                border: '1px solid rgba(255,149,0,0.45)', background: 'rgba(255,149,0,0.12)',
                color: '#B45309', fontWeight: 700, fontSize: '15px',
              }}>🧺 Dodaj brudne pranie do pralni</button>

              {/* ZAKOŃCZ TRASĘ (czerwony) — drugi przycisk na dole */}
              <button onClick={() => { setEndOpen(true); setEndKm(''); }} className="driver-end-btn" style={{
                width: '100%', padding: '14px', fontSize: '15px',
              }}>■ Zakończ trasę</button>
            </div>
          )}
        </>
      )}

      {/* MODAL: dodaj przyjazd (pełny, jak w harmonogramie) */}
      {addEntryFor !== null && (() => {
        let defaultType = 'P';
        if (addEntryFor !== '') {
          const clientStop = stops.find(s => s.client_name === addEntryFor);
          const todayArrivalsForClient = entries.filter(e => e.client_name === addEntryFor && arrivalDateStr(e) === today);
          const hasP = todayArrivalsForClient.some(a => a.type === 'P');
          const hasO = todayArrivalsForClient.some(a => a.type === 'O');
          defaultType = (hasP && !hasO) ? 'O' : (hasO && !hasP) ? 'P' : (clientStop?.entries?.[0]?.type || 'P');
        }

        return (
          <AddEntryModal
            isOpen={true}
            onClose={() => setAddEntryFor(null)}
            defaultArrDay={todayArrDay}
            defaultClientName={addEntryFor || undefined}
            defaultType={defaultType}
            weekKey={weekKey}
            clients={clients.filter(c => c.route_id)}
            routes={allRoutes}
            onAdded={() => { setAddEntryFor(null); refetch(); }}
          />
        );
      })()}

      {addDirtyTrip && (() => {
        const info = tripDateInfo(addDirtyTrip.trip_date);
        return (
          <AddEntryModal
            isOpen={true}
            onClose={() => setAddDirtyTrip(null)}
            defaultArrDay={info.arrDay}
            defaultType="P"
            weekKey={info.weekKey}
            clients={clients.filter(c => c.route_id)}
            routes={allRoutes}
            onAdded={(entry) => addDirtyPickupToTrip(addDirtyTrip, entry)}
          />
        );
      })()}

      {/* MODAL: szczegóły/edycja przyjazdu */}
      {viewEntry && (
        <ViewEditEntryModal
          isOpen={true}
          onClose={() => setViewEntry(null)}
          entry={viewEntry}
          contextMode="arr"
          initiallyEditing={true}
          onUpdated={() => { setViewEntry(null); refetch(); }}
          onDeleted={() => { setViewEntry(null); refetch(); }}
          clients={clients}
          routes={allRoutes}
        />
      )}

      {/* MODAL: zakończ */}
      {endOpen && (
        <div className="ap-overlay" style={{ display: 'flex' }} onClick={() => !busy && setEndOpen(false)}>
          <div className="ap-sheet" onClick={ev => ev.stopPropagation()}>
            <div className="ap-handle"></div>
            <div className="ap-content">
              <div className="ap-title" style={{ textAlign: 'left', fontSize: '18px', marginBottom: '4px' }}>Zakończ trasę</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                Auto: <strong>{VEHICLE_LABELS[trip?.car] || trip?.car}</strong> · licznik trafi do zatwierdzenia admina ({today})
              </div>
              {pickedNotDeliveredStops.length > 0 && (
                <div style={{
                  fontSize: '12px',
                  color: '#B45309',
                  background: 'rgba(255,149,0,0.12)',
                  border: '1px solid rgba(255,149,0,0.28)',
                  borderRadius: '10px',
                  padding: '9px 11px',
                  marginBottom: '14px',
                  fontWeight: 650,
                  lineHeight: 1.4,
                }}>
                  Masz pranie odebrane z pralni: {pickedNotDeliveredNames.join(', ')}. Dostarcz je albo cofnij odbiór przed zakończeniem trasy.
                </div>
              )}
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Końcowy stan licznika (km)</label>
              <input className="ap-input" type="text" inputMode="decimal" autoFocus value={endKm}
                onChange={ev => setEndKm(ev.target.value)} placeholder="np. 379978" style={{ marginTop: '6px', marginBottom: '16px' }} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setEndOpen(false)} disabled={busy} style={{ flex: 1, padding: '13px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', fontWeight: 600 }}>Anuluj</button>
                <button onClick={endTrip} disabled={busy} style={{ flex: 2, padding: '13px', borderRadius: '12px', border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>{busy ? 'Zapisywanie…' : 'Zakończ i zgłoś licznik'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: zmień auto */}
      {changeCarOpen && trip && (
        <div className="ap-overlay" style={{ display: 'flex' }} onClick={() => !busy && setChangeCarOpen(false)}>
          <div className="ap-sheet" onClick={ev => ev.stopPropagation()}>
            <div className="ap-handle"></div>
            <div className="ap-content">
              <div className="ap-title" style={{ textAlign: 'left', fontSize: '18px', marginBottom: '4px' }}>Zmień auto</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                Obecne auto: <strong>{VEHICLE_LABELS[trip.car] || trip.car}</strong>
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '8px', fontWeight: 700 }}>Nowe auto</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                {VEHICLES.filter(v => v.key !== trip.car).map(v => {
                  const active = changeCarTarget === v.key;
                  return (
                    <button key={v.key} onClick={() => setChangeCarTarget(v.key)} style={{
                      flex: '1 1 110px', padding: '12px', borderRadius: '12px', cursor: 'pointer', fontWeight: 700, fontSize: '14px',
                      border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                      background: active ? 'var(--accent-light)' : 'var(--bg-card)',
                      color: active ? 'var(--accent)' : 'var(--text-secondary)',
                    }}>{v.label}</button>
                  );
                })}
              </div>

              {tripHasProgress ? (
                <>
                  {pickedNotDeliveredStops.length > 0 && (
                    <div style={{ fontSize: '12px', color: '#B45309', background: 'rgba(255,149,0,0.12)', border: '1px solid rgba(255,149,0,0.28)', borderRadius: '10px', padding: '9px 11px', marginBottom: '14px', fontWeight: 650, lineHeight: 1.4 }}>
                      Masz pranie odebrane z pralni: {pickedNotDeliveredNames.join(', ')}. Dostarcz je albo cofnij odbiór przed zmianą auta.
                    </div>
                  )}
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px', lineHeight: 1.4 }}>
                    Auto już jeździło — zamkniemy tę nogę z licznikiem (km trafią do kosztów <strong>{VEHICLE_LABELS[trip.car] || trip.car}</strong>), a potem wybierzesz trasy dla nowego auta.
                  </div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Licznik auta {VEHICLE_LABELS[trip.car] || trip.car} (km)</label>
                  <input className="ap-input" type="text" inputMode="decimal" autoFocus value={changeCarKm}
                    onChange={ev => setChangeCarKm(ev.target.value)} placeholder="np. 379978" style={{ marginTop: '6px', marginBottom: '16px' }} />
                </>
              ) : (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.4 }}>
                  Nic jeszcze nie zrobiono — zmienimy auto bez licznika. Trasy i to, co załadowane, zostają.
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setChangeCarOpen(false)} disabled={busy} style={{ flex: 1, padding: '13px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', fontWeight: 600 }}>Anuluj</button>
                <button onClick={changeCar} disabled={busy} style={{ flex: 2, padding: '13px', borderRadius: '12px', border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>{busy ? 'Zapisywanie…' : 'Zmień auto'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
