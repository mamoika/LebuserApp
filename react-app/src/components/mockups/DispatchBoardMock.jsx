import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Clock3, Gauge, PlayCircle,
  GripVertical, Palette, RefreshCw, UserCheck, X,
} from 'lucide-react';
import { VEHICLE_LABELS } from '../../lib/vehicles';
import { getRouteColorByDisplay, routeBadgeStyle } from '../../lib/visualSystem';
import { toastSuccess, toastWarn } from '../../lib/toast';
import { BOARD_COLUMNS, INITIAL_KURSY, MOCK_DRIVERS, MOCK_TRIP_LOG } from './mockData';
import './mockups.css';

const driverById = Object.fromEntries(MOCK_DRIVERS.map(d => [d.id, d]));

const JOURNAL_ICONS = {
  start: PlayCircle,
  stop: CheckCircle2,
  problem: AlertTriangle,
  car: RefreshCw,
  handoff: UserCheck,
  finish: Clock3,
  settlement: Gauge,
};

function JournalPanel({ kurs, onClose, onStatusChange }) {
  const driver = kurs.driverId ? driverById[kurs.driverId] : null;
  const events = MOCK_TRIP_LOG[kurs.id] || [];
  const panelRef = useRef(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    panelRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab' && panelRef.current) {
        const focusable = [...panelRef.current.querySelectorAll('a[href], button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="journal-overlay" onPointerDown={onClose}>
      <aside
        ref={panelRef}
        className="journal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="journal-title"
        tabIndex={-1}
        onPointerDown={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span className="kurs-route-badge" style={routeBadgeStyle(kurs.routeDisplay)}>T{kurs.routeDisplay}</span>
              <h2 id="journal-title" className="journal-title">{kurs.routeName}</h2>
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', fontWeight: 600 }}>
              {driver ? driver.name : 'Bez kierowcy'}{kurs.car ? ` · ${VEHICLE_LABELS[kurs.car]}` : ''}
            </div>
          </div>
          <button className="journal-close" onClick={onClose} aria-label="Zamknij"><X size={16} /></button>
        </div>

        <div className="journal-status-control">
          <label htmlFor="journal-status">Etap kursu</label>
          <select id="journal-status" value={kurs.status} onChange={event => onStatusChange(kurs.id, event.target.value)}>
            {BOARD_COLUMNS.map(column => <option key={column.key} value={column.key}>{column.label}</option>)}
          </select>
          <small>Alternatywa dla przeciągania — działa także klawiaturą.</small>
        </div>

        <div style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--text-quaternary)', margin: '10px 0 4px' }}>
          Dziennik kursu
        </div>

        {events.length === 0 && (
          <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', padding: '12px 0' }}>
            Brak wpisów — kurs jeszcze nie ruszył.
          </div>
        )}

        {events.map((ev, i) => {
          const Icon = JOURNAL_ICONS[ev.type] || Clock3;
          return (
            <div className="journal-event" key={i}>
              <div className="journal-event-icon"><Icon size={14} /></div>
              <div>
                <div className="journal-event-time">{ev.time}</div>
                <div className="journal-event-label">{ev.label}</div>
                <div className="journal-event-detail">{ev.detail}</div>
              </div>
            </div>
          );
        })}

        {kurs.status === 'active' && (
          <Link to="/mock/kierowca" className="mock-back-link" style={{ marginTop: '18px' }}>
            Zobacz makietę ekranu kierowcy dla tego kursu →
          </Link>
        )}
      </aside>
    </div>
  );
}

function KursCard({ kurs, index, onOpen, onApprove }) {
  const driver = kurs.driverId ? driverById[kurs.driverId] : null;
  const routeColor = getRouteColorByDisplay(kurs.routeDisplay);
  const progressPct = kurs.status === 'active' ? Math.round((kurs.currentStop / kurs.stopsTotal) * 100) : 0;

  return (
    <Draggable draggableId={kurs.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`kurs-card ${snapshot.isDragging ? 'is-dragging' : ''} ${kurs.status === 'closed' ? 'kurs-closed' : ''}`}
          style={provided.draggableProps.style}
        >
          <div className="kurs-card-top">
            <button type="button" className="kurs-title-button" onClick={() => onOpen(kurs)} aria-label={`Otwórz dziennik kursu ${kurs.routeName}`}>
              <span className="kurs-route-badge" style={{ background: `${routeColor}1F`, color: routeColor }}>T{kurs.routeDisplay}</span>
              <span className="kurs-route-name">{kurs.routeName}</span>
            </button>
            <div className="kurs-card-actions">
              {kurs.car && <span className="kurs-car-chip">{VEHICLE_LABELS[kurs.car]}</span>}
              <button type="button" className="kurs-drag-handle" {...provided.dragHandleProps} aria-label={`Przeciągnij kurs ${kurs.routeName}`}>
                <GripVertical size={16} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="kurs-driver-row">
            {driver ? (
              <>
                <div className="kurs-avatar">{driver.initials}</div>
                <span className="kurs-driver-name">{driver.name}</span>
              </>
            ) : (
              <span className="kurs-no-driver"><AlertTriangle size={12} /> Brak kierowcy</span>
            )}
          </div>

          {kurs.status === 'ready' && (
            <div className="kurs-progress-label"><Clock3 size={11} style={{ marginRight: '4px', verticalAlign: '-1px' }} />Start {kurs.plannedStart} · {kurs.stopsTotal} przystanków</div>
          )}

          {kurs.status === 'active' && (
            <>
              <div className="kurs-progress-track">
                <div className="kurs-progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
              <div className="kurs-progress-label">{kurs.currentStop} z {kurs.stopsTotal} przystanków · od {kurs.startedAt}</div>
            </>
          )}

          {kurs.status === 'planning' && (
            <div className="kurs-progress-label">{kurs.stopsTotal} przystanków · czeka na przypisanie</div>
          )}

          {(kurs.status === 'settlement' || kurs.status === 'closed') && (
            <>
              <div className="kurs-settlement-row">{kurs.reportedKm ?? '—'} km · {kurs.reportedHours ?? 'brak godzin'}</div>
              <div className="kurs-approve-row">
                <button
                  className={`kurs-approve-btn ${kurs.kmApproved ? 'is-approved' : ''}`}
                  onClick={(e) => { e.stopPropagation(); onApprove(kurs.id, 'kmApproved'); }}
                >
                  <Gauge size={12} /> km {kurs.kmApproved ? '✓' : ''}
                </button>
                <button
                  className={`kurs-approve-btn ${kurs.hoursApproved ? 'is-approved' : ''}`}
                  onClick={(e) => { e.stopPropagation(); onApprove(kurs.id, 'hoursApproved'); }}
                >
                  <Clock3 size={12} /> godziny {kurs.hoursApproved ? '✓' : ''}
                </button>
              </div>
            </>
          )}

          {kurs.problem && (
            <div className="kurs-problem-badge"><AlertTriangle size={12} /> {kurs.problem.label}</div>
          )}
        </div>
      )}
    </Draggable>
  );
}

export default function DispatchBoardMock() {
  const [kursy, setKursy] = useState(INITIAL_KURSY);
  const [openKurs, setOpenKurs] = useState(null);

  const summary = useMemo(() => {
    const missingDriver = kursy.filter(k => k.status === 'planning' && !k.driverId).length;
    const active = kursy.filter(k => k.status === 'active').length;
    const settlement = kursy.filter(k => k.status === 'settlement').length;
    const problems = kursy.filter(k => !!k.problem).length;
    return { total: kursy.length, missingDriver, active, settlement, problems };
  }, [kursy]);

  const onDragEnd = (result) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    setKursy(prev => {
      const moved = prev.find(k => k.id === draggableId);
      const withoutMoved = prev.filter(k => k.id !== draggableId);
      const destItems = withoutMoved.filter(k => k.status === destination.droppableId);
      const others = withoutMoved.filter(k => k.status !== destination.droppableId);
      destItems.splice(destination.index, 0, { ...moved, status: destination.droppableId });
      return [...others, ...destItems];
    });

    if (source.droppableId !== destination.droppableId) {
      toastSuccess(`Kurs przeniesiony: ${BOARD_COLUMNS.find(c => c.key === destination.droppableId)?.label} (makieta — brak zapisu)`);
    }
  };

  const handleApprove = (id, field) => {
    setKursy(prev => prev.map(k => k.id === id ? { ...k, [field]: !k[field] } : k));
    toastWarn('Makieta — zatwierdzenie nie jest jeszcze zapisywane w bazie.');
  };

  const handleStatusChange = (id, status) => {
    setKursy(prev => prev.map(k => k.id === id ? { ...k, status } : k));
    setOpenKurs(prev => prev?.id === id ? { ...prev, status } : prev);
    toastSuccess(`Kurs przeniesiony: ${BOARD_COLUMNS.find(column => column.key === status)?.label} (makieta — brak zapisu)`);
  };

  return (
    <section className="dispatch-mock-root" aria-labelledby="dispatch-mock-title">
      <Link to="/mock" className="mock-back-link"><ArrowLeft size={14} /> Wszystkie makiety</Link>

      <h1 id="dispatch-mock-title" className="mock-page-title">Dyspozytornia dnia</h1>

      <div className="mock-banner">
        <Palette size={16} aria-hidden="true" /> Makieta „Dyspozytornia administratora" — dane przykładowe, zmiany nie są zapisywane w bazie.
      </div>

      <div className="dispatch-summary">
        <span className="dispatch-chip">{summary.total} kursów dzisiaj</span>
        {summary.missingDriver > 0 && <span className="dispatch-chip is-warning"><AlertTriangle size={12} /> {summary.missingDriver} brak obsady</span>}
        <span className="dispatch-chip is-active">{summary.active} w trasie</span>
        <span className="dispatch-chip">{summary.settlement} do rozliczenia</span>
        {summary.problems > 0 && <span className="dispatch-chip is-warning"><AlertTriangle size={12} /> {summary.problems} zgłoszony problem</span>}
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="dispatch-board" aria-label="Etapy kursów dziennych">
          {BOARD_COLUMNS.map(col => {
            const items = kursy.filter(k => k.status === col.key);
            return (
              <div className="dispatch-col" key={col.key}>
                <div className="dispatch-col-header">
                  <span className="dispatch-col-title">{col.label}</span>
                  <span className="dispatch-col-count">{items.length}</span>
                </div>
                <Droppable droppableId={col.key}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`dispatch-col-drop ${snapshot.isDraggingOver ? 'is-over' : ''}`}
                    >
                      {items.map((kurs, index) => (
                        <KursCard key={kurs.id} kurs={kurs} index={index} onOpen={setOpenKurs} onApprove={handleApprove} />
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {openKurs && <JournalPanel kurs={openKurs} onClose={() => setOpenKurs(null)} onStatusChange={handleStatusChange} />}
    </section>
  );
}
