import { useCallback, useEffect, useMemo, useState } from 'react';
import { PlayCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useAppData } from '../../hooks/useAppData';
import { callExistingTripRpc } from '../../lib/courseRpc';
import { getDriverAppSettings, getDriverTripsData } from '../../lib/readRpc';
import { parseRouteIds, routeNamesForTrip, ymd } from '../../lib/tripUiHelpers';
import { getRouteColorByDisplay } from '../../lib/visualSystem';
import { toastError, toastSuccess } from '../../lib/toast';
import { VEHICLES, VEHICLE_LABELS } from '../../lib/vehicles';

export default function DriverCourseStart({ plannedTrip = null, onStarted }) {
  const { user, sessionToken } = useAuth();
  const { allRoutes } = useAppData();
  const today = ymd();
  const [allTrips, setAllTrips] = useState([]);
  const [defaultCar, setDefaultCar] = useState(null);
  const [selectedCar, setSelectedCar] = useState(VEHICLES[0].key);
  const [selectedRoutes, setSelectedRoutes] = useState(() => parseRouteIds(user?.routes));
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const routeMap = useMemo(
    () => Object.fromEntries(allRoutes.map((route, index) => [route.id, { num: index + 1, name: route.name }])),
    [allRoutes],
  );

  const loadTrips = useCallback(async () => {
    if (!sessionToken) return [];
    try { await supabase.rpc('auto_start_due_trips', { p_session_token: sessionToken }); } catch { /* noop */ }
    const data = await getDriverTripsData(sessionToken);
    const trips = data?.trips || [];
    setAllTrips(trips);
    return trips;
  }, [sessionToken]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [trips, settings] = await Promise.all([
          loadTrips(),
          getDriverAppSettings(sessionToken),
        ]);
        if (cancelled) return;
        const car = settings?.driver_cars?.[user?.id] || null;
        setDefaultCar(car);
        if (plannedTrip) {
          setSelectedCar(plannedTrip.car || car || VEHICLES[0].key);
          setSelectedRoutes(parseRouteIds(plannedTrip.routes));
        } else if (car) {
          setSelectedCar(car);
        }
        setAllTrips(trips || []);
      } catch (error) {
        if (!cancelled) toastError(`Błąd ładowania: ${error.message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadTrips, plannedTrip, sessionToken, user?.id]);

  const carsInUse = useMemo(() => {
    const map = new Map();
    allTrips.forEach(trip => {
      if (trip.status === 'active' && trip.car && trip.driver_id !== user?.id) {
        map.set(trip.car, trip.driver_name || 'inny kierowca');
      }
    });
    return map;
  }, [allTrips, user?.id]);

  const handoverPool = useMemo(
    () => allTrips.filter(trip => trip.status === 'handover' && trip.trip_date === today),
    [allTrips, today],
  );

  const doneToday = useMemo(
    () => allTrips.filter(trip => trip.driver_id === user?.id && trip.trip_date === today && trip.status === 'finished'),
    [allTrips, today, user?.id],
  );

  const toggleRoute = routeId => {
    setSelectedRoutes(prev => {
      const next = new Set(prev);
      if (next.has(routeId)) next.delete(routeId);
      else next.add(routeId);
      return next;
    });
  };

  const startCourse = async () => {
    if (selectedRoutes.size === 0) {
      toastError('Wybierz przynajmniej jedną trasę');
      return;
    }
    const occupiedBy = carsInUse.get(selectedCar);
    if (occupiedBy) {
      toastError(`Auto ${VEHICLE_LABELS[selectedCar] || selectedCar} jest już w użyciu (${occupiedBy})`);
      return;
    }
    try {
      setBusy(true);
      await callExistingTripRpc('driver_start_trip', sessionToken, {
        p_planned_trip_id: plannedTrip?.id || null,
        p_trip_date: plannedTrip?.trip_date || today,
        p_car: selectedCar,
        p_routes: [...selectedRoutes].join(','),
      });
      toastSuccess('Kurs rozpoczęty');
      await onStarted?.();
    } catch (error) {
      toastError(`Błąd startu kursu: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const claimTrip = async poolTrip => {
    if (!poolTrip?.id) return;
    if (!window.confirm(`Przejąć kurs ${routeNamesForTrip(poolTrip, routeMap)}?`)) return;
    try {
      setBusy(true);
      const { data, error } = await supabase.rpc('claim_loaded_trip', {
        p_session_token: sessionToken,
        p_trip_id: poolTrip.id,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toastSuccess('Kurs przejęty');
      await onStarted?.();
    } catch (error) {
      toastError(`Błąd przejęcia: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="live-board-loading">Ładowanie…</div>;

  return (
    <section className="driver-phone live-driver-course">
      <div className="mock-kicker">{plannedTrip ? 'Kurs gotowy' : 'Start dnia'}</div>
      <h1 className="mock-page-title">{plannedTrip ? routeNamesForTrip(plannedTrip, routeMap) : 'Rozpocznij kurs'}</h1>

      {doneToday.length > 0 && (
        <div className="live-sheet-copy" style={{ marginBottom: '12px' }}>
          Dziś zakończone kursy: {doneToday.length} — możesz rozpocząć kolejny.
        </div>
      )}

      {plannedTrip && (
        <div className="driver-focus-card live-ready-card" style={{ marginBottom: '14px' }}>
          <div>
            <strong>Administrator zaplanował kurs</strong>
            <span>Sprawdź auto i trasy, potem rozpocznij.</span>
          </div>
        </div>
      )}

      {handoverPool.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div className="driver-upcoming-title">Kursy do przejęcia ({handoverPool.length})</div>
          {handoverPool.map(trip => (
            <div className="driver-upcoming-row" key={trip.id} style={{ justifyContent: 'space-between' }}>
              <span>{VEHICLE_LABELS[trip.car] || trip.car} · {routeNamesForTrip(trip, routeMap)}</span>
              <button className="driver-tool-btn" onClick={() => claimTrip(trip)} disabled={busy}>Przejmij</button>
            </div>
          ))}
        </div>
      )}

      <div className="live-field-label">Auto na dziś</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
        {VEHICLES.map(vehicle => {
          const active = selectedCar === vehicle.key;
          const locked = carsInUse.has(vehicle.key);
          return (
            <button
              key={vehicle.key}
              type="button"
              disabled={locked}
              onClick={() => !locked && setSelectedCar(vehicle.key)}
              style={{
                flex: '1 1 110px', padding: '12px', borderRadius: '12px', cursor: locked ? 'not-allowed' : 'pointer', fontWeight: 700,
                border: `2px solid ${locked ? 'var(--border)' : active ? 'var(--accent)' : 'var(--border)'}`,
                background: locked ? 'var(--bg-tertiary)' : active ? 'var(--accent-light)' : 'var(--bg-card)',
                color: locked ? 'var(--text-quaternary)' : active ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              {vehicle.label}{defaultCar === vehicle.key ? ' ★' : ''}
            </button>
          );
        })}
      </div>

      <div className="live-field-label">Trasy na dziś</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
        {allRoutes.map((route, index) => {
          const active = selectedRoutes.has(route.id);
          const color = getRouteColorByDisplay(index + 1);
          return (
            <button
              key={route.id}
              type="button"
              onClick={() => toggleRoute(route.id)}
              style={{
                padding: '8px 12px', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
                border: `2px solid ${active ? color : 'var(--border)'}`,
                background: active ? `${color}14` : 'var(--bg-card)',
                color: active ? color : 'var(--text-secondary)',
              }}
            >
              T{index + 1} {route.name}
            </button>
          );
        })}
      </div>

      <button className="driver-primary-btn" onClick={startCourse} disabled={busy || selectedRoutes.size === 0}>
        <PlayCircle size={20} /> {plannedTrip ? 'Rozpocznij kurs' : 'Rozpocznij trasę'}
      </button>
    </section>
  );
}
