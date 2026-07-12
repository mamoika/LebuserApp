import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LoaderCircle, PlayCircle, Star, Truck, UserCheck } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useAppData } from '../../hooks/useAppData';
import { callExistingTripRpc } from '../../lib/courseRpc';
import { getDriverAppSettings, getDriverTripsData } from '../../lib/readRpc';
import { parseRouteIds, routeNamesForTrip, ymd } from '../../lib/tripUiHelpers';
import { getRouteColorByDisplay, routeBadgeStyle } from '../../lib/visualSystem';
import { toastError, toastSuccess } from '../../lib/toast';
import { VEHICLES, VEHICLE_LABELS } from '../../lib/vehicles';
import '../mockups/mockups.css';

function StartSection({ label, children, hint }) {
  return (
    <section className="live-start-section">
      <h2 className="live-start-section-label">{label}</h2>
      {children}
      {hint && <p className="live-start-section-hint">{hint}</p>}
    </section>
  );
}

export default function DriverCourseStart({ plannedTrip = null, onStarted }) {
  const { t } = useTranslation();
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
        if (!cancelled) toastError(t('course.start.loadError', { message: error.message }));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadTrips, plannedTrip, sessionToken, t, user?.id]);

  const carsInUse = useMemo(() => {
    const map = new Map();
    allTrips.forEach(trip => {
      if (trip.status === 'active' && trip.car && trip.driver_id !== user?.id) {
        map.set(trip.car, trip.driver_name || t('course.start.otherDriver'));
      }
    });
    return map;
  }, [allTrips, t, user?.id]);

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
      toastError(t('course.start.selectRoute'));
      return;
    }
    const occupiedBy = carsInUse.get(selectedCar);
    if (occupiedBy) {
      toastError(t('course.start.carInUse', { car: VEHICLE_LABELS[selectedCar] || selectedCar, driver: occupiedBy }));
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
      toastSuccess(t('course.start.started'));
      await onStarted?.();
    } catch (error) {
      toastError(t('course.start.startError', { message: error.message }));
    } finally {
      setBusy(false);
    }
  };

  const claimTrip = async poolTrip => {
    if (!poolTrip?.id) return;
    if (!window.confirm(t('course.start.claimConfirm', { name: routeNamesForTrip(poolTrip, routeMap) }))) return;
    try {
      setBusy(true);
      const { data, error } = await supabase.rpc('claim_loaded_trip', {
        p_session_token: sessionToken,
        p_trip_id: poolTrip.id,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toastSuccess(t('course.start.claimed'));
      await onStarted?.();
    } catch (error) {
      toastError(t('course.start.claimError', { message: error.message }));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="live-board-loading">
        <LoaderCircle className="is-spinning" aria-hidden="true" /> {t('course.start.loading')}
      </div>
    );
  }

  const title = plannedTrip ? routeNamesForTrip(plannedTrip, routeMap) : t('course.start.beginCourse');
  const kicker = plannedTrip ? t('course.start.ready') : t('course.start.dayStart');

  return (
    <section className="driver-phone live-driver-start" aria-labelledby="driver-start-title">
      <header className="live-start-header">
        <p className="live-start-kicker">{kicker}</p>
        <h1 id="driver-start-title" className="live-start-title">{title}</h1>
        {doneToday.length > 0 && (
          <p className="live-start-subtitle">{t('course.start.doneToday', { count: doneToday.length })}</p>
        )}
      </header>

      {plannedTrip && (
        <div className="live-start-banner is-planned">
          <UserCheck size={20} aria-hidden="true" />
          <div>
            <strong>{t('course.start.adminPlanned')}</strong>
            <span>{t('course.start.adminPlannedHint')}</span>
          </div>
        </div>
      )}

      {handoverPool.length > 0 && (
        <div className="driver-focus-card live-start-handover">
          <div className="live-start-handover-title">{t('course.start.handoverPool', { count: handoverPool.length })}</div>
          {handoverPool.map(trip => (
            <div className="live-start-handover-row" key={trip.id}>
              <span className="live-start-handover-meta">
                <Truck size={15} aria-hidden="true" />
                {VEHICLE_LABELS[trip.car] || trip.car} · {routeNamesForTrip(trip, routeMap)}
              </span>
              <button type="button" className="live-start-claim-btn" onClick={() => claimTrip(trip)} disabled={busy}>
                {t('course.start.claim')}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="driver-focus-card live-start-card">
        <StartSection label={t('course.start.carToday')}>
          <div className="live-start-car-grid" role="group" aria-label={t('course.start.carToday')}>
            {VEHICLES.map(vehicle => {
              const active = selectedCar === vehicle.key;
              const lockedBy = carsInUse.get(vehicle.key);
              const isDefault = defaultCar === vehicle.key;
              return (
                <button
                  key={vehicle.key}
                  type="button"
                  className={`live-start-car-chip ${active ? 'is-selected' : ''} ${lockedBy ? 'is-locked' : ''}`}
                  disabled={Boolean(lockedBy)}
                  onClick={() => !lockedBy && setSelectedCar(vehicle.key)}
                  title={lockedBy ? t('course.start.carInUse', { car: vehicle.label, driver: lockedBy }) : undefined}
                >
                  <span className="live-start-car-label">{vehicle.label}</span>
                  {isDefault && (
                    <span className="live-start-default-mark" title={t('course.start.defaultCar')}>
                      <Star size={11} aria-hidden="true" />
                    </span>
                  )}
                  {lockedBy && <span className="live-start-car-lock">{lockedBy}</span>}
                </button>
              );
            })}
          </div>
        </StartSection>

        <StartSection
          label={t('course.start.routesToday')}
          hint={selectedRoutes.size === 0 ? t('course.start.selectRoute') : null}
        >
          <div className="live-start-route-grid" role="group" aria-label={t('course.start.routesToday')}>
            {allRoutes.map((route, index) => {
              const active = selectedRoutes.has(route.id);
              const display = index + 1;
              const color = getRouteColorByDisplay(display);
              return (
                <button
                  key={route.id}
                  type="button"
                  className={`live-start-route-chip ${active ? 'is-selected' : ''}`}
                  onClick={() => toggleRoute(route.id)}
                  style={active ? { borderColor: color, background: `${color}14` } : undefined}
                >
                  <span
                    className="live-start-route-num"
                    style={active ? routeBadgeStyle(display) : undefined}
                  >
                    T{display}
                  </span>
                  <span className="live-start-route-name">{route.name}</span>
                </button>
              );
            })}
          </div>
        </StartSection>
      </div>

      <button type="button" className="driver-primary-btn live-start-submit" onClick={startCourse} disabled={busy || selectedRoutes.size === 0}>
        <PlayCircle size={20} aria-hidden="true" />
        {plannedTrip ? t('course.start.beginCourse') : t('course.start.beginRoute')}
      </button>
    </section>
  );
}
