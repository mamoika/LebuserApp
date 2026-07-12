import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, Clock3, Gauge, LoaderCircle, PlayCircle, Printer, RefreshCw, ShoppingCart, UserCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAppData } from '../../hooks/useAppData';
import {
  callExistingTripRpc, changeCourseVehicle, completeCourseStop, getDriverCourse,
  reportCourseProblem,
} from '../../lib/courseRpc';
import { getBlockingPickedLaundry, getDriverTripsData } from '../../lib/readRpc';
import { printTripWorkCard } from '../../lib/coursePrint';
import {
  buildExtraCandidates, canCompleteStop, pickedNotDeliveredStops, tripHasProgress,
} from '../../lib/courseTaskHelpers';
import { parseExtraClients, pickupDateStr, routeNamesForTrip, tripDateInfo } from '../../lib/tripUiHelpers';
import { toastError, toastSuccess } from '../../lib/toast';
import { VEHICLES, VEHICLE_LABELS } from '../../lib/vehicles';
import { AddEntryModal } from '../modals/EntryModals';
import CourseCurrentStop from './CourseCurrentStop';
import CourseSheet from './CourseSheet';
import DriverCourseStart from './DriverCourseStart';
import DriverCourseHistory from './DriverCourseHistory';
import '../mockups/mockups.css';

const PROBLEMS = [
  { key: 'partial', label: 'Częściowy odbiór', hint: 'Odbierz tylko część kg z pralni' },
  { key: 'closed', label: 'Klient zamknięty / nieobecny', hint: 'Pomiń przystanek i zapisz zdarzenie' },
  { key: 'extra', label: 'Dodatkowy postój', hint: 'Zapisz zmianę w dzienniku kursu' },
  { key: 'car', label: 'Zmiana auta', hint: 'Zamknij odcinek i otwórz kolejny' },
  { key: 'handoff', label: 'Przekaż kierowcy', hint: 'Kurs zostaje ten sam' },
];

function localTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

function nowTime() {
  return new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

export default function DriverCourse() {
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
  const [addEntryFor, setAddEntryFor] = useState(null);
  const [finished, setFinished] = useState(null);
  const [printContext, setPrintContext] = useState({ dailyCosts: [], allTrips: [] });
  const [drivers, setDrivers] = useState([]);
  const [targetDriver, setTargetDriver] = useState('');
  const [nextCar, setNextCar] = useState('');
  const [segmentKm, setSegmentKm] = useState('');
  const [endKm, setEndKm] = useState('');
  const [workStart, setWorkStart] = useState('');
  const [workEnd, setWorkEnd] = useState('');

  const routeMap = useMemo(
    () => Object.fromEntries(allRoutes.map((route, index) => [route.id, { num: index + 1, name: route.name }])),
    [allRoutes],
  );

  const loadCourse = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const next = await getDriverCourse(sessionToken);
      setData({
        trip: next.trip || null,
        stops: next.stops || [],
        employee: next.employee || null,
        workTimeReport: next.work_time_report || null,
      });
    } catch (error) {
      toastError(`Błąd pobierania kursu: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => { loadCourse(); }, [loadCourse]);

  const trip = data.trip;
  const stops = data.stops;
  const completedStops = stops.filter(stop => stop.status !== 'pending').length;
  const current = stops.find(stop => stop.status === 'pending') || null;
  const hasProgress = useMemo(() => tripHasProgress(stops, user?.name), [stops, user?.name]);
  const pickedNotDelivered = useMemo(() => pickedNotDeliveredStops(stops, user?.name), [stops, user?.name]);
  const pickedNotDeliveredNames = useMemo(() => pickedNotDelivered.map(stop => stop.client_name).filter(Boolean), [pickedNotDelivered]);
  const extraCandidates = useMemo(
    () => buildExtraCandidates({ entries, stops, trip, userName: user?.name }),
    [entries, stops, trip, user?.name],
  );
  const canCompleteCurrent = current ? canCompleteStop(current) : false;

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

  const completeStop = async () => {
    try {
      setBusy(true);
      await completeCourseStop(sessionToken, current.id);
      toastSuccess(`Zakończono przystanek: ${current.client_name}`);
      await reloadAll();
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const addExtraClient = async clientName => {
    if (!trip || !clientName) return;
    const extras = parseExtraClients(trip.extra_clients);
    const next = JSON.stringify([...new Set([...extras, clientName])]);
    try {
      setBusy(true);
      await callExistingTripRpc('driver_set_trip_extra_clients', sessionToken, {
        p_trip_id: trip.id,
        p_extra_clients: next,
      });
      toastSuccess(`Dodano przystanek: ${clientName}`);
      await reloadAll();
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
      await reportCourseProblem(sessionToken, trip.id, current?.id || null, option.key, option.label);
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

  const openFinish = () => {
    if (pickedNotDeliveredNames.length > 0) {
      toastError(`Najpierw dostarcz albo cofnij odbiór: ${pickedNotDeliveredNames.join(', ')}`);
      return;
    }
    setEndKm('');
    setWorkStart(localTime(trip.started_at) || '07:00');
    setWorkEnd(nowTime());
    setEndOpen(true);
  };

  const finishCourse = async () => {
    if (pickedNotDeliveredNames.length > 0) {
      toastError(`Najpierw dostarcz albo cofnij odbiór: ${pickedNotDeliveredNames.join(', ')}`);
      return;
    }
    const km = Number(String(endKm).replace(',', '.'));
    if (!Number.isFinite(km)) {
      toastError('Podaj poprawny licznik');
      return;
    }
    try {
      setBusy(true);
      const freshBlocking = await findBlockingPickedLaundry();
      if (freshBlocking.length > 0) {
        toastError(`Najpierw dostarcz albo cofnij odbiór: ${freshBlocking.join(', ')}`);
        await refetch();
        return;
      }
      const result = data.employee
        ? await callExistingTripRpc('driver_finish_trip_with_time', sessionToken, { p_trip_id: trip.id, p_end_km: km, p_work_start: workStart, p_work_end: workEnd })
        : await callExistingTripRpc('driver_finish_trip', sessionToken, { p_trip_id: trip.id, p_end_km: km });
      setEndOpen(false);
      setFinished({ trip: result.trip || trip, km, start: workStart, end: workEnd, withTime: !!data.employee });
      toastSuccess('Kurs zakończony i przekazany do rozliczenia');
      const tripsData = await getDriverTripsData(sessionToken);
      setPrintContext({ dailyCosts: tripsData?.daily_costs || [], allTrips: tripsData?.trips || [] });
      await loadCourse();
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="live-board-loading"><LoaderCircle className="is-spinning" /> Ładowanie kursu…</div>;

  if (showHistory) {
    return <DriverCourseHistory routeMap={routeMap} onBack={() => setShowHistory(false)} />;
  }

  if (finished) {
    return (
      <section className="driver-phone">
        <div className="driver-focus-card driver-finished-screen">
          <CheckCircle2 size={56} color="var(--accent-green)" />
          <h1>Kurs zakończony</h1>
          <p>{routeNamesForTrip(finished.trip, routeMap)} · {stops.length} przystanków</p>
          <div className="live-finish-summary">
            Licznik: <strong>{finished.km} km</strong>
            {finished.withTime && <><br />Godziny: <strong>{finished.start}–{finished.end}</strong></>}
            <br /><span>Czeka na zatwierdzenie w Dyspozytorni.</span>
          </div>
          <button className="driver-primary-btn" onClick={() => { setFinished(null); loadCourse(); }}>Gotowe</button>
          <button className="driver-secondary-btn" onClick={async () => {
            await printTripWorkCard({
              sessionToken,
              trip: finished.trip,
              entries,
              routeMap,
              driverName: user?.name,
              dailyCosts: printContext.dailyCosts,
            });
          }}><Printer size={17} /> Drukuj kartę kursu</button>
          <button className="driver-secondary-btn" onClick={() => { setFinished(null); setShowHistory(true); }}>Historia kursów</button>
        </div>
      </section>
    );
  }

  if (!trip) {
    return <DriverCourseStart onStarted={loadCourse} />;
  }

  if (trip.status === 'planned') {
    return <DriverCourseStart plannedTrip={trip} onStarted={loadCourse} />;
  }

  const addEntryInfo = tripDateInfo(trip.trip_date);

  return (
    <section className="driver-phone live-driver-course" aria-labelledby="current-stop-title">
      <div className="live-course-topline">
        <span>{routeNamesForTrip(trip, routeMap)} · {VEHICLE_LABELS[trip.car] || trip.car}</span>
        <span className="driver-status-pill">W trasie</span>
      </div>
      <div className="driver-progress-track" role="progressbar" aria-label="Postęp kursu" aria-valuemin="0" aria-valuemax={stops.length} aria-valuenow={completedStops}>
        <div className="driver-progress-fill" style={{ width: `${stops.length ? (completedStops / stops.length) * 100 : 0}%` }} />
      </div>
      <div className="driver-progress-label">{current ? `Przystanek ${current.position} z ${stops.length}` : `Wszystkie ${stops.length} przystanków zakończone`}</div>

      {pickedNotDeliveredNames.length > 0 && (
        <div className="live-blocking-banner">
          Masz pranie odebrane z pralni: {pickedNotDeliveredNames.join(', ')}. Dostarcz je albo cofnij odbiór przed zakończeniem kursu.
        </div>
      )}

      {current ? (
        <>
          <CourseCurrentStop
            stop={current}
            trip={trip}
            stops={stops}
            user={user}
            sessionToken={sessionToken}
            entries={entries}
            clients={clients}
            allRoutes={allRoutes}
            busy={busy}
            setBusy={setBusy}
            onReload={reloadAll}
            onComplete={completeStop}
            canComplete={canCompleteCurrent}
            partialOpen={partialOpen}
            onPartialOpenChange={setPartialOpen}
          />
          <button className="driver-secondary-btn" onClick={() => setProblemOpen(true)} disabled={busy}><AlertTriangle size={15} /> Problem lub zmiana</button>
        </>
      ) : (
        <div className="driver-focus-card live-all-stops-done">
          <CheckCircle2 size={48} color="var(--accent-green)" />
          <h1 id="current-stop-title">Wszystkie przystanki zakończone</h1>
          <p>Podaj licznik i godziny, aby przekazać kurs do rozliczenia.</p>
          <button className="driver-primary-btn" onClick={openFinish} disabled={pickedNotDeliveredNames.length > 0}><Gauge size={19} /> Zakończ kurs</button>
        </div>
      )}

      {extraCandidates.length > 0 && (
        <div className="driver-upcoming">
          <div className="driver-upcoming-title">Dodatkowe przystanki</div>
          {extraCandidates.map(candidate => (
            <div className="live-extra-row" key={candidate.client_name}>
              <span>
                {candidate.client_name}
                {candidate.kg ? ` · ${candidate.kg} kg` : ''}
                {candidate.isUrgent ? ' · pilne' : ''}
              </span>
              <button className="driver-tool-btn" onClick={() => addExtraClient(candidate.client_name)} disabled={busy}>Dodaj</button>
            </div>
          ))}
        </div>
      )}

      {current && (
        <div className="driver-upcoming">
          <div className="driver-upcoming-title">Pozostałe przystanki</div>
          {stops.filter(stop => stop.status === 'pending' && stop.id !== current.id).map(stop => (
            <div className="driver-upcoming-row" key={stop.id}><span className="driver-upcoming-index">{stop.position}</span>{stop.client_name}</div>
          ))}
          {stops.filter(stop => stop.status === 'pending' && stop.id !== current.id).length === 0 && <div className="driver-empty-row">To ostatni przystanek.</div>}
        </div>
      )}

      <button className="driver-secondary-btn" onClick={() => setAddEntryFor('')} disabled={busy}><ShoppingCart size={15} /> Dodaj brudne pranie</button>
      {!hasProgress && (
        <button className="driver-secondary-btn" onClick={cancelTrip} disabled={busy}>Anuluj pusty kurs</button>
      )}
      <button className="driver-secondary-btn" onClick={() => setShowHistory(true)}><Clock3 size={15} /> Historia kursów</button>

      {problemOpen && (
        <CourseSheet titleId="problem-title" title="Problem lub zmiana" onClose={() => setProblemOpen(false)}>
          <p className="live-sheet-copy">Wybierz zdarzenie dla bieżącego przystanku.</p>
          {PROBLEMS.map(option => (
            <button key={option.key} className="driver-problem-option" onClick={() => chooseProblem(option)}>
              <span><span className="driver-problem-option-label">{option.label}</span><span className="driver-problem-option-hint">{option.hint}</span></span>
              <ChevronRight size={17} />
            </button>
          ))}
          <div className="ap-btn-group"><button className="ap-btn ap-btn-secondary" onClick={() => setProblemOpen(false)}>Zamknij</button></div>
        </CourseSheet>
      )}

      {changeCarOpen && (
        <CourseSheet titleId="change-car-title" title="Zmień auto" onClose={() => !busy && setChangeCarOpen(false)} busy={busy}>
          {pickedNotDeliveredNames.length > 0 && (
            <div className="live-blocking-banner">Masz pranie w aucie: {pickedNotDeliveredNames.join(', ')}. Najpierw je dostarcz albo cofnij odbiór.</div>
          )}
          <p className="live-sheet-copy">Zmiana zamknie bieżący odcinek, ale nie zakończy kursu.</p>
          <label className="live-field-label" htmlFor="next-car">Nowe auto</label>
          <select id="next-car" className="ap-input" value={nextCar} onChange={event => setNextCar(event.target.value)}>
            {VEHICLES.filter(vehicle => vehicle.key !== trip.car).map(vehicle => <option value={vehicle.key} key={vehicle.key}>{vehicle.label}</option>)}
          </select>
          <label className="live-field-label" htmlFor="segment-km">Licznik starego auta — opcjonalnie</label>
          <input id="segment-km" className="ap-input" inputMode="decimal" value={segmentKm} onChange={event => setSegmentKm(event.target.value)} />
          <div className="ap-btn-group">
            <button className="ap-btn ap-btn-primary" onClick={changeVehicle} disabled={busy || !nextCar || pickedNotDeliveredNames.length > 0}>Zmień auto</button>
            <button className="ap-btn ap-btn-secondary" onClick={() => setChangeCarOpen(false)}>Anuluj</button>
          </div>
        </CourseSheet>
      )}

      {handoffOpen && (
        <CourseSheet titleId="handoff-title" title="Przekaż kierowcy" onClose={() => !busy && setHandoffOpen(false)} busy={busy}>
          <p className="live-sheet-copy">Kurs zachowa historię. Możesz wskazać kierowcę albo zostawić auto do przejęcia.</p>
          <label className="live-field-label" htmlFor="target-driver">Nowy kierowca</label>
          <select id="target-driver" className="ap-input" value={targetDriver} onChange={event => setTargetDriver(event.target.value)}>
            <option value="">Wybierz kierowcę</option>
            {drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
          </select>
          <div className="ap-btn-group">
            <button className="ap-btn ap-btn-primary" onClick={handoff} disabled={busy || !targetDriver}><UserCheck size={17} /> Przekaż wskazanemu</button>
          </div>
          <p className="live-sheet-copy">Nie masz komu teraz dać? Zostaw kurs do przejęcia — auto z praniem poczeka w puli.</p>
          <div className="ap-btn-group">
            <button className="ap-btn ap-btn-secondary" onClick={parkTrip} disabled={busy}>Zostaw do przejęcia</button>
            <button className="ap-btn ap-btn-secondary" onClick={() => setHandoffOpen(false)}>Anuluj</button>
          </div>
        </CourseSheet>
      )}

      {endOpen && (
        <CourseSheet titleId="finish-title" title="Zakończ kurs" onClose={() => !busy && setEndOpen(false)} busy={busy}>
          {pickedNotDeliveredNames.length > 0 && (
            <div className="live-blocking-banner">Masz pranie w aucie: {pickedNotDeliveredNames.join(', ')}. Dostarcz je albo cofnij odbiór.</div>
          )}
          <p className="live-sheet-copy">Kilometry i godziny będą zatwierdzane osobno przez administratora.</p>
          <label className="live-field-label" htmlFor="course-end-km">Końcowy stan licznika</label>
          <input id="course-end-km" className="ap-input" inputMode="decimal" value={endKm} onChange={event => setEndKm(event.target.value)} />
          {data.employee && (
            <div className="live-time-grid">
              <label className="live-field-label" htmlFor="course-work-start">Start pracy<input id="course-work-start" className="ap-input" type="time" value={workStart} onChange={event => setWorkStart(event.target.value)} /></label>
              <label className="live-field-label" htmlFor="course-work-end">Koniec pracy<input id="course-work-end" className="ap-input" type="time" value={workEnd} onChange={event => setWorkEnd(event.target.value)} /></label>
            </div>
          )}
          <div className="ap-btn-group">
            <button className="ap-btn ap-btn-primary" onClick={finishCourse} disabled={busy || !endKm || pickedNotDeliveredNames.length > 0}>Zatwierdź i zakończ kurs</button>
            <button className="ap-btn ap-btn-secondary" onClick={() => setEndOpen(false)}>Wróć</button>
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
