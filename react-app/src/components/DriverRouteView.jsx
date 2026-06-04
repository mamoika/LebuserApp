import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../hooks/useAppData';
import { logAction } from '../lib/logger';
import { toastError, toastSuccess } from '../lib/toast';
import { routeBadgeStyle } from '../lib/visualSystem';
import { getCurrentMonday, formatWeekKey } from '../lib/dateUtils';
import { VEHICLES, VEHICLE_LABELS, vehicleEndColumn, DRIVER_CARS_KEY } from '../lib/vehicles';

/* ── helpery dat ── */
function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function parseMonday(weekKey) {
  const [y, m, d] = weekKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function deliveryDateStr(e) {
  if (!e.week_key) return null;
  const dt = parseMonday(e.week_key);
  dt.setDate(dt.getDate() + ((e.arr_day || 1) - 1));
  return ymd(dt);
}
function pickupDateStr(e) {
  const wk = e.pick_week_key || e.week_key;
  if (!wk) return null;
  const dt = parseMonday(wk);
  dt.setDate(dt.getDate() + ((e.pick_day || 1) - 1));
  return ymd(dt);
}
function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}
function parseRouteIds(routesStr) {
  return new Set((routesStr || '').split(',').map(s => Number(s.trim())).filter(Boolean));
}

export default function DriverRouteView() {
  const { user } = useAuth();
  const { entries, allRoutes, loading, refetch } = useAppData();

  const [trip, setTrip] = useState(null);
  const [tripLoading, setTripLoading] = useState(true);
  const [defaultCar, setDefaultCar] = useState(null);
  const [selectedCar, setSelectedCar] = useState(VEHICLES[0].key);
  const [selectedRoutes, setSelectedRoutes] = useState(() => parseRouteIds(user?.routes));
  const [busy, setBusy] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [endKm, setEndKm] = useState('');
  const [draft, setDraft] = useState({}); // { clientKey: { dBaskets, pBaskets, pKg, note } }

  const today = ymd(new Date());
  const currentWeekKey = formatWeekKey(getCurrentMonday());
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

  /* ── budowanie przystanków ──
     Trasy bierzemy z aktywnej trasy (wybrane na starcie); 1 przystanek = 1 klient.
     Kotwica = klient z czymkolwiek na dziś; pokazujemy obie nogi z bież. tygodnia. */
  const activeRouteIds = trip ? parseRouteIds(trip.routes) : selectedRoutes;
  const onSelectedRoute = e => activeRouteIds.size === 0 || activeRouteIds.has(e.route_id);
  const mine = entries.filter(onSelectedRoute);

  const anchorClients = new Set();
  mine.forEach(e => {
    if (deliveryDateStr(e) === today || pickupDateStr(e) === today) anchorClients.add(e.client_name || '—');
  });

  const stopsMap = new Map();
  const ensureStop = (e) => {
    const key = e.client_name || '—';
    if (!stopsMap.has(key)) stopsMap.set(key, { key, client_name: e.client_name, route_id: e.route_id, deliveryEntries: [], pickupEntries: [] });
    return stopsMap.get(key);
  };
  mine.forEach(e => {
    const client = e.client_name || '—';
    if (!anchorClients.has(client)) return;
    const deliveryDue = deliveryDateStr(e) === today || (e.week_key === currentWeekKey && !e.delivered);
    const pickupDue = pickupDateStr(e) === today || ((e.pick_week_key || e.week_key) === currentWeekKey && !e.done);
    if (deliveryDue) ensureStop(e).deliveryEntries.push(e);
    if (pickupDue) ensureStop(e).pickupEntries.push(e);
  });
  const stops = [...stopsMap.values()].sort((a, b) =>
    (a.route_id || 0) - (b.route_id || 0) || String(a.client_name).localeCompare(String(b.client_name), 'pl'));

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

  const markDelivered = async (stop) => {
    try {
      setBusy(true);
      const baskets = parseInt(draftVal(stop.key, 'dBaskets', stop.deliveryEntries[0]?.delivered_baskets), 10);
      const ids = stop.deliveryEntries.map(e => e.id);
      const { error } = await supabase.from('entries')
        .update({ delivered: true, delivered_by: user.name, delivered_at: new Date().toISOString(), delivered_baskets: isNaN(baskets) ? null : baskets })
        .in('id', ids);
      if (error) throw error;
      await logAction({ userName: user.name, action: 'delivered', clientName: stop.client_name, entryId: ids[0], details: `dostawa${isNaN(baskets) ? '' : ', ' + baskets + ' koszy'}` });
      await refetch();
    } catch (err) { toastError('Błąd: ' + err.message); }
    finally { setBusy(false); }
  };

  const markPicked = async (stop) => {
    try {
      setBusy(true);
      const baskets = parseInt(draftVal(stop.key, 'pBaskets', stop.pickupEntries[0]?.picked_baskets), 10);
      const kg = parseFloat(String(draftVal(stop.key, 'pKg', stop.pickupEntries[0]?.weighed_kg)).replace(',', '.'));
      const ids = stop.pickupEntries.map(e => e.id);
      const { error } = await supabase.from('entries')
        .update({ done: true, picked_by: user.name, picked_at: new Date().toISOString(), picked_baskets: isNaN(baskets) ? null : baskets, weighed_kg: isNaN(kg) ? null : kg })
        .in('id', ids);
      if (error) throw error;
      await logAction({ userName: user.name, action: 'done', clientName: stop.client_name, entryId: ids[0], details: `odbiór${isNaN(kg) ? '' : ', ' + kg + ' kg'}${isNaN(baskets) ? '' : ', ' + baskets + ' koszy'}` });
      await refetch();
    } catch (err) { toastError('Błąd: ' + err.message); }
    finally { setBusy(false); }
  };

  // Zapis koszy/kg/uwag bez zmiany statusu (na onBlur)
  const saveExtras = async (stop, leg) => {
    const noteVal = draftVal(stop.key, 'note', stop.deliveryEntries[0]?.driver_note || stop.pickupEntries[0]?.driver_note);
    const legEntries = leg === 'delivery' ? stop.deliveryEntries : stop.pickupEntries;
    if (legEntries.length === 0) return;
    const ids = legEntries.map(e => e.id);
    const patch = { driver_note: noteVal || null };
    if (leg === 'delivery') {
      const b = parseInt(draftVal(stop.key, 'dBaskets', legEntries[0]?.delivered_baskets), 10);
      patch.delivered_baskets = isNaN(b) ? null : b;
    } else {
      const b = parseInt(draftVal(stop.key, 'pBaskets', legEntries[0]?.picked_baskets), 10);
      const kg = parseFloat(String(draftVal(stop.key, 'pKg', legEntries[0]?.weighed_kg)).replace(',', '.'));
      patch.picked_baskets = isNaN(b) ? null : b;
      patch.weighed_kg = isNaN(kg) ? null : kg;
    }
    await supabase.from('entries').update(patch).in('id', ids);
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
      const dEnt = s.deliveryEntries, pEnt = s.pickupEntries;
      const dDone = dEnt.length > 0 && dEnt.every(e => e.delivered);
      const pDone = pEnt.length > 0 && pEnt.every(e => e.done);
      const time = fmtTime(pEnt[0]?.picked_at || dEnt[0]?.delivered_at);
      const kg = pEnt[0]?.weighed_kg ?? '';
      const dB = dEnt[0]?.delivered_baskets ?? '';
      const pB = pEnt[0]?.picked_baskets ?? '';
      const baskets = [pB && `O:${pB}`, dB && `D:${dB}`].filter(Boolean).join(' ');
      const note = dEnt[0]?.driver_note || pEnt[0]?.driver_note || '';
      return `<tr>
        <td>${i + 1}</td>
        <td class="l">${esc(s.client_name)}</td>
        <td>${time}</td>
        <td>${pEnt.length ? (pDone ? '✓' : '—') : ''}</td>
        <td>${dEnt.length ? (dDone ? '✓' : '—') : ''}</td>
        <td>${esc(baskets)}</td>
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
        <thead><tr><th>Lp.</th><th class="l">Hotel/Klient</th><th>Godz.</th><th>Odbiór</th><th>Dostawa</th><th>Kosze</th><th>Kg</th><th class="l">Uwagi</th></tr></thead>
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

  const numInput = { width: '70px', padding: '6px 8px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', textAlign: 'center' };

  const LegRow = ({ stop, leg }) => {
    const isDelivery = leg === 'delivery';
    const legEntries = isDelivery ? stop.deliveryEntries : stop.pickupEntries;
    if (legEntries.length === 0) return null;
    const done = legEntries.every(e => isDelivery ? e.delivered : e.done);
    const at = isDelivery ? legEntries[0]?.delivered_at : legEntries[0]?.picked_at;
    const color = isDelivery ? '#34C759' : '#AF52DE';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <span style={{ width: '78px', flexShrink: 0, fontWeight: 700, fontSize: '13px', color }}>
          {isDelivery ? '📦 Dostawa' : '🧺 Odbiór'}
        </span>
        <div style={{ display: 'flex', gap: '6px', flex: 1, minWidth: '140px' }}>
          <input
            type="number" inputMode="numeric" placeholder="kosze"
            value={draftVal(stop.key, isDelivery ? 'dBaskets' : 'pBaskets', isDelivery ? legEntries[0]?.delivered_baskets : legEntries[0]?.picked_baskets)}
            onChange={e => setDraftVal(stop.key, isDelivery ? 'dBaskets' : 'pBaskets', e.target.value)}
            onBlur={() => trip && saveExtras(stop, leg)}
            disabled={!trip} style={numInput}
          />
          {!isDelivery && (
            <input
              type="number" inputMode="decimal" placeholder="kg"
              value={draftVal(stop.key, 'pKg', legEntries[0]?.weighed_kg)}
              onChange={e => setDraftVal(stop.key, 'pKg', e.target.value)}
              onBlur={() => trip && saveExtras(stop, leg)}
              disabled={!trip} style={numInput}
            />
          )}
        </div>
        {done ? (
          <span style={{ fontSize: '12px', fontWeight: 700, color, flexShrink: 0, width: '96px', textAlign: 'right' }}>✓ {fmtTime(at)}</span>
        ) : trip ? (
          <button onClick={() => isDelivery ? markDelivered(stop) : markPicked(stop)} disabled={busy} style={{
            width: '96px', padding: '9px 0', borderRadius: '9px', border: 'none', cursor: 'pointer',
            background: color, color: '#fff', fontWeight: 700, fontSize: '12px', flexShrink: 0,
          }}>{isDelivery ? 'Dostarczono' : 'Odebrano'}</button>
        ) : (
          <span style={{ width: '96px', textAlign: 'right', fontSize: '11px', color: 'var(--text-tertiary)' }}>—</span>
        )}
      </div>
    );
  };

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
            {stops.map(stop => (
              <div key={stop.key} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <RouteBadge id={stop.route_id} />
                  <span style={{ fontWeight: 700, fontSize: '15px' }}>{stop.client_name}</span>
                </div>
                <LegRow stop={stop} leg="delivery" />
                <LegRow stop={stop} leg="pickup" />
                <input
                  type="text" placeholder="Uwagi do przystanku…"
                  value={draftVal(stop.key, 'note', stop.deliveryEntries[0]?.driver_note || stop.pickupEntries[0]?.driver_note)}
                  onChange={e => setDraftVal(stop.key, 'note', e.target.value)}
                  onBlur={() => saveExtras(stop, stop.deliveryEntries.length ? 'delivery' : 'pickup')}
                  style={{ width: '100%', marginTop: '8px', padding: '8px 10px', borderRadius: '9px', border: '1px solid var(--border)', fontSize: '12px' }}
                />
              </div>
            ))}
          </div>
        </>
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
