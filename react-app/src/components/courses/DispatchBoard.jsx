import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import {
  AlertTriangle, CalendarDays, CheckCircle2, Clock3, Gauge, GripVertical,
  History, LoaderCircle, PlayCircle, Plus, RefreshCw, UserCheck, X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAppData } from '../../hooks/useAppData';
import { approveCourseKm, callExistingTripRpc, getDispatchBoard, getTripJournal, setCourseStage } from '../../lib/courseRpc';
import { getDriverTripsData } from '../../lib/readRpc';
import { buildVirtualPlannedTrips } from '../../lib/tripUiHelpers';
import { toastError, toastSuccess } from '../../lib/toast';
import { VEHICLE_LABELS } from '../../lib/vehicles';
import { getRouteColorByDisplay, routeBadgeStyle } from '../../lib/visualSystem';
import AssignTripSheet from './sheets/AssignTripSheet';
import PlanPickupSheet from './sheets/PlanPickupSheet';
import '../mockups/mockups.css';

const BOARD_COLUMNS = [
  { key: 'planning', label: 'Do zaplanowania' },
  { key: 'ready', label: 'Gotowe do wyjazdu' },
  { key: 'active', label: 'W trasie' },
  { key: 'settlement', label: 'Do rozliczenia' },
  { key: 'closed', label: 'Zamknięte' },
];

const EVENT_LABELS = {
  course_planned: 'Kurs zaplanowany',
  course_started: 'Kurs rozpoczęty',
  laundry_pickup_completed: 'Odebrano z pralni',
  laundry_pickup_reopened: 'Cofnięto odbiór z pralni',
  delivery_completed: 'Dostawa zakończona',
  delivery_reopened: 'Cofnięto dostawę',
  stop_completed: 'Przystanek zakończony',
  client_unavailable: 'Klient zamknięty / nieobecny',
  partial_pickup: 'Częściowy odbiór',
  problem_reported: 'Problem lub zmiana',
  car_changed: 'Zmiana auta',
  driver_handoff: 'Przekazanie kierowcy',
  course_finished: 'Kurs zakończony',
  kilometers_approved: 'Kilometry zatwierdzone',
  hours_submitted: 'Zgłoszono czas pracy',
  hours_approved: 'Czas pracy zatwierdzony',
  hours_rejected: 'Czas pracy odrzucony',
};

const EVENT_ICONS = {
  course_started: PlayCircle,
  stop_completed: CheckCircle2,
  delivery_completed: CheckCircle2,
  laundry_pickup_completed: CheckCircle2,
  problem_reported: AlertTriangle,
  client_unavailable: AlertTriangle,
  partial_pickup: AlertTriangle,
  car_changed: RefreshCw,
  driver_handoff: UserCheck,
  course_finished: Clock3,
  kilometers_approved: Gauge,
  hours_submitted: Clock3,
  hours_approved: CheckCircle2,
  hours_rejected: AlertTriangle,
};

function ymd(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(value) {
  if (!value) return '';
  return new Date(`${value}T00:00:00`).toLocaleDateString('pl-PL', { weekday: 'long', day: '2-digit', month: 'long' });
}

function JournalPanel({ trip, sessionToken, isAdmin, onClose, onStageChange }) {
  const [journal, setJournal] = useState({ events: [], segments: [] });
  const [loading, setLoading] = useState(true);
  const panelRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getTripJournal(sessionToken, trip.id)
      .then(data => { if (!cancelled) setJournal({ events: data.events || [], segments: data.segments || [] }); })
      .catch(error => { if (!cancelled) toastError(`Błąd dziennika: ${error.message}`); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sessionToken, trip.id]);

  useEffect(() => {
    const previous = document.activeElement;
    panelRef.current?.focus();
    const keydown = event => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab' && panelRef.current) {
        const focusable = [...panelRef.current.querySelectorAll('a[href], button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus?.(); };
  }, [onClose]);

  return (
    <div className="journal-overlay" onPointerDown={onClose}>
      <aside ref={panelRef} className="journal-panel" role="dialog" aria-modal="true" aria-labelledby="live-journal-title" tabIndex={-1} onPointerDown={event => event.stopPropagation()}>
        <div className="live-journal-header">
          <div>
            <div className="live-journal-title-row">
              <span className="kurs-route-badge" style={routeBadgeStyle(trip.route_display || 1)}>T{trip.route_display || '—'}</span>
              <h2 id="live-journal-title" className="journal-title">{trip.route_name || 'Kurs dzienny'}</h2>
            </div>
            <div className="live-journal-subtitle">{trip.driver_name || 'Bez kierowcy'}{trip.car ? ` · ${VEHICLE_LABELS[trip.car] || trip.car}` : ''}</div>
          </div>
          <button className="journal-close" onClick={onClose} aria-label="Zamknij dziennik"><X size={18} /></button>
        </div>

        <div className="journal-status-control">
          <label htmlFor="live-course-stage">Etap kursu</label>
          <select id="live-course-stage" value={trip.board_status} disabled={!isAdmin} onChange={event => onStageChange(trip.id, event.target.value)}>
            {BOARD_COLUMNS.map(column => <option key={column.key} value={column.key}>{column.label}</option>)}
          </select>
          <small>{isAdmin ? 'Zmiana etapu jest zapisywana w systemie.' : 'Podgląd bez możliwości zmiany etapu.'}</small>
        </div>

        {journal.segments.length > 0 && (
          <div className="live-segments" aria-label="Odcinki kursu">
            {journal.segments.map((segment, index) => (
              <div className="live-segment" key={segment.id}>
                <strong>Odcinek {index + 1}</strong>
                <span>{segment.driver_name || 'Bez kierowcy'} · {VEHICLE_LABELS[segment.car] || segment.car || 'bez auta'}</span>
                <small>{formatTime(segment.started_at)}–{segment.ended_at ? formatTime(segment.ended_at) : 'teraz'}{segment.end_km ? ` · ${segment.end_km} km` : ''}</small>
              </div>
            ))}
          </div>
        )}

        <div className="live-journal-section-title">Dziennik kursu</div>
        {loading && <div className="live-loading-row"><LoaderCircle size={16} className="is-spinning" /> Ładowanie…</div>}
        {!loading && journal.events.length === 0 && <div className="driver-empty-row">Brak zdarzeń.</div>}
        {journal.events.map(event => {
          const Icon = EVENT_ICONS[event.event_type] || History;
          return (
            <div className="journal-event" key={event.id}>
              <div className="journal-event-icon"><Icon size={14} /></div>
              <div>
                <div className="journal-event-time">{formatTime(event.created_at)}{event.actor_name ? ` · ${event.actor_name}` : ''}</div>
                <div className="journal-event-label">{EVENT_LABELS[event.event_type] || event.event_type}</div>
                <div className="journal-event-detail">{event.client_name ? `${event.client_name} · ` : ''}{event.details || ''}</div>
              </div>
            </div>
          );
        })}

        {trip.board_status === 'active' && <Link to="/route" className="mock-back-link live-journal-driver-link">Otwórz Kartę kursu kierowcy →</Link>}
      </aside>
    </div>
  );
}

function KmApprovalSheet({ trip, value, busy, onValue, onApprove, onClose }) {
  const sheetRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    sheetRef.current?.focus();
    const keydown = event => {
      if (event.key === 'Escape' && !busy) onClose();
      if (event.key === 'Tab' && sheetRef.current) {
        const focusable = [...sheetRef.current.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus?.(); };
  }, [busy, onClose]);

  return <div className="ap-overlay" style={{ display: 'flex' }} onPointerDown={() => !busy && onClose()}><div ref={sheetRef} className="ap-sheet" role="dialog" aria-modal="true" aria-labelledby="km-title" tabIndex={-1} onPointerDown={event => event.stopPropagation()}><div className="ap-handle" /><div className="ap-content"><h2 id="km-title" className="ap-title">Zatwierdź kilometry</h2><p className="live-sheet-copy">{trip.driver_name || 'Kierowca'} · {VEHICLE_LABELS[trip.car] || trip.car}</p><label className="live-field-label" htmlFor="approved-km">Końcowy stan licznika</label><input id="approved-km" className="ap-input" inputMode="decimal" value={value} onChange={event => onValue(event.target.value)} /><div className="ap-btn-group"><button className="ap-btn ap-btn-primary" onClick={() => onApprove(true)} disabled={busy}>Zatwierdź i zapisz w kosztach</button><button className="ap-btn ap-btn-secondary" onClick={() => onApprove(false)} disabled={busy}>Zatwierdź bez kosztów</button><button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={busy}>Anuluj</button></div></div></div></div>;
}

function CourseCard({ trip, index, isAdmin, onOpen, onApprove, onAssign }) {
  const progress = trip.stops_total ? Math.round((trip.stops_completed / trip.stops_total) * 100) : 0;
  const routeColor = getRouteColorByDisplay(trip.route_display || 1);
  const canAssign = isAdmin && (trip.isVirtual || (trip.board_status === 'planning' && !trip.driver_id));
  const isVirtual = !!trip.isVirtual;
  return (
    <Draggable draggableId={String(trip.id)} index={index} isDragDisabled={!isAdmin || isVirtual}>
      {(provided, snapshot) => (
        <article ref={provided.innerRef} {...provided.draggableProps} className={`kurs-card ${snapshot.isDragging ? 'is-dragging' : ''} ${trip.board_status === 'closed' ? 'kurs-closed' : ''}`} style={provided.draggableProps.style}>
          <div className="kurs-card-top">
            <button className="kurs-title-button" onClick={() => !isVirtual && onOpen(trip)} aria-label={`Otwórz dziennik kursu ${trip.route_name || trip.driver_name || ''}`} disabled={isVirtual}>
              <span className="kurs-route-badge" style={{ background: `${routeColor}1F`, color: routeColor }}>T{trip.route_display || '—'}</span>
              <span className="kurs-route-name">{trip.route_name || 'Kurs dzienny'}</span>
            </button>
            <div className="kurs-card-actions">
              {trip.car && <span className="kurs-car-chip">{VEHICLE_LABELS[trip.car] || trip.car}</span>}
              {isAdmin && <button className="kurs-drag-handle" {...provided.dragHandleProps} aria-label={`Przeciągnij kurs ${trip.route_name || ''}`}><GripVertical size={16} /></button>}
            </div>
          </div>

          <div className="kurs-driver-row">
            {trip.driver_name ? <><div className="kurs-avatar">{trip.driver_name.split(' ').map(part => part[0]).join('').slice(0, 2)}</div><span className="kurs-driver-name">{trip.driver_name}</span></> : <span className="kurs-no-driver"><AlertTriangle size={12} /> Brak kierowcy</span>}
          </div>

          {trip.board_status === 'ready' && <div className="kurs-progress-label"><Clock3 size={12} /> {trip.planned_start ? `Start ${formatTime(trip.planned_start)}` : 'Gotowe do ręcznego startu'} · {trip.stops_total} przystanków</div>}
          {trip.board_status === 'planning' && <div className="kurs-progress-label">{trip.isVirtual ? 'Wymaga przypisania kierowcy' : `${trip.stops_total || 0} przystanków · uzupełnij obsadę`}</div>}
          {canAssign && (
            <button className="kurs-approve-btn" onClick={() => onAssign(trip)}><UserCheck size={13} /> Przypisz kierowcę</button>
          )}
          {trip.board_status === 'active' && <><div className="kurs-progress-track"><div className="kurs-progress-fill" style={{ width: `${progress}%` }} /></div><div className="kurs-progress-label">{trip.stops_completed} z {trip.stops_total} · {trip.current_stop_name || 'brak kolejnego przystanku'}</div></>}
          {(trip.board_status === 'settlement' || trip.board_status === 'closed') && <><div className="kurs-settlement-row">{trip.end_km ?? '—'} km · {trip.reported_hours || 'brak zgłoszonych godzin'}</div><div className="kurs-approve-row"><button className={`kurs-approve-btn ${trip.km_approval_status === 'approved' ? 'is-approved' : ''}`} disabled={!isAdmin || !trip.end_km} onClick={() => onApprove(trip)}><Gauge size={13} /> km {trip.km_approval_status === 'approved' ? '✓' : ''}</button><Link className={`kurs-approve-btn ${trip.hours_status === 'approved' ? 'is-approved' : ''}`} to="/grafik"><Clock3 size={13} /> godziny {trip.hours_status === 'approved' ? '✓' : ''}</Link></div></>}
          {trip.problem_label && <div className="kurs-problem-badge"><AlertTriangle size={12} /> {trip.problem_label}</div>}
        </article>
      )}
    </Draggable>
  );
}

export default function DispatchBoard() {
  const { sessionToken, isAdmin, user } = useAuth();
  const { entries, allRoutes, clients, refetch } = useAppData();
  const [tripDate, setTripDate] = useState(() => ymd());
  const [trips, setTrips] = useState([]);
  const [allTrips, setAllTrips] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openTrip, setOpenTrip] = useState(null);
  const [kmTrip, setKmTrip] = useState(null);
  const [assignTrip, setAssignTrip] = useState(null);
  const [planPickupOpen, setPlanPickupOpen] = useState(false);
  const [kmValue, setKmValue] = useState('');
  const [busy, setBusy] = useState(false);

  const routeMap = useMemo(
    () => Object.fromEntries(allRoutes.map((route, index) => [route.id, { num: index + 1, name: route.name }])),
    [allRoutes],
  );

  const loadBoard = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const [data, tripsData] = await Promise.all([
        getDispatchBoard(sessionToken, tripDate),
        getDriverTripsData(sessionToken),
      ]);
      const boardTrips = data.trips || [];
      const storedTrips = tripsData?.trips || [];
      setAllTrips(storedTrips);
      const virtualTrips = buildVirtualPlannedTrips({
        entries,
        allTrips: storedTrips,
        tripDate,
      }).map(trip => ({
        ...trip,
        route_display: routeMap[Number(trip.routes)]?.num || Number(trip.routes),
        route_name: routeMap[Number(trip.routes)]?.name || `Trasa ${trip.routes}`,
      }));
      const merged = [...virtualTrips, ...boardTrips];
      setTrips(merged);
      setOpenTrip(current => current ? merged.find(trip => trip.id === current.id) || null : null);
    } catch (error) {
      toastError(`Błąd pobierania dyspozytorni: ${error.message}`);
    } finally { setLoading(false); }
  }, [entries, routeMap, sessionToken, tripDate]);

  useEffect(() => { setLoading(true); loadBoard(); }, [loadBoard]);

  useEffect(() => {
    if (!isAdmin || !sessionToken) return undefined;
    let cancelled = false;
    callExistingTripRpc('list_drivers', sessionToken)
      .then(list => { if (!cancelled) setDrivers(list || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isAdmin, sessionToken]);

  useEffect(() => { const interval = window.setInterval(loadBoard, 30000); return () => window.clearInterval(interval); }, [loadBoard]);

  const summary = useMemo(() => ({
    missing: trips.filter(trip => trip.board_status === 'planning').length,
    active: trips.filter(trip => trip.board_status === 'active').length,
    settlement: trips.filter(trip => trip.board_status === 'settlement').length,
    problems: trips.filter(trip => trip.problem_label).length,
  }), [trips]);

  const moveStage = async (tripId, stage) => {
    try {
      setBusy(true);
      await setCourseStage(sessionToken, tripId, stage);
      toastSuccess(`Etap kursu: ${BOARD_COLUMNS.find(column => column.key === stage)?.label}`);
      await loadBoard();
    } catch (error) { toastError(error.message); }
    finally { setBusy(false); }
  };

  const onDragEnd = result => {
    if (!isAdmin || !result.destination || result.source.droppableId === result.destination.droppableId) return;
    if (String(result.draggableId).startsWith('virtual_')) return;
    moveStage(result.draggableId, result.destination.droppableId);
  };

  const approveKm = async (writeCosts = true) => {
    const value = Number(String(kmValue).replace(',', '.'));
    if (!Number.isFinite(value)) { toastError('Podaj poprawny licznik'); return; }
    try {
      setBusy(true);
      await approveCourseKm(sessionToken, kmTrip.id, value, writeCosts);
      setKmTrip(null);
      toastSuccess(writeCosts ? 'Kilometry zatwierdzone i zapisane w kosztach' : 'Kilometry zatwierdzone bez kosztów');
      await loadBoard();
    } catch (error) { toastError(error.message); }
    finally { setBusy(false); }
  };

  return (
    <section className="dispatch-mock-root live-dispatch" aria-labelledby="dispatch-title">
      <div className="live-board-toolbar">
        <div><div className="mock-kicker">Operacje transportowe</div><h1 id="dispatch-title" className="mock-page-title">Dyspozytornia dnia</h1><div className="live-board-date-label">{formatDate(tripDate)}</div></div>
        <div className="live-board-actions">
          <label htmlFor="dispatch-date">Data kursów<input id="dispatch-date" aria-label="Data kursów" type="date" value={tripDate} onChange={event => setTripDate(event.target.value)} /></label>
          <button className="driver-tool-btn" onClick={loadBoard} disabled={loading || busy}><RefreshCw size={15} /> Odśwież</button>
          {isAdmin && <button className="driver-tool-btn" onClick={() => setPlanPickupOpen(true)}><Plus size={15} /> Zleć odbiór</button>}
        </div>
      </div>

      <div className="dispatch-summary">
        <span className="dispatch-chip"><CalendarDays size={13} /> {trips.length} kursów</span>
        {summary.missing > 0 && <span className="dispatch-chip is-warning"><AlertTriangle size={12} /> {summary.missing} do zaplanowania</span>}
        <span className="dispatch-chip is-active">{summary.active} w trasie</span>
        <span className="dispatch-chip">{summary.settlement} do rozliczenia</span>
        {summary.problems > 0 && <span className="dispatch-chip is-warning"><AlertTriangle size={12} /> {summary.problems} problemów</span>}
      </div>

      {loading ? <div className="live-board-loading"><LoaderCircle className="is-spinning" /> Ładowanie kursów…</div> : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="dispatch-board" aria-label="Etapy kursów dziennych">
            {BOARD_COLUMNS.map(column => {
              const items = trips.filter(trip => trip.board_status === column.key);
              return <div className="dispatch-col" key={column.key}><div className="dispatch-col-header"><span className="dispatch-col-title">{column.label}</span><span className="dispatch-col-count">{items.length}</span></div><Droppable droppableId={column.key} isDropDisabled={!isAdmin}>{(provided, snapshot) => <div ref={provided.innerRef} {...provided.droppableProps} className={`dispatch-col-drop ${snapshot.isDraggingOver ? 'is-over' : ''}`}>{items.map((trip, index) => <CourseCard key={trip.id} trip={trip} index={index} isAdmin={isAdmin} onOpen={setOpenTrip} onApprove={tripToApprove => { setKmTrip(tripToApprove); setKmValue(String(tripToApprove.end_km || '')); }} onAssign={setAssignTrip} />)}{items.length === 0 && <div className="dispatch-empty">Brak kursów</div>}{provided.placeholder}</div>}</Droppable></div>;
            })}
          </div>
        </DragDropContext>
      )}

      {openTrip && !openTrip.isVirtual && <JournalPanel trip={openTrip} sessionToken={sessionToken} isAdmin={isAdmin} onClose={() => setOpenTrip(null)} onStageChange={moveStage} />}
      {kmTrip && <KmApprovalSheet trip={kmTrip} value={kmValue} busy={busy} onValue={setKmValue} onApprove={approveKm} onClose={() => setKmTrip(null)} />}
      {assignTrip && (
        <AssignTripSheet
          trip={assignTrip}
          sessionToken={sessionToken}
          routeMap={routeMap}
          drivers={drivers}
          onClose={() => setAssignTrip(null)}
          onAssigned={async () => { setAssignTrip(null); await loadBoard(); await refetch(); }}
        />
      )}
      {planPickupOpen && (
        <PlanPickupSheet
          sessionToken={sessionToken}
          userName={user?.name}
          clients={clients}
          routes={allRoutes}
          allTrips={allTrips}
          drivers={drivers}
          onClose={() => setPlanPickupOpen(false)}
          onPlanned={async () => { setPlanPickupOpen(false); await loadBoard(); await refetch(); }}
        />
      )}
    </section>
  );
}
