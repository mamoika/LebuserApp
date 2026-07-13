import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import {
  AlertTriangle, CalendarDays, CheckCircle2, ChevronRight, Clock3, Gauge, GripVertical,
  History, LoaderCircle, PlayCircle, Plus, RefreshCw, UserCheck, X, XCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAppData } from '../../hooks/useAppData';
import { approveWorkTime, rejectWorkTime } from '../../lib/adminRpc';
import { formatCourseDate, formatCourseTime } from '../../lib/courseLocale';
import { approveCourseKm, callExistingTripRpc, getDispatchBoard, getTripCourse, getTripJournal, getTripWorkTimeReport, setCourseStage } from '../../lib/courseRpc';
import { getDriverTripsData } from '../../lib/readRpc';
import { dispatchCourseMode } from '../../lib/dispatchCourseMode';
import { buildVirtualPlannedTrips } from '../../lib/tripUiHelpers';
import { operationalYmd } from '../../lib/dateUtils';
import { toastError, toastSuccess } from '../../lib/toast';
import { formatWorkDuration, minutesBetweenClocks, timeForInput } from '../../lib/workTime';
import { VEHICLE_LABELS } from '../../lib/vehicles';
import { getRouteColorByDisplay, routeBadgeStyle } from '../../lib/visualSystem';
import AssignTripSheet from './sheets/AssignTripSheet';
import DispatchTripArchive from './DispatchTripArchive';
import DriverCoursePlanning from './DriverCoursePlanning';
import TripCourseStops from './TripCourseStops';
import '../mockups/mockups.css';

const BOARD_COLUMN_KEYS = ['planning', 'ready', 'active', 'settlement', 'closed'];

const EVENT_ICONS = {
  course_started: PlayCircle,
  stop_completed: CheckCircle2,
  delivery_completed: CheckCircle2,
  laundry_pickup_completed: CheckCircle2,
  pickup_undone: RefreshCw,
  dirty_stop_added: Plus,
  dirty_stop_removed: X,
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

function DispatchPlanningView({ trip, sessionToken, readOnly, onReload, onCancelled }) {
  const [course, setCourse] = useState({ trip, stops: [] });
  const [loading, setLoading] = useState(true);

  const loadCourse = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTripCourse(sessionToken, trip.id);
      setCourse({ trip: data.trip || trip, stops: data.stops || [] });
    } catch (error) {
      toastError(error.message);
    } finally {
      setLoading(false);
    }
  }, [sessionToken, trip]);

  useEffect(() => { loadCourse(); }, [loadCourse]);

  const reload = async () => {
    await loadCourse();
    await onReload?.();
  };

  if (loading) return <div className="live-loading-row"><LoaderCircle size={16} className="is-spinning" /> Ładowanie planu…</div>;

  return (
    <DriverCoursePlanning
      trip={course.trip}
      stops={course.stops}
      adminMode
      readOnly={readOnly}
      onUpdated={reload}
      onCancelled={onCancelled}
    />
  );
}

function JournalPanel({
  trip, sessionToken, isAdmin, entries, clients, routes, routeMap, drivers, allTrips, dailyCosts,
  busy, setBusy, onClose, onStageChange, onReload, onDeleted, boardColumns, locale,
}) {
  const { t } = useTranslation();
  const [journal, setJournal] = useState({ events: [], segments: [] });
  const [loading, setLoading] = useState(true);
  const panelRef = useRef(null);
  const courseMode = dispatchCourseMode(trip);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getTripJournal(sessionToken, trip.id)
      .then(data => { if (!cancelled) setJournal({ events: data.events || [], segments: data.segments || [] }); })
      .catch(error => { if (!cancelled) toastError(error.message); })
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
              <h2 id="live-journal-title" className="journal-title">{trip.route_name || t('course.dailyCourse')}</h2>
            </div>
            <div className="live-journal-subtitle">{trip.driver_name || t('course.noDriver')}{trip.car ? ` · ${VEHICLE_LABELS[trip.car] || trip.car}` : ''}</div>
          </div>
          <button className="journal-close" onClick={onClose} aria-label={t('course.closeJournal')}><X size={18} /></button>
        </div>

        {courseMode !== 'planning' && (
          <div className="journal-status-control">
            <label htmlFor="live-course-stage">{t('course.board.stageLabel')}</label>
            <select id="live-course-stage" value={trip.board_status} disabled={!isAdmin} onChange={event => onStageChange(trip.id, event.target.value)}>
              {boardColumns.map(column => <option key={column.key} value={column.key}>{column.label}</option>)}
            </select>
            <small>{isAdmin ? t('course.board.stageHintAdmin') : t('course.board.stageHintView')}</small>
          </div>
        )}

        {journal.segments.length > 0 && (
          <div className="live-segments">
            {journal.segments.map((segment, index) => (
              <div className="live-segment" key={segment.id}>
                <strong>{t('course.board.segment', { n: index + 1 })}</strong>
                <span>{segment.driver_name || t('course.noDriver')} · {VEHICLE_LABELS[segment.car] || segment.car || t('course.board.noCar')}</span>
                <small>{formatCourseTime(segment.started_at, locale)}–{segment.ended_at ? formatCourseTime(segment.ended_at, locale) : t('course.board.now')}{segment.end_km ? ` · ${segment.end_km} km` : ''}</small>
              </div>
            ))}
          </div>
        )}

        {courseMode === 'planning' ? (
          <DispatchPlanningView trip={trip} sessionToken={sessionToken} readOnly={!isAdmin} onReload={onReload} onCancelled={onDeleted} />
        ) : (
          <TripCourseStops
            trip={trip}
            sessionToken={sessionToken}
            isAdmin={isAdmin}
            entries={entries}
            clients={clients}
            routes={routes}
            routeMap={routeMap}
            drivers={drivers}
            allTrips={allTrips}
            dailyCosts={dailyCosts}
            busy={busy}
            setBusy={setBusy}
            onReload={onReload}
            onDeleted={onDeleted}
          />
        )}

        <div className="live-journal-section-title">{t('course.board.journalTitle')}</div>
        {loading && <div className="live-loading-row"><LoaderCircle size={16} className="is-spinning" /> {t('course.loading')}</div>}
        {!loading && journal.events.length === 0 && <div className="driver-empty-row">{t('course.board.noEvents')}</div>}
        {journal.events.map(event => {
          const Icon = EVENT_ICONS[event.event_type] || History;
          return (
            <div className="journal-event" key={event.id}>
              <div className="journal-event-icon"><Icon size={14} /></div>
              <div>
                <div className="journal-event-time">{formatCourseTime(event.created_at, locale)}{event.actor_name ? ` · ${event.actor_name}` : ''}</div>
                <div className="journal-event-label">{t(`course.events.${event.event_type}`, { defaultValue: event.event_type })}</div>
                <div className="journal-event-detail">{event.client_name ? `${event.client_name} · ` : ''}{event.details || ''}</div>
              </div>
            </div>
          );
        })}

        {trip.board_status === 'active' && <Link to="/route" className="mock-back-link live-journal-driver-link">{t('course.board.openDriverCard')}</Link>}
      </aside>
    </div>
  );
}

function KmApprovalSheet({ trip, value, busy, onValue, onApprove, onClose }) {
  const { t } = useTranslation();
  const sheetRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement;
    sheetRef.current?.focus();
    return () => { previous?.focus?.(); };
  }, []);

  useEffect(() => {
    const keydown = event => {
      if (event.key === 'Escape' && !busy) onCloseRef.current();
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
    return () => { document.removeEventListener('keydown', keydown); };
  }, [busy]);

  return (
    <div className="ap-overlay" style={{ display: 'flex' }} onPointerDown={() => !busy && onClose()}>
      <div ref={sheetRef} className="ap-sheet" role="dialog" aria-modal="true" aria-labelledby="km-title" tabIndex={-1} onPointerDown={event => event.stopPropagation()}>
        <div className="ap-handle" />
        <div className="ap-content">
          <h2 id="km-title" className="ap-title">{t('course.km.title')}</h2>
          <p className="live-sheet-copy">{trip.driver_name || t('course.noDriver')} · {VEHICLE_LABELS[trip.car] || trip.car}</p>
          <label className="live-field-label" htmlFor="approved-km">{t('course.km.endReading')}</label>
          <input id="approved-km" className="ap-input" inputMode="decimal" value={value} onChange={event => onValue(event.target.value)} />
          <div className="ap-btn-group">
            <button className="ap-btn ap-btn-primary" onClick={() => onApprove(true)} disabled={busy}>{t('course.km.approveWithCosts')}</button>
            <button className="ap-btn ap-btn-secondary" onClick={() => onApprove(false)} disabled={busy}>{t('course.km.approveNoCosts')}</button>
            <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={busy}>{t('course.cancel')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HoursApprovalSheet({ trip, start, end, busy, onStart, onEnd, onApprove, onReject, onClose }) {
  const { t, i18n } = useTranslation();
  const sheetRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  const duration = minutesBetweenClocks(start, end);
  const locale = i18n.language?.startsWith('de') ? 'de-DE' : 'pl-PL';

  useEffect(() => {
    const previous = document.activeElement;
    sheetRef.current?.focus();
    return () => { previous?.focus?.(); };
  }, []);

  useEffect(() => {
    const keydown = event => {
      if (event.key === 'Escape' && !busy) onCloseRef.current();
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
    return () => { document.removeEventListener('keydown', keydown); };
  }, [busy]);

  return (
    <div className="ap-overlay" style={{ display: 'flex' }} onPointerDown={() => !busy && onClose()}>
      <div ref={sheetRef} className="ap-sheet" role="dialog" aria-modal="true" aria-labelledby="hours-title" tabIndex={-1} onPointerDown={event => event.stopPropagation()}>
        <div className="ap-handle" />
        <div className="ap-content live-hours-approve-sheet">
          <h2 id="hours-title" className="ap-title">{t('course.board.hoursApproveTitle')}</h2>
          <div className="live-hours-approve-driver">
            <div className="live-hours-approve-avatar" aria-hidden="true">
              {(trip.driver_name || trip.employee_name || '?').split(' ').map(part => part[0]).join('').slice(0, 2)}
            </div>
            <div>
              <strong>{trip.employee_name || trip.driver_name || t('course.noDriver')}</strong>
              <span>{trip.reported_hours ? t('workTime.driverReported') + ` ${trip.reported_hours}` : t('course.board.noReportedHours')}</span>
            </div>
          </div>
          <div className="live-time-grid">
            <label className="live-field-label" htmlFor="approved-hours-start">{t('workTime.start')}
              <input id="approved-hours-start" className="ap-input" type="time" value={start} onChange={event => onStart(event.target.value)} disabled={busy} />
            </label>
            <label className="live-field-label" htmlFor="approved-hours-end">{t('workTime.end')}
              <input id="approved-hours-end" className="ap-input" type="time" value={end} onChange={event => onEnd(event.target.value)} disabled={busy} />
            </label>
          </div>
          <div className="live-worktime-preview">
            {t('workTime.toApprove')}: <strong>{start || '—'}–{end || '—'}</strong>
            {duration ? ` · ${formatWorkDuration(duration)}` : ` · ${t('workTime.invalid')}`}
          </div>
          {trip.trip_date && (
            <p className="live-sheet-copy is-muted">
              {new Date(`${trip.trip_date}T00:00:00`).toLocaleDateString(locale)}
            </p>
          )}
          <div className="ap-btn-group">
            <button className="ap-btn ap-btn-primary" onClick={onApprove} disabled={busy || !duration}>
              <CheckCircle2 size={16} aria-hidden="true" /> {t('workTime.approveTitle')}
            </button>
            <button className="ap-btn ap-btn-secondary is-danger" onClick={onReject} disabled={busy}>
              <XCircle size={16} aria-hidden="true" /> {t('workTime.rejectTitle')}
            </button>
            <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={busy}>{t('course.cancel')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettlementCheck({ icon: Icon, label, state, disabled, onClick, hint }) {
  return (
    <button
      type="button"
      className={`kurs-settlement-check is-${state}`}
      disabled={disabled}
      onClick={onClick}
      title={hint}
    >
      <span className="kurs-settlement-check-icon" aria-hidden="true"><Icon size={15} /></span>
      <span className="kurs-settlement-check-copy">
        <strong>{label}</strong>
        <small>{state === 'approved' ? '✓' : state === 'pending' ? '…' : '—'}</small>
      </span>
      {state === 'pending' && !disabled && <ChevronRight size={14} className="kurs-settlement-check-chevron" aria-hidden="true" />}
    </button>
  );
}

function CourseCard({ trip, index, isAdmin, onOpen, onApprove, onApproveHours, onAssign, locale }) {
  const { t } = useTranslation();
  const progress = trip.stops_total ? Math.round((trip.stops_completed / trip.stops_total) * 100) : 0;
  const routeColor = getRouteColorByDisplay(trip.route_display || 1);
  const canAssign = isAdmin && (trip.isVirtual || (trip.board_status === 'planning' && !trip.driver_id));
  const isVirtual = !!trip.isVirtual;
  const kmApproved = trip.km_approval_status === 'approved';
  const hoursApproved = trip.hours_status === 'approved';
  const hasHoursReport = Boolean(trip.work_time_report_id || trip.reported_hours);
  const kmState = kmApproved ? 'approved' : trip.end_km ? 'pending' : 'missing';
  const hoursState = hoursApproved ? 'approved' : hasHoursReport ? 'pending' : 'missing';
  const settlementPending = (trip.board_status === 'settlement') && (!kmApproved || !hoursApproved);
  const openCourse = () => (isVirtual ? onAssign(trip) : onOpen(trip));
  return (
    <Draggable draggableId={String(trip.id)} index={index} isDragDisabled={!isAdmin || isVirtual}>
      {(provided, snapshot) => (
        <article
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`kurs-card is-clickable ${snapshot.isDragging ? 'is-dragging' : ''} ${trip.board_status === 'closed' ? 'kurs-closed' : ''}`}
          style={provided.draggableProps.style}
          onClick={event => { if (!event.target.closest('button, a, input, select')) openCourse(); }}
        >
          <div className="kurs-card-top">
            <button className="kurs-title-button" onClick={openCourse}>
              <span className="kurs-route-badge" style={{ background: `${routeColor}1F`, color: routeColor }}>T{trip.route_display || '—'}</span>
              <span className="kurs-route-name">{trip.route_name || t('course.dailyCourse')}</span>
            </button>
            <div className="kurs-card-actions">
              {trip.car && <span className="kurs-car-chip">{VEHICLE_LABELS[trip.car] || trip.car}</span>}
              {isAdmin && <button className="kurs-drag-handle" {...provided.dragHandleProps}><GripVertical size={16} /></button>}
            </div>
          </div>

          <div className="kurs-driver-row">
            {trip.driver_name ? <><div className="kurs-avatar">{trip.driver_name.split(' ').map(part => part[0]).join('').slice(0, 2)}</div><span className="kurs-driver-name">{trip.driver_name}</span></> : <span className="kurs-no-driver"><AlertTriangle size={12} /> {t('course.noDriver')}</span>}
          </div>

          {trip.board_status === 'ready' && (
            <div className="kurs-progress-label">
              <Clock3 size={12} /> {trip.planned_start ? t('course.board.startAt', { time: formatCourseTime(trip.planned_start, locale) }) : t('course.board.readyManualStart')} · {trip.stops_total} {t('course.board.stops')}
            </div>
          )}
          {trip.board_status === 'planning' && (
            <div className="kurs-progress-label">
              {trip.isVirtual ? t('course.board.needsDriver') : `${trip.stops_total || 0} ${t('course.board.stops')} · ${t('course.board.fillCrew')}`}
            </div>
          )}
          {canAssign && (
            <button className="kurs-approve-btn" onClick={() => onAssign(trip)}><UserCheck size={13} /> {t('course.board.assignDriver')}</button>
          )}
          {trip.board_status === 'active' && (
            <>
              <div className="kurs-progress-track"><div className="kurs-progress-fill" style={{ width: `${progress}%` }} /></div>
              <div className="kurs-progress-label">
                {t('course.board.stopsProgress', { done: trip.stops_completed, total: trip.stops_total, name: trip.current_stop_name || t('course.board.noNextStop') })}
              </div>
            </>
          )}
          {(trip.board_status === 'settlement' || trip.board_status === 'closed') && (
            <div className="kurs-settlement-panel">
              <div className="kurs-settlement-meta">
                <span>{trip.end_km ?? '—'} km</span>
                <span className="kurs-settlement-dot" aria-hidden="true">·</span>
                <span>{trip.reported_hours || t('course.board.noReportedHours')}</span>
              </div>
              <div className="kurs-settlement-checks">
                <SettlementCheck
                  icon={Gauge}
                  label="km"
                  state={kmState}
                  disabled={!isAdmin || !trip.end_km}
                  onClick={() => onApprove(trip)}
                  hint={kmApproved ? t('course.board.kmApproved') : t('course.km.title')}
                />
                <SettlementCheck
                  icon={Clock3}
                  label={t('course.board.hoursShort')}
                  state={hoursState}
                  disabled={!isAdmin || hoursApproved || !hasHoursReport}
                  onClick={() => onApproveHours(trip)}
                  hint={hoursApproved ? t('course.board.hoursApprovedLabel') : hasHoursReport ? t('course.board.hoursApproveTitle') : t('course.board.noReportedHours')}
                />
              </div>
              {settlementPending && (
                <p className="kurs-settlement-hint">{t('course.board.settlementHint')}</p>
              )}
            </div>
          )}
          {trip.problem_label && <div className="kurs-problem-badge"><AlertTriangle size={12} /> {trip.problem_label}</div>}
        </article>
      )}
    </Draggable>
  );
}

export default function DispatchBoard() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('de') ? 'de-DE' : 'pl-PL';
  const { sessionToken, isAdmin } = useAuth();
  const { entries, allRoutes, clients, refetch } = useAppData();
  const [viewMode, setViewMode] = useState('day');
  const [tripDate, setTripDate] = useState(() => operationalYmd());
  const [trips, setTrips] = useState([]);
  const [allTrips, setAllTrips] = useState([]);
  const [dailyCosts, setDailyCosts] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openTrip, setOpenTrip] = useState(null);
  const [kmTrip, setKmTrip] = useState(null);
  const [assignTrip, setAssignTrip] = useState(null);
  const [kmValue, setKmValue] = useState('');
  const [hoursTrip, setHoursTrip] = useState(null);
  const [hoursStart, setHoursStart] = useState('');
  const [hoursEnd, setHoursEnd] = useState('');
  const [busy, setBusy] = useState(false);

  const boardColumns = useMemo(
    () => BOARD_COLUMN_KEYS.map(key => ({ key, label: t(`course.board.columns.${key}`) })),
    [t],
  );

  const routeMap = useMemo(
    () => Object.fromEntries(allRoutes.map((route, index) => [route.id, { num: index + 1, name: route.name }])),
    [allRoutes],
  );

  const archiveVirtualTrips = useMemo(() => buildVirtualPlannedTrips({
    entries,
    allTrips,
  }).map(trip => ({
    ...trip,
    isVirtual: true,
    driver_name: t('course.unassignedDriver'),
    route_display: routeMap[Number(trip.routes)]?.num || Number(trip.routes),
    route_name: routeMap[Number(trip.routes)]?.name || `Trasa ${trip.routes}`,
  })), [allTrips, entries, routeMap, t]);

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
      setDailyCosts(tripsData?.daily_costs || []);
      const virtualTrips = buildVirtualPlannedTrips({
        entries,
        allTrips: storedTrips,
        tripDate,
      }).map(trip => ({
        ...trip,
        isVirtual: true,
        route_display: routeMap[Number(trip.routes)]?.num || Number(trip.routes),
        route_name: routeMap[Number(trip.routes)]?.name || `Trasa ${trip.routes}`,
      }));
      const merged = [...virtualTrips, ...boardTrips];
      setTrips(merged);
      setOpenTrip(current => current ? merged.find(trip => trip.id === current.id) || storedTrips.find(trip => trip.id === current.id) || null : null);
    } catch (error) {
      toastError(error.message);
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

  useEffect(() => {
    if (viewMode !== 'day') return undefined;
    const interval = window.setInterval(loadBoard, 30000);
    return () => window.clearInterval(interval);
  }, [loadBoard, viewMode]);

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
      toastSuccess(t('course.board.stageChanged', { label: boardColumns.find(column => column.key === stage)?.label }));
      await loadBoard();
    } catch (error) { toastError(error.message); }
    finally { setBusy(false); }
  };

  const onDragEnd = result => {
    if (!isAdmin || !result.destination || result.source.droppableId === result.destination.droppableId) return;
    if (String(result.draggableId).startsWith('virtual_')) return;
    if (result.destination.droppableId === 'closed') {
      toastError(t('course.board.closedAutoHint'));
      return;
    }
    moveStage(result.draggableId, result.destination.droppableId);
  };

  const openKmApproval = tripToApprove => {
    setKmTrip(tripToApprove);
    setKmValue(String(tripToApprove.end_km || ''));
  };

  const openHoursApproval = async tripToApprove => {
    let enriched = { ...tripToApprove };
    if (!enriched.work_time_report_id && enriched.id) {
      try {
        setBusy(true);
        const data = await getTripWorkTimeReport(sessionToken, enriched.id);
        if (data?.report?.id) {
          enriched = {
            ...enriched,
            work_time_report_id: data.report.id,
            hours_status: data.report.status || enriched.hours_status,
            reported_start: data.report.reported_start || enriched.reported_start,
            reported_end: data.report.reported_end || enriched.reported_end,
            employee_name: data.report.employee_name || enriched.employee_name,
          };
        }
      } catch (error) {
        toastError(error.message);
        return;
      } finally {
        setBusy(false);
      }
    }
    if (!enriched.work_time_report_id && !enriched.reported_hours) {
      toastError(t('course.board.noReportedHours'));
      return;
    }
    setHoursTrip(enriched);
    if (enriched.reported_start) {
      setHoursStart(timeForInput(enriched.reported_start) || '');
      setHoursEnd(timeForInput(enriched.reported_end) || '');
      return;
    }
    if (enriched.reported_hours?.includes('–')) {
      const [start, end] = enriched.reported_hours.split('–');
      setHoursStart(timeForInput(start) || '');
      setHoursEnd(timeForInput(end) || '');
      return;
    }
    setHoursStart('');
    setHoursEnd('');
  };

  const approveKm = async (writeCosts = true) => {
    const value = Number(String(kmValue).replace(',', '.'));
    if (!Number.isFinite(value)) { toastError(t('course.board.invalidKm')); return; }
    try {
      setBusy(true);
      await approveCourseKm(sessionToken, kmTrip.id, value, writeCosts);
      setKmTrip(null);
      toastSuccess(writeCosts ? t('course.km.successWithCosts') : t('course.km.successNoCosts'));
      await loadBoard();
    } catch (error) { toastError(error.message); }
    finally { setBusy(false); }
  };

  const approveHours = async () => {
    let reportId = hoursTrip?.work_time_report_id;
    if (!reportId && hoursTrip?.id) {
      try {
        const data = await getTripWorkTimeReport(sessionToken, hoursTrip.id);
        reportId = data?.report?.id;
      } catch {
        reportId = null;
      }
    }
    if (!reportId) {
      toastError(t('course.board.noReportedHours'));
      return;
    }
    if (!minutesBetweenClocks(hoursStart, hoursEnd)) {
      toastError(t('workTime.invalid'));
      return;
    }
    try {
      setBusy(true);
      await approveWorkTime(sessionToken, reportId, hoursStart, hoursEnd);
      setHoursTrip(null);
      toastSuccess(t('workTime.approvalSuccess'));
      await loadBoard();
    } catch (error) { toastError(error.message); }
    finally { setBusy(false); }
  };

  const rejectHours = async () => {
    let reportId = hoursTrip?.work_time_report_id;
    if (!reportId && hoursTrip?.id) {
      try {
        const data = await getTripWorkTimeReport(sessionToken, hoursTrip.id);
        reportId = data?.report?.id;
      } catch {
        reportId = null;
      }
    }
    if (!reportId) {
      toastError(t('course.board.noReportedHours'));
      return;
    }
    const note = window.prompt(t('workTime.rejectPrompt'), '');
    if (note === null) return;
    try {
      setBusy(true);
      await rejectWorkTime(sessionToken, reportId, note);
      setHoursTrip(null);
      toastSuccess(t('workTime.rejectSuccess'));
      await loadBoard();
    } catch (error) { toastError(error.message); }
    finally { setBusy(false); }
  };

  return (
    <section className="dispatch-mock-root live-dispatch" aria-labelledby="dispatch-title">
      <div className="live-board-toolbar">
        <div>
          <div className="mock-kicker">{t('course.board.kicker')}</div>
          <h1 id="dispatch-title" className="mock-page-title">
            {viewMode === 'day' ? t('course.board.titleDay') : t('course.board.titleArchive')}
          </h1>
          {viewMode === 'day' && <div className="live-board-date-label">{formatCourseDate(tripDate, locale)}</div>}
        </div>
        <div className="live-board-actions">
          <div className="segmented-control live-view-toggle">
            <button type="button" className={`seg-btn ${viewMode === 'day' ? 'active' : ''}`} onClick={() => setViewMode('day')}>{t('course.board.viewDay')}</button>
            <button type="button" className={`seg-btn ${viewMode === 'archive' ? 'active' : ''}`} onClick={() => setViewMode('archive')}>{t('course.board.viewArchive')}</button>
          </div>
          {viewMode === 'day' && (
            <label htmlFor="dispatch-date">{t('course.board.courseDate')}<input id="dispatch-date" type="date" value={tripDate} onChange={event => setTripDate(event.target.value)} /></label>
          )}
          <button className="driver-tool-btn" onClick={loadBoard} disabled={loading || busy}><RefreshCw size={15} /> {t('course.board.refresh')}</button>
          {isAdmin && viewMode === 'day' && (
            <button className="driver-tool-btn" onClick={() => setAssignTrip({ id: `new_${tripDate}`, trip_date: tripDate, routes: '' })}><Plus size={15} /> {t('course.board.newCourse')}</button>
          )}
        </div>
      </div>

      {viewMode === 'archive' ? (
        <DispatchTripArchive
          allTrips={allTrips}
          entries={entries}
          allRoutes={allRoutes}
          routeMap={routeMap}
          dailyCosts={dailyCosts}
          virtualTrips={archiveVirtualTrips}
          busy={busy}
          setBusy={setBusy}
          sessionToken={sessionToken}
          onOpenTrip={setOpenTrip}
          onApproveKm={openKmApproval}
          onPlanPickup={null}
          onReload={loadBoard}
        />
      ) : (
        <>
          <div className="dispatch-summary">
            <span className="dispatch-chip"><CalendarDays size={13} /> {t('course.board.coursesCount', { count: trips.length })}</span>
            {summary.missing > 0 && <span className="dispatch-chip is-warning"><AlertTriangle size={12} /> {t('course.board.toPlan', { count: summary.missing })}</span>}
            <span className="dispatch-chip is-active">{t('course.board.inRoute', { count: summary.active })}</span>
            <span className="dispatch-chip">{t('course.board.settlement', { count: summary.settlement })}</span>
            {summary.problems > 0 && <span className="dispatch-chip is-warning"><AlertTriangle size={12} /> {t('course.board.problems', { count: summary.problems })}</span>}
          </div>

          {loading ? <div className="live-board-loading"><LoaderCircle className="is-spinning" /> {t('course.board.loadingCourses')}</div> : (
            <DragDropContext onDragEnd={onDragEnd}>
              <div className="dispatch-board">
                {boardColumns.map(column => {
                  const items = trips.filter(trip => trip.board_status === column.key);
                  return (
                    <div className="dispatch-col" key={column.key}>
                      <div className="dispatch-col-header"><span className="dispatch-col-title">{column.label}</span><span className="dispatch-col-count">{items.length}</span></div>
                      <Droppable droppableId={column.key} isDropDisabled={!isAdmin || column.key === 'closed'}>
                        {(provided, snapshot) => (
                          <div ref={provided.innerRef} {...provided.droppableProps} className={`dispatch-col-drop ${snapshot.isDraggingOver ? 'is-over' : ''}`}>
                            {items.map((trip, index) => (
                              <CourseCard key={trip.id} trip={trip} index={index} isAdmin={isAdmin} locale={locale} onOpen={setOpenTrip} onApprove={openKmApproval} onApproveHours={openHoursApproval} onAssign={setAssignTrip} />
                            ))}
                            {items.length === 0 && <div className="dispatch-empty">{t('course.board.noCourses')}</div>}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </div>
                  );
                })}
              </div>
            </DragDropContext>
          )}
        </>
      )}

      {openTrip && !openTrip.isVirtual && (
        <JournalPanel
          trip={openTrip}
          sessionToken={sessionToken}
          isAdmin={isAdmin}
          entries={entries}
          clients={clients}
          routes={allRoutes}
          routeMap={routeMap}
          drivers={drivers}
          allTrips={allTrips}
          dailyCosts={dailyCosts}
          busy={busy}
          setBusy={setBusy}
          boardColumns={boardColumns}
          locale={locale}
          onClose={() => setOpenTrip(null)}
          onStageChange={moveStage}
          onReload={async () => { await loadBoard(); await refetch(); }}
          onDeleted={() => { setOpenTrip(null); loadBoard(); }}
        />
      )}
      {kmTrip && <KmApprovalSheet trip={kmTrip} value={kmValue} busy={busy} onValue={setKmValue} onApprove={approveKm} onClose={() => setKmTrip(null)} />}
      {hoursTrip && (
        <HoursApprovalSheet
          trip={hoursTrip}
          start={hoursStart}
          end={hoursEnd}
          busy={busy}
          onStart={setHoursStart}
          onEnd={setHoursEnd}
          onApprove={approveHours}
          onReject={rejectHours}
          onClose={() => setHoursTrip(null)}
        />
      )}
      {assignTrip && (
        <AssignTripSheet
          trip={assignTrip}
          sessionToken={sessionToken}
          routeMap={routeMap}
          routes={allRoutes}
          drivers={drivers}
          onClose={() => setAssignTrip(null)}
          onAssigned={async createdTrip => {
            setAssignTrip(null);
            await loadBoard();
            await refetch();
            if (createdTrip?.id) {
              const routeId = Number(String(createdTrip.routes || '').split(',').find(Boolean));
              setOpenTrip({
                ...createdTrip,
                board_status: 'ready',
                route_display: routeMap[routeId]?.num || routeId,
                route_name: routeMap[routeId]?.name || `Trasa ${routeId}`,
              });
            }
          }}
        />
      )}
    </section>
  );
}
