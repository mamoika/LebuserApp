import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardCopy, Truck, Users, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { VEHICLES, VEHICLE_LABELS } from '../lib/vehicles';
import { toastError, toastSuccess } from '../lib/toast';
import {
  copyWeeklyRoutePlan,
  getWeeklyRoutePlan,
  removeWeeklyRouteAssignment,
  saveWeeklyRouteAssignment,
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

function localDateTimeValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
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

function AssignmentSheet({ selection, drivers, availableDriverIds, busy, onClose, onSave, onRemove, t }) {
  const trip = selection.trip;
  const [driverId, setDriverId] = useState(trip?.driver_id || '');
  const [car, setCar] = useState(trip?.car || '');
  const [plannedStart, setPlannedStart] = useState(localDateTimeValue(trip?.planned_start));

  const submit = () => {
    if (!driverId) return;
    onSave({
      routeId: selection.route.id,
      tripDate: selection.date,
      driverId,
      car,
      plannedStart: plannedStart ? new Date(plannedStart).toISOString() : null,
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
            <select id="weekly-plan-driver" value={driverId} onChange={event => setDriverId(event.target.value)}>
              <option value="">{t('weeklyPlan.chooseDriver')}</option>
              {drivers.map(driver => <option value={driver.id} key={driver.id}>{driver.name}{!availableDriverIds.has(driver.id) ? ` (${t('weeklyPlan.unavailable')})` : ''}</option>)}
            </select>
          </label>

          <label className="weekly-plan-field" htmlFor="weekly-plan-start">
            <span>{t('weeklyPlan.startTime')}</span>
            <input id="weekly-plan-start" type="datetime-local" value={plannedStart} onChange={event => setPlannedStart(event.target.value)} />
          </label>

          <div className="weekly-plan-field">
            <span>{t('weeklyPlan.vehicle')}</span>
            <div className="weekly-plan-vehicle-options">
              {VEHICLES.map(vehicle => (
                <button key={vehicle.key} type="button" className={car === vehicle.key ? 'active' : ''} onClick={() => setCar(vehicle.key)}>
                  {vehicle.label}
                </button>
              ))}
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

export default function WeeklyRoutePlanView({ showBackLink = true }) {
  const { t, i18n } = useTranslation();
  const { isAdmin, sessionToken } = useAuth();
  const [weekStart, setWeekStart] = useState(() => mondayOf());
  const [plan, setPlan] = useState({ trips: [], routes: [], drivers: [], availability: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState(null);

  const load = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    try {
      const data = await getWeeklyRoutePlan(sessionToken, ymd(weekStart));
      setPlan({ trips: data?.trips || [], routes: data?.routes || [], drivers: data?.drivers || [], availability: data?.availability || [] });
    } catch (error) {
      toastError(`${t('weeklyPlan.loadError')}: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [sessionToken, t, weekStart]);

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
  const availableDriversByDate = useMemo(() => {
    const result = new Map();
    plan.availability.forEach(item => {
      if (!result.has(item.work_date)) result.set(item.work_date, new Set());
      if (isWorkingScheduleValue(item.value)) result.get(item.work_date).add(item.driver_id);
    });
    return result;
  }, [plan.availability]);
  const visibleRoutes = useMemo(() => {
    if (isAdmin) return sortedRoutes;
    const assigned = new Set([...tripsByCell.keys()].map(key => Number(key.split('|')[1])));
    return sortedRoutes.filter(route => assigned.has(route.id));
  }, [isAdmin, sortedRoutes, tripsByCell]);
  const locale = i18n.language?.startsWith('de') ? 'de-DE' : 'pl-PL';
  const weekLabel = `${days[0].toLocaleDateString(locale, { day: '2-digit', month: 'short' })} – ${days[days.length - 1].toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}`;
  const assignedCount = plan.trips.reduce((count, trip) => count + parseRouteIds(trip.routes).length, 0);

  const mutate = async (action, successMessage) => {
    try {
      setBusy(true);
      await action();
      setSelection(null);
      toastSuccess(successMessage);
      await load();
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const copyPreviousWeek = () => {
    if (!window.confirm(t('weeklyPlan.copyConfirm'))) return;
    mutate(
      async () => {
        await copyWeeklyRoutePlan(sessionToken, ymd(addDays(weekStart, -7)), ymd(weekStart));
      },
      t('weeklyPlan.copySuccess'),
    );
  };

  const assignmentFor = (date, routeId) => tripsByCell.get(`${ymd(date)}|${routeId}`) || null;
  const today = ymd(new Date());

  return (
    <section className="weekly-route-plan" aria-labelledby="weekly-plan-title">
      <header className="weekly-plan-header">
        <div>
          <div className="weekly-plan-kicker"><CalendarDays size={14} aria-hidden="true" /> {isAdmin ? t('weeklyPlan.adminKicker') : t('weeklyPlan.driverKicker')}</div>
          <h1 id="weekly-plan-title">{isAdmin ? t('weeklyPlan.adminTitle') : t('weeklyPlan.driverTitle')}</h1>
          <p>{isAdmin ? t('weeklyPlan.adminDescription') : t('weeklyPlan.driverDescription')}</p>
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
        {isAdmin && (
          <div className="weekly-plan-actions">
            <button type="button" className="weekly-plan-action" onClick={copyPreviousWeek} disabled={busy}><ClipboardCopy size={15} /> {t('weeklyPlan.copyPrevious')}</button>
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="weekly-plan-summary" aria-label={t('weeklyPlan.summary')}>
          <span><Truck size={14} /> {t('weeklyPlan.assigned', { count: assignedCount })}</span>
          <span><Users size={14} /> {t('weeklyPlan.visibleToDrivers')}</span>
          <span className={assignedCount < sortedRoutes.length * DAYS ? 'is-warning' : ''}>{t('weeklyPlan.unassigned', { count: Math.max(0, sortedRoutes.length * DAYS - assignedCount) })}</span>
        </div>
      )}

      {loading ? <div className="loader">{t('common.loading')}</div> : (
        <div className="weekly-plan-table-wrap">
          <table className="weekly-plan-table">
            <thead>
              <tr>
                <th>{t('weeklyPlan.route')}</th>
                {days.map(date => (
                  <th key={ymd(date)} className={ymd(date) === today ? 'is-today' : ''}>
                    <span>{date.toLocaleDateString(locale, { weekday: 'short' })}</span>
                    <strong>{date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })}</strong>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRoutes.map(route => (
                <tr key={route.id}>
                  <th scope="row"><span className="weekly-plan-route-number">T{routeNumber.get(route.id)}</span><span>{route.name}</span></th>
                  {days.map(date => {
                    const trip = assignmentFor(date, route.id);
                    return (
                      <td key={ymd(date)} className={ymd(date) === today ? 'is-today' : ''}>
                        <button
                          type="button"
                          className={`weekly-plan-cell ${trip ? 'has-assignment' : 'is-empty'}`}
                          disabled={!isAdmin}
                          onClick={() => isAdmin && setSelection({ route, date: ymd(date), trip })}
                          aria-label={trip ? `${route.name}: ${trip.driver_name}` : `${route.name}: ${t('weeklyPlan.unassignedShort')}`}
                        >
                          {trip ? <>
                            <strong>{trip.driver_name}</strong>
                            <span>{trip.car ? VEHICLE_LABELS[trip.car] || trip.car : t('weeklyPlan.noVehicle')}</span>
                            {formatTime(trip.planned_start) && <small>{formatTime(trip.planned_start)}</small>}
                            <em>{t('weeklyPlan.scheduledShort')}</em>
                          </> : <span className="weekly-plan-empty">{isAdmin ? t('weeklyPlan.assign') : '—'}</span>}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {isAdmin && (
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
      )}

      {selection && <AssignmentSheet
        selection={selection}
        drivers={plan.drivers}
        availableDriverIds={availableDriversByDate.get(selection.date) || new Set(plan.drivers.map(driver => driver.id))}
        busy={busy}
        t={t}
        onClose={() => !busy && setSelection(null)}
        onSave={assignment => mutate(async () => {
          await saveWeeklyRouteAssignment(sessionToken, assignment);
        }, t('weeklyPlan.saveSuccess'))}
        onRemove={() => mutate(() => removeWeeklyRouteAssignment(sessionToken, selection.route.id, selection.date), t('weeklyPlan.removeSuccess'))}
      />}
    </section>
  );
}
