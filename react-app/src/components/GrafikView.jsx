import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { isHoliday } from '../utils/holidays';
import { getWorkScheduleMonth } from '../lib/readRpc';
import { toastError, toastSuccess } from '../lib/toast';
import { monthNames, dayNamesSunSat } from '../lib/dateUtils';
import { exportRowsAsXlsx } from '../lib/excelExport';
import { BookOpen, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3, Download, History, Info, Printer, X, XCircle } from 'lucide-react';
import { approveWorkTime, rejectWorkTime } from '../lib/adminRpc';
import { formatWorkDuration, minutesBetweenClocks, timeForInput } from '../lib/workTime';
import { getEmployeeMonthNorm, parseHours, formatDiff } from '../lib/rosterHelpers';

const VALUE_STYLE = {
  'W':   { bg: '#f1f5f9', color: '#94a3b8', pattern: false },
  'UW':  { bg: '#bfdbfe', color: '#1e40af', pattern: false },
  'L4':  { bg: '#ffe4e6', color: '#be123c', pattern: false },
  'NU':  { bg: '#fef3c7', color: '#92400e', pattern: false },
  'NN':  { bg: '#ff0000', color: '#fff', pattern: false },
  'I':   { bg: null, color: '#6d28d9', pattern: true },
  'END': { bg: '#e2e8f0', color: '#475569', pattern: false },
  '8':   { bg: '#dcfce7', color: '#15803d', pattern: false },
};

const NAME_COLUMN_WIDTH = 185;
const DAY_COLUMN_WIDTH = 30;
const SUMMARY_COLUMN_WIDTHS = [46, 38, 42, 30, 30, 30, 30];
const SUMMARY_TOTAL_WIDTH = SUMMARY_COLUMN_WIDTHS.reduce((sum, width) => sum + width, 0);
const SUMMARY_RIGHT_OFFSETS = SUMMARY_COLUMN_WIDTHS.map((_, index) => (
  SUMMARY_COLUMN_WIDTHS.slice(index + 1).reduce((sum, width) => sum + width, 0)
));

function getCellStyle(value, isWeekendOrHoliday) {
  const v = String(value || '').trim().toUpperCase();
  if (!v) return { bg: isWeekendOrHoliday ? '#f4f4f6' : '#fff', color: '#d1d5db', pattern: false };
  if (VALUE_STYLE[v]) return VALUE_STYLE[v];
  
  const h = parseHours(v);
  if (h > 0) {
    if (h <= 4.5) {
      // 1h – 4.5h: bardzo mało -> mocny, wyrazisty pomarańcz
      return { bg: '#fed7aa', color: '#9a3412', pattern: false };
    }
    if (h < 7) {
      // 5h – 6.5h: średnio mało -> ciepła morela / brzoskwinia
      return { bg: '#ffedd5', color: '#c2410c', pattern: false };
    }
    if (h < 8) {
      // 7h – 7.5h: drobny brak -> jasna limonka („mniej zielony”)
      return { bg: '#ecfccb', color: '#4d7c0f', pattern: false };
    }
    if (h === 8) {
      // 8h norma (w tym standardowe "8" oraz "5+8", "6-14") -> czysta zieleń
      return { bg: '#dcfce7', color: '#15803d', pattern: false };
    }
    if (h <= 10) {
      // 8.5h – 10h: lekki plus (np. 9, 10) -> morski turkus / szmaragd
      return { bg: '#ccfbf1', color: '#0f766e', pattern: false };
    }
    if (h <= 12) {
      // 11h – 12h: duży plus (np. 11, 12, 6,67+11) -> kobalt / jasne indygo
      return { bg: '#e0e7ff', color: '#3730a3', pattern: false };
    }
    // 13h+: potężne godziny / split -> głęboki fiolet / purpura
    return { bg: '#ede9fe', color: '#5b21b6', pattern: false };
  }

  return { bg: '#fff', color: '#0f172a', pattern: false };
}

// Dłuższe wpisy (np. "7,30+11") nie mieszczą się w wąskiej kolumnie — dobieramy
// rozmiar czcionki do długości najdłuższej linii.
function cellFontSize(value) {
  const s = String(value || '');
  const longest = s.includes('+')
    ? Math.max(...s.split('+').map((p, i) => (i === 0 ? p + '+' : p).length))
    : s.length;
  if (longest <= 3) return 11;
  if (longest <= 4) return 9.5;
  if (longest <= 5) return 8.5;
  if (longest <= 6) return 7.5;
  return 6.5;
}
// Zmianę dzieloną ("7,30+11") pokazujemy w osobnych liniach: "7,30" nad "+11".
function renderCellValue(value) {
  const s = String(value);
  if (s.includes('+')) {
    return s.split('+').map((p, i) => (
      <div key={i} style={{ lineHeight: 1.05 }}>{i === 0 ? `${p}+` : p}</div>
    ));
  }
  return s;
}

function countSymbol(employees, getValue, day, sym) {
  return employees.filter(e => String(getValue(e, day) || '').toUpperCase() === sym).length;
}

function countSymbolForEmployee(emp, days, getValue, sym) {
  return days.filter(d => String(getValue(emp, d) || '').toUpperCase() === sym).length;
}

function isPresent(value) {
  const v = String(value || '').trim().toUpperCase();
  return v && v !== 'W' && v !== 'UW' && v !== 'L4' && v !== 'NU' && v !== 'NN' && v !== 'I' && v !== 'END' && v !== '';
}


function ValuePicker({ selectedValue, onSelect, onCancel }) {
  const { t } = useTranslation();
  const [customValue, setCustomValue] = useState('');
  const PRESETS = ['8', 'I', 'W', 'UW', 'L4', 'NU', 'NN', 'END'];
  const inputRef = useRef(null);

  useEffect(() => {
    setCustomValue(selectedValue || '');
    const tId = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
        try { inputRef.current.setSelectionRange(0, 9999); } catch { /* setSelectionRange nieobsługiwane dla tego typu inputa */ }
      }
    }, 50);
    return () => clearTimeout(tId);
  }, [selectedValue]);

  return (
    <div className="print-hide" style={{
      position: 'fixed', bottom: '32px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
      background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid rgba(0,0,0,0.12)', borderRadius: '16px', padding: '8px 12px',
      boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
      display: 'flex', alignItems: 'center', gap: '5px',
    }}>
      {PRESETS.map((b, idx) => {
        const st = getCellStyle(b, false);
        const isActive = selectedValue === b;
        const btnBg = st.pattern
          ? 'repeating-linear-gradient(-45deg,#ede9fe,#ede9fe 2px,#f5f3ff 2px,#f5f3ff 7px)'
          : (st.bg || '#f5f5f5');
        return [
          <button key={b} onClick={() => onSelect(b)} style={{
            background: btnBg, color: st.color,
            border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: '8px', padding: '4px 9px',
            fontSize: '12px', fontWeight: 700, cursor: 'pointer',
            transition: 'all 0.12s', lineHeight: 1.4,
            opacity: isActive ? 0.65 : 1,
          }}>{b}</button>,
          idx === 0 && [
            <input key="inna"
              ref={inputRef}
              autoFocus
              value={customValue} onChange={e => setCustomValue(e.target.value)}
              onFocus={e => { e.target.select(); try { e.target.setSelectionRange(0, 9999); } catch { /* setSelectionRange nieobsługiwane dla tego typu inputa */ } }}
              placeholder={t('grafik.otherValue')}
              onKeyDown={e => { 
                if (e.key === 'Enter') { onSelect(customValue.trim()); setCustomValue(''); }
                else if (e.key === 'Escape' && onCancel) { onCancel(); }
              }}
              style={{ width: '64px', padding: '4px 6px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '8px', fontSize: '12px', fontWeight: 600, textAlign: 'center', outline: 'none', background: '#fff' }}
            />,
            <button key="ok" onClick={() => { onSelect(customValue.trim()); setCustomValue(''); }} style={{
              background: 'transparent', color: 'var(--accent)', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '12px', padding: '4px 4px'
            }}>OK</button>,
            <div key="sep" style={{ width: '1px', height: '20px', background: 'rgba(0,0,0,0.1)', margin: '0 2px' }} />,
          ]
        ];
      })}
      {onCancel && (
        <>
          <div style={{ width: '1px', height: '24px', background: 'rgba(0,0,0,0.1)', margin: '0 4px' }} />
          <button onClick={onCancel} style={{
            background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '50%',
            width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', transition: 'all 0.2s',
          }} onMouseOver={e => e.currentTarget.style.background = '#e2e8f0'} onMouseOut={e => e.currentTarget.style.background = '#f1f5f9'}>
            ✕
          </button>
        </>
      )}
    </div>
  );
}

function formatTotalHours(totalNum) {
  if (!totalNum) return '';
  const rounded = Math.round(totalNum * 10) / 10;
  return `${rounded}`;
}

function WorkTimeApprovalRow({ report, sessionToken, onChanged }) {
  const { t, i18n } = useTranslation();
  const [start, setStart] = useState(timeForInput(report.reported_start));
  const [end, setEnd] = useState(timeForInput(report.reported_end));
  const [busy, setBusy] = useState(false);
  const duration = minutesBetweenClocks(start, end);

  const approve = async () => {
    if (!start || !end || !duration) return;
    setBusy(true);
    try {
      await approveWorkTime(sessionToken, report.id, start, end);
      toastSuccess(t('workTime.approvalSuccess'));
      await onChanged();
    } catch (error) {
      toastError(t('workTime.approvalError') + ' ' + error.message);
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    const note = window.prompt(t('workTime.rejectPrompt'), report.rejection_note || '');
    if (note === null) return;
    setBusy(true);
    try {
      await rejectWorkTime(sessionToken, report.id, note);
      toastSuccess(t('workTime.rejectSuccess'));
      await onChanged();
    } catch (error) {
      toastError(t('workTime.rejectError') + ' ' + error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="work-time-approval-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(150px,1fr) auto auto', gap: '10px', alignItems: 'center', padding: '11px 12px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-card-solid)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 750, color: 'var(--text-primary)' }}>{report.employee_name}</div>
        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
          {new Date(`${report.work_date}T00:00:00`).toLocaleDateString(i18n.language)} · {t('workTime.driverReported')} {formatWorkDuration(report.reported_minutes)}
        </div>
      </div>
      <div className="work-time-approval-inputs" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <input aria-label={t('workTime.start')} type="time" value={start} onChange={e => setStart(e.target.value)} disabled={busy} style={{ width: '105px', padding: '8px', border: '1px solid var(--border)', borderRadius: '9px', fontWeight: 700 }} />
        <span style={{ color: 'var(--text-tertiary)' }}>-</span>
        <input aria-label={t('workTime.end')} type="time" value={end} onChange={e => setEnd(e.target.value)} disabled={busy} style={{ width: '105px', padding: '8px', border: '1px solid var(--border)', borderRadius: '9px', fontWeight: 700 }} />
        <span style={{ minWidth: '58px', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>{duration ? formatWorkDuration(duration) : '—'}</span>
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button type="button" onClick={approve} disabled={busy || !duration} title={t('workTime.approveTitle')} style={{ width: '36px', height: '36px', display: 'grid', placeItems: 'center', border: 0, borderRadius: '9px', background: 'rgba(52,199,89,.13)', color: '#15803D', cursor: 'pointer' }}><CheckCircle2 size={18} /></button>
        <button type="button" onClick={reject} disabled={busy} title={t('workTime.rejectTitle')} style={{ width: '36px', height: '36px', display: 'grid', placeItems: 'center', border: 0, borderRadius: '9px', background: 'rgba(255,59,48,.11)', color: '#C24135', cursor: 'pointer' }}><XCircle size={18} /></button>
      </div>
    </div>
  );
}

function WorkTimeApprovalPanel({ reports, sessionToken, onChanged, canApprove }) {
  const { t } = useTranslation();
  const actionable = reports.filter(report => report.status === 'pending');
  if (actionable.length === 0) return null;
  return (
    <section className="print-hide" style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,149,0,.28)', borderRadius: '16px', padding: '14px', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '11px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '10px', display: 'grid', placeItems: 'center', background: 'rgba(255,149,0,.13)', color: '#B45309' }}><Clock3 size={18} /></div>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 800 }}>{t('workTime.pendingTitle', { count: actionable.length })}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{canApprove ? t('workTime.checkHint') : t('workTime.viewOnlyHint')}</div>
        </div>
      </div>
      {canApprove ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {actionable.map(report => <WorkTimeApprovalRow key={`${report.id}-${report.updated_at}`} report={report} sessionToken={sessionToken} onChanged={onChanged} />)}
        </div>
      ) : null}
    </section>
  );
}

function WorkTimeDecisionHistory({ events, open, onClose }) {
  const { t, i18n } = useTranslation();

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => { if (event.key === 'Escape') onClose(); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open, onClose]);

  if (!open) return null;

  const eventColor = (type) => type === 'approved' ? '#15803D' : type === 'rejected' ? '#C24135' : '#B45309';
  const eventLabel = (type) => t(`workTime.event_${type}`, { defaultValue: type });
  const formatEventDate = (value) => new Date(value).toLocaleString(i18n.language, {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="work-time-history-backdrop print-hide" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="work-time-history-dialog" role="dialog" aria-modal="true" aria-labelledby="work-time-history-title">
        <header className="work-time-history-header">
          <div className="work-time-history-icon"><History size={19} aria-hidden="true" /></div>
        <div style={{ flex: 1 }}>
            <div id="work-time-history-title" style={{ fontSize: '16px', fontWeight: 800 }}>{t('workTime.decisionHistory')}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{t('workTime.decisionHistoryCount', { count: events.length })}</div>
        </div>
          <button type="button" className="work-time-history-close" onClick={onClose} aria-label={t('common.close')} autoFocus><X size={18} /></button>
        </header>
        <div className="work-time-history-list">
          {events.length === 0 && <div className="work-time-history-empty">{t('workTime.noDecisionHistory')}</div>}
          {events.map(event => {
            const color = eventColor(event.event_type);
            const range = event.work_start && event.work_end
              ? `${timeForInput(event.work_start)}-${timeForInput(event.work_end)}`
              : '—';
            return (
              <div key={event.id} className="work-time-history-item">
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '10px', fontWeight: 800, color, background: `${color}18`, padding: '2px 7px', borderRadius: '6px' }}>{eventLabel(event.event_type)}</span>
                    <span style={{ fontSize: '12px', fontWeight: 750 }}>{event.employee_name}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{event.work_date}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    {event.actor_name || '—'} · {range}{event.work_minutes ? ` · ${formatWorkDuration(event.work_minutes)}` : ''}
                  </div>
                  {event.note && <div style={{ fontSize: '11px', color: '#C24135', marginTop: '3px' }}>{t('workTime.rejectionReason')}: {event.note}</div>}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-quaternary)', whiteSpace: 'nowrap', alignSelf: 'center' }}>{formatEventDate(event.created_at)}</div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default function GrafikView({ historyOpen = false, onHistoryClose = () => {} }) {
  const { t } = useTranslation();
  const { user, isAdmin, canViewAdminData, sessionToken } = useAuth();
  const MONTH_NAMES = monthNames();
  const DAY_NAMES = dayNamesSunSat();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [employees, setEmployees] = useState([]);
  const [groupData, setGroupData] = useState([]);
  const [entries, setEntries] = useState({});
  const [workTimeReports, setWorkTimeReports] = useState([]);
  const [workTimeEvents, setWorkTimeEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCell, setSelectedCell] = useState(null);
  const [showGuide, setShowGuide] = useState(false);
  const containerRef = useRef(null);
  const todayRef = useRef(null);

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);

  // Obliczanie dni roboczych (bez weekendów i świąt)
  const workingDays = useMemo(() => {
    return days.filter(d => {
      const dateObj = new Date(year, month - 1, d);
      const dw = dateObj.getDay();
      const isWe = dw === 0 || dw === 6;
      const isHol = isHoliday(dateObj);
      return !isWe && !isHol;
    }).length;
  }, [days, year, month]);

  const norm = workingDays * 8;

  const fetchData = useCallback(async () => {
    if (!canViewAdminData || !sessionToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await getWorkScheduleMonth(sessionToken, year, month);
      setEmployees(data?.roster || []);
      setGroupData(data?.groups || []);
      setWorkTimeReports(data?.work_time_reports || []);
      setWorkTimeEvents(data?.work_time_events || []);
      const map = {};
      (data?.schedule_entries || []).forEach(e => { map[`${e.employee_id}_${e.day}`] = e.value; });
      setEntries(map);
    } catch (err) {
      toastError(t('common.error') + ': ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [canViewAdminData, sessionToken, year, month, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Keep keyboard navigation inside the visible strip between the frozen name
  // column and the frozen monthly summary. Native scrollIntoView does not know
  // about sticky table cells, so it can leave the selected day hidden below them.
  useEffect(() => {
    if (!selectedCell) return undefined;
    const container = containerRef.current;
    const cell = container?.querySelector(`[data-cell="${selectedCell.empIdx}-${selectedCell.day}"]`);
    if (!container || !cell) return undefined;

    const frame = requestAnimationFrame(() => {
      const containerRect = container.getBoundingClientRect();
      const cellRect = cell.getBoundingClientRect();
      const headerHeight = container.querySelector('thead')?.getBoundingClientRect().height || 36;
      const contentWidth = containerRect.width - NAME_COLUMN_WIDTH - SUMMARY_TOTAL_WIDTH;
      const visibleLeft = containerRect.left + NAME_COLUMN_WIDTH;
      const visibleRight = contentWidth >= DAY_COLUMN_WIDTH
        ? containerRect.right - SUMMARY_TOTAL_WIDTH
        : containerRect.right;
      const visibleTop = containerRect.top + headerHeight;
      const visibleBottom = containerRect.bottom;

      let left = 0;
      let top = 0;
      if (cellRect.left < visibleLeft) left = cellRect.left - visibleLeft;
      else if (cellRect.right > visibleRight) left = cellRect.right - visibleRight;
      if (cellRect.top < visibleTop) top = cellRect.top - visibleTop;
      else if (cellRect.bottom > visibleBottom) top = cellRect.bottom - visibleBottom;

      if ((left || top) && typeof container.scrollBy === 'function') {
        container.scrollBy({ left, top, behavior: 'auto' });
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [selectedCell]);

  const groups = useMemo(() => {
    // Pracownicy w grupie sortowani alfabetycznie po nazwisku (locale PL).
    const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pl');
    const res = groupData.map(g => ({ g: g.name, color: g.color, members: employees.filter(e => e.group_name === g.name).sort(byName) }))
      .filter(({ members }) => members.length > 0);

    const extraNames = [...new Set(employees.map(e => e.group_name))].filter(name => !groupData.find(g => g.name === name));
    extraNames.forEach(name => {
      const members = employees.filter(e => e.group_name === name).sort(byName);
      if (members.length) res.push({ g: name, color: '#455a64', members });
    });
    return res;
  }, [employees, groupData]);

  const allEmps = useMemo(() => groups.flatMap(({ members }) => members), [groups]);

  const getDefaultValue = useCallback((emp, day) => {
    const dateObj = new Date(year, month - 1, day);
    const dw = dateObj.getDay();
    const isWe = dw === 0 || dw === 6;
    const isHol = isHoliday(dateObj);
    return (isWe || isHol) ? 'W' : 'I';
  }, [year, month]);

  const getValue = useCallback((emp, day) => {
    const key = `${emp.id}_${day}`;
    return entries[key] !== undefined ? entries[key] : getDefaultValue(emp, day);
  }, [entries, getDefaultValue]);

  const saveCell = async (empId, day, raw) => {
    const val = raw.trim().toUpperCase() || getDefaultValue(employees.find(e => e.id === empId), day);
    const key = `${empId}_${day}`;
    const previous = entries[key];
    setEntries(prev => ({ ...prev, [`${empId}_${day}`]: val }));
    const { data, error } = await supabase.rpc('admin_save_schedule_entry', {
      p_session_token: sessionToken,
      p_employee_id: empId,
      p_year: year,
      p_month: month,
      p_day: day,
      p_value: val,
      p_updated_by: user?.name || null,
    });
    if (error || data?.error) {
      setEntries(prev => {
        const next = { ...prev };
        if (previous !== undefined) next[key] = previous; else delete next[key];
        return next;
      });
      toastError(t('grafik.saveError'));
    }
  };

  const handleContainerKeyDown = (e) => {
    if (!selectedCell || !isAdmin) return;
    const { empIdx, day } = selectedCell;

    const move = (dEmp, dDay) => {
      const newEmp = Math.max(0, Math.min(allEmps.length - 1, empIdx + dEmp));
      const newDay = Math.max(1, Math.min(daysInMonth, day + dDay));
      setSelectedCell({ empIdx: newEmp, day: newDay });
      e.preventDefault();
    };

    if (e.key === 'ArrowRight')  move(0, 1);
    else if (e.key === 'ArrowLeft')  move(0, -1);
    else if (e.key === 'ArrowDown')  move(1, 0);
    else if (e.key === 'ArrowUp')    move(-1, 0);
    else if (e.key === 'Tab') { e.preventDefault(); move(0, e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') setSelectedCell(null);
  };

    const handlePickerSelect = (val) => {
    if (!selectedCell || !isAdmin) return;
    const { empIdx, day } = selectedCell;
    const emp = allEmps[empIdx];
    if (emp) saveCell(emp.id, day, val);
    setSelectedCell({ empIdx: Math.min(empIdx + 1, allEmps.length - 1), day });
  };

  const atMinMonth = year === 2026 && month === 1; // start: styczeń 2026
  const prevMonth = () => { if (atMinMonth) return; if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); };

  const exportToExcel = async () => {
    const wsData = [];
    const headers = [t('grafik.employee'), ...days.map(d => `${d}`), t('grafik.excelSumHours'), t('grafik.excelNorm'), t('grafik.diffShort'), 'L4', 'UW', 'NU', 'NN'];
    wsData.push([`${MONTH_NAMES[month - 1]} ${year}`, `${t('grafik.workdays')} ${workingDays}`, `${t('grafik.norm')} ${norm}h`]);
    wsData.push([]);
    wsData.push(headers);

    groups.forEach(({ g, members }) => {
      wsData.push([g]);
      members.forEach(emp => {
        const totalHours = days.reduce((sum, d) => sum + parseHours(getValue(emp, d)), 0);
        const empNorm = getEmployeeMonthNorm(emp, norm, days, year, month, getValue);
        const diff = totalHours - empNorm;
        const l4Count = countSymbolForEmployee(emp, days, getValue, 'L4');
        const uwCount = countSymbolForEmployee(emp, days, getValue, 'UW');
        const nuCount = countSymbolForEmployee(emp, days, getValue, 'NU');
        const nnCount = countSymbolForEmployee(emp, days, getValue, 'NN');
        const contractTag = emp.contract_type ? `[${emp.contract_type}] ` : '';
        const row = [
          `${contractTag}${emp.name}`,
          ...days.map(d => getValue(emp, d) || ''),
          totalHours,
          empNorm,
          totalHours === 0 ? 0 : diff,
          l4Count,
          uwCount,
          nuCount,
          nnCount
        ];
        wsData.push(row);
      });
    });

    wsData.push([]);
    wsData.push([t('grafik.excelSummary')]);
    const obecniRow = [t('grafik.present'), ...days.map(d => employees.filter(e => isPresent(getValue(e, d))).length)];
    const l4Row = ['L4', ...days.map(d => countSymbol(employees, getValue, d, 'L4'))];
    const uwRow = [t('grafik.excelVacations'), ...days.map(d => countSymbol(employees, getValue, d, 'UW'))];
    const nuRow = [t('grafik.excelExcusedAbsences'), ...days.map(d => countSymbol(employees, getValue, d, 'NU'))];
    const nnRow = [t('grafik.excelAbsences'), ...days.map(d => countSymbol(employees, getValue, d, 'NN'))];
    
    wsData.push(obecniRow);
    wsData.push(l4Row);
    wsData.push(uwRow);
    wsData.push(nuRow);
    wsData.push(nnRow);

    try {
      await exportRowsAsXlsx(wsData, `${t('grafik.fileName')}_${MONTH_NAMES[month-1]}_${year}.xlsx`);
    } catch {
      toastError(t('common.error'));
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!canViewAdminData) return <div style={{ padding: '40px', textAlign: 'center' }}>{t('admin.noAccess')}</div>;
  if (loading) return <div className="loader">{t('grafik.loading')}</div>;

  const btnStyle = { 
    background: 'var(--bg-card-solid)', 
    border: '1px solid var(--border)', 
    borderRadius: '12px', 
    padding: '8px 12px', 
    display: 'flex', 
    alignItems: 'center', 
    gap: '6px',
    cursor: 'pointer', 
    fontWeight: 600,
    fontSize: '13px',
    color: 'var(--text-secondary)',
    boxShadow: 'var(--shadow-sm)',
    transition: 'all 0.15s ease'
  };

  const thBase  = { 
    padding: '7px 2px', 
    fontSize: '10px', 
    fontWeight: 600, 
    textAlign: 'center', 
    whiteSpace: 'nowrap', 
    borderBottom: '1px solid rgba(0,0,0,0.08)', 
    background: '#f8f9fb', 
    letterSpacing: '0.01em',
    position: 'sticky',
    top: 0,
    zIndex: 10
  };
  const stickySummaryStyle = (index, background, zIndex = 4) => ({
    position: 'sticky',
    right: `${SUMMARY_RIGHT_OFFSETS[index]}px`,
    zIndex,
    width: `${SUMMARY_COLUMN_WIDTHS[index]}px`,
    minWidth: `${SUMMARY_COLUMN_WIDTHS[index]}px`,
    maxWidth: `${SUMMARY_COLUMN_WIDTHS[index]}px`,
    background,
  });

  const todayDay = today.getFullYear() === year && today.getMonth() + 1 === month ? today.getDate() : null;

  return (
    <div className="grafik-container grafik-modern-layout" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {isAdmin && selectedCell && (
        <ValuePicker
          key={`${selectedCell.empIdx}-${selectedCell.day}`}
          selectedValue={allEmps[selectedCell.empIdx] ? getValue(allEmps[selectedCell.empIdx], selectedCell.day) : null}
          onSelect={handlePickerSelect}
          onCancel={() => { setSelectedCell(null); containerRef.current?.focus(); }}
        />
      )}

      <WorkTimeApprovalPanel reports={workTimeReports} sessionToken={sessionToken} onChanged={fetchData} canApprove={isAdmin} />
      <WorkTimeDecisionHistory events={workTimeEvents} open={historyOpen} onClose={onHistoryClose} />

      {/* Pasek nawigacji i akcji (Apple UI) */}
      <div className="print-hide" style={{ 
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
        background: 'var(--bg-card)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        padding: '12px 16px', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)'
      }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button style={{ ...btnStyle, opacity: atMinMonth ? 0.4 : 1, cursor: atMinMonth ? 'not-allowed' : 'pointer' }} disabled={atMinMonth} onClick={prevMonth} onMouseOver={e=>{ if(!atMinMonth) e.currentTarget.style.background='var(--bg-secondary)'; }} onMouseOut={e=>e.currentTarget.style.background='var(--bg-card-solid)'}>
            <ChevronLeft size={16} /> {t('grafik.prev')}
          </button>
          
          <div style={{ fontWeight: 800, fontSize: '18px', minWidth: '160px', textAlign: 'center', color: 'var(--text-primary)' }}>
            {MONTH_NAMES[month - 1]} {year}
          </div>
          
          <button style={btnStyle} onClick={nextMonth} onMouseOver={e=>e.currentTarget.style.background='var(--bg-secondary)'} onMouseOut={e=>e.currentTarget.style.background='var(--bg-card-solid)'}>
            {t('grafik.next')} <ChevronRight size={16} />
          </button>
        </div>

        <div className="action-buttons" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)', padding: '6px 12px', borderRadius: '12px' }}>
            <Info size={14} />
            <span>{t('grafik.workdays')} <strong style={{color:'var(--text-primary)'}}>{workingDays}</strong> | {t('grafik.norm')} <strong style={{color:'var(--text-primary)'}}>{norm} h</strong></span>
          </div>
          <button style={btnStyle} onClick={exportToExcel} title={t('grafik.exportExcelTitle')} onMouseOver={e=>e.currentTarget.style.background='var(--bg-secondary)'} onMouseOut={e=>e.currentTarget.style.background='var(--bg-card-solid)'}>
            <Download size={16} /> {t('grafik.excel')}
          </button>
          <button style={btnStyle} onClick={handlePrint} title={t('grafik.printTitle')} onMouseOver={e=>e.currentTarget.style.background='var(--bg-secondary)'} onMouseOut={e=>e.currentTarget.style.background='var(--bg-card-solid)'}>
            <Printer size={16} /> {t('grafik.print')}
          </button>
        </div>
      </div>

      {/* Legenda i Przewodnik UoP / UZ */}
      <div className="print-hide" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px', background: 'var(--bg-card-solid)', padding: '10px 16px', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
            {[
              ['I', t('grafik.legend.I')],
              ['1', t('grafik.legend.h1', '1–4h')],
              ['7', t('grafik.legend.h7', '7h')],
              ['8', t('grafik.legend.h8', '8h / 5+8')],
              ['9', t('grafik.legend.h9', '9–10h')],
              ['11', t('grafik.legend.h11', '11h+')],
              ['W', t('grafik.legend.W')],
              ['UW', t('grafik.legend.UW')],
              ['L4', t('grafik.legend.L4')],
              ['NU', t('grafik.legend.NU')],
              ['NN', t('grafik.legend.NN')],
              ['END', t('grafik.legend.END')]
            ].map(([sym, label]) => {
              const st = getCellStyle(sym, false);
              const chipBg = st.pattern
                ? 'repeating-linear-gradient(-45deg,#ede9fe,#ede9fe 2px,#f5f3ff 2px,#f5f3ff 7px)'
                : (st.bg || '#f5f5f5');
              return (
                <div key={sym} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 600 }}>
                  <span style={{ background: chipBg, color: st.color, padding: '2px 8px', borderRadius: '6px', border: '1px solid rgba(0,0,0,0.07)', minWidth: '28px', textAlign: 'center' }}>{sym}</span>
                  <span style={{ color: 'var(--text-tertiary)', paddingRight: '8px' }}>{label}</span>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setShowGuide(prev => !prev)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: showGuide ? 'var(--bg-secondary)' : 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <BookOpen size={14} style={{ color: 'var(--accent)' }} />
            <span>Zasady rozliczeń UoP vs UZ</span>
            {showGuide ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {showGuide && (
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '14px 18px',
            fontSize: '12px',
            lineHeight: 1.5,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '16px',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{ borderLeft: '3px solid #15803d', paddingLeft: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <span style={{ fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px', background: 'rgba(52, 199, 89, 0.15)', color: '#15803d', border: '1px solid rgba(52, 199, 89, 0.3)' }}>UoP</span>
                <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Umowa o Pracę (etat — Kodeks Pracy)</strong>
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <li><strong>UW (Urlop wypoczynkowy)</strong>: płatny urlop pracownika — obniża wymiar pracy o <strong>8h na każdy dzień roboczy</strong>.</li>
                <li><strong>L4 (Chorobowe)</strong>: obniża wymiar pracy o <strong>8h na każdy dzień roboczy</strong>.</li>
                <li><strong>NU (Nieob. usprawiedliwiona)</strong>: np. uzgodniona nieobecność bezpłatna — obniża normę o 8h (nie generuje długu godzin).</li>
                <li><strong>NN (Nieob. nieusprawiedliwiona)</strong>: nieobecność bez zgody — nie obniża normy (powstaje -8h niedogodzin w bilansie).</li>
                <li><strong>Norma & Różnica</strong>: norma pracownika jest korygowana o dni UW/L4/NU. Godziny powyżej skorygowanej normy to <strong>płatne nadgodziny (+)</strong>.</li>
              </ul>
            </div>

            <div style={{ borderLeft: '3px solid #1d4ed8', paddingLeft: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <span style={{ fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px', background: 'rgba(0, 122, 255, 0.15)', color: '#1d4ed8', border: '1px solid rgba(0, 122, 255, 0.3)' }}>UZ</span>
                <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Umowa Zlecenie (godzinowa — Kodeks Cywilny)</strong>
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <li><strong>Rozliczenie za godziny</strong>: wypłata zleceniobiorcy to zawsze czysta suma: <strong>Σ h × stawka</strong>.</li>
                <li><strong>Stosuj NU zamiast UW</strong>: zleceniobiorcy <u>nie przysługuje</u> urlop wypoczynkowy (UW). W dni niedyspozycyjności/wyjazdu wpisujemy <strong>NU</strong> lub <strong>W</strong> (dzień niepłatny).</li>
                <li><strong>L4 na zleceniu</strong>: w przypadku choroby również wpisujemy <strong>L4</strong> lub <strong>NU</strong> (brak godzin do wypłaty).</li>
                <li><strong>Norma & Różnica</strong>: mają dla zlecenia charakter wyłącznie <strong>orientacyjny</strong> (pokazują porównanie do pełnego etatu).</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Tabela */}
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleContainerKeyDown}
        className="grafik-scroll-container"
        style={{
          overflow: 'auto',
          maxHeight: 'calc(100vh - 200px)',
          borderRadius: '16px',
          border: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.08)',
          outline: 'none',
          background: '#fff',
          position: 'relative'
        }}
      >
        <table className="grafik-modern-table" style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', minWidth: `${NAME_COLUMN_WIDTH + days.length * DAY_COLUMN_WIDTH + SUMMARY_TOTAL_WIDTH}px`, width: '100%' }}>
          <thead>
            <tr>
              <th style={{
                ...thBase,
                width: `${NAME_COLUMN_WIDTH}px`,
                position: 'sticky',
                top: 0,
                left: 0,
                zIndex: 30,
                textAlign: 'left',
                paddingLeft: '14px',
                color: '#48484a',
                borderRight: '1px solid rgba(0,0,0,0.08)',
                boxShadow: '2px 0 6px -2px rgba(0,0,0,0.06)',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.02em',
                background: '#f8f9fb'
              }}>
                {t('grafik.employee')}
              </th>
              {days.map(d => {
                const dateObj = new Date(year, month - 1, d);
                const dw = dateObj.getDay();
                const isWe = dw === 0 || dw === 6;
                const hol = isHoliday(dateObj);
                const isToday = d === todayDay;

                // Sticky headers must be fully opaque; translucent fills allow
                // scrolled row values to show through and visually overlap text.
                const bg = isToday ? '#007AFF' : isWe ? '#f1f3f6' : hol ? '#fff1f0' : '#f8f9fb';

                return (
                  <th
                    key={d}
                    ref={isToday ? todayRef : null}
                    title={hol ? hol.name : ''}
                    style={{
                      ...thBase,
                      width: `${DAY_COLUMN_WIDTH}px`,
                      background: bg,
                      boxShadow: isToday ? 'inset 1px 0 rgba(255,255,255,.18), inset -1px 0 rgba(0,0,0,.08)' : 'none',
                      position: 'sticky',
                      top: 0,
                      zIndex: 10,
                      padding: '4px 0 5px',
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '2px',
                    }}>
                      <div style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        background: 'transparent',
                        color: isToday ? '#ffffff' : hol ? '#FF3B30' : isWe ? '#8e8e93' : '#1c1c1e',
                        fontSize: '11px',
                        fontWeight: isToday ? 700 : 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 1,
                      }}>
                        {d}
                      </div>
                      <div style={{
                        fontSize: '8px',
                        fontWeight: isToday ? 700 : 500,
                        color: isToday ? 'rgba(255,255,255,.88)' : isWe ? '#8e8e93' : hol ? '#FF3B30' : '#8e8e93',
                        lineHeight: 1,
                        letterSpacing: '0.02em',
                      }}>
                        {DAY_NAMES[dw]}
                      </div>
                    </div>
                    {hol && !isToday && <div style={{ position: 'absolute', top: 2, right: 2, width: '4px', height: '4px', background: '#FF3B30', borderRadius: '50%' }} />}
                  </th>
                );
              })}
              <th style={{ ...thBase, ...stickySummaryStyle(0, '#f8f9fb', 20), color: '#248A3D', borderLeft: '2px solid rgba(0,0,0,0.12)', boxShadow: '-8px 0 12px -12px rgba(0,0,0,.45)', fontSize: '10px', fontWeight: 700 }}>{t('grafik.sumH')}</th>
              <th style={{ ...thBase, ...stickySummaryStyle(1, '#f8f9fb', 20), color: '#8e8e93', fontSize: '10px' }}>{t('grafik.normShort')}</th>
              <th style={{ ...thBase, ...stickySummaryStyle(2, '#f8f9fb', 20), color: '#48484a', fontSize: '10px' }}>{t('grafik.diffShort')}</th>
              <th style={{ ...thBase, ...stickySummaryStyle(3, '#f8f9fb', 20), color: '#FF3B30', fontSize: '9px', borderLeft: '1px solid rgba(0,0,0,0.05)' }}>L4</th>
              <th style={{ ...thBase, ...stickySummaryStyle(4, '#f8f9fb', 20), color: '#007AFF', fontSize: '9px' }}>UW</th>
              <th style={{ ...thBase, ...stickySummaryStyle(5, '#f8f9fb', 20), color: '#FF9500', fontSize: '9px' }}>NU</th>
              <th style={{ ...thBase, ...stickySummaryStyle(6, '#f8f9fb', 20), color: '#FF3B30', fontSize: '9px' }}>NN</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ g, color: grpColor, members }) => {
              return [
                <tr key={`grp-${g}`} style={{ height: '32px' }}>
                  <td style={{
                    position: 'sticky', left: 0, zIndex: 3,
                    background: '#F5F5F7', padding: '0 14px',
                    borderTop: '1px solid rgba(0,0,0,0.06)', borderBottom: '1px solid rgba(0,0,0,0.06)',
                    borderRight: '1px solid rgba(0,0,0,0.08)', boxShadow: '2px 0 6px -2px rgba(0,0,0,0.06)',
                    width: `${NAME_COLUMN_WIDTH}px`,
                  }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: grpColor }} />
                      <span style={{ fontWeight: 700, fontSize: '11px', color: '#1c1c1e', letterSpacing: '0.02em' }}>{g}</span>
                      <span style={{ fontSize: '9px', color: '#8e8e93', fontWeight: 600, background: 'rgba(0,0,0,0.05)', padding: '1px 7px', borderRadius: '10px' }}>
                        {members.length}
                      </span>
                    </div>
                  </td>
                  <td colSpan={daysInMonth + 7} style={{
                    background: '#F5F5F7',
                    borderTop: '1px solid rgba(0,0,0,0.06)', borderBottom: '1px solid rgba(0,0,0,0.06)',
                  }} />
                </tr>,
                ...members.map((emp) => {
                  const empIdx = allEmps.indexOf(emp);
                  const totalHours = days.reduce((sum, d) => sum + parseHours(getValue(emp, d)), 0);
                  const empNorm = getEmployeeMonthNorm(emp, norm, days, year, month, getValue);
                  const diff = totalHours - empNorm;
                  const l4Count = countSymbolForEmployee(emp, days, getValue, 'L4');
                  const uwCount = countSymbolForEmployee(emp, days, getValue, 'UW');
                  const nuCount = countSymbolForEmployee(emp, days, getValue, 'NU');
                  const nnCount = countSymbolForEmployee(emp, days, getValue, 'NN');

                  const rowBg = empIdx % 2 === 0 ? '#ffffff' : '#f8f9fb';

                  return (
                    <tr key={emp.id} className="grafik-modern-row" style={{ height: '32px' }}>
                      <td className="grafik-name-td" style={{ width: `${NAME_COLUMN_WIDTH}px`, position: 'sticky', left: 0, zIndex: 5, background: rowBg, padding: '0 8px 0 14px', borderRight: '1px solid rgba(0,0,0,0.08)', boxShadow: '2px 0 6px -2px rgba(0,0,0,0.06)', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', width: '100%', overflow: 'hidden' }}>
                          <span
                            style={{
                              fontSize: '9px',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: '4px',
                              marginRight: '6px',
                              flexShrink: 0,
                              letterSpacing: '0.3px',
                              background: emp.contract_type === 'UoP' ? 'rgba(52, 199, 89, 0.14)' : 'rgba(0, 122, 255, 0.14)',
                              color: emp.contract_type === 'UoP' ? '#248A3D' : '#0055CC',
                            }}
                            title={emp.contract_type === 'UoP' ? 'Umowa o Pracę' : 'Umowa Zlecenie'}
                          >
                            {emp.contract_type || 'UoP'}
                          </span>
                          <span title={emp.name} style={{ fontWeight: 600, fontSize: '11px', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{emp.name}</span>
                          <span style={{ fontSize: '9px', color: 'rgba(0,0,0,0.3)', fontWeight: 500, flexShrink: 0, marginLeft: '4px' }}>{emp.default_start}–{emp.default_end}</span>
                        </div>
                      </td>
                      {days.map(d => {
                        const dateObj = new Date(year, month - 1, d);
                        const dw = dateObj.getDay();
                        const isWeOrHol = dw === 0 || dw === 6 || !!isHoliday(dateObj);
                        const isToday = d === todayDay;
                        const val = getValue(emp, d);
                        const cs = getCellStyle(val, isWeOrHol);
                        const isSelected = selectedCell?.empIdx === empIdx && selectedCell?.day === d;

                        const hasVal = val && String(val).trim();
                        const isPattern = hasVal && cs.pattern;
                        const cellBg = isPattern
                          ? 'repeating-linear-gradient(-45deg,#ede9fe,#ede9fe 2px,#f5f3ff 2px,#f5f3ff 7px)'
                          : hasVal ? cs.bg
                          : isToday ? '#eff6ff'
                          : isWeOrHol ? '#f0f0f2'
                          : rowBg;

                        return (
                          <td key={d}
                            className={`${hasVal ? '' : 'grafik-cell-hoverable'}${isAdmin ? ' grafik-editable-cell' : ''}`}
                            data-cell={`${empIdx}-${d}`}
                            onClick={() => { setSelectedCell({ empIdx, day: d }); containerRef.current?.focus(); }}
                            onDoubleClick={() => {}}
                            style={{
                              background: cellBg,
                              color: cs.color,
                              textAlign: 'center',
                              fontWeight: 700,
                              fontSize: '10px',
                              borderBottom: '1px solid rgba(0,0,0,0.04)',
                              borderRight: '1px solid rgba(0,0,0,0.04)',
                              boxShadow: isSelected ? 'inset 0 0 0 2px var(--accent)' : 'none',
                              cursor: isAdmin ? 'pointer' : 'default',
                              padding: 0, width: `${DAY_COLUMN_WIDTH}px`,
                              boxSizing: 'border-box',
                              position: 'relative',
                              verticalAlign: 'middle', overflow: 'hidden'
                            }}>
                            {val ? (
                              <div style={{ fontSize: `${cellFontSize(val)}px`, lineHeight: 1.05, wordBreak: 'break-word', padding: '0 1px' }}>
                                {renderCellValue(val)}
                              </div>
                            ) : null}
                          </td>
                        );
                      })}
                      {/* Σ godzin */}
                      <td className="grafik-summary-td" style={{ ...stickySummaryStyle(0, rowBg), textAlign: 'center', fontWeight: 700, fontSize: '11px', color: totalHours > 0 ? '#248A3D' : 'rgba(0,0,0,0.12)', borderLeft: '2px solid rgba(0,0,0,0.12)', borderBottom: '1px solid rgba(0,0,0,0.04)', boxShadow: '-8px 0 12px -12px rgba(0,0,0,.45)', padding: '0 3px' }}>
                        {totalHours > 0 ? formatTotalHours(totalHours) : '—'}
                      </td>
                      {/* Norma */}
                      <td
                        className="grafik-summary-td"
                        style={{
                          textAlign: 'center',
                          fontWeight: emp.contract_type === 'UoP' && empNorm !== norm ? 600 : 500,
                          fontSize: '10px',
                          color: emp.contract_type === 'UoP' && empNorm !== norm ? '#007AFF' : '#8e8e93',
                          borderBottom: '1px solid rgba(0,0,0,0.04)',
                          ...stickySummaryStyle(1, rowBg),
                        }}
                        title={emp.contract_type === 'UoP' && empNorm !== norm ? `Norma bazowa: ${norm}h, skorygowana o urlop/L4/NU: ${empNorm}h` : undefined}
                      >
                        {empNorm}
                      </td>
                      {/* Różnica */}
                      <td className="grafik-summary-td" style={{ ...stickySummaryStyle(2, rowBg), textAlign: 'center', borderBottom: '1px solid rgba(0,0,0,0.04)', padding: '0 2px' }}>
                        {totalHours === 0 ? (
                          <span style={{ color: 'rgba(0,0,0,0.12)' }}>—</span>
                        ) : diff > 0 ? (
                          <span style={{ display: 'inline-block', padding: '1px 5px', borderRadius: '6px', background: 'rgba(52, 199, 89, 0.12)', color: '#248A3D', fontWeight: 700, fontSize: '10px' }}>
                            {formatDiff(diff)}
                          </span>
                        ) : diff < 0 ? (
                          <span style={{ display: 'inline-block', padding: '1px 5px', borderRadius: '6px', background: 'rgba(255, 59, 48, 0.08)', color: '#FF3B30', fontWeight: 700, fontSize: '10px' }}>
                            {formatDiff(diff)}
                          </span>
                        ) : (
                          <span style={{ color: '#8e8e93', fontWeight: 500, fontSize: '10px' }}>0</span>
                        )}
                      </td>
                      {/* L4, UW, NU, NN */}
                      <td className="grafik-summary-td" style={{ ...stickySummaryStyle(3, rowBg), textAlign: 'center', borderLeft: '1px solid rgba(0,0,0,0.06)', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                        {l4Count > 0 ? <span style={{ display: 'inline-block', padding: '1px 5px', borderRadius: '6px', background: 'rgba(255,59,48,0.1)', color: '#FF3B30', fontWeight: 700, fontSize: '9px' }}>{l4Count}</span> : <span style={{ color: 'rgba(0,0,0,0.1)' }}>—</span>}
                      </td>
                      <td className="grafik-summary-td" style={{ ...stickySummaryStyle(4, rowBg), textAlign: 'center', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                        {uwCount > 0 ? <span style={{ display: 'inline-block', padding: '1px 5px', borderRadius: '6px', background: 'rgba(0,122,255,0.1)', color: '#007AFF', fontWeight: 700, fontSize: '9px' }}>{uwCount}</span> : <span style={{ color: 'rgba(0,0,0,0.1)' }}>—</span>}
                      </td>
                      <td className="grafik-summary-td" style={{ ...stickySummaryStyle(5, rowBg), textAlign: 'center', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                        {nuCount > 0 ? <span style={{ display: 'inline-block', padding: '1px 5px', borderRadius: '6px', background: 'rgba(255,149,0,0.1)', color: '#FF9500', fontWeight: 700, fontSize: '9px' }}>{nuCount}</span> : <span style={{ color: 'rgba(0,0,0,0.1)' }}>—</span>}
                      </td>
                      <td className="grafik-summary-td" style={{ ...stickySummaryStyle(6, rowBg), textAlign: 'center', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                        {nnCount > 0 ? <span style={{ display: 'inline-block', padding: '1px 5px', borderRadius: '6px', background: 'rgba(255,59,48,0.1)', color: '#FF3B30', fontWeight: 700, fontSize: '9px' }}>{nnCount}</span> : <span style={{ color: 'rgba(0,0,0,0.1)' }}>—</span>}
                      </td>
                    </tr>
                  );
                }),
              ];
            })}

            {/* Wiersze podsumowania */}
            {[
              { label: t('grafik.present'), labelColor: '#fff', nameBg: '#1c1c1e', cellBgBase: '#1c1c1e', cellBgWe: '#2c2c2e', cellBgToday: '#007AFF', color: '#fff' },
              { label: t('grafik.totalHours'), labelColor: '#34C759', nameBg: 'rgba(242,242,247,0.92)', cellBgBase: 'rgba(242,242,247,0.92)', cellBgWe: 'rgba(232,232,237,0.92)', cellBgToday: 'rgba(52,199,89,0.1)', color: '#34C759',
                fn: (d) => { const t = employees.reduce((s, e) => s + parseHours(getValue(e, d)), 0); return formatTotalHours(t); }
              }
            ].map(({ label, labelColor, nameBg, cellBgBase, cellBgWe, cellBgToday, color, fn }) => {
              const sumFn = fn || ((d) => employees.filter(e => isPresent(getValue(e, d))).length);
              return (
                <tr key={label} style={{ height: '32px' }}>
                  <td style={{ position: 'sticky', left: 0, zIndex: 3, background: nameBg, color: labelColor, fontWeight: 700, fontSize: '11px', padding: '0 8px 0 14px', borderRight: '1px solid rgba(255,255,255,0.08)', boxShadow: '2px 0 6px -2px rgba(0,0,0,0.06)', borderTop: '1px solid rgba(0,0,0,0.08)', letterSpacing: '0.01em' }}>
                    {label}
                  </td>
                  {days.map(d => {
                    const dateObj = new Date(year, month - 1, d);
                    const dw = dateObj.getDay();
                    const isWe = dw === 0 || dw === 6;
                    const isToday = d === todayDay;
                    const cnt = sumFn(d);
                    const bg = isToday ? cellBgToday : isWe ? cellBgWe : cellBgBase;
                    return (
                      <td key={d} style={{ textAlign: 'center', fontWeight: 700, fontSize: '11px', background: bg, color, borderTop: '1px solid rgba(0,0,0,0.08)', borderRight: '1px solid rgba(0,0,0,0.04)', fontVariantNumeric: 'tabular-nums' }}>
                        {cnt || ''}
                      </td>
                    );
                  })}
                  <td colSpan={7} style={{ background: nameBg, borderTop: '1px solid rgba(0,0,0,0.06)', borderLeft: '2px solid rgba(0,0,0,0.12)' }} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="print-hide" style={{ display: 'flex', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap', background: 'rgba(242,242,247,0.8)', border: '1px solid rgba(0,0,0,0.06)', borderRadius: '14px', padding: '10px 16px', fontSize: '10px', color: '#8e8e93' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#555', fontWeight: 500 }}>
          <span style={{ fontSize: '13px' }}>💡</span>
          <span>{t('grafik.tipRanges')} <strong style={{ color: '#1565c0' }}>6-14</strong> &nbsp;|&nbsp; {t('grafik.tipFractions')} <strong style={{ color: '#2e7d32' }}>7.5</strong> / <strong style={{ color: '#2e7d32' }}>7,5</strong></span>
        </div>
        <div style={{ width: '1px', background: '#ddd', alignSelf: 'stretch' }} />
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', color: '#999' }}>
          {[['10','0,17'],['15','0,25'],['20','0,33'],['30','0,50'],['40','0,67'],['45','0,75'],['50','0,83']].map(([min, val]) => (
            <span key={min}>{min} {t('grafik.minUnit')} = <strong style={{ color: '#555' }}>{val}</strong></span>
          ))}
        </div>
      </div>
      
    </div>
  );
}
