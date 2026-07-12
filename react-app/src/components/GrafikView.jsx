import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { isHoliday } from '../utils/holidays';
import { getWorkScheduleMonth } from '../lib/readRpc';
import { toastError, toastSuccess } from '../lib/toast';
import { monthNames, dayNamesSunSat } from '../lib/dateUtils';
import { exportRowsAsXlsx } from '../lib/excelExport';
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock3, Download, History, Info, Printer, XCircle } from 'lucide-react';
import { approveWorkTime, rejectWorkTime } from '../lib/adminRpc';
import { clockToMinutes, formatWorkDuration, minutesBetweenClocks, timeForInput } from '../lib/workTime';

const VALUE_STYLE = {
  'W':   { bg: '#f0f0f0', color: '#aaa', pattern: false },
  'UW':  { bg: '#bfdbfe', color: '#1e40af', pattern: false },
  'L4':  { bg: '#ffe4e6', color: '#be123c', pattern: false },
  'NN':  { bg: '#ff0000', color: '#fff', pattern: false },
  'I':   { bg: null, color: '#6d28d9', pattern: true },
  'END': { bg: '#f1f5f9', color: '#94a3b8', pattern: false },
  '8':   { bg: '#dcfce7', color: '#15803d', pattern: false },
};

function getCellStyle(value, isWeekendOrHoliday) {
  const v = String(value || '').trim().toUpperCase();
  if (!v) return { bg: isWeekendOrHoliday ? '#f4f4f6' : '#fff', color: '#d1d5db', pattern: false };
  if (VALUE_STYLE[v]) return VALUE_STYLE[v];
  
  if (parseHours(v) === 8) return VALUE_STYLE['8'];

  if (v.includes('-')) return { bg: '#dbeafe', color: '#1d4ed8', pattern: false };
  if (v.includes('+')) return { bg: '#fff7ed', color: '#c2410c', pattern: false };
  if (!isNaN(parseFloat(v.replace(',', '.')))) return { bg: '#fef3c7', color: '#b45309', pattern: false };
  return { bg: '#fff', color: '#374151', pattern: false };
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

function parseHours(value) {
  const v = String(value || '').trim().toUpperCase();
  if (!v || v === 'W' || v === 'UW' || v === 'L4' || v === 'NN' || v === 'I' || v === 'END') return 0;
  
  if (v.includes('-')) {
    const parts = v.split('-');
    if (parts.length === 2 && (parts[0].includes(':') || parts[1].includes(':'))) {
      const startMinutes = clockToMinutes(parts[0]);
      const endMinutes = clockToMinutes(parts[1]);
      if (startMinutes != null && endMinutes != null) {
        const minutes = endMinutes >= startMinutes ? endMinutes - startMinutes : 1440 - startMinutes + endMinutes;
        return minutes / 60;
      }
    }
    const st = parseFloat(parts[0].replace(',', '.'));
    const en = parseFloat(parts[1].replace(',', '.'));
    if (!isNaN(st) && !isNaN(en)) {
      return en >= st ? en - st : (24 - st) + en;
    }
  }

  if (v.includes('+')) return parseFloat(v.split('+')[1].replace(',', '.')) || 0;
  return parseFloat(v.replace(',', '.')) || 0;
}

function countSymbol(employees, getValue, day, sym) {
  return employees.filter(e => String(getValue(e, day) || '').toUpperCase() === sym).length;
}

function countSymbolForEmployee(emp, days, getValue, sym) {
  return days.filter(d => String(getValue(emp, d) || '').toUpperCase() === sym).length;
}

function isPresent(value) {
  const v = String(value || '').trim().toUpperCase();
  return v && v !== 'W' && v !== 'UW' && v !== 'L4' && v !== 'NN' && v !== 'I' && v !== 'END' && v !== '';
}


function ValuePicker({ selectedValue, onSelect, onCancel }) {
  const { t } = useTranslation();
  const [customValue, setCustomValue] = useState('');
  const PRESETS = ['8', 'I', 'W', 'UW', 'L4', 'NN', 'END'];
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

function formatDiff(diff) {
  if (diff === 0) return '0';
  const sign = diff > 0 ? '+' : '-';
  const abs = Math.abs(diff);
  const rounded = Math.round(abs * 10) / 10;
  return `${sign}${rounded}`;
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

function WorkTimeDecisionHistory({ events }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  if (events.length === 0) return null;

  const eventColor = (type) => type === 'approved' ? '#15803D' : type === 'rejected' ? '#C24135' : '#B45309';
  const eventLabel = (type) => t(`workTime.event_${type}`, { defaultValue: type });
  const formatEventDate = (value) => new Date(value).toLocaleString(i18n.language, {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <section className="print-hide" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '12px 14px', boxShadow: 'var(--shadow-sm)' }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', border: 0, background: 'transparent', padding: 0, cursor: 'pointer', color: 'var(--text-primary)', textAlign: 'left' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '10px', display: 'grid', placeItems: 'center', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}><History size={18} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: 800 }}>{t('workTime.decisionHistory')}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{t('workTime.decisionHistoryCount', { count: events.length })}</div>
        </div>
        <ChevronDown size={18} style={{ color: 'var(--text-tertiary)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' }} />
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
          {events.map(event => {
            const color = eventColor(event.event_type);
            const range = event.work_start && event.work_end
              ? `${timeForInput(event.work_start)}-${timeForInput(event.work_end)}`
              : '—';
            return (
              <div key={event.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px,1fr) auto', gap: '10px', padding: '9px 10px', borderRadius: '10px', background: 'var(--bg-card-solid)', border: '1px solid var(--border)' }}>
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
      )}
    </section>
  );
}

export default function GrafikView() {
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
      // Scroll into view logic could be added here
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
    const headers = [t('grafik.employee'), ...days.map(d => `${d}`), t('grafik.excelSumHours'), t('grafik.excelNorm'), t('grafik.diffShort'), 'L4', 'UW', 'NN'];
    wsData.push([`${MONTH_NAMES[month - 1]} ${year}`, `${t('grafik.workdays')} ${workingDays}`, `${t('grafik.norm')} ${norm}h`]);
    wsData.push([]);
    wsData.push(headers);

    groups.forEach(({ g, members }) => {
      wsData.push([g]);
      members.forEach(emp => {
        const totalHours = days.reduce((sum, d) => sum + parseHours(getValue(emp, d)), 0);
        const l4Count = countSymbolForEmployee(emp, days, getValue, 'L4');
        const uwCount = countSymbolForEmployee(emp, days, getValue, 'UW');
        const nnCount = countSymbolForEmployee(emp, days, getValue, 'NN');
        const row = [
          emp.name,
          ...days.map(d => getValue(emp, d) || ''),
          totalHours,
          norm,
          totalHours - norm,
          l4Count,
          uwCount,
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
    const nnRow = [t('grafik.excelAbsences'), ...days.map(d => countSymbol(employees, getValue, d, 'NN'))];
    
    wsData.push(obecniRow);
    wsData.push(l4Row);
    wsData.push(uwRow);
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

  const thBase  = { padding: '6px 2px', fontSize: '10px', fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap', borderBottom: '2px solid #e8e8e8', background: '#f8f8f9' };
  const nameColW = 148;
  const dayColW  = 30;

  const todayDay = today.getFullYear() === year && today.getMonth() + 1 === month ? today.getDate() : null;

  return (
    <div className="grafik-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {isAdmin && selectedCell && (
        <ValuePicker
          key={`${selectedCell.empIdx}-${selectedCell.day}`}
          selectedValue={allEmps[selectedCell.empIdx] ? getValue(allEmps[selectedCell.empIdx], selectedCell.day) : null}
          onSelect={handlePickerSelect}
          onCancel={() => { setSelectedCell(null); containerRef.current?.focus(); }}
        />
      )}

      <WorkTimeApprovalPanel reports={workTimeReports} sessionToken={sessionToken} onChanged={fetchData} canApprove={isAdmin} />
      <WorkTimeDecisionHistory events={workTimeEvents} />

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

      {/* Legenda */}
      <div className="print-hide" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', background: 'var(--bg-card-solid)', padding: '10px 16px', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        {[['I',t('grafik.legend.I')],['8',t('grafik.legend.hours')],['6+',t('grafik.legend.plus')],['6-14',t('grafik.legend.range')],['W',t('grafik.legend.W')],['UW',t('grafik.legend.UW')],['L4',t('grafik.legend.L4')],['NN',t('grafik.legend.NN')],['END',t('grafik.legend.END')]].map(([sym, label]) => {
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

      {/* Tabela */}
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleContainerKeyDown}
        style={{
          overflowX: 'auto', borderRadius: '16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06)',
          border: '1px solid #e8e8ec',
          outline: 'none', background: '#fff'
        }}
      >
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: `${nameColW + days.length * dayColW + 220}px`, width: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...thBase, width: `${nameColW}px`, position: 'sticky', left: 0, zIndex: 3, textAlign: 'left', paddingLeft: '12px', color: '#555', borderRight: '1px solid #e8e8ec', fontSize: '11px' }}>
                {t('grafik.employee')}
              </th>
              {days.map(d => {
                const dateObj = new Date(year, month - 1, d);
                const dw = dateObj.getDay();
                const isWe = dw === 0 || dw === 6;
                const hol = isHoliday(dateObj);
                const isToday = d === todayDay;

                let bg = '#f8f8f9', color = '#444', borderBottomColor = '#e8e8e8';
                if (isToday) { bg = 'var(--accent)'; color = '#fff'; borderBottomColor = 'var(--accent)'; }
                else if (isWe || hol) { bg = '#f4f4f6'; color = '#d32f2f'; }

                return (
                  <th key={d} ref={isToday ? todayRef : null} title={hol ? hol.name : ''} style={{ ...thBase, width: `${dayColW}px`, background: bg, color, borderBottom: `2px solid ${borderBottomColor}`, position: 'relative' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, lineHeight: 1.2 }}>{d}</div>
                    <div style={{ fontSize: '8px', fontWeight: 500, opacity: isToday ? 0.85 : 0.55, marginTop: '1px' }}>{DAY_NAMES[dw]}</div>
                    {hol && !isToday && <div style={{ position: 'absolute', top: 2, right: 3, width: '4px', height: '4px', background: '#d32f2f', borderRadius: '50%' }} />}
                  </th>
                );
              })}
              <th style={{ ...thBase, width: '44px', color: '#2e7d32', borderLeft: '2px solid #e8e8ec', fontSize: '10px' }}>{t('grafik.sumH')}</th>
              <th style={{ ...thBase, width: '38px', color: '#888', fontSize: '10px' }}>{t('grafik.normShort')}</th>
              <th style={{ ...thBase, width: '38px', color: '#c62828', fontSize: '10px' }}>{t('grafik.diffShort')}</th>
              <th style={{ ...thBase, width: '28px', color: '#f57f17', fontSize: '9px', borderLeft: '1px solid #e8e8ec' }}>L4</th>
              <th style={{ ...thBase, width: '28px', color: '#1565c0', fontSize: '9px' }}>UW</th>
              <th style={{ ...thBase, width: '28px', color: '#b71c1c', fontSize: '9px' }}>NN</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ g, color: grpColor, members }) => {
              return [
                <tr key={`grp-${g}`} style={{ height: '26px' }}>
                  <td style={{
                    position: 'sticky', left: 0, zIndex: 2,
                    background: `${grpColor}12`, padding: '0 10px',
                    borderTop: `1px solid ${grpColor}30`, borderBottom: `1px solid ${grpColor}30`,
                    borderRight: '1px solid #e8e8ec', width: `${nameColW}px`,
                  }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: grpColor, flexShrink: 0 }} />
                      <span style={{ fontWeight: 700, fontSize: '10px', color: grpColor, letterSpacing: '0.5px', textTransform: 'uppercase' }}>{g}</span>
                    </div>
                  </td>
                  <td colSpan={daysInMonth + 6} style={{
                    background: `${grpColor}08`,
                    borderTop: `1px solid ${grpColor}20`, borderBottom: `1px solid ${grpColor}20`,
                  }} />
                </tr>,
                ...members.map((emp) => {
                  const empIdx = allEmps.indexOf(emp);
                  const totalHours = days.reduce((sum, d) => sum + parseHours(getValue(emp, d)), 0);
                  const diff = totalHours - norm;
                  const l4Count = countSymbolForEmployee(emp, days, getValue, 'L4');
                  const uwCount = countSymbolForEmployee(emp, days, getValue, 'UW');
                  const nnCount = countSymbolForEmployee(emp, days, getValue, 'NN');

                  const rowBg = empIdx % 2 === 0 ? '#ffffff' : '#fafbfc';

                  return (
                    <tr key={emp.id} style={{ height: '30px' }}>
                      <td style={{ width: `${nameColW}px`, position: 'sticky', left: 0, zIndex: 1, background: rowBg, padding: '0 8px 0 12px', borderRight: '1px solid #e8e8ec', borderBottom: '1px solid #f0f0f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', overflow: 'hidden' }}>
                          <span title={emp.name} style={{ fontWeight: 600, fontSize: '11px', color: '#222', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emp.name}</span>
                          <span style={{ fontSize: '9px', color: '#bbb', fontWeight: 500, flexShrink: 0, marginLeft: '4px' }}>{emp.default_start}–{emp.default_end}</span>
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
                            data-cell={`${empIdx}-${d}`}
                            onClick={() => { setSelectedCell({ empIdx, day: d }); containerRef.current?.focus(); }}
                            onDoubleClick={() => {}}
                            style={{
                              background: cellBg,
                              color: cs.color,
                              textAlign: 'center',
                              fontWeight: 700,
                              fontSize: '10px',
                              borderBottom: '1px solid rgba(0,0,0,0.06)',
                              borderRight: '1px solid rgba(0,0,0,0.06)',
                              boxShadow: isSelected ? 'inset 0 0 0 2px var(--accent)' : 'none',
                              cursor: 'default',
                              padding: 0, width: `${dayColW}px`,
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
                      <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '11px', color: totalHours > 0 ? '#2e7d32' : '#ccc', borderLeft: '2px solid #e8e8ec', borderBottom: '1px solid #f0f0f0', padding: '0 2px', background: rowBg }}>
                        {totalHours > 0 ? formatTotalHours(totalHours) : '—'}
                      </td>
                      {/* Norma */}
                      <td style={{ textAlign: 'center', fontWeight: 500, fontSize: '10px', color: '#bbb', borderBottom: '1px solid #f0f0f0', background: rowBg }}>
                        {norm}
                      </td>
                      {/* Różnica */}
                      <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '10px', color: totalHours === 0 ? '#ddd' : diff > 0 ? '#2e7d32' : diff < 0 ? '#c62828' : '#aaa', borderBottom: '1px solid #f0f0f0', background: rowBg }}>
                        {totalHours === 0 ? '—' : formatDiff(diff)}
                      </td>
                      {/* L4, UW, NN */}
                      <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '10px', color: l4Count > 0 ? '#f57f17' : '#ddd', borderLeft: '1px solid #eee', borderBottom: '1px solid #f0f0f0', background: rowBg }}>{l4Count || '—'}</td>
                      <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '10px', color: uwCount > 0 ? '#1565c0' : '#ddd', borderBottom: '1px solid #f0f0f0', background: rowBg }}>{uwCount || '—'}</td>
                      <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '10px', color: nnCount > 0 ? '#b71c1c' : '#ddd', borderBottom: '1px solid #f0f0f0', background: rowBg }}>{nnCount || '—'}</td>
                    </tr>
                  );
                }),
              ];
            })}

            {/* Wiersze podsumowania */}
            {[
              { label: t('grafik.present'), labelColor: '#fff', nameBg: '#1e3a5f', cellBgBase: '#243f6a', cellBgWe: '#1a3258', cellBgToday: '#2d5896', color: '#fff' },
              { label: t('grafik.totalHours'), labelColor: '#2e7d32', nameBg: '#f4fbf4', cellBgBase: '#f4fbf4', cellBgWe: '#edf6ed', cellBgToday: '#daf0da', color: '#2e7d32',
                fn: (d) => { const t = employees.reduce((s, e) => s + parseHours(getValue(e, d)), 0); return formatTotalHours(t); }
              }
            ].map(({ label, labelColor, nameBg, cellBgBase, cellBgWe, cellBgToday, color, fn }) => {
              const sumFn = fn || ((d) => employees.filter(e => isPresent(getValue(e, d))).length);
              return (
                <tr key={label} style={{ height: '28px' }}>
                  <td style={{ position: 'sticky', left: 0, zIndex: 1, background: nameBg, color: labelColor, fontWeight: 700, fontSize: '11px', padding: '0 10px 0 12px', borderRight: '1px solid #e8e8ec', borderTop: '2px solid #e0e0e0' }}>
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
                      <td key={d} style={{ textAlign: 'center', fontWeight: 700, fontSize: '11px', background: bg, color, borderTop: '2px solid #e0e0e0', borderRight: '1px solid rgba(0,0,0,0.04)' }}>
                        {cnt || ''}
                      </td>
                    );
                  })}
                  <td colSpan={6} style={{ background: nameBg, borderTop: '2px solid #e0e0e0' }} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="print-hide" style={{ display: 'flex', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap', background: '#f8f8f9', border: '1px solid #e8e8ec', borderRadius: '12px', padding: '10px 16px', fontSize: '10px', color: '#888' }}>
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
