import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardCopy, Eye, EyeOff, Search, Settings2, Truck, Users, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { effectiveRouteServiceRules, isRuleScheduledOnDate } from '../lib/serviceSchedule';
import { VEHICLES, VEHICLE_LABELS } from '../lib/vehicles';
import { getRouteColorByDisplay } from '../lib/visualSystem';
import { toastError, toastSuccess } from '../lib/toast';
import {
  copyWeeklyRoutePlan,
  getWeeklyRoutePlan,
  getWeeklyRoutePlanVisibility,
  removeWeeklyRouteAssignment,
  saveWeeklyRouteAssignment,
  saveWeeklyRoutePlanVisibility,
} from '../lib/weeklyRoutePlanRpc';

const DAYS = 6;

function mondayOf(date = new Date()) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

function addDays(date, count) {
  const result = new Date(date);
  result.setDate(result.getDate() + count);
  return result;
}

function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseRouteIds(value) {
  return String(value || '')
    .split(',')
    .map(part => Number(part.trim()))
    .filter(Number.isFinite);
}

function localTimeValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function plannedStartIso(date, time) {
  if (!date || !time) return null;
  const plannedStart = new Date(`${date}T${time}:00`);
  return Number.isNaN(plannedStart.getTime()) ? null : plannedStart.toISOString();
}

function formatTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function isWorkingScheduleValue(value) {
  return !['W', 'UW', 'L4', 'NU', 'NN', 'END'].includes(String(value || '').trim().toUpperCase());
}

function isRouteScheduledOnDate(route, date) {
  return effectiveRouteServiceRules(route).some(rule => isRuleScheduledOnDate(rule, date));
}

function AssignmentSheet({ selection, drivers, availableDriverIds, vehicleReservations, busy, onClose, onSave, onRemove, t }) {
  const trip = selection.trip;
  const [driverId, setDriverId] = useState(trip?.driver_id || '');
  const [car, setCar] = useState(trip?.car || '');
  const [startTime, setStartTime] = useState(localTimeValue(trip?.planned_start) || '07:00');

  const changeDriver = nextDriverId => {
    const reservation = vehicleReservations.get(car);
    setDriverId(nextDriverId);
    if (reservation && reservation.driverId !== nextDriverId) setCar('');
  };

  const submit = () => {
    if (!driverId) return;
    onSave({
      routeId: selection.route.id,
      tripDate: selection.date,
      driverId,
      car,
      plannedStart: plannedStartIso(selection.date, startTime),
    });
  };

  return (
    <div className="ap-overlay weekly-plan-overlay" style={{ display: 'flex' }} onPointerDown={onClose}>
      <section className="ap-sheet weekly-plan-sheet" role="dialog" aria-modal="true" aria-labelledby="weekly-plan-assignment-title" onPointerDown={event => event.stopPropagation()}>
        <div className="ap-handle" />
        <div className="ap-content">
          <div className="weekly-plan-sheet-heading">
            <div>
              <div className="weekly-plan-kicker">{selection.date}</div>
              <h2 id="weekly-plan-assignment-title" className="ap-title">{selection.route.name}</h2>
            </div>
            <button type="button" className="weekly-plan-close" onClick={onClose} aria-label={t('common.close')}><X size={18} /></button>
          </div>

          <label className="weekly-plan-field" htmlFor="weekly-plan-driver">
            <span>{t('weeklyPlan.driver')}</span>
            <select id="weekly-plan-driver" value={driverId} onChange={event => changeDriver(event.target.value)}>
              <option value="">{t('weeklyPlan.chooseDriver')}</option>
              {drivers.map(driver => <option value={driver.id} key={driver.id}>{driver.name}{!availableDriverIds.has(driver.id) ? ` (${t('weeklyPlan.unavailable')})` : ''}</option>)}
            </select>
          </label>

          <label className="weekly-plan-field" htmlFor="weekly-plan-start">
            <span>{t('weeklyPlan.startTime')}</span>
            <input id="weekly-plan-start" type="time" value={startTime} onChange={event => setStartTime(event.target.value)} />
          </label>

          <div className="weekly-plan-field">
            <span>{t('weeklyPlan.vehicle')}</span>
            <div className="weekly-plan-vehicle-options">
              {VEHICLES.map(vehicle => {
                const reservation = vehicleReservations.get(vehicle.key);
                const occupiedByOtherDriver = Boolean(reservation && reservation.driverId !== driverId);
                return (
                  <button
                    key={vehicle.key}
                    type="button"
                    className={car === vehicle.key ? 'active' : ''}
                    onClick={() => setCar(vehicle.key)}
                    disabled={occupiedByOtherDriver}
                    title={occupiedByOtherDriver ? t('weeklyPlan.vehicleOccupied', { driver: reservation.driverName }) : undefined}
                  >
                    <span>{vehicle.label}</span>
                    {occupiedByOtherDriver && <small>{t('weeklyPlan.vehicleOccupied', { driver: reservation.driverName })}</small>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="ap-btn-group weekly-plan-sheet-actions">
            {trip && (
              <button type="button" className="ap-btn weekly-plan-remove" onClick={onRemove} disabled={busy}>{t('weeklyPlan.remove')}</button>
            )}
            <span />
            <button type="button" className="ap-btn ap-btn-secondary" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
            <button type="button" className="ap-btn ap-btn-primary" onClick={submit} disabled={busy || !driverId}>{busy ? t('common.saving') : t('common.save')}</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function RouteVisibilitySheet({ routes, hiddenRouteIds, busy, onClose, onSave, t }) {
  const [draftHiddenRouteIds, setDraftHiddenRouteIds] = useState(() => new Set(hiddenRouteIds));
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingRoutes = routes.filter(route => (
    !normalizedQuery || route.name.toLocaleLowerCase().includes(normalizedQuery)
  ));
  const routeNumber = new Map(routes.map((route, index) => [route.id, index + 1]));
  const visibleCount = routes.length - draftHiddenRouteIds.size;

  const toggleRoute = routeId => {
    setDraftHiddenRouteIds(current => {
      const next = new Set(current);
      if (next.has(routeId)) next.delete(routeId);
      else next.add(routeId);
      return next;
    });
  };

  return (
    <div className="ap-overlay weekly-plan-overlay" style={{ display: 'flex' }} onPointerDown={onClose}>
      <section className="ap-sheet weekly-plan-sheet weekly-plan-visibility-sheet" role="dialog" aria-modal="true" aria-labelledby="weekly-plan-visibility-title" onPointerDown={event => event.stopPropagation()}>
        <div className="ap-handle" />
        <div className="ap-content">
          <div className="weekly-plan-sheet-heading">
            <div>
              <div className="weekly-plan-kicker"><Settings2 size={14} /> {t('weeklyPlan.visibilityKicker')}</div>
              <h2 id="weekly-plan-visibility-title" className="ap-title">{t('weeklyPlan.visibilityTitle')}</h2>
              <p className="weekly-plan-visibility-description">{t('weeklyPlan.visibilityDescription')}</p>
            </div>
            <button type="button" className="weekly-plan-close" onClick={onClose} aria-label={t('common.close')}><X size={18} /></button>
          </div>

          <label className="weekly-plan-route-search">
            <Search size={16} aria-hidden="true" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('weeklyPlan.searchRoutes')} aria-label={t('weeklyPlan.searchRoutes')} autoFocus />
          </label>

          <div className="weekly-plan-visibility-controls">
            <strong>{t('weeklyPlan.routesVisible', { visible: visibleCount, total: routes.length })}</strong>
            <div>
              <button type="button" onClick={() => setDraftHiddenRouteIds(new Set())}>{t('weeklyPlan.showAll')}</button>
              <button type="button" onClick={() => setDraftHiddenRouteIds(new Set(routes.map(route => route.id)))}>{t('weeklyPlan.hideAll')}</button>
            </div>
          </div>

          <div className="weekly-plan-route-picker">
            {matchingRoutes.map(route => {
              const visible = !draftHiddenRouteIds.has(route.id);
              const displayNumber = routeNumber.get(route.id);
              return (
                <button
                  type="button"
                  className={visible ? 'is-visible' : 'is-hidden'}
                  key={route.id}
                  onClick={() => toggleRoute(route.id)}
                  aria-pressed={visible}
                >
                  <span className="weekly-plan-route-number" style={{ '--route-color': getRouteColorByDisplay(displayNumber) }}>T{displayNumber}</span>
                  <strong>{route.name}</strong>
                  <span>{visible ? <Eye size={17} /> : <EyeOff size={17} />}{t(visible ? 'weeklyPlan.visible' : 'weeklyPlan.hidden')}</span>
                </button>
              );
            })}
            {!matchingRoutes.length && <div className="weekly-plan-route-picker-empty">{t('weeklyPlan.noMatchingRoutes')}</div>}
          </div>

          <div className="ap-btn-group weekly-plan-sheet-actions weekly-plan-visibility-actions">
            <button type="button" className="ap-btn ap-btn-secondary" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
            <button type="button" className="ap-btn ap-btn-primary" onClick={() => onSave([...draftHiddenRouteIds])} disabled={busy}>
              {busy ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function WeeklyRoutePlanView({ showBackLink = true, onRouteSelect = null, onPlanLoad = null }) {
  const { t, i18n } = useTranslation();
  const { user, canEditModule, sessionToken } = useAuth();
  const isDriverPlanView = user?.role === 'driver' || Boolean(onRouteSelect);
  const isAdminPlanView = !isDriverPlanView;
  const canManagePlan = canEditModule('route_plan') && !onRouteSelect;
  const [weekStart, setWeekStart] = useState(() => mondayOf());
  const [plan, setPlan] = useState({ trips: [], routes: [], drivers: [], availability: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState(null);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [hiddenRouteIds, setHiddenRouteIds] = useState(new Set());
  const [visibilityUpdatedAt, setVisibilityUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    try {
      const [data, visibility] = await Promise.all([
        getWeeklyRoutePlan(sessionToken, ymd(weekStart)),
        isAdminPlanView ? getWeeklyRoutePlanVisibility(sessionToken) : Promise.resolve(null),
      ]);
      const nextPlan = {
        trips: data?.trips || [],
        routes: data?.routes || [],
        clients: data?.clients || [],
        drivers: data?.drivers || [],
        availability: data?.availability || [],
      };
      setPlan(nextPlan);
      if (visibility) {
        setHiddenRouteIds(new Set((visibility.hidden_route_ids || []).map(Number)));
        setVisibilityUpdatedAt(visibility.updated_at || null);
      }
      onPlanLoad?.(nextPlan);
    } catch (error) {
      toastError(`${t('weeklyPlan.loadError')}: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [isAdminPlanView, onPlanLoad, sessionToken, t, weekStart]);

  useEffect(() => { load(); }, [load]);

  const days = useMemo(() => Array.from({ length: DAYS }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const sortedRoutes = useMemo(
    () => [...plan.routes].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [plan.routes],
  );
  const routeNumber = useMemo(
    () => new Map(sortedRoutes.map((route, index) => [route.id, index + 1])),
    [sortedRoutes],
  );
  const tripsByCell = useMemo(() => {
    const result = new Map();
    plan.trips.forEach(trip => {
      parseRouteIds(trip.routes).forEach(routeId => result.set(`${trip.trip_date}|${routeId}`, trip));
    });
    return result;
  }, [plan.trips]);
  const assignmentFor = (date, routeId) => tripsByCell.get(`${ymd(date)}|${routeId}`) || null;
  const availableDriversByDate = useMemo(() => {
    const result = new Map();
    plan.availability.forEach(item => {
      if (!result.has(item.work_date)) result.set(item.work_date, new Set());
      if (isWorkingScheduleValue(item.value)) result.get(item.work_date).add(item.driver_id);
    });
    return result;
  }, [plan.availability]);
  const vehicleReservationsForSelection = useMemo(() => {
    const result = new Map();
    if (!selection) return result;
    plan.trips.forEach(trip => {
      if (
        trip.trip_date === selection.date
        && trip.car
        && !parseRouteIds(trip.routes).includes(selection.route.id)
      ) {
        result.set(trip.car, { driverId: trip.driver_id, driverName: trip.driver_name });
      }
    });
    return result;
  }, [plan.trips, selection]);
  const visibleRoutes = useMemo(() => {
    if (canManagePlan) return sortedRoutes.filter(route => !hiddenRouteIds.has(route.id));
    if (isAdminPlanView) return sortedRoutes.filter(route => !hiddenRouteIds.has(route.id));
    const assigned = new Set([...tripsByCell.keys()].map(key => Number(key.split('|')[1])));
    return sortedRoutes.filter(route => assigned.has(route.id));
  }, [canManagePlan, hiddenRouteIds, isAdminPlanView, sortedRoutes, tripsByCell]);
  const locale = i18n.language?.startsWith('de') ? 'de-DE' : 'pl-PL';
  const weekLabel = `${days[0].toLocaleDateString(locale, { day: '2-digit', month: 'short' })} – ${days[days.length - 1].toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}`;
  const visibleRouteIdSet = useMemo(() => new Set(visibleRoutes.map(route => route.id)), [visibleRoutes]);
  const assignedCount = plan.trips.reduce((count, trip) => (
    count + parseRouteIds(trip.routes).filter(routeId => visibleRouteIdSet.has(routeId)).length
  ), 0);
  const unassignedScheduledCount = visibleRoutes.reduce((count, route) => (
    count + days.filter(date => (
      isRouteScheduledOnDate(route, ymd(date)) && !assignmentFor(date, route.id)
    )).length
  ), 0);

  const mutate = async (action, successMessage) => {
    try {
      setBusy(true);
      await action();
      await load();
      setSelection(null);
      toastSuccess(successMessage);
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const copyPreviousWeek = async () => {
    if (!window.confirm(t('weeklyPlan.copyConfirm'))) return;
    await mutate(
      async () => {
        await copyWeeklyRoutePlan(sessionToken, ymd(addDays(weekStart, -7)), ymd(weekStart));
      },
      t('weeklyPlan.copySuccess'),
    );
  };

  const saveVisibility = async nextHiddenRouteIds => {
    try {
      setBusy(true);
      const result = await saveWeeklyRoutePlanVisibility(
        sessionToken,
        nextHiddenRouteIds,
        visibilityUpdatedAt,
      );
      setHiddenRouteIds(new Set((result.hidden_route_ids || []).map(Number)));
      setVisibilityUpdatedAt(result.updated_at || null);
      setVisibilityOpen(false);
      toastSuccess(t('weeklyPlan.visibilitySaveSuccess'));
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const today = ymd(new Date());

  return (
    <section className={`weekly-route-plan ${isDriverPlanView ? 'is-driver-plan' : ''}`} aria-labelledby="weekly-plan-title">
      <header className="weekly-plan-header">
        <div>
          <div className="weekly-plan-kicker"><CalendarDays size={14} aria-hidden="true" /> {isAdminPlanView ? t('weeklyPlan.adminKicker') : t('weeklyPlan.driverKicker')}</div>
          <h1 id="weekly-plan-title">{isAdminPlanView ? t('weeklyPlan.adminTitle') : t('weeklyPlan.driverTitle')}</h1>
          <p>{isAdminPlanView ? t('weeklyPlan.adminDescription') : t('weeklyPlan.driverDescription')}</p>
        </div>
        {showBackLink && <Link className="weekly-plan-back" to="/clients">{t('weeklyPlan.backToRoutes')}</Link>}
      </header>

      <div className="weekly-plan-toolbar">
        <div className="weekly-plan-navigation">
          <button type="button" className="week-nav-btn" aria-label={t('weeklyPlan.previousWeek')} onClick={() => setWeekStart(value => addDays(value, -7))}><ChevronLeft size={19} /></button>
          <div className="weekly-plan-week-label"><strong>{t('weeklyPlan.week')}</strong><span>{weekLabel}</span></div>
          <button type="button" className="week-nav-btn" aria-label={t('weeklyPlan.nextWeek')} onClick={() => setWeekStart(value => addDays(value, 7))}><ChevronRight size={19} /></button>
          <button type="button" className="week-today-btn" onClick={() => setWeekStart(mondayOf())}>{t('weeklyPlan.currentWeek')}</button>
        </div>
        {canManagePlan && (
          <div className="weekly-plan-actions">
            <button type="button" className="weekly-plan-action" onClick={() => setVisibilityOpen(true)} disabled={busy}>
              <Settings2 size={15} /> {t('weeklyPlan.chooseRoutes')}
              {hiddenRouteIds.size > 0 && <span className="weekly-plan-hidden-count">{hiddenRouteIds.size}</span>}
            </button>
            <button type="button" className="weekly-plan-action" onClick={copyPreviousWeek} disabled={busy}><ClipboardCopy size={15} /> {t('weeklyPlan.copyPrevious')}</button>
          </div>
        )}
      </div>

      {isAdminPlanView && (
        <div className="weekly-plan-summary" aria-label={t('weeklyPlan.summary')}>
          <span><Truck size={14} /> {t('weeklyPlan.assigned', { count: assignedCount })}</span>
          <span><Users size={14} /> {t('weeklyPlan.visibleToDrivers')}</span>
          {hiddenRouteIds.size > 0 && <span><EyeOff size={14} /> {t('weeklyPlan.hiddenRoutes', { count: hiddenRouteIds.size })}</span>}
          <span className={unassignedScheduledCount > 0 ? 'is-warning' : ''}>{t('weeklyPlan.unassigned', { count: unassignedScheduledCount })}</span>
        </div>
      )}

      {loading ? <div className="loader">{t('common.loading')}</div> : (<>
        {!canManagePlan && <div className="weekly-plan-mobile-hint"><ChevronRight size={15} aria-hidden="true" /> {t('weeklyPlan.swipeTable')}</div>}
        <div className={`weekly-plan-table-wrap ${!canManagePlan ? 'is-driver-view' : ''}`}>
          <table className="weekly-plan-table">
            <thead>
              <tr>
                <th>{t('weeklyPlan.route')}</th>
                {days.map(date => (
                  <th key={ymd(date)} className={ymd(date) === today ? 'is-today' : ''}>
                    <span>{ymd(date) === today ? t('weeklyPlan.today') : date.toLocaleDateString(locale, { weekday: 'short' })}</span>
                    <strong>{date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })}</strong>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRoutes.map(route => (
                <tr key={route.id} style={{ '--route-color': getRouteColorByDisplay(routeNumber.get(route.id)) }}>
                  <th scope="row">
                    {!canManagePlan && onRouteSelect ? (
                      <button
                        type="button"
                        className="weekly-plan-route-link"
                        onClick={() => onRouteSelect(route)}
                        aria-label={t('weeklyPlan.openRoute', { route: route.name })}
                      >
                        <span className="weekly-plan-route-number">T{routeNumber.get(route.id)}</span>
                        <span>{route.name}</span>
                      </button>
                    ) : <><span className="weekly-plan-route-number">T{routeNumber.get(route.id)}</span><span>{route.name}</span></>}
                  </th>
                  {days.map(date => {
                    const trip = assignmentFor(date, route.id);
                    const scheduledForDate = isRouteScheduledOnDate(route, ymd(date));
                    return (
                      <td key={ymd(date)} className={`${ymd(date) === today ? 'is-today' : ''} ${!scheduledForDate ? 'is-off-schedule' : ''}`}>
                        <button
                          type="button"
                          className={`weekly-plan-cell ${trip ? 'has-assignment' : 'is-empty'} ${!scheduledForDate ? 'is-off-schedule' : ''} ${!canManagePlan && trip && onRouteSelect ? 'is-route-link' : ''}`}
                          disabled={!canManagePlan && !(trip && onRouteSelect)}
                          onClick={() => {
                            if (canManagePlan) setSelection({ route, date: ymd(date), trip });
                            else if (trip && onRouteSelect) onRouteSelect(route);
                          }}
                          aria-label={trip
                            ? (!canManagePlan && onRouteSelect
                              ? t('weeklyPlan.openRoute', { route: route.name })
                              : `${route.name}: ${trip.driver_name}`)
                            : `${route.name}: ${scheduledForDate ? t('weeklyPlan.unassignedShort' ) : t('weeklyPlan.outsideSchedule')}`}
                        >
                          {trip ? <>
                            {isAdminPlanView ? <strong>{trip.driver_name}</strong> : <strong className="weekly-plan-driver-time">{formatTime(trip.planned_start) || '—'}</strong>}
                            <span>{trip.car ? VEHICLE_LABELS[trip.car] || trip.car : t('weeklyPlan.noVehicle')}</span>
                            {isAdminPlanView && formatTime(trip.planned_start) && <small>{formatTime(trip.planned_start)}</small>}
                            {(isAdminPlanView || !scheduledForDate) && <em>{scheduledForDate ? t('weeklyPlan.scheduledShort') : t('weeklyPlan.exceptionShort')}</em>}
                          </> : <span className="weekly-plan-empty">{canManagePlan ? t(scheduledForDate ? 'weeklyPlan.assign' : 'weeklyPlan.assignException') : '—'}</span>}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {isAdminPlanView && (
                <tr className="weekly-plan-free-row">
                  <th scope="row">{t('weeklyPlan.freeDrivers')}</th>
                  {days.map(date => {
                    const assignedIds = new Set(plan.trips.filter(trip => trip.trip_date === ymd(date)).map(trip => trip.driver_id));
                    const available = availableDriversByDate.get(ymd(date)) || new Set(plan.drivers.map(driver => driver.id));
                    const free = plan.drivers.filter(driver => available.has(driver.id) && !assignedIds.has(driver.id));
                    return <td key={ymd(date)}>{free.length ? free.map(driver => <span key={driver.id} className="weekly-plan-free-chip">{driver.name}</span>) : '—'}</td>;
                  })}
                </tr>
              )}
            </tbody>
          </table>
          {!visibleRoutes.length && <div className="weekly-plan-empty-state">{t('weeklyPlan.noTrips')}</div>}
        </div>
      </>)}

      {selection && <AssignmentSheet
        selection={selection}
        drivers={plan.drivers}
        availableDriverIds={availableDriversByDate.get(selection.date) || new Set(plan.drivers.map(driver => driver.id))}
        vehicleReservations={vehicleReservationsForSelection}
        busy={busy}
        t={t}
        onClose={() => !busy && setSelection(null)}
        onSave={assignment => mutate(async () => {
          await saveWeeklyRouteAssignment(sessionToken, assignment);
        }, t('weeklyPlan.saveSuccess'))}
        onRemove={() => mutate(() => removeWeeklyRouteAssignment(sessionToken, selection.route.id, selection.date), t('weeklyPlan.removeSuccess'))}
      />}
      {visibilityOpen && <RouteVisibilitySheet
        routes={sortedRoutes}
        hiddenRouteIds={hiddenRouteIds}
        busy={busy}
        t={t}
        onClose={() => !busy && setVisibilityOpen(false)}
        onSave={saveVisibility}
      />}
    </section>
  );
}
