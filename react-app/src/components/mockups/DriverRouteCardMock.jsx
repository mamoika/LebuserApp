import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, Navigation2,
  Package, Palette, ShoppingCart,
} from 'lucide-react';
import { toastSuccess, toastWarn } from '../../lib/toast';
import { routeBadgeStyle } from '../../lib/visualSystem';
import { VEHICLE_LABELS } from '../../lib/vehicles';
import { MOCK_DRIVER_COURSE, PROBLEM_OPTIONS } from './mockData';
import './mockups.css';

const TASK_ICON = { dostawa: Package, odbior: ShoppingCart };
const TASK_LABEL = { dostawa: 'Dostawa', odbior: 'Odbiór' };

function useSheetDialog(onClose) {
  const ref = useRef(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    ref.current?.focus();
    const onKeyDown = event => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab' && ref.current) {
        const focusable = [...ref.current.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')];
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
  return ref;
}

function ProblemSheet({ onClose, onPick }) {
  const sheetRef = useSheetDialog(onClose);
  return (
    <div className="ap-overlay" style={{ display: 'flex' }} onPointerDown={onClose}>
      <div ref={sheetRef} className="ap-sheet" role="dialog" aria-modal="true" aria-labelledby="problem-title" tabIndex={-1} onPointerDown={e => e.stopPropagation()}>
        <div className="ap-handle" />
        <div className="ap-content">
          <h2 id="problem-title" className="ap-title">Problem lub zmiana</h2>
          <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center', marginBottom: '10px' }}>
            Wybierz, co się zmieniło na tym przystanku
          </div>
          {PROBLEM_OPTIONS.map(opt => (
            <button key={opt.key} className="driver-problem-option" onClick={() => onPick(opt)}>
              <span>
                <span className="driver-problem-option-label">{opt.label}</span>
                <div className="driver-problem-option-hint">{opt.hint}</div>
              </span>
              <ChevronRight size={16} color="var(--text-quaternary)" />
            </button>
          ))}
          <div className="ap-btn-group">
            <button className="ap-btn ap-btn-secondary" onClick={onClose}>Zamknij</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EndCourseSheet({ onClose, onConfirm }) {
  const [km, setKm] = useState('');
  const [start, setStart] = useState('06:32');
  const [end, setEnd] = useState('14:10');
  const sheetRef = useSheetDialog(onClose);

  return (
    <div className="ap-overlay" style={{ display: 'flex' }} onPointerDown={onClose}>
      <div ref={sheetRef} className="ap-sheet" role="dialog" aria-modal="true" aria-labelledby="end-course-title" tabIndex={-1} onPointerDown={e => e.stopPropagation()}>
        <div className="ap-handle" />
        <div className="ap-content">
          <h2 id="end-course-title" className="ap-title">Zakończ kurs</h2>
          <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center', marginBottom: '16px' }}>
            Ostatni przystanek obsłużony. Podaj licznik i godziny pracy do zatwierdzenia.
          </div>

          <label htmlFor="end-course-km" style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>Stan licznika (km)</label>
          <input
            id="end-course-km"
            type="number"
            inputMode="numeric"
            value={km}
            onChange={e => setKm(e.target.value)}
            placeholder="np. 24810"
            style={{ width: '100%', padding: '13px 14px', borderRadius: '12px', border: '1px solid var(--border)', fontSize: '16px', marginBottom: '14px', fontFamily: 'inherit' }}
          />

          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="end-course-start" style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>Start pracy</label>
              <input id="end-course-start" type="time" value={start} onChange={e => setStart(e.target.value)} style={{ width: '100%', padding: '13px 14px', borderRadius: '12px', border: '1px solid var(--border)', fontSize: '16px', fontFamily: 'inherit' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="end-course-end" style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>Koniec pracy</label>
              <input id="end-course-end" type="time" value={end} onChange={e => setEnd(e.target.value)} style={{ width: '100%', padding: '13px 14px', borderRadius: '12px', border: '1px solid var(--border)', fontSize: '16px', fontFamily: 'inherit' }} />
            </div>
          </div>

          <div className="ap-btn-group">
            <button className="ap-btn ap-btn-primary" onClick={() => onConfirm({ km, start, end })} disabled={!km}>
              Zatwierdź i zakończ kurs
            </button>
            <button className="ap-btn ap-btn-secondary" onClick={onClose}>Wróć</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DriverRouteCardMock() {
  const course = MOCK_DRIVER_COURSE;
  const [stopIndex, setStopIndex] = useState(course.startStopIndex);
  const [problemOpen, setProblemOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [finished, setFinished] = useState(null);

  const stops = course.stops;
  const current = stops[stopIndex];
  const isLastStop = stopIndex === stops.length - 1;

  const handleFinishStop = () => {
    if (isLastStop) {
      setEndOpen(true);
      return;
    }
    toastSuccess(`Zakończono przystanek: ${current.name}`);
    setStopIndex(i => i + 1);
  };

  const handlePickProblem = (opt) => {
    setProblemOpen(false);
    toastWarn(`Zgłoszono: ${opt.label} (makieta — brak zapisu w bazie)`);
  };

  const handleConfirmEnd = ({ km, start, end }) => {
    setEndOpen(false);
    setFinished({ km, start, end });
    toastSuccess('Kurs zakończony — zgłoszono licznik i godziny (makieta)');
  };

  if (finished) {
    return (
      <div className="driver-phone">
        <Link to="/mock" className="mock-back-link"><ArrowLeft size={14} /> Wszystkie makiety</Link>
        <div className="driver-focus-card driver-finished-screen">
          <CheckCircle2 size={56} color="var(--accent-green)" style={{ marginBottom: '16px' }} />
          <h1 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '6px' }}>Kurs zakończony</h1>
          <div style={{ fontSize: '14px', color: 'var(--text-tertiary)', marginBottom: '18px' }}>
            {course.routeName} · {stops.length} przystanków obsłużonych
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            Licznik: <strong>{finished.km} km</strong><br />
            Godziny pracy: <strong>{finished.start}–{finished.end}</strong><br />
            <span style={{ color: 'var(--text-quaternary)' }}>Czeka na zatwierdzenie administratora (kolumna „Do rozliczenia")</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="driver-phone">
      <Link to="/mock" className="mock-back-link"><ArrowLeft size={14} /> Wszystkie makiety</Link>

      <div className="mock-banner">
        <Palette size={16} aria-hidden="true" /> Makieta „Karta kursu kierowcy" — dane przykładowe, przyciski nie zapisują niczego w bazie.
      </div>

      <div className="driver-top-bar">
        <span className="driver-route-pill">
          <span className="kurs-route-badge" style={{ ...routeBadgeStyle(course.routeDisplay), marginRight: '6px' }}>T{course.routeDisplay}</span>
          {course.routeName} · {VEHICLE_LABELS[course.car]}
        </span>
        <span className="driver-status-pill">W trasie</span>
      </div>

      <div className="driver-progress-track" role="progressbar" aria-label="Postęp kursu" aria-valuemin="1" aria-valuemax={stops.length} aria-valuenow={stopIndex + 1}>
        <div className="driver-progress-fill" style={{ width: `${((stopIndex + 1) / stops.length) * 100}%` }} />
      </div>
      <div className="driver-progress-label">Przystanek {stopIndex + 1} z {stops.length}</div>

      <div className="driver-focus-card">
        <h1 className="driver-client-name">{current.name}</h1>
        <div className="driver-address-row">
          <span className="driver-address-text">{current.address}</span>
          <a
            className="driver-nav-btn"
            href={`https://maps.google.com/?q=${encodeURIComponent(current.address)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Navigation2 size={14} /> Nawiguj
          </a>
        </div>

        <div className="driver-task-list">
          {current.tasks.length === 0 && (
            <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Brak zadań — tylko potwierdzenie przystanku.</div>
          )}
          {current.tasks.map((task, i) => {
            const Icon = TASK_ICON[task.type];
            return (
              <div className="driver-task-row" key={i}>
                <span className={`driver-task-icon ${task.type}`}><Icon size={16} /></span>
                {TASK_LABEL[task.type]}: {task.qty} {task.unit}
              </div>
            );
          })}
        </div>

        {current.note && (
          <div className="driver-note"><AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '1px' }} /> {current.note}</div>
        )}
      </div>

      <button className="driver-primary-btn" onClick={handleFinishStop}>
        <CheckCircle2 size={19} /> {isLastStop ? 'Zakończ kurs' : 'Zakończ przystanek'}
      </button>
      <button className="driver-secondary-btn" onClick={() => setProblemOpen(true)}>
        <AlertTriangle size={14} /> Problem lub zmiana
      </button>

      <div className="driver-upcoming">
        <div className="driver-upcoming-title">Pozostałe przystanki</div>
        {stops.slice(stopIndex + 1).map((s, i) => (
          <div className="driver-upcoming-row" key={s.id}>
            <span className="driver-upcoming-index">{stopIndex + i + 2}</span>
            {s.name}
          </div>
        ))}
        {stopIndex === stops.length - 1 && (
          <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', padding: '10px 4px' }}>To ostatni przystanek.</div>
        )}
      </div>

      {problemOpen && <ProblemSheet onClose={() => setProblemOpen(false)} onPick={handlePickProblem} />}
      {endOpen && <EndCourseSheet onClose={() => setEndOpen(false)} onConfirm={handleConfirmEnd} />}
    </div>
  );
}
