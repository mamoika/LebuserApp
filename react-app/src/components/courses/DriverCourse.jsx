import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronRight, Clock3, Gauge, LoaderCircle,
  Navigation2, Package, PlayCircle, RefreshCw, ShoppingCart, Truck, UserCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAppData } from '../../hooks/useAppData';
import {
  callExistingTripRpc, changeCourseVehicle, completeCourseStop, getDriverCourse,
  reportCourseProblem,
} from '../../lib/courseRpc';
import { getDriverTripsData } from '../../lib/readRpc';
import { formatKg, routeNamesForTrip, tripDateInfo, ymd } from '../../lib/tripUiHelpers';
import { toastError, toastSuccess } from '../../lib/toast';
import { VEHICLES, VEHICLE_LABELS } from '../../lib/vehicles';
import { AddEntryModal } from '../modals/EntryModals';
import CourseSheet from './CourseSheet';
import DriverCourseStart from './DriverCourseStart';
import DeliverPromptSheet from './sheets/DeliverPromptSheet';
import PartialPickupSheet from './sheets/PartialPickupSheet';
import '../mockups/mockups.css';

const PROBLEMS = [
  { key: 'partial', label: 'Częściowy odbiór', hint: 'Odbierz tylko część kg z pralni' },
  { key: 'closed', label: 'Klient zamknięty / nieobecny', hint: 'Pomiń przystanek i zapisz zdarzenie' },
  { key: 'extra', label: 'Dodatkowy postój', hint: 'Zapisz zmianę w dzienniku kursu' },
  { key: 'car', label: 'Zmiana auta', hint: 'Zamknij odcinek i otwórz kolejny' },
  { key: 'handoff', label: 'Przekaż kierowcy', hint: 'Kurs zostaje ten sam' },
];

const TASK_LABELS = {
  pickup_clean: 'Odbiór czystego z pralni',
  deliver_clean: 'Dostawa czystego',
  pickup_dirty: 'Odbiór brudnego',
};

const TASK_ICONS = {
  pickup_clean: Package,
  deliver_clean: Truck,
  pickup_dirty: ShoppingCart,
};

function localTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

function nowTime() {
  return new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

function mapsUrl(stop) {
  if (stop.lat != null && stop.lng != null && stop.lat !== '' && stop.lng !== '') {
    return `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.address || stop.client_name)}`;
}

function groupTasks(tasks = []) {
  const groups = new Map();
  tasks.forEach(task => {
    if (!groups.has(task.task_type)) groups.set(task.task_type, []);
    groups.get(task.task_type).push(task);
  });
  return [...groups.entries()].map(([type, items]) => ({
    type,
    items,
    completed: items.every(item => item.status === 'completed'),
    skipped: items.every(item => item.status === 'skipped'),
    quantity: items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
    unit: items.find(item => item.unit)?.unit || '',
  }));
}

export default function DriverCourse() {
  const { sessionToken, user } = useAuth();
  const { clients, allRoutes, refetch } = useAppData();
  const [data, setData] = useState({ trip: null, stops: [], employee: null });
  const [historyTrips, setHistoryTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [problemOpen, setProblemOpen] = useState(false);
  const [changeCarOpen, setChangeCarOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [partialOpen, setPartialOpen] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [addEntryFor, setAddEntryFor] = useState(null);
  const [finished, setFinished] = useState(null);
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
      const [next, tripsData] = await Promise.all([
        getDriverCourse(sessionToken),
        getDriverTripsData(sessionToken),
      ]);
      setData({
        trip: next.trip || null,
        stops: next.stops || [],
        employee: next.employee || null,
        workTimeReport: next.work_time_report || null,
      });
      setHistoryTrips((tripsData?.trips || []).filter(trip => trip.driver_id === user?.id && trip.status === 'finished').slice(0, 12));
    } catch (error) {
      toastError(`Błąd pobierania kursu: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [sessionToken, user?.id]);

  useEffect(() => { loadCourse(); }, [loadCourse]);

  const trip = data.trip;
  const stops = data.stops;
  const completedStops = stops.filter(stop => stop.status !== 'pending').length;
  const current = stops.find(stop => stop.status === 'pending') || null;
  const currentGroups = useMemo(() => groupTasks(current?.tasks || []), [current]);
  const pendingPickup = current?.tasks?.filter(task => task.task_type === 'pickup_clean' && task.status === 'pending') || [];
  const pendingDelivery = current?.tasks?.filter(task => task.task_type === 'deliver_clean' && task.status === 'pending') || [];
  const pendingDirty = current?.tasks?.filter(task => task.task_type === 'pickup_dirty' && task.status === 'pending') || [];
  const pickupReady = pendingPickup.length === 0 || pendingPickup.every(task => task.laundry_packed_at || task.laundry_ready_at || ['packed', 'released', 'at_client', 'returned'].includes(task.metadata?.laundry_status));
  const canCompleteCurrent = pendingDelivery.length === 0 && pendingDirty.every(task => task.status !== 'pending');
  const pickupKg = Number(pendingPickup.reduce((sum, task) => sum + (Number(task.quantity) || 0), 0).toFixed(1));
  const hasPhysicalTrolley = pendingPickup.some(task => task.laundry_trolley_no && task.laundry_trolley_no !== 'brak');
  const hasDeliveryTrolleys = pendingDelivery.some(task => task.laundry_trolley_cycle_id);

  const rpcAction = async (fn, args, success) => {
    try {
      setBusy(true);
      await callExistingTripRpc(fn, sessionToken, args);
      toastSuccess(success);
      await loadCourse();
      await refetch();
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const pickupLaundry = async (leaveTrolley = false) => {
    const ids = [...new Set(pendingPickup.map(task => task.entry_id).filter(Boolean))];
    const physicalTrolleys = [...new Set(pendingPickup.map(task => task.laundry_trolley_no).filter(value => value && value !== 'brak'))];
    await rpcAction('driver_pickup_entries', {
      p_ids: ids,
      p_baskets: physicalTrolleys.length || 1,
      p_leave_trolley: hasPhysicalTrolley ? leaveTrolley : true,
    }, 'Odebrano czyste pranie z pralni');
  };

  const deliverLaundry = async leaveTrolley => {
    if (hasDeliveryTrolleys) {
      setDeliverOpen(true);
      return;
    }
    const ids = [...new Set(pendingDelivery.map(task => task.entry_id).filter(Boolean))];
    await rpcAction('driver_deliver_entries', {
      p_ids: ids,
      p_trolley_actions: [],
    }, 'Dostawa zapisana');
  };

  const completeStop = async () => {
    try {
      setBusy(true);
      await completeCourseStop(sessionToken, current.id);
      toastSuccess(`Zakończono przystanek: ${current.client_name}`);
      await loadCourse();
      await refetch();
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

  const openFinish = () => {
    setEndKm('');
    setWorkStart(localTime(trip.started_at) || '07:00');
    setWorkEnd(nowTime());
    setEndOpen(true);
  };

  const finishCourse = async () => {
    const km = Number(String(endKm).replace(',', '.'));
    if (!Number.isFinite(km)) {
      toastError('Podaj poprawny licznik');
      return;
    }
    try {
      setBusy(true);
      const result = data.employee
        ? await callExistingTripRpc('driver_finish_trip_with_time', sessionToken, { p_trip_id: trip.id, p_end_km: km, p_work_start: workStart, p_work_end: workEnd })
        : await callExistingTripRpc('driver_finish_trip', sessionToken, { p_trip_id: trip.id, p_end_km: km });
      setEndOpen(false);
      setFinished({ trip: result.trip || trip, km, start: workStart, end: workEnd, withTime: !!data.employee });
      toastSuccess('Kurs zakończony i przekazany do rozliczenia');
      await loadCourse();
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="live-board-loading"><LoaderCircle className="is-spinning" /> Ładowanie kursu…</div>;

  if (showHistory) {
    return (
      <section className="driver-phone live-driver-course">
        <div className="live-course-topline"><span>Historia kursów</span><button className="driver-tool-btn" onClick={() => setShowHistory(false)}>Wróć</button></div>
        <div className="driver-upcoming">
          {historyTrips.length === 0 && <div className="driver-empty-row">Brak zakończonych kursów</div>}
          {historyTrips.map(item => (
            <div className="driver-upcoming-row" key={item.id}>
              <span>{routeNamesForTrip(item, routeMap)} · {item.trip_date} · {item.end_km ? `${item.end_km} km` : 'bez km'}</span>
            </div>
          ))}
        </div>
      </section>
    );
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

  const addEntryInfo = trip ? tripDateInfo(trip.trip_date) : tripDateInfo(ymd());

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

      {current ? (
        <>
          <article className="driver-focus-card">
            <h1 id="current-stop-title" className="driver-client-name">{current.client_name}</h1>
            <div className="driver-address-row">
              <span className="driver-address-text">{current.address || current.note || 'Brak zapisanego adresu'}</span>
              <a className="driver-nav-btn" href={mapsUrl(current)} target="_blank" rel="noopener noreferrer"><Navigation2 size={15} /> Nawiguj</a>
            </div>
            <div className="driver-task-list">
              {currentGroups.map(group => {
                const Icon = TASK_ICONS[group.type] || Package;
                return (
                  <div className={`live-task-group ${group.completed ? 'is-completed' : ''}`} key={group.type}>
                    <span className={`driver-task-icon ${group.type === 'pickup_dirty' ? 'odbior' : 'dostawa'}`}><Icon size={17} /></span>
                    <span>
                      <strong>{TASK_LABELS[group.type]}</strong>
                      <small>
                        {group.items.length} {group.items.length === 1 ? 'zadanie' : 'zadania'}
                        {group.quantity ? ` · ${group.quantity.toLocaleString('pl-PL')} ${group.unit}` : ''}
                      </small>
                    </span>
                    {group.type === 'pickup_clean' && !group.completed && pickupKg > 0 && (
                      <button type="button" className="driver-tool-btn" onClick={() => setPartialOpen(true)} disabled={busy || !pickupReady}>
                        {formatKg(pickupKg)} kg
                      </button>
                    )}
                    {group.completed && <CheckCircle2 size={20} color="var(--accent-green)" />}
                  </div>
                );
              })}
            </div>
            {current.note && <div className="driver-note"><AlertTriangle size={14} /> {current.note}</div>}

            {pendingPickup.length > 0 && (
              hasPhysicalTrolley ? (
                <div className="live-delivery-actions">
                  <button className="live-task-action" onClick={() => pickupLaundry(false)} disabled={busy || !pickupReady}><Package size={17} /> Zabieram z wózkiem</button>
                  <button className="live-task-action is-secondary" onClick={() => pickupLaundry(true)} disabled={busy || !pickupReady}>Wózek zostaje</button>
                </div>
              ) : (
                <button className="live-task-action" onClick={() => pickupLaundry(true)} disabled={busy || !pickupReady}><Package size={17} /> {pickupReady ? 'Odbierz czyste z pralni' : 'Pranie jeszcze niegotowe'}</button>
              )
            )}

            {pendingPickup.length === 0 && pendingDelivery.length > 0 && (
              <div className="live-delivery-actions">
                <button className="live-task-action" onClick={() => deliverLaundry(false)} disabled={busy}><Truck size={17} /> {hasDeliveryTrolleys ? 'Dostarcz — wybierz wózki' : 'Dostarcz czyste'}</button>
                {!hasDeliveryTrolleys && pendingDelivery.some(task => task.laundry_trolley_cycle_id) && (
                  <button className="live-task-action is-secondary" onClick={() => deliverLaundry(true)} disabled={busy}>Dostarcz — wózek zostaje</button>
                )}
              </div>
            )}

            {pendingDirty.length > 0 && (
              <div className="live-dirty-block">
                <div className="driver-upcoming-title">Brudne pranie do pralni</div>
                {pendingDirty.map(task => (
                  <div className="driver-upcoming-row" key={task.id}>
                    <span>{task.metadata?.entry_type || 'P'} · {task.quantity ? `${task.quantity} ${task.unit}` : 'bez wagi'}</span>
                  </div>
                ))}
                <button className="live-task-action is-secondary" onClick={() => setAddEntryFor(current.client_name)} disabled={busy}>Dodaj przyjazd brudnego</button>
              </div>
            )}
          </article>

          <button className="driver-primary-btn" onClick={completeStop} disabled={busy || !canCompleteCurrent}>
            <CheckCircle2 size={20} /> {canCompleteCurrent ? 'Zakończ przystanek' : 'Najpierw zakończ zadania na przystanku'}
          </button>
          <button className="driver-secondary-btn" onClick={() => setProblemOpen(true)} disabled={busy}><AlertTriangle size={15} /> Problem lub zmiana</button>
        </>
      ) : (
        <div className="driver-focus-card live-all-stops-done">
          <CheckCircle2 size={48} color="var(--accent-green)" />
          <h1 id="current-stop-title">Wszystkie przystanki zakończone</h1>
          <p>Podaj licznik i godziny, aby przekazać kurs do rozliczenia.</p>
          <button className="driver-primary-btn" onClick={openFinish}><Gauge size={19} /> Zakończ kurs</button>
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
          <p className="live-sheet-copy">Zmiana zamknie bieżący odcinek, ale nie zakończy kursu.</p>
          <label className="live-field-label" htmlFor="next-car">Nowe auto</label>
          <select id="next-car" className="ap-input" value={nextCar} onChange={event => setNextCar(event.target.value)}>
            {VEHICLES.filter(vehicle => vehicle.key !== trip.car).map(vehicle => <option value={vehicle.key} key={vehicle.key}>{vehicle.label}</option>)}
          </select>
          <label className="live-field-label" htmlFor="segment-km">Licznik starego auta — opcjonalnie</label>
          <input id="segment-km" className="ap-input" inputMode="decimal" value={segmentKm} onChange={event => setSegmentKm(event.target.value)} />
          <div className="ap-btn-group">
            <button className="ap-btn ap-btn-primary" onClick={changeVehicle} disabled={busy || !nextCar}>Zmień auto</button>
            <button className="ap-btn ap-btn-secondary" onClick={() => setChangeCarOpen(false)}>Anuluj</button>
          </div>
        </CourseSheet>
      )}

      {handoffOpen && (
        <CourseSheet titleId="handoff-title" title="Przekaż kierowcy" onClose={() => !busy && setHandoffOpen(false)} busy={busy}>
          <p className="live-sheet-copy">Kurs zachowa historię, a system rozpocznie nowy odcinek.</p>
          <label className="live-field-label" htmlFor="target-driver">Nowy kierowca</label>
          <select id="target-driver" className="ap-input" value={targetDriver} onChange={event => setTargetDriver(event.target.value)}>
            <option value="">Wybierz kierowcę</option>
            {drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
          </select>
          <div className="ap-btn-group">
            <button className="ap-btn ap-btn-primary" onClick={handoff} disabled={busy || !targetDriver}><UserCheck size={17} /> Przekaż kurs</button>
            <button className="ap-btn ap-btn-secondary" onClick={() => setHandoffOpen(false)}>Anuluj</button>
          </div>
        </CourseSheet>
      )}

      {endOpen && (
        <CourseSheet titleId="finish-title" title="Zakończ kurs" onClose={() => !busy && setEndOpen(false)} busy={busy}>
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
            <button className="ap-btn ap-btn-primary" onClick={finishCourse} disabled={busy || !endKm}>Zatwierdź i zakończ kurs</button>
            <button className="ap-btn ap-btn-secondary" onClick={() => setEndOpen(false)}>Wróć</button>
          </div>
        </CourseSheet>
      )}

      {partialOpen && current && (
        <PartialPickupSheet
          stop={current}
          sessionToken={sessionToken}
          contextDate={trip.trip_date}
          onClose={() => setPartialOpen(false)}
          onDone={async () => { await loadCourse(); await refetch(); }}
        />
      )}

      {deliverOpen && current && (
        <DeliverPromptSheet
          stop={current}
          pendingDelivery={pendingDelivery}
          sessionToken={sessionToken}
          onClose={() => setDeliverOpen(false)}
          onDone={async () => { await loadCourse(); await refetch(); }}
        />
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
          onAdded={async () => { setAddEntryFor(null); await loadCourse(); await refetch(); }}
        />
      )}
    </section>
  );
}
