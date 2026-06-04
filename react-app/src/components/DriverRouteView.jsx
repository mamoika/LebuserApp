import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../hooks/useAppData';
import { logAction } from '../lib/logger';
import { toastError, toastSuccess } from '../lib/toast';
import { routeBadgeStyle } from '../lib/visualSystem';
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
  const d = new Date(iso);
  return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}
function parseRouteIds(routesStr) {
  return new Set((routesStr || '').split(',').map(s => Number(s.trim())).filter(Boolean));
}

export default function DriverRouteView() {
  const { user } = useAuth();
  const { entries, allRoutes, loading, refetch } = useAppData();

  const [trip, setTrip] = useState(null);          // aktywna trasa (lub null)
  const [tripLoading, setTripLoading] = useState(true);
  const [defaultCar, setDefaultCar] = useState(null);
  const [selectedCar, setSelectedCar] = useState(VEHICLES[0].key);
  const [busy, setBusy] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [endKm, setEndKm] = useState('');

  const today = ymd(new Date());
  const routeIds = parseRouteIds(user?.routes);
  const routeMap = Object.fromEntries(allRoutes.map((r, i) => [r.id, { name: r.name, num: i + 1 }]));

  // Wczytaj aktywną trasę + domyślne auto
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

  // Dzisiejsze przystanki dla tras kierowcy
  const onMyRoute = e => routeIds.size === 0 || routeIds.has(e.route_id);
  const deliveries = entries.filter(e => onMyRoute(e) && deliveryDateStr(e) === today);
  // Odbiory grupujemy po kliencie (jak w harmonogramie)
  const pickupRaw = entries.filter(e => onMyRoute(e) && pickupDateStr(e) === today);
  const pickupGroups = (() => {
    const map = new Map();
    pickupRaw.forEach(e => {
      const key = `${e.route_id || ''}|${e.client_name || ''}`;
      const g = map.get(key) || { key, client_name: e.client_name, route_id: e.route_id, entries: [], weight: 0 };
      g.entries.push(e);
      g.weight += parseFloat(e.weight) || 0;
      g.done = g.entries.every(x => x.done);
      map.set(key, g);
    });
    return [...map.values()].sort((a, b) => (a.route_id || 0) - (b.route_id || 0) || String(a.client_name).localeCompare(String(b.client_name), 'pl'));
  })();

  /* ── akcje ── */
  const startTrip = async () => {
    try {
      setBusy(true);
      const { data, error } = await supabase.from('driver_trips').insert({
        driver_id: user.id, driver_name: user.name, trip_date: today,
        car: selectedCar, status: 'active',
      }).select().single();
      if (error) throw error;
      setTrip(data);
      await logAction({ userName: user.name, action: 'trip_start', details: `Auto: ${VEHICLE_LABELS[selectedCar] || selectedCar}` });
      toastSuccess('Trasa rozpoczęta');
    } catch (err) {
      toastError('Błąd startu trasy: ' + err.message);
    } finally { setBusy(false); }
  };

  const markDelivered = async (e) => {
    try {
      setBusy(true);
      const { error } = await supabase.from('entries')
        .update({ delivered: true, delivered_by: user.name, delivered_at: new Date().toISOString() })
        .eq('id', e.id);
      if (error) throw error;
      await logAction({ userName: user.name, action: 'delivered', clientName: e.client_name, entryId: e.id, details: `${e.type === 'O' ? 'Obrusy' : 'Pościel'}${e.weight ? ', ' + e.weight + ' kg' : ''}` });
      await refetch();
    } catch (err) {
      toastError('Błąd: ' + err.message);
    } finally { setBusy(false); }
  };

  const markPicked = async (group) => {
    try {
      setBusy(true);
      const ids = group.entries.map(x => x.id);
      const { error } = await supabase.from('entries')
        .update({ done: true, picked_by: user.name, picked_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
      await logAction({ userName: user.name, action: 'done', clientName: group.client_name, entryId: group.entries[0].id, details: `${group.entries.length} wpis(y), ${group.weight ? Number(group.weight.toFixed(1)) + ' kg' : 'bez wagi'}` });
      await refetch();
    } catch (err) {
      toastError('Błąd: ' + err.message);
    } finally { setBusy(false); }
  };

  const endTrip = async () => {
    const km = parseFloat(String(endKm).replace(',', '.'));
    if (!endKm || isNaN(km)) { toastError('Podaj końcowy stan licznika (km)'); return; }
    try {
      setBusy(true);
      // 1) zamknij trasę
      const { error: tErr } = await supabase.from('driver_trips')
        .update({ ended_at: new Date().toISOString(), end_km: km, status: 'finished' })
        .eq('id', trip.id);
      if (tErr) throw tErr;

      // 2) zapisz końcowy licznik do Kosztów (daily_costs.{auto}_end na dziś)
      const col = vehicleEndColumn(trip.car);
      const { data: existing } = await supabase.from('daily_costs').select('entry_date').eq('entry_date', today).maybeSingle();
      const { error: cErr } = existing
        ? await supabase.from('daily_costs').update({ [col]: km }).eq('entry_date', today)
        : await supabase.from('daily_costs').insert({ entry_date: today, [col]: km });
      if (cErr) throw cErr;

      await logAction({ userName: user.name, action: 'trip_end', details: `Auto: ${VEHICLE_LABELS[trip.car] || trip.car}, licznik: ${km} km` });
      setTrip(null);
      setEndOpen(false);
      setEndKm('');
      toastSuccess('Trasa zakończona, licznik zapisany');
    } catch (err) {
      toastError('Błąd zakończenia trasy: ' + err.message);
    } finally { setBusy(false); }
  };

  if (loading || tripLoading) return <div className="loader">Ładowanie trasy…</div>;

  const RouteBadge = ({ id }) => {
    const info = routeMap[id];
    if (!info) return null;
    return <span className="rt-badge" style={routeBadgeStyle(info.num)}>T{info.num}</span>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '560px' }}>
      {/* START / STATUS TRASY */}
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
                }}>
                  {v.label}{defaultCar === v.key ? ' ★' : ''}
                </button>
              );
            })}
          </div>
          <button onClick={startTrip} disabled={busy} style={{
            width: '100%', padding: '14px', borderRadius: '12px', border: 'none', cursor: 'pointer',
            background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: '15px',
          }}>▶ Rozpocznij trasę</button>
        </div>
      ) : (
        <div style={{ background: 'var(--accent-light)', border: '1px solid var(--accent)', borderRadius: '16px', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--accent)' }}>🚐 Trasa w toku · {VEHICLE_LABELS[trip.car] || trip.car}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>Start: {fmtTime(trip.started_at)}</div>
          </div>
          <button onClick={() => { setEndOpen(true); setEndKm(''); }} style={{
            padding: '12px 16px', borderRadius: '12px', border: 'none', cursor: 'pointer',
            background: 'var(--accent-red, #FF3B30)', color: '#fff', fontWeight: 700, fontSize: '14px', flexShrink: 0,
          }}>■ Zakończ</button>
        </div>
      )}

      {/* DOSTAWY */}
      <section>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', margin: '4px 0 8px' }}>
          📦 Dostawy dziś ({deliveries.length})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {deliveries.length === 0 && <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', padding: '8px 0' }}>Brak dostaw na dziś</div>}
          {deliveries.map(e => (
            <div key={e.id} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 14px',
              borderLeft: `3px solid ${e.delivered ? '#34C759' : '#007AFF'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>{e.urgent && '🚩 '}{e.client_name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                  <RouteBadge id={e.route_id} />
                  <span>{e.type === 'O' ? 'Obrusy' : 'Pościel'}</span>
                  {e.weight ? <span>· {e.weight} kg</span> : null}
                </div>
              </div>
              {e.delivered ? (
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#34C759', flexShrink: 0 }}>✓ {fmtTime(e.delivered_at)}</span>
              ) : trip ? (
                <button onClick={() => markDelivered(e)} disabled={busy} style={{
                  padding: '10px 14px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                  background: '#34C759', color: '#fff', fontWeight: 700, fontSize: '13px', flexShrink: 0,
                }}>Dostarczono</button>
              ) : (
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', flexShrink: 0 }}>—</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ODBIORY */}
      <section>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', margin: '4px 0 8px' }}>
          🧺 Odbiory dziś ({pickupGroups.length})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {pickupGroups.length === 0 && <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', padding: '8px 0' }}>Brak odbiorów na dziś</div>}
          {pickupGroups.map(g => (
            <div key={g.key} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 14px',
              borderLeft: `3px solid ${g.done ? '#34C759' : '#AF52DE'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>{g.client_name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                  <RouteBadge id={g.route_id} />
                  {g.entries.length > 1 && <span>{g.entries.length}×</span>}
                  {g.weight ? <span>· {Number(g.weight.toFixed(1))} kg</span> : null}
                </div>
              </div>
              {g.done ? (
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#34C759', flexShrink: 0 }}>✓ Odebrane</span>
              ) : trip ? (
                <button onClick={() => markPicked(g)} disabled={busy} style={{
                  padding: '10px 14px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                  background: '#AF52DE', color: '#fff', fontWeight: 700, fontSize: '13px', flexShrink: 0,
                }}>Odebrane</button>
              ) : (
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', flexShrink: 0 }}>—</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* MODAL: zakończ trasę */}
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
              <input
                className="ap-input" type="text" inputMode="decimal" autoFocus
                value={endKm} onChange={ev => setEndKm(ev.target.value)}
                placeholder="np. 184320"
                style={{ marginTop: '6px', marginBottom: '16px' }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setEndOpen(false)} disabled={busy} style={{
                  flex: 1, padding: '13px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', fontWeight: 600,
                }}>Anuluj</button>
                <button onClick={endTrip} disabled={busy} style={{
                  flex: 2, padding: '13px', borderRadius: '12px', border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 700,
                }}>{busy ? 'Zapisywanie…' : 'Zakończ i zapisz licznik'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
