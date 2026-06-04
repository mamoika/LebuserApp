import { useState, useEffect } from 'react';
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
function nextWeekKey(wk) {
  const dt = parseMonday(wk);
  dt.setDate(dt.getDate() + 7);
  return formatWeekKey(dt);
}

const pfLabel = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)' };
const pfInput = { padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--bg-card)', color: 'var(--text-primary)' };
const DAY_SHORT = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt'];

function trolleyLabel(count) {
  const n = Number(count);
  if (!Number.isFinite(n)) return '0 wózków';
  if (n === 1) return '1 wózek';
  if (n >= 2 && n <= 4) return `${n} wózki`;
  return `${n} wózków`;
}

// Lista najbliższych dni roboczych (data + wyliczony dzień/tydzień odbioru)
function pickupDateOptions() {
  const opts = [];
  const start = new Date();
  for (let i = 1; i <= 14 && opts.length < 10; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const wd = (d.getDay() + 6) % 7 + 1; // Pn=1 … Nd=7
    if (wd > 5) continue;
    const monday = new Date(d);
    monday.setDate(d.getDate() - (wd - 1));
    opts.push({
      value: ymd(d),
      label: `${DAY_SHORT[wd - 1]} ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`,
      pickDay: wd,
      pickWeekKey: formatWeekKey(monday),
    });
  }
  return opts;
}

export default function DriverRouteView({ manageMode = false }) {
  const { user, isAdmin } = useAuth();
  const { entries, allRoutes, clients, loading, refetch } = useAppData();

  const [trip, setTrip] = useState(null);
  const [allTrips, setAllTrips] = useState([]);
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
  const [addOpen, setAddOpen] = useState(false);
  const [addEntryFor, setAddEntryFor] = useState(null); // nazwa klienta, dla którego otwieramy AddEntryModal
  const [viewEntry, setViewEntry] = useState(null); // wpis do podglądu/edycji w ViewEditEntryModal
  const [draft, setDraft] = useState({}); // { clientKey: { note } }
  const [noteEdit, setNoteEdit] = useState({}); // { clientName: value } — notatka klienta w trakcie edycji

  const today = ymd(new Date());
  const weekKey = formatWeekKey(getCurrentMonday());
  const todayArrDay = Math.min(5, Math.max(1, (new Date().getDay() + 6) % 7 + 1)); // 1=Pn…5=Pt
  const routeMap = Object.fromEntries(allRoutes.map((r, i) => [r.id, { name: r.name, num: i + 1 }]));

  const loadTrips = async () => {
    let q = supabase.from('driver_trips').select('*').order('started_at', { ascending: false }).limit(60);
    if (!isAdmin) q = q.eq('driver_id', user?.id);
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
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setTripLoading(true);
      const [trips, { data: setting }] = await Promise.all([
        loadTrips(),
        supabase.from('app_settings').select('value').eq('key', DRIVER_CARS_KEY).maybeSingle(),
      ]);
      if (cancelled) return;
      const ownToday = (trips || []).filter(t => t.driver_id === user?.id && t.trip_date === today);
      const currentTrip = ownToday.find(t => t.status === 'active') || ownToday[0] || null;
      setTrip(currentTrip);
      const car = setting?.value?.[user?.id] || null;
      setDefaultCar(car);
      if (currentTrip) setSelectedCar(currentTrip.car);
      else if (car) setSelectedCar(car);
      setTripLoading(false);
    };
    if (user?.id) load();
    return () => { cancelled = true; };
  }, [user?.id, today, isAdmin]);

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60000);
    const channel = supabase.channel('driver-trips-route-view')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_trips' }, loadTrips)
      .subscribe();
    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [user?.id, isAdmin]);

  /* ── przystanki = klienci z ODBIOREM dziś (wg harmonogramu) ──
     Każdy taki wpis ma dziś 2 czynności kierowcy: odbiór czystego z pralni
     (done) i dostawę do klienta (delivered). Dodatkowo przy kliencie można
     dorzucić "przyjazd" brudnego (nowy wpis w grafiku). */
  const activeRouteIds = trip ? parseRouteIds(trip.routes) : selectedRoutes;
  let extraClients = [];
  try { extraClients = JSON.parse(trip?.extra_clients || '[]'); } catch { extraClients = []; }
  const extraSet = new Set(extraClients);
  const includeEntry = e => activeRouteIds.size === 0 || activeRouteIds.has(e.route_id) || extraSet.has(e.client_name);

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

  entries.filter(includeEntry).forEach(e => {
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

  // Kandydaci do dorzucenia: klienci z odbiorem dziś, których nie ma na liście
  const shownClients = new Set(stops.map(s => s.client_name));
  const candMap = new Map();
  entries.forEach(e => {
    if (pickupDateStr(e) === today && !shownClients.has(e.client_name)) {
      if (!candMap.has(e.client_name)) candMap.set(e.client_name, e.route_id);
    }
  });
  const candidates = [...candMap.entries()].map(([client_name, route_id]) => ({ client_name, route_id }));

  const getTripStops = (sourceTrip) => {
    if (!sourceTrip) return [];
    const routeIds = parseRouteIds(sourceTrip.routes);
    let extras = [];
    try { extras = JSON.parse(sourceTrip.extra_clients || '[]'); } catch { extras = []; }
    const extrasSet = new Set(extras);
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
      if (routeIds.size > 0 && !routeIds.has(e.route_id) && !extrasSet.has(e.client_name)) return;
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

  const tripIncludesEntry = (sourceTrip, entry) => {
    const routeIds = parseRouteIds(sourceTrip?.routes);
    let extras = [];
    try { extras = JSON.parse(sourceTrip?.extra_clients || '[]'); } catch { extras = []; }
    const extrasSet = new Set(extras);
    return routeIds.size === 0 || routeIds.has(entry.route_id) || extrasSet.has(entry.client_name);
  };

  const getTripDirtyEntries = (sourceTrip) => entries.filter(e =>
    arrivalDateStr(e) === sourceTrip?.trip_date && tripIncludesEntry(sourceTrip, e)
  );

  const dirtyTrolleysForClient = (clientName, dateStr) => entries
    .filter(e => e.client_name === clientName && arrivalDateStr(e) === dateStr)
    .reduce((sum, e) => sum + (Number(e.trolleys) || 1), 0);

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

  const distanceLabel = (sourceTrip) => {
    const dist = distanceForTrip(sourceTrip);
    if (dist !== null) return `przejazd ${dist} km`;
    return `licznik ${sourceTrip.end_km ?? '—'} km`;
  };

  const tripKmApproval = (sourceTrip) => {
    if (!sourceTrip?.end_km) return { approved: false, currentValue: null, field: null };
    const field = vehicleEndColumn(sourceTrip.car);
    const row = dailyCosts.find(r => r.entry_date === sourceTrip.trip_date);
    const currentValue = row?.[field];
    const approved = String(currentValue ?? '').trim() === String(sourceTrip.end_km ?? '').trim();
    return { approved, currentValue, field };
  };

  const activeTrips = allTrips.filter(t => t.status === 'active');
  const historyTrips = allTrips.filter(t => t.status === 'finished').slice(0, 12);
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

  /* ── akcje ── */
  const startTrip = async () => {
    try {
      setBusy(true);
      const { data, error } = await supabase.from('driver_trips').insert({
        driver_id: user.id, driver_name: user.name, trip_date: today, car: selectedCar,
        routes: [...selectedRoutes].join(','), status: 'active',
      }).select().single();
      if (error) throw error;
      setTrip(data);
      await loadTrips();
      await logAction({ userName: user.name, action: 'trip_start', details: `Auto: ${VEHICLE_LABELS[selectedCar] || selectedCar}` });
      toastSuccess('Trasa rozpoczęta');
    } catch (err) { toastError('Błąd startu trasy: ' + err.message); }
    finally { setBusy(false); }
  };

  // 1) Odbiór czystego z pralni
  const markPralnia = async (stop, baskets = 1) => {
    try {
      setBusy(true);
      const ids = stop.entries.map(e => e.id);
      const basketCount = Math.max(0, Number(baskets) || 1);
      const { error } = await supabase.from('entries')
        .update({ done: true, picked_by: user.name, picked_at: new Date().toISOString(), picked_baskets: basketCount })
        .in('id', ids);
      if (error) throw error;
      await logAction({ userName: user.name, action: 'done', clientName: stop.client_name, entryId: ids[0], details: `odbiór z pralni, ${Number(sumWeight(stop.entries).toFixed(1))} kg, ${trolleyLabel(basketCount)}` });
      await refetch();
    } catch (err) { toastError('Błąd: ' + err.message); }
    finally { setBusy(false); }
  };

  // 2) Dostawa do klienta
  const markDelivered = async (stop) => {
    try {
      setBusy(true);
      const ids = stop.entries.map(e => e.id);
      const { error } = await supabase.from('entries')
        .update({ delivered: true, delivered_by: user.name, delivered_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
      await logAction({ userName: user.name, action: 'delivered', clientName: stop.client_name, entryId: ids[0], details: `dostawa do klienta` });
      await refetch();
    } catch (err) { toastError('Błąd: ' + err.message); }
    finally { setBusy(false); }
  };

  // Cofnij dostawę (np. klienta nie było, pranie wraca na pralnię)
  const undoDelivered = async (stop) => {
    try {
      setBusy(true);
      const ids = stop.entries.map(e => e.id);
      const { error } = await supabase.from('entries')
        .update({ delivered: false, delivered_by: null, delivered_at: null }).in('id', ids);
      if (error) throw error;
      await logAction({ userName: user.name, action: 'undone', clientName: stop.client_name, entryId: ids[0], details: 'cofnięto dostawę' });
      await refetch();
    } catch (err) { toastError('Błąd: ' + err.message); }
    finally { setBusy(false); }
  };

  // Cofnij odbiór z pralni — dozwolone dopiero gdy dostawa jest cofnięta
  const undoPralnia = async (stop) => {
    if (stop.entries.some(e => e.delivered)) { toastError('Najpierw cofnij dostawę'); return; }
    try {
      setBusy(true);
      const ids = stop.entries.map(e => e.id);
      const { error } = await supabase.from('entries')
        .update({ done: false, picked_by: null, picked_at: null, picked_baskets: null }).in('id', ids);
      if (error) throw error;
      await logAction({ userName: user.name, action: 'undone', clientName: stop.client_name, entryId: ids[0], details: 'cofnięto odbiór z pralni' });
      await refetch();
    } catch (err) { toastError('Błąd: ' + err.message); }
    finally { setBusy(false); }
  };




  const saveNote = async (stop) => {
    const noteVal = draftVal(stop.key, 'note', stop.entries[0]?.driver_note);
    const ids = stop.entries.map(e => e.id);
    if (ids.length === 0) return;
    await supabase.from('entries').update({ driver_note: noteVal || null }).in('id', ids);
  };

  // Notatka klienta — wspólna (clients.note), widoczna w harmonogramie i na trasie
  const saveClientNote = async (clientName, val) => {
    const { error } = await supabase.from('clients').update({ note: val || null }).eq('name', clientName);
    if (error) { toastError('Błąd zapisu notatki: ' + error.message); return; }
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

  const endTrip = async () => {
    const km = parseFloat(String(endKm).replace(',', '.'));
    if (!endKm || isNaN(km)) { toastError('Podaj końcowy stan licznika (km)'); return; }
    try {
      setBusy(true);
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

  const approveTripKm = async (sourceTrip) => {
    if (!isAdmin || !sourceTrip?.end_km) return;
    try {
      setBusy(true);
      const col = vehicleEndColumn(sourceTrip.car);
      const km = sourceTrip.end_km;
      const { data: existing } = await supabase.from('daily_costs').select('entry_date').eq('entry_date', sourceTrip.trip_date).maybeSingle();
      const { error } = existing
        ? await supabase.from('daily_costs').update({ [col]: km }).eq('entry_date', sourceTrip.trip_date)
        : await supabase.from('daily_costs').insert({ entry_date: sourceTrip.trip_date, [col]: km });
      if (error) throw error;
      await logAction({ userName: user.name, action: 'edited', details: `Zatwierdzono licznik trasy: ${sourceTrip.driver_name || 'kierowca'}, ${VEHICLE_LABELS[sourceTrip.car] || sourceTrip.car}, ${km} km` });
      await loadTrips();
      toastSuccess('Licznik zatwierdzony i zapisany w kosztach');
    } catch (err) {
      toastError('Błąd zatwierdzania licznika: ' + err.message);
    } finally {
      setBusy(false);
    }
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
    const showFoot = t.end_km || t.status === 'finished';
    return (
      <div
        key={t.id}
        className={`trip-card ${statusClass}`}
        role="button"
        tabIndex={0}
        onClick={() => setDetailTrip(t)}
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
              {t.end_km ? `${kmApproval.approved ? '✓' : '⏳'} licznik ${t.end_km} km` : ''}
            </span>
            <div className="trip-card-actions">
              {isAdmin && t.end_km && !kmApproval.approved && (
                <button className="driver-mini-card-btn" onClick={(e) => { e.stopPropagation(); approveTripKm(t); }} disabled={busy}>Zatwierdź km</button>
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
          <button className="driver-tool-btn" onClick={() => setDetailTrip(null)}>← Wróć do listy</button>
        </div>

        <div style={{ margin: '4px 0 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <TripProgress stats={stats} />
          <TripMetrics stats={stats} />
        </div>

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

  if (routeView === 'history') {
    // Podgląd progresu wybranej trasy (read-only) — wspólny dla admina i kierowcy.
    if (detailTrip) {
      const live = allTrips.find(t => t.id === detailTrip.id) || detailTrip;
      return renderTripDetail(live);
    }
    if (isAdmin) {
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

      // (data → zbiór tras już obsłużonych realną trasą tego dnia)
      const coveredByDate = new Map();
      allTrips.forEach(t => {
        if (t.status === 'planned' || !t.trip_date) return;
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

      // Dodajemy "Brak przypisania" do opcji kierowców jeśli są wirtualne trasy
      if (virtualPlannedTrips.length > 0 && !uniqueDrivers.includes('Brak przypisania')) {
        uniqueDrivers.push('Brak przypisania');
        uniqueDrivers.sort();
      }

      return (
        <div className="admin-dashboard-shell">
          <div className="driver-history-header">
            <div>
              <div className="driver-trip-kicker">Panel Administratora</div>
              <div className="driver-trip-title">{manageMode ? 'Trasy na żywo' : 'Zarządzanie Trasami'}</div>
              <div className="driver-trip-subtitle">{manageMode ? 'Kliknij trasę, aby zobaczyć progres' : `Sortowanie i grupowanie tras (${allTrips.length} w historii)`}</div>
            </div>
            {!manageMode && <button className="driver-tool-btn" onClick={() => setRouteView('current')}>← Wróć do widoku</button>}
          </div>

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
            <button className="driver-add-primary" style={{ marginLeft: 'auto', padding: '10px 16px', borderRadius: '8px', minWidth: 'auto', width: 'auto', fontSize: '13px' }} onClick={() => setAddEntryFor('')}>
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

    return (
      <div className="driver-route-shell">
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
          <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '12px' }}>Rozpocznij trasę</div>

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
            {trip.status === 'active' && <button className="driver-end-btn" onClick={() => { setEndOpen(true); setEndKm(''); }}>■ Zakończ</button>}
          </div>
        </div>
      )}

      {/* PRZYSTANKI */}
      {trip && (
        <>
          <div className="driver-section-toolbar">
            <div className="driver-section-title">
              Przystanki dziś ({stops.length})
            </div>
            {trip.status === 'active' && <button className="driver-link-btn" onClick={() => setAddEntryFor('')}>
              ➕ Dodaj przejazd
            </button>}
          </div>
          <div className="driver-stops-list">
            {stops.length === 0 && <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', padding: '8px 0' }}>Brak przystanków dla wybranych tras</div>}
            {stops.map(stop => {
              const pickupEntries = stop.entries || [];
              const dirtyEntries = stop.dirtyEntries || [];
              const hasPickupEntries = pickupEntries.length > 0;
              const pralniaDone = hasPickupEntries && pickupEntries.every(e => e.done);
              const deliveredDone = hasPickupEntries && pickupEntries.every(e => e.delivered);
              const kg = Number(sumWeight(pickupEntries).toFixed(1));
              const formOpen = false; // AddEntryModal zastąpił inline formularz
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
                        onUndo={() => undoPralnia(stop)} undoDisabled={deliveredDone} undoHint="Najpierw cofnij dostawę" />
                      <ActionRow icon="📦" label="Dostarczono" tone="delivered" done={deliveredDone} at={pickupEntries[0]?.delivered_at} btnLabel="Dostarczono"
                        onClick={() => markDelivered(stop)} onUndo={() => undoDelivered(stop)}
                        actionDisabled={!pralniaDone} actionHint="Najpierw odbierz pranie z pralni" />
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
                                    const { error } = await supabase.from('entries').delete().eq('id', a.id);
                                    if (error) { toastError('Błąd: ' + error.message); return; }
                                    await logAction({ userName: user.name, action: 'deleted', clientName: stop.client_name, entryId: a.id, details: 'cofnięto przyjazd brudnego' });
                                    await refetch();
                                    toastSuccess('Usunięto przyjazd');
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

          {/* Dodaj punkt z obcej trasy */}
          {trip.status === 'active' && candidates.length > 0 && (
            <div>
              <button onClick={() => setAddOpen(o => !o)} style={{
                width: '100%', padding: '11px', borderRadius: '11px', cursor: 'pointer',
                border: '1px dashed var(--border)', background: 'var(--bg-card)',
                color: 'var(--text-secondary)', fontWeight: 600, fontSize: '13px',
              }}>➕ Dodaj punkt z innej trasy</button>
              {addOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                  {candidates.map(c => (
                    <button key={c.client_name} onClick={() => addExtraClient(c.client_name)} style={{
                      display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left',
                      padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                      border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: '13px', fontWeight: 600,
                    }}>
                      <RouteBadge id={c.route_id} />
                      {c.client_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {trip.status === 'active' && <div style={{ marginTop: '16px' }}>
            <button onClick={() => setAddEntryFor('')} style={{
              width: '100%',
            }} className="driver-add-primary">➕ Dodaj przejazd</button>
          </div>}
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
    </div>
  );
}
