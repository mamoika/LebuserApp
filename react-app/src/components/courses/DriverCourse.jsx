import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, ChevronRight, Clock3, Gauge, LoaderCircle, Printer, ShoppingCart, UserCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAppData } from '../../hooks/useAppData';
import {
  callExistingTripRpc, changeCourseVehicle, completeCourseStop, getDriverCourse,
  getTripCourse,
  reportCourseProblem,
} from '../../lib/courseRpc';
import { getBlockingPickedLaundry, getDriverTripsData, getMyWorkTime } from '../../lib/readRpc';
import { printTripWorkCard } from '../../lib/coursePrint';
import {
  canCompleteStop, pickedNotDeliveredStops, tripHasProgress,
} from '../../lib/courseTaskHelpers';
import { parseExtraClients, pickupDateStr, routeNamesForTrip, stopDisplayOrder, tripDateInfo, findDriverPlannedTrip } from '../../lib/tripUiHelpers';
import { operationalYmd } from '../../lib/dateUtils';
import { routeBadgeStyle } from '../../lib/visualSystem';
import { toastError, toastSuccess } from '../../lib/toast';
import {
  addMinutesToClock, decimalHoursToMinutes, formatWorkDuration, minutesBetweenClocks,
  resolveWorkPlan, timeForInput,
} from '../../lib/workTime';
import { VEHICLES, VEHICLE_LABELS } from '../../lib/vehicles';
import { AddEntryModal } from '../modals/EntryModals';
import CourseCurrentStop from './CourseCurrentStop';
import CourseSheet from './CourseSheet';
import DriverCourseStart from './DriverCourseStart';
import DriverCoursePlanning from './DriverCoursePlanning';
import DriverCourseHistory from './DriverCourseHistory';
import '../mockups/mockups.css';

const PROBLEM_KEYS = ['partial', 'closed', 'extra', 'car', 'handoff'];

export default function DriverCourse() {
  const { t } = useTranslation();
  const { sessionToken, user } = useAuth();
  const { clients, allRoutes, entries, refetch } = useAppData();
  const [data, setData] = useState({ trip: null, stops: [], employee: null });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [problemOpen, setProblemOpen] = useState(false);
  const [changeCarOpen, setChangeCarOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [partialOpen, setPartialOpen] = useState(false);
  const [viewStopId, setViewStopId] = useState(null);
  const [addEntryFor, setAddEntryFor] = useState(null);
  const [finished, setFinished] = useState(null);
  const [printContext, setPrintContext] = useState({ dailyCosts: [], allTrips: [] });
  const [allTrips, setAllTrips] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [targetDriver, setTargetDriver] = useState('');
  const [nextCar, setNextCar] = useState('');
  const [segmentKm, setSegmentKm] = useState('');
  const [endKm, setEndKm] = useState('');
  const [workStart, setWorkStart] = useState('');
  const [workEnd, setWorkEnd] = useState('');
  const [workMode, setWorkMode] = useState('range');
  const [workHours, setWorkHours] = useState('');
  const [workTimeData, setWorkTimeData] = useState({ employee: null, reports: [], schedule_entries: [] });

  const problems = useMemo(() => PROBLEM_KEYS.map(key => ({
    key,
    label: t(`course.driver.problems.${key}.label`),
    hint: t(`course.driver.problems.${key}.hint`),
  })), [t]);

  const routeMap = useMemo(
    () => Object.fromEntries(allRoutes.map((route, index) => [route.id, { num: index + 1, name: route.name }])),
    [allRoutes],
  );

  const loadCourse = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    try {
      const [next, tripsData] = await Promise.all([
        getDriverCourse(sessionToken),
        getDriverTripsData(sessionToken),
      ]);
      const trips = tripsData?.trips || [];
      setAllTrips(trips);

      let trip = next.trip || null;
      let stops = next.stops || [];

      if (trip?.status !== 'active' && trip?.status !== 'handover') {
        const planned = findDriverPlannedTrip(trips, user?.id, user?.name);
        if (planned?.id) {
          const plannedCourse = await getTripCourse(sessionToken, planned.id);
          if (plannedCourse.trip?.status === 'planned') {
            trip = plannedCourse.trip;
            stops = plannedCourse.stops || [];
          }
        }
      }

      setData({
        trip,
        stops,
        employee: next.employee || null,
        workTimeReport: next.work_time_report || null,
      });
    } catch (error) {
      toastError(`Błąd pobierania kursu: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [sessionToken, user?.id, user?.name]);

  useEffect(() => { loadCourse(); }, [loadCourse]);

  const trip = data.trip;
  const stops = useMemo(
    () => (data.stops || []).filter(stop => stop.status !== 'skipped'),
    [data.stops],
  );
  const orderedStops = useMemo(
    () => [...stops].sort((a, b) => (a.position || 0) - (b.position || 0)),
    [stops],
  );
  const completedStops = stops.filter(stop => stop.status === 'completed').length;

  useEffect(() => {
    if (!orderedStops.length) {
      setViewStopId(null);
      return;
    }
    setViewStopId(prev => {
      if (prev && orderedStops.some(stop => stop.id === prev)) return prev;
      return orderedStops.find(stop => stop.status === 'pending')?.id ?? orderedStops[0]?.id ?? null;
    });
  }, [orderedStops, trip?.id]);

  const viewStop = orderedStops.find(stop => stop.id === viewStopId)
    ?? orderedStops.find(stop => stop.status === 'pending')
    ?? orderedStops[0]
    ?? null;
  const viewStopIndex = viewStop ? orderedStops.findIndex(stop => stop.id === viewStop.id) : -1;
  const hasProgress = useMemo(() => tripHasProgress(stops, user?.name), [stops, user?.name]);
  const pickedNotDelivered = useMemo(() => pickedNotDeliveredStops(stops, user, trip), [stops, user, trip]);
  const pickedNotDeliveredNames = useMemo(() => pickedNotDelivered.map(stop => stop.client_name).filter(Boolean), [pickedNotDelivered]);
  const canCompleteCurrent = viewStop?.status === 'pending' ? canCompleteStop(viewStop) : false;
  const otherPendingStops = useMemo(
    () => orderedStops.filter(stop => stop.status === 'pending' && stop.id !== viewStop?.id),
    [orderedStops, viewStop?.id],
  );
  const isLastStop = Boolean(viewStop && otherPendingStops.length === 0);
  const routeDisplay = useMemo(() => {
    if (!trip) return null;
    if (trip.route_display != null) return trip.route_display;
    const firstRouteId = String(trip.routes || '').split(',').map(value => Number(value.trim())).find(Boolean);
    return routeMap[firstRouteId]?.num || firstRouteId || null;
  }, [trip, routeMap]);

  const reloadAll = async () => {
    await loadCourse();
    await refetch();
  };

  const findBlockingPickedLaundry = async () => {
    if (!trip) return [];
    const data = await getBlockingPickedLaundry(sessionToken);
    const routeIds = new Set(String(trip.routes || '').split(',').map(value => Number(value.trim())).filter(Boolean));
    const extras = new Set(parseExtraClients(trip.extra_clients));
    const blocking = (data?.entries || []).filter(entry => pickupDateStr(entry) === trip.trip_date && (
      routeIds.size === 0 || routeIds.has(entry.route_id) || extras.has(entry.client_name)
    ));
    return [...new Set(blocking.map(entry => entry.client_name).filter(Boolean))];
  };

  const goPrevStop = () => {
    if (viewStopIndex > 0) setViewStopId(orderedStops[viewStopIndex - 1].id);
  };

  const goNextStop = () => {
    if (viewStopIndex >= 0 && viewStopIndex < orderedStops.length - 1) {
      setViewStopId(orderedStops[viewStopIndex + 1].id);
    }
  };

  const completeStop = async () => {
    if (!viewStop || viewStop.status !== 'pending') {
      toastError(t('course.driver.stopAlreadyDone'));
      return;
    }
    const completedId = viewStop.id;
    const completedPosition = viewStop.position;
    try {
      setBusy(true);
      await completeCourseStop(sessionToken, completedId);
      toastSuccess(t('course.driver.stopCompleted', { name: viewStop.client_name }));
      const next = await getDriverCourse(sessionToken);
      setData({
        trip: next.trip || null,
        stops: next.stops || [],
        employee: next.employee || null,
        workTimeReport: next.work_time_report || null,
      });
      await refetch();
      const freshOrdered = [...(next.stops || [])].sort((a, b) => (a.position || 0) - (b.position || 0));
      const nextPending = freshOrdered.find(stop => stop.position > completedPosition && stop.status === 'pending')
        ?? freshOrdered.find(stop => stop.status === 'pending');
      if (nextPending) setViewStopId(nextPending.id);
      else {
        const idx = freshOrdered.findIndex(stop => stop.id === completedId);
        if (idx >= 0 && idx < freshOrdered.length - 1) setViewStopId(freshOrdered[idx + 1].id);
      }
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const chooseProblem = async option => {
    setProblemOpen(false);
    if (option.key === 'partial') {
      setPartialOpen(true);
      return;
    }
    if (option.key === 'extra') {
      setAddEntryFor('');
      return;
    }
    if (option.key === 'car') {
      if (pickedNotDeliveredNames.length > 0) {
        toastError(`Najpierw dostarcz albo cofnij odbiór: ${pickedNotDeliveredNames.join(', ')}`);
        return;
      }
      setNextCar(VEHICLES.find(vehicle => vehicle.key !== trip.car)?.key || '');
      setSegmentKm('');
      setChangeCarOpen(true);
      return;
    }
    if (option.key === 'handoff') {
      try {
        const list = await callExistingTripRpc('list_drivers', sessionToken);
        setDrivers((list || []).filter(driver => String(driver.id) !== String(trip.driver_id)));
        setTargetDriver('');
        setHandoffOpen(true);
      } catch (error) {
        toastError(error.message);
      }
      return;
    }
    try {
      await reportCourseProblem(sessionToken, trip.id, viewStop?.id || null, option.key, option.label);
      toastSuccess('Zdarzenie zapisane w dzienniku kursu');
      await loadCourse();
    } catch (error) {
      toastError(error.message);
    }
  };

  const changeVehicle = async () => {
    if (pickedNotDeliveredNames.length > 0) {
      toastError(`Najpierw rozładuj auto: ${pickedNotDeliveredNames.join(', ')}`);
      return;
    }
    const value = segmentKm.trim() ? Number(String(segmentKm).replace(',', '.')) : null;
    if (segmentKm.trim() && !Number.isFinite(value)) {
      toastError('Podaj poprawny licznik');
      return;
    }
    try {
      setBusy(true);
      await changeCourseVehicle(sessionToken, trip.id, nextCar, value);
      setChangeCarOpen(false);
      toastSuccess('Zmieniono auto — kurs pozostał ten sam');
      await loadCourse();
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const handoff = async () => {
    try {
      setBusy(true);
      await callExistingTripRpc('transfer_loaded_trip', sessionToken, { p_trip_id: trip.id, p_target_driver_id: targetDriver });
      setHandoffOpen(false);
      toastSuccess('Kurs przekazany — rozpoczęto nowy odcinek');
      await loadCourse();
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const parkTrip = async () => {
    try {
      setBusy(true);
      await callExistingTripRpc('park_loaded_trip', sessionToken, { p_trip_id: trip.id });
      setHandoffOpen(false);
      toastSuccess('Kurs zostawiony do przejęcia');
      await loadCourse();
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const cancelTrip = async () => {
    if (!window.confirm('Anulować kurs? Nic nie zostało jeszcze zrobione.')) return;
    try {
      setBusy(true);
      await callExistingTripRpc('driver_cancel_trip', sessionToken, { p_trip_id: trip.id });
      toastSuccess('Kurs anulowany');
      await loadCourse();
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const openFinish = async () => {
    if (pickedNotDeliveredNames.length > 0) {
      toastError(t('course.driver.blockingLaundry', { names: pickedNotDeliveredNames.join(', ') }));
      return;
    }
    const tripDate = trip?.trip_date || operationalYmd();
    let wtData;
    try {
      wtData = await getMyWorkTime(sessionToken, Number(tripDate.slice(0, 4)), Number(tripDate.slice(5, 7)));
    } catch {
      toastError(t('workTime.loadError'));
      return;
    }
    const day = Number(String(tripDate).slice(8, 10));
    const scheduleValue = (wtData.schedule_entries || []).find(entry => Number(entry.day) === day)?.value;
    const plan = resolveWorkPlan(wtData.employee, scheduleValue);
    const existing = (wtData.reports || []).find(report => report.work_date === tripDate);
    setWorkTimeData(wtData);
    setWorkMode('range');
    setEndKm('');
    setWorkStart(existing ? timeForInput(existing.reported_start) : plan.start);
    setWorkEnd(existing ? timeForInput(existing.reported_end) : plan.end);
    setWorkHours(String(((existing?.reported_minutes || plan.minutes) / 60).toFixed(2)).replace(/\.00$/, ''));
    setEndOpen(true);
  };

  const completeCurrentStop = async () => {
    const finishAfter = isLastStop && canCompleteCurrent;
    await completeStop();
    if (finishAfter) await openFinish();
  };

  const durationMinutes = workMode === 'duration' ? decimalHoursToMinutes(workHours) : null;
  const effectiveWorkEnd = workMode === 'duration' && durationMinutes
    ? addMinutesToClock(workStart, durationMinutes)
    : workEnd;
  const effectiveWorkMinutes = workMode === 'duration'
    ? durationMinutes
    : minutesBetweenClocks(workStart, workEnd);
  const currentWorkReport = workTimeData.reports?.find(report => report.work_date === (trip?.trip_date || operationalYmd()));
  const workTimeAlreadyApproved = currentWorkReport?.status === 'approved';
  const modalWorkDay = Number(String(trip?.trip_date || operationalYmd()).slice(8, 10));
  const modalScheduleValue = workTimeData.schedule_entries?.find(entry => Number(entry.day) === modalWorkDay)?.value;
  const modalWorkPlan = resolveWorkPlan(workTimeData.employee, modalScheduleValue);

  const finishCourse = async () => {
    if (pickedNotDeliveredNames.length > 0) {
      toastError(t('course.driver.blockingLaundry', { names: pickedNotDeliveredNames.join(', ') }));
      return;
    }
    const km = Number(String(endKm).replace(',', '.'));
    if (!Number.isFinite(km)) {
      toastError(t('course.board.invalidKm'));
      return;
    }
    if (workTimeData.employee && !workTimeAlreadyApproved && !effectiveWorkMinutes) {
      toastError(t('workTime.invalid'));
      return;
    }
    try {
      setBusy(true);
      const freshBlocking = await findBlockingPickedLaundry();
      if (freshBlocking.length > 0) {
        toastError(t('course.driver.blockingLaundry', { names: freshBlocking.join(', ') }));
        await refetch();
        return;
      }
      const result = workTimeData.employee && !workTimeAlreadyApproved
        ? await callExistingTripRpc('driver_finish_trip_with_time', sessionToken, {
          p_trip_id: trip.id,
          p_end_km: km,
          p_work_start: workStart,
          p_work_end: effectiveWorkEnd,
        })
        : await callExistingTripRpc('driver_finish_trip', sessionToken, { p_trip_id: trip.id, p_end_km: km });
      setEndOpen(false);
      setFinished({
        trip: result.trip || trip,
        km,
        start: workStart,
        end: effectiveWorkEnd,
        withTime: !!(workTimeData.employee && !workTimeAlreadyApproved),
      });
      toastSuccess(t('course.driver.finishSuccess'));
      const tripsData = await getDriverTripsData(sessionToken);
      setPrintContext({ dailyCosts: tripsData?.daily_costs || [], allTrips: tripsData?.trips || [] });
      await loadCourse();
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };
  if (loading) return <div className="live-board-loading"><LoaderCircle className="is-spinning" /> {t('course.driver.loadingCourse')}</div>;

  if (showHistory) {
    return <DriverCourseHistory routeMap={routeMap} onBack={() => setShowHistory(false)} />;
  }

  if (finished) {
    return (
      <section className="driver-phone">
        <div className="driver-focus-card driver-finished-screen">
          <CheckCircle2 size={56} color="var(--accent-green)" />
          <h1>{t('course.driver.finishedTitle')}</h1>
          <p>{routeNamesForTrip(finished.trip, routeMap)} · {stops.length} {t('course.board.stops')}</p>
          <div className="live-finish-summary">
            {t('course.driver.counterLabel')}: <strong>{finished.km} km</strong>
            {finished.withTime && <><br />{t('course.driver.hoursLabel')}: <strong>{finished.start}–{finished.end}</strong></>}
            <br /><span>{t('course.driver.finishedHint')}</span>
          </div>
          <button className="driver-primary-btn" onClick={() => { setFinished(null); loadCourse(); }}>{t('course.driver.finishedDone')}</button>
          <button className="driver-secondary-btn" onClick={async () => {
            await printTripWorkCard({
              sessionToken,
              trip: finished.trip,
              entries,
              routeMap,
              driverName: user?.name,
              dailyCosts: printContext.dailyCosts,
            });
          }}><Printer size={17} /> {t('course.driver.printCard')}</button>
          <button className="driver-secondary-btn" onClick={() => { setFinished(null); setShowHistory(true); }}>{t('course.driver.courseHistory')}</button>
        </div>
      </section>
    );
  }

  if (!trip) {
    return <DriverCourseStart onStarted={loadCourse} onHistory={() => setShowHistory(true)} />;
  }

  if (trip.status === 'planned') {
    return (
      <DriverCoursePlanning
        trip={trip}
        stops={stops}
        onUpdated={loadCourse}
      />
    );
  }

  const addEntryInfo = tripDateInfo(trip.trip_date);

  return (
    <section className="driver-phone live-driver-course" aria-labelledby="current-stop-title">
      <div className="live-course-context-card">
        <div className="driver-top-bar live-course-context-bar">
          <div className="live-course-context-col">
            <span className="live-course-context-label">{t('course.driver.courseLabel')}</span>
            <span className="driver-route-pill">
              {routeDisplay != null && (
                <span className="kurs-route-badge" style={{ ...routeBadgeStyle(routeDisplay), marginRight: '6px' }}>T{routeDisplay}</span>
              )}
              {routeNamesForTrip(trip, routeMap)} · {VEHICLE_LABELS[trip.car] || trip.car}
            </span>
          </div>
          <div className="live-course-context-col is-right">
            <span className="live-course-context-label">{t('course.driver.statusLabel')}</span>
            <span className="driver-status-pill">{t('course.driver.inRoute')}</span>
          </div>
        </div>
        <div className="driver-progress-track" role="progressbar" aria-label={t('course.driver.progress')} aria-valuemin="0" aria-valuemax={stops.length} aria-valuenow={completedStops}>
          <div className="driver-progress-fill" style={{ width: `${stops.length ? (completedStops / stops.length) * 100 : 0}%` }} />
        </div>
        {orderedStops.length > 0 ? (
          <div className="live-stop-picker" role="tablist" aria-label={t('course.driver.stopPicker')}>
            {orderedStops.map(stop => {
              const isActive = viewStop?.id === stop.id;
              const displayNo = stopDisplayOrder(stop, clients);
              const tone = [
                stop.status === 'completed' ? 'is-done' : '',
                stop.status === 'skipped' ? 'is-skipped' : '',
                isActive ? 'is-active' : '',
              ].filter(Boolean).join(' ');
              return (
                <button
                  key={stop.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={t('course.driver.jumpToStop', { n: displayNo, name: stop.client_name })}
                  className={`live-stop-picker-btn ${tone}`}
                  onClick={() => setViewStopId(stop.id)}
                >
                  {displayNo}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="driver-progress-label">{t('course.driver.allStopsDone', { count: stops.length })}</div>
        )}
      </div>

      {pickedNotDeliveredNames.length > 0 && (
        <div className="live-blocking-banner">
          {t('course.driver.blockingLaundry', { names: pickedNotDeliveredNames.join(', ') })}
        </div>
      )}

      {viewStop ? (
        <>
          <CourseCurrentStop
            stop={viewStop}
            trip={trip}
            allTrips={allTrips}
            user={user}
            sessionToken={sessionToken}
            entries={entries}
            clients={clients}
            allRoutes={allRoutes}
            busy={busy}
            setBusy={setBusy}
            onReload={reloadAll}
            onComplete={isLastStop ? completeCurrentStop : completeStop}
            canComplete={canCompleteCurrent}
            stopViewStatus={viewStop.status}
            onPrevStop={goPrevStop}
            onNextStop={goNextStop}
            canPrevStop={viewStopIndex > 0}
            canNextStop={viewStopIndex >= 0 && viewStopIndex < orderedStops.length - 1}
            isLastStop={isLastStop}
            onFinishCourse={openFinish}
            canFinishCourse={pickedNotDeliveredNames.length === 0}
            partialOpen={partialOpen}
            onPartialOpenChange={setPartialOpen}
          />

          {!isLastStop && (
            <div className="driver-upcoming live-stop-upcoming">
              <div className="driver-upcoming-title">{t('course.driver.remainingStops')}</div>
              {otherPendingStops.map(stop => (
                <button type="button" className="driver-upcoming-row is-clickable" key={stop.id} onClick={() => setViewStopId(stop.id)}>
                  <span className="driver-upcoming-index">{stopDisplayOrder(stop, clients)}</span>{stop.client_name}
                </button>
              ))}
            </div>
          )}

          <button className="driver-secondary-btn" onClick={() => setProblemOpen(true)} disabled={busy}><AlertTriangle size={15} /> {t('course.driver.problemTitle')}</button>
        </>
      ) : (
        <div className="driver-focus-card live-all-stops-done">
          <CheckCircle2 size={48} color="var(--accent-green)" />
          <h1 id="current-stop-title">{t('course.driver.allDoneTitle')}</h1>
          <p>{t('course.driver.allDoneHint')}</p>
          <button className="driver-primary-btn" onClick={openFinish} disabled={busy || pickedNotDeliveredNames.length > 0}>
            <Gauge size={19} aria-hidden="true" /> {t('course.driver.finishCourse')}
          </button>
        </div>
      )}

      {!viewStop && (
        <button className="driver-secondary-btn" onClick={() => setAddEntryFor('')} disabled={busy}><ShoppingCart size={15} /> {t('course.driver.addDirty')}</button>
      )}
      {!hasProgress && (
        <button className="driver-secondary-btn" onClick={cancelTrip} disabled={busy}>{t('course.driver.cancelEmpty')}</button>
      )}
      <button className="driver-secondary-btn" onClick={() => setShowHistory(true)}><Clock3 size={15} /> {t('course.driver.courseHistory')}</button>

      {problemOpen && (
        <CourseSheet titleId="problem-title" title={t('course.driver.problemTitle')} onClose={() => setProblemOpen(false)}>
          <p className="live-sheet-copy">{t('course.driver.problemHint')}</p>
          {problems.map(option => (
            <button key={option.key} className="driver-problem-option" onClick={() => chooseProblem(option)}>
              <span><span className="driver-problem-option-label">{option.label}</span><span className="driver-problem-option-hint">{option.hint}</span></span>
              <ChevronRight size={17} />
            </button>
          ))}
          <div className="ap-btn-group"><button className="ap-btn ap-btn-secondary" onClick={() => setProblemOpen(false)}>{t('common.close')}</button></div>
        </CourseSheet>
      )}

      {changeCarOpen && (
        <CourseSheet titleId="change-car-title" title={t('course.driver.changeCarTitle')} onClose={() => !busy && setChangeCarOpen(false)} busy={busy}>
          {pickedNotDeliveredNames.length > 0 && (
            <div className="live-blocking-banner">{t('course.driver.blockingLaundryShort', { names: pickedNotDeliveredNames.join(', ') })}</div>
          )}
          <p className="live-sheet-copy">{t('course.driver.changeCarHint')}</p>
          <label className="live-field-label" htmlFor="next-car">{t('course.driver.newCar')}</label>
          <select id="next-car" className="ap-input" value={nextCar} onChange={event => setNextCar(event.target.value)}>
            {VEHICLES.filter(vehicle => vehicle.key !== trip.car).map(vehicle => <option value={vehicle.key} key={vehicle.key}>{vehicle.label}</option>)}
          </select>
          <label className="live-field-label" htmlFor="segment-km">{t('course.driver.segmentKm')}</label>
          <input id="segment-km" className="ap-input" inputMode="decimal" value={segmentKm} onChange={event => setSegmentKm(event.target.value)} />
          <div className="ap-btn-group">
            <button className="ap-btn ap-btn-primary" onClick={changeVehicle} disabled={busy || !nextCar || pickedNotDeliveredNames.length > 0}>{t('course.driver.changeCarBtn')}</button>
            <button className="ap-btn ap-btn-secondary" onClick={() => setChangeCarOpen(false)}>{t('course.cancel')}</button>
          </div>
        </CourseSheet>
      )}

      {handoffOpen && (
        <CourseSheet titleId="handoff-title" title={t('course.driver.handoffTitle')} onClose={() => !busy && setHandoffOpen(false)} busy={busy}>
          <p className="live-sheet-copy">{t('course.driver.handoffHint')}</p>
          <label className="live-field-label" htmlFor="target-driver">{t('course.driver.selectDriver')}</label>
          <select id="target-driver" className="ap-input" value={targetDriver} onChange={event => setTargetDriver(event.target.value)}>
            <option value="">{t('course.driver.selectDriver')}</option>
            {drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
          </select>
          <div className="ap-btn-group">
            <button className="ap-btn ap-btn-primary" onClick={handoff} disabled={busy || !targetDriver}><UserCheck size={17} /> {t('course.driver.handoffAssign')}</button>
          </div>
          <p className="live-sheet-copy">{t('course.driver.handoffPoolHint')}</p>
          <div className="ap-btn-group">
            <button className="ap-btn ap-btn-secondary" onClick={parkTrip} disabled={busy}>{t('course.driver.leaveForClaim')}</button>
            <button className="ap-btn ap-btn-secondary" onClick={() => setHandoffOpen(false)}>{t('course.cancel')}</button>
          </div>
        </CourseSheet>
      )}

      {endOpen && (
        <CourseSheet titleId="finish-title" title={t('course.driver.finishTitle')} onClose={() => !busy && setEndOpen(false)} busy={busy}>
          {pickedNotDeliveredNames.length > 0 && (
            <div className="live-blocking-banner">{t('course.driver.blockingLaundryShort', { names: pickedNotDeliveredNames.join(', ') })}</div>
          )}
          <p className="live-sheet-copy">{t('course.driver.finishHint')}</p>
          <label className="live-field-label" htmlFor="course-end-km">{t('course.driver.endKm')}</label>
          <input id="course-end-km" className="ap-input" inputMode="decimal" value={endKm} onChange={event => setEndKm(event.target.value)} />

          {workTimeData.employee && !workTimeAlreadyApproved ? (
            <div className="live-worktime-finish">
              <div className="live-worktime-finish-head">
                <div>
                  <strong>{t('workTime.workHours')}</strong>
                  <div className="live-worktime-employee">{t('workTime.employee')}: {workTimeData.employee.name}</div>
                </div>
                <button type="button" className="driver-tool-btn" onClick={() => { setWorkMode('range'); setWorkStart(modalWorkPlan.start); setWorkEnd(modalWorkPlan.end); setWorkHours(String(modalWorkPlan.minutes / 60)); }}>
                  {t('workTime.asScheduled')} {modalWorkPlan.start}-{modalWorkPlan.end}
                </button>
              </div>
              <div className="segmented-control">
                <button type="button" className={`seg-btn ${workMode === 'range' ? 'active' : ''}`} onClick={() => setWorkMode('range')}>{t('workTime.rangeMode')}</button>
                <button type="button" className={`seg-btn ${workMode === 'duration' ? 'active' : ''}`} onClick={() => setWorkMode('duration')}>{t('workTime.durationMode')}</button>
              </div>
              {workMode === 'range' ? (
                <div className="live-time-grid">
                  <label className="live-field-label" htmlFor="course-work-start">{t('workTime.start')}<input id="course-work-start" className="ap-input" type="time" value={workStart} onChange={event => setWorkStart(event.target.value)} /></label>
                  <label className="live-field-label" htmlFor="course-work-end">{t('workTime.end')}<input id="course-work-end" className="ap-input" type="time" value={workEnd} onChange={event => setWorkEnd(event.target.value)} /></label>
                </div>
              ) : (
                <div className="live-time-grid">
                  <label className="live-field-label" htmlFor="course-work-start">{t('workTime.start')}<input id="course-work-start" className="ap-input" type="time" value={workStart} onChange={event => setWorkStart(event.target.value)} /></label>
                  <label className="live-field-label" htmlFor="course-work-hours">{t('workTime.hoursWorked')}<input id="course-work-hours" className="ap-input" inputMode="decimal" value={workHours} onChange={event => setWorkHours(event.target.value)} placeholder="8" /></label>
                </div>
              )}
              <div className="live-worktime-preview">
                {t('workTime.toApprove')}: <strong>{workStart || '—'}-{effectiveWorkEnd || '—'}</strong> · {effectiveWorkMinutes ? formatWorkDuration(effectiveWorkMinutes) : t('workTime.invalid')}
              </div>
            </div>
          ) : workTimeAlreadyApproved ? (
            <div className="live-worktime-approved-banner">
              {t('workTime.alreadyApproved', { start: timeForInput(currentWorkReport.approved_start), end: timeForInput(currentWorkReport.approved_end) })}
            </div>
          ) : (
            <div className="live-worktime-unlinked-banner">{t('workTime.finishUnlinkedHint')}</div>
          )}

          <div className="ap-btn-group">
            <button
              className="ap-btn ap-btn-primary"
              onClick={finishCourse}
              disabled={busy || !endKm || pickedNotDeliveredNames.length > 0 || (workTimeData.employee && !workTimeAlreadyApproved && !effectiveWorkMinutes)}
            >
              {busy ? t('common.saving') : workTimeData.employee && !workTimeAlreadyApproved ? t('workTime.finishWithBoth') : t('workTime.finishKmOnly')}
            </button>
            <button className="ap-btn ap-btn-secondary" onClick={() => setEndOpen(false)}>{t('course.back')}</button>
          </div>
        </CourseSheet>
      )}

      {addEntryFor !== null && (
        <AddEntryModal
          isOpen
          onClose={() => setAddEntryFor(null)}
          defaultArrDay={addEntryInfo.arrDay}
          defaultClientName={addEntryFor || undefined}
          weekKey={addEntryInfo.weekKey}
          clients={clients.filter(client => client.route_id)}
          routes={allRoutes}
          onAdded={async () => { setAddEntryFor(null); await reloadAll(); }}
        />
      )}
    </section>
  );
}
