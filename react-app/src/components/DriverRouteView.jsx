import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../hooks/useAppData';
import { logAction } from '../lib/logger';
import { toastError, toastSuccess } from '../lib/toast';
import { routeBadgeStyle } from '../lib/visualSystem';
import { getCurrentMonday, formatWeekKey } from '../lib/dateUtils';
import { VEHICLES, VEHICLE_LABELS, vehicleEndColumn, DRIVER_CARS_KEY } from '../lib/vehicles';
import { AddEntryModal } from './modals/EntryModals';

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

export default function DriverRouteView() {
  const { user } = useAuth();
  const { entries, allRoutes, clients, loading, refetch } = useAppData();

  const [trip, setTrip] = useState(null);
  const [tripLoading, setTripLoading] = useState(true);
  const [defaultCar, setDefaultCar] = useState(null);
  const [selectedCar, setSelectedCar] = useState(VEHICLES[0].key);
  const [selectedRoutes, setSelectedRoutes] = useState(() => parseRouteIds(user?.routes));
  const [busy, setBusy] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [endKm, setEndKm] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addEntryFor, setAddEntryFor] = useState(null); // nazwa klienta, dla którego otwieramy AddEntryModal
  const [pf, setPf] = useState(null); // edycja istniejącego przyjazdu (editId)
  const [draft, setDraft] = useState({}); // { clientKey: { note } }
  const [noteEdit, setNoteEdit] = useState({}); // { clientName: value } — notatka klienta w trakcie edycji

  const today = ymd(new Date());
  const weekKey = formatWeekKey(getCurrentMonday());
  const todayArrDay = Math.min(5, Math.max(1, (new Date().getDay() + 6) % 7 + 1)); // 1=Pn…5=Pt
  const routeMap = Object.fromEntries(allRoutes.map((r, i) => [r.id, { name: r.name, num: i + 1 }]));

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setTripLoading(true);
      const [{ data: trips }, { data: setting }] = await Promise.all([
        supabase.from('driver_trips').select('*')
          .eq('driver_id', user?.id).eq('trip_date', today).eq('status', 'active')
          .order('started_at', { ascending: false }).limit(1),
        supabase.from('app_settings').select('value').eq('key', DRIVER_CARS_KEY).maybeSingle(),
      ]);
      if (cancelled) return;
      const active = trips?.[0] || null;
      setTrip(active);
      const car = setting?.value?.[user?.id] || null;
      setDefaultCar(car);
      if (active) setSelectedCar(active.car);
      else if (car) setSelectedCar(car);
      setTripLoading(false);
    };
    if (user?.id) load();
    return () => { cancelled = true; };
  }, [user?.id, today]);

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
  entries.filter(includeEntry).forEach(e => {
    if (pickupDateStr(e) !== today) return;
    const key = e.client_name || '—';
    if (!stopsMap.has(key)) stopsMap.set(key, { key, client_name: e.client_name, route_id: e.route_id, entries: [] });
    stopsMap.get(key).entries.push(e);
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
      await logAction({ userName: user.name, action: 'trip_start', details: `Auto: ${VEHICLE_LABELS[selectedCar] || selectedCar}` });
      toastSuccess('Trasa rozpoczęta');
    } catch (err) { toastError('Błąd startu trasy: ' + err.message); }
    finally { setBusy(false); }
  };

  // 1) Odbiór czystego z pralni
  const markPralnia = async (stop) => {
    try {
      setBusy(true);
      const ids = stop.entries.map(e => e.id);
      const { error } = await supabase.from('entries')
        .update({ done: true, picked_by: user.name, picked_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
      await logAction({ userName: user.name, action: 'done', clientName: stop.client_name, entryId: ids[0], details: `odbiór z pralni, ${Number(sumWeight(stop.entries).toFixed(1))} kg` });
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
        .update({ done: false, picked_by: null, picked_at: null }).in('id', ids);
      if (error) throw error;
      await logAction({ userName: user.name, action: 'undone', clientName: stop.client_name, entryId: ids[0], details: 'cofnięto odbiór z pralni' });
      await refetch();
    } catch (err) { toastError('Błąd: ' + err.message); }
    finally { setBusy(false); }
  };

  // Przyjazd brudnego — otwieramy pełny AddEntryModal z pre-wybranym klientem
  const setPfField = (field, value) => setPf(p => ({ ...p, [field]: value }));


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
      const col = vehicleEndColumn(trip.car);
      const { data: existing } = await supabase.from('daily_costs').select('entry_date').eq('entry_date', today).maybeSingle();
      const { error: cErr } = existing
        ? await supabase.from('daily_costs').update({ [col]: km }).eq('entry_date', today)
        : await supabase.from('daily_costs').insert({ entry_date: today, [col]: km });
      if (cErr) throw cErr;
      await logAction({ userName: user.name, action: 'trip_end', details: `Auto: ${VEHICLE_LABELS[trip.car] || trip.car}, licznik: ${km} km` });
      setTrip({ ...trip, end_km: km, status: 'finished' });
      setEndOpen(false); setEndKm('');
      toastSuccess('Trasa zakończona, licznik zapisany');
    } catch (err) { toastError('Błąd zakończenia trasy: ' + err.message); }
    finally { setBusy(false); }
  };

  /* ── wydruk karty ── */
  const printCard = () => {
    const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const rows = stops.map((s, i) => {
      const pralnia = s.entries.every(e => e.done);
      const delivered = s.entries.every(e => e.delivered);
      const time = fmtTime(s.entries[0]?.delivered_at || s.entries[0]?.picked_at);
      const kg = Number(sumWeight(s.entries).toFixed(1)) || '';
      const note = s.entries[0]?.driver_note || '';
      return `<tr>
        <td>${i + 1}</td>
        <td class="l">${esc(s.client_name)}</td>
        <td>${time}</td>
        <td>${pralnia ? '✓' : '—'}</td>
        <td>${delivered ? '✓' : '—'}</td>
        <td>${kg}</td>
        <td class="l">${esc(note)}</td>
      </tr>`;
    }).join('');
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
        @media print{button{display:none}}
      </style></head><body>
      <h1>KARTA PRACY KIEROWCY</h1>
      <div class="head">
        <div><b>Kierowca:</b> ${esc(user?.name)}</div>
        <div><b>Data:</b> ${today}</div>
        <div><b>Samochód:</b> ${esc(VEHICLE_LABELS[trip?.car] || trip?.car || '')}</div>
        <div><b>KM koniec:</b> ${trip?.end_km ?? ''}</div>
      </div>
      <table>
        <thead><tr><th>Lp.</th><th class="l">Hotel/Klient</th><th>Godz.</th><th>Z pralni</th><th>Dostarczono</th><th>Kg</th><th class="l">Uwagi</th></tr></thead>
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

  const ActionRow = ({ icon, label, color, done, at, btnLabel, onClick, onUndo, undoDisabled, undoHint }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
      <span style={{ flex: 1, fontWeight: 700, fontSize: '13px', color }}>{icon} {label}</span>
      {done ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color }}>✓ {fmtTime(at)}</span>
          {onUndo && trip && (
            <button onClick={onUndo} disabled={busy || undoDisabled} title={undoDisabled ? undoHint : 'Cofnij'} style={{
              padding: '6px 10px', borderRadius: '8px', cursor: undoDisabled ? 'not-allowed' : 'pointer',
              border: '1px solid var(--border)', background: 'var(--bg-card)',
              color: undoDisabled ? 'var(--text-tertiary)' : 'var(--text-secondary)',
              fontSize: '11px', fontWeight: 600, opacity: undoDisabled ? 0.5 : 1,
            }}>↩︎ cofnij</button>
          )}
        </div>
      ) : trip ? (
        <button onClick={onClick} disabled={busy} style={{
          width: '120px', padding: '9px 0', borderRadius: '9px', border: 'none', cursor: 'pointer',
          background: color, color: '#fff', fontWeight: 700, fontSize: '12px', flexShrink: 0,
        }}>{btnLabel}</button>
      ) : <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>—</span>}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '640px' }}>
      {/* START / STATUS */}
      {!trip ? (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px' }}>
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
        <div style={{ background: 'var(--accent-light)', border: '1px solid var(--accent)', borderRadius: '16px', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--accent)' }}>🚐 Trasa w toku · {VEHICLE_LABELS[trip.car] || trip.car}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>Start: {fmtTime(trip.started_at)}</div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={printCard} style={{
              padding: '11px 14px', borderRadius: '11px', border: '1px solid var(--border)', cursor: 'pointer',
              background: 'var(--bg-card)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '13px',
            }}>🖨 Karta</button>
            <button onClick={() => { setEndOpen(true); setEndKm(''); }} style={{
              padding: '11px 16px', borderRadius: '11px', border: 'none', cursor: 'pointer',
              background: 'var(--accent-red, #FF3B30)', color: '#fff', fontWeight: 700, fontSize: '13px',
            }}>■ Zakończ</button>
          </div>
        </div>
      )}

      {/* PRZYSTANKI */}
      {trip && (
        <>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>
            Przystanki dziś ({stops.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {stops.length === 0 && <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', padding: '8px 0' }}>Brak przystanków dla wybranych tras</div>}
            {stops.map(stop => {
              const pralniaDone = stop.entries.every(e => e.done);
              const deliveredDone = stop.entries.every(e => e.delivered);
              const kg = Number(sumWeight(stop.entries).toFixed(1));
              const formOpen = false; // AddEntryModal zastąpił inline formularz
              // Przyjazdy brudnego dodane dziś dla tego klienta
              const todayArrivals = entries.filter(e => e.client_name === stop.client_name && arrivalDateStr(e) === today);
              // Notatka klienta (wspólna)
              const clientObj = clients.find(c => c.name === stop.client_name);
              const clientNote = clientObj?.note || '';
              const isNoteEditing = stop.client_name in noteEdit;
              return (
                <div key={stop.key} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '12px 14px' }}>
                  {/* Nagłówek klienta */}
                  <div style={{ marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <RouteBadge id={stop.route_id} />
                      <span style={{ fontWeight: 700, fontSize: '15px', flex: 1 }}>{stop.client_name}</span>
                      {/* Przycisk notatki */}
                      <button
                        onClick={() => toggleNoteEdit(stop.client_name, clientNote)}
                        title={clientNote ? 'Edytuj komentarz' : 'Dodaj komentarz'}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px', opacity: clientNote || isNoteEditing ? 1 : 0.35, padding: '2px 4px', lineHeight: 1 }}
                      >💬</button>
                      {kg > 0 && <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.05)', padding: '3px 8px', borderRadius: '6px' }}>{kg} kg</span>}
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

                  <ActionRow icon="🏭" label="Odbiór z pralni" color="#AF52DE" done={pralniaDone} at={stop.entries[0]?.picked_at} btnLabel="Odebrano z pralni"
                    onClick={() => markPralnia(stop)} onUndo={() => undoPralnia(stop)} undoDisabled={deliveredDone} undoHint="Najpierw cofnij dostawę" />
                  <ActionRow icon="📦" label="Dostarczono" color="#34C759" done={deliveredDone} at={stop.entries[0]?.delivered_at} btnLabel="Dostarczono"
                    onClick={() => markDelivered(stop)} onUndo={() => undoDelivered(stop)} />

                  {/* Przyjazd brudnego → nowy wpis w harmonogramie */}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '2px' }}>

                    {/* ── Lista już dodanych dziś przyjazdów (zawsze widoczna) ── */}
                    {todayArrivals.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
                        {todayArrivals.map(a => {
                          const isEditing = pf?.editId === a.id;
                          return (
                            <div key={a.id}>
                              {/* wiersz: label + przyciski edycja/usuń */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: isEditing ? 'rgba(37,99,235,0.07)' : 'rgba(52,199,89,0.08)', borderRadius: '8px', padding: '5px 8px', border: isEditing ? '1px solid var(--accent)' : '1px solid transparent' }}>
                                <span style={{ fontSize: '12px', color: isEditing ? 'var(--accent)' : '#34C759', fontWeight: 700, flex: 1 }}>
                                  {isEditing ? '✏️' : '✓'} {a.type === 'O' ? 'Obrusy' : 'Pościel'}{a.weight ? ` · ${a.weight} kg` : ''}
                                </span>
                                {/* Edytuj */}
                                <button
                                  onClick={() => {
                                    if (isEditing) { setPf(null); return; }
                                    setPf({ editId: a.id, stopKey: stop.key, client_name: stop.client_name, routeId: stop.route_id, type: a.type || 'P', kg: a.weight ?? '' });
                                  }}
                                  title={isEditing ? 'Anuluj edycję' : 'Edytuj kg / typ'}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: isEditing ? 'var(--accent)' : 'var(--text-tertiary)', fontSize: '13px', padding: '2px 5px', borderRadius: '4px' }}
                                >✏️</button>
                                {/* Usuń */}
                                <button
                                  onClick={async () => {
                                    if (!window.confirm(`Usunąć: ${a.type === 'O' ? 'Obrusy' : 'Pościel'}${a.weight ? ' ' + a.weight + ' kg' : ''}?`)) return;
                                    const { error } = await supabase.from('entries').delete().eq('id', a.id);
                                    if (error) { toastError('Błąd: ' + error.message); return; }
                                    await logAction({ userName: user.name, action: 'deleted', clientName: stop.client_name, entryId: a.id, details: 'cofnięto przyjazd brudnego' });
                                    if (pf?.editId === a.id) setPf(null);
                                    await refetch();
                                    toastSuccess('Usunięto przyjazd');
                                  }}
                                  disabled={busy}
                                  title="Usuń"
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '14px', lineHeight: 1, padding: '2px 4px', borderRadius: '4px' }}
                                >×</button>
                              </div>

                              {/* Inline edytor — tylko dla edytowanego wpisu */}
                              {isEditing && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 8px', background: 'rgba(37,99,235,0.04)', borderRadius: '0 0 8px 8px', marginTop: '-4px' }}>
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    {[['P', 'Pościel'], ['O', 'Obrusy']].map(([val, lbl]) => (
                                      <button key={val} onClick={() => setPfField('type', val)} style={{
                                        flex: 1, padding: '7px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '12px',
                                        border: `2px solid ${pf.type === val ? 'var(--accent)' : 'var(--border)'}`,
                                        background: pf.type === val ? 'var(--accent-light)' : 'var(--bg-card)',
                                        color: pf.type === val ? 'var(--accent)' : 'var(--text-secondary)',
                                      }}>{lbl}</button>
                                    ))}
                                  </div>
                                  <label style={pfLabel}>Kg (brudne)
                                    <input type="number" inputMode="decimal" placeholder="kg" value={pf.kg}
                                      onChange={e => setPfField('kg', e.target.value)} style={pfInput} autoFocus />
                                  </label>
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                      onClick={async () => {
                                        const kg = parseFloat(String(pf.kg).replace(',', '.'));
                                        const { error } = await supabase.from('entries').update({
                                          type: pf.type,
                                          weight: isNaN(kg) ? null : kg,
                                          weighed_kg: isNaN(kg) ? null : kg,
                                        }).eq('id', a.id);
                                        if (error) { toastError('Błąd zapisu: ' + error.message); return; }
                                        await logAction({ userName: user.name, action: 'edited', clientName: stop.client_name, entryId: a.id, details: `typ: ${pf.type}, kg: ${isNaN(kg) ? '—' : kg}` });
                                        setPf(null);
                                        await refetch();
                                        toastSuccess('Zaktualizowano przyjazd');
                                      }}
                                      disabled={busy}
                                      style={{ flex: 2, padding: '9px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: '12px' }}
                                    >{busy ? 'Zapisuję…' : '💾 Zapisz zmiany'}</button>
                                    <button onClick={() => setPf(null)} style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600 }}>Anuluj</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* ── Formularz nowego przyjazdu ── */}
                      <button onClick={() => setAddEntryFor(stop.client_name)} style={{
                        alignSelf: 'flex-start', background: 'none', border: '1px dashed var(--border)', borderRadius: '9px', padding: '8px 12px',
                        cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block',
                      }}>➕ Przyjazd brudnego (do pralni)</button>
                  </div>


                </div>
              );
            })}
          </div>

          {/* Dodaj punkt z obcej trasy */}
          {candidates.length > 0 && (
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
        </>
      )}

      {/* MODAL: dodaj przyjazd (pełny, jak w harmonogramie) */}
      {addEntryFor !== null && (
        <AddEntryModal
          isOpen={true}
          onClose={() => setAddEntryFor(null)}
          defaultArrDay={todayArrDay}
          defaultClientName={addEntryFor}
          weekKey={weekKey}
          clients={clients.filter(c => c.route_id)}
          routes={allRoutes}
          onAdded={() => { setAddEntryFor(null); refetch(); }}
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
                Auto: <strong>{VEHICLE_LABELS[trip?.car] || trip?.car}</strong> · zapisze się do Kosztów ({today})
              </div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Końcowy stan licznika (km)</label>
              <input className="ap-input" type="text" inputMode="decimal" autoFocus value={endKm}
                onChange={ev => setEndKm(ev.target.value)} placeholder="np. 379978" style={{ marginTop: '6px', marginBottom: '16px' }} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setEndOpen(false)} disabled={busy} style={{ flex: 1, padding: '13px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', fontWeight: 600 }}>Anuluj</button>
                <button onClick={endTrip} disabled={busy} style={{ flex: 2, padding: '13px', borderRadius: '12px', border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>{busy ? 'Zapisywanie…' : 'Zakończ i zapisz licznik'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
