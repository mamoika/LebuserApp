import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { toastError, toastSuccess, toastWarn } from '../lib/toast';
import { loadMonthRoster } from '../lib/roster';
import { isHoliday } from '../utils/holidays';
import { dayNamesSunSat } from '../lib/dateUtils';

// Kolory stanowisk; nazwy wyświetlane przez t(`timeline.roles.<key>`).
const ROLES = {
  "T":  { bg: "#607D8B", fc: "#fff" },
  "S":  { bg: "#2E7D32", fc: "#fff" },
  "M":  { bg: "#E65100", fc: "#fff" },
  "R":  { bg: "#C62828", fc: "#fff" },
  "PR": { bg: "#00838F", fc: "#fff" },
  "P":  { bg: "#6A1B9A", fc: "#fff" },
  "SZ": { bg: "#4E342E", fc: "#fff" },
  "PP": { bg: "#F9A825", fc: "#1a1a1a" },
  "SP": { bg: "#37474F", fc: "#fff" },
  "O":  { bg: "#AD1457", fc: "#fff" },
  "PK": { bg: "#558B2F", fc: "#fff" },
  "SC": { bg: "#FF6F00", fc: "#fff" },
  "K":  { bg: "#1155cc", fc: "#fff" },
};

const STATUS_STYLE = {
  'W':   { bg: '#f0f0f0', color: '#aaa' },
  'UW':  { bg: '#bfdbfe', color: '#1e40af' },
  'L4':  { bg: '#ffe4e6', color: '#be123c' },
  'NN':  { bg: '#ff0000', color: '#fff' },
  'END': { bg: '#e2e8f0', color: '#64748b' },
  'I':   { bg: '#ede9fe', color: '#6d28d9' },
};

const DEFAULT_VISIBLE_START = 5;
const DEFAULT_VISIBLE_END = 22; // exclusive: domyślnie widoczne godziny 5–21
const ABSENCE_STATUSES = new Set(['W', 'UW', 'L4', 'NN', 'END', 'I']);
const range = (start, end) => Array.from({ length: Math.max(0, end - start) }, (_, i) => start + i);
// Czy zmiana to pełna doba / dyżur (przechodzi przez północ lub trwa ~24h).
function isFullDayDuty(endH, duration) {
  return endH > 24 || roundHours(duration) >= 23.5;
}

function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function fmtDate(d) { return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}`; }
function toDateStr(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function parseHourValue(str) {
  if (!str) return 0;
  const s = String(str).trim();
  if (!s) return 0;
  if (s.includes(':')) {
    const p = s.split(':');
    const h = parseInt(p[0], 10);
    const m = parseInt(p[1], 10) || 0;
    return Number.isFinite(h) ? h + m / 60 : null;
  }
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function parseHour(str) {
  return parseHourValue(str) ?? 0;
}
function getWeekNum(d) {
  const date = new Date(d); date.setHours(0,0,0,0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const w1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
}

function roundHours(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function fmtHours(value) {
  const n = roundHours(value);
  return Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
}

function fmtHourLabel(value) {
  const rounded = roundHours(value);
  const dayOffset = Math.floor(rounded / 24);
  const normalized = ((rounded % 24) + 24) % 24;
  const base = fmtHours(normalized);
  return dayOffset > 0 ? `${base}+${dayOffset}` : base;
}

function getShiftDuration(startH, endH) {
  if (!Number.isFinite(startH) || !Number.isFinite(endH)) return 0;
  return roundHours(endH >= startH ? endH - startH : 24 - startH + endH);
}

function getVisibleShiftSegments(startH, endH, winStart, winEnd) {
  const segments = [];
  const addOverlap = (offset) => {
    const visibleStart = winStart + offset;
    const visibleEnd = winEnd + offset;
    const os = Math.max(startH, visibleStart);
    const oe = Math.min(endH, visibleEnd);
    if (oe > os) segments.push({ start: os - offset, end: oe - offset });
  };

  addOverlap(0);
  if (endH > 24) addOverlap(24);

  return segments
    .sort((a, b) => a.start - b.start)
    .reduce((acc, seg) => {
      const prev = acc[acc.length - 1];
      if (prev && seg.start <= prev.end) {
        prev.end = Math.max(prev.end, seg.end);
      } else {
        acc.push({ ...seg });
      }
      return acc;
    }, []);
}

function getCellShiftFill(h, startH, endH, winStart, winEnd) {
  const cellStart = h;
  const cellEnd = h + 1;
  let fillFrom = 1;
  let fillTo = 0;

  getVisibleShiftSegments(startH, endH, winStart, winEnd).forEach((seg) => {
    const os = Math.max(cellStart, seg.start);
    const oe = Math.min(cellEnd, seg.end);
    if (oe <= os) return;
    fillFrom = Math.min(fillFrom, os - cellStart);
    fillTo = Math.max(fillTo, oe - cellStart);
  });

  return fillTo > fillFrom ? { fillFrom, fillTo } : null;
}

function parseScheduleShift(value, emp) {
  const rawValue = String(value || '').trim().toUpperCase();
  const defaultStart = parseHour(emp.default_start);
  const defaultEndRaw = parseHour(emp.default_end);
  const defaultEnd = defaultEndRaw < defaultStart ? defaultEndRaw + 24 : defaultEndRaw;
  const isWorking = !!rawValue && !ABSENCE_STATUSES.has(rawValue);

  if (!isWorking) {
    return {
      start: defaultStart,
      end: defaultEnd,
      duration: 0,
      working: false,
      status: rawValue,
      confirmed: false,
      fullDay: false,
      rawValue,
    };
  }

  let finalStart = defaultStart;
  let finalEnd = defaultEnd;
  let duration = getShiftDuration(defaultStart, defaultEnd);

  if (rawValue.includes('-')) {
    const [a, b] = rawValue.split('-');
    const st = parseHourValue(a);
    const en = parseHourValue(b);
    if (st !== null && en !== null) {
      finalStart = st;
      finalEnd = en <= st ? en + 24 : en;
      duration = roundHours(finalEnd - finalStart);
    }
  } else if (rawValue.includes('+')) {
    const [a, b] = rawValue.split('+');
    const st = parseHourValue(a);
    const dur = parseHourValue(b);
    if (st !== null && dur !== null) {
      finalStart = st;
      finalEnd = st + dur;
      duration = roundHours(dur);
    }
  } else {
    const dur = parseHourValue(rawValue);
    if (dur !== null) {
      finalStart = defaultStart;
      finalEnd = defaultStart + dur;
      duration = roundHours(dur);
    }
  }

  return {
    start: finalStart,
    end: finalEnd,
    duration,
    working: true,
    status: null,
    confirmed: true,
    fullDay: isFullDayDuty(finalEnd, duration),
    rawValue,
  };
}

function getCellBackground(h, startH, endH, working, role, confirmed, winStart, winEnd) {
  if (!working) return { background: 'transparent', color: 'transparent' };

  const rInfo = ROLES[role];
  const unassignedColor = confirmed ? 'rgba(0, 122, 255, 0.15)' : 'rgba(0, 0, 0, 0.04)';
  const shiftColor = rInfo ? rInfo.bg : unassignedColor;
  const shiftTextColor = rInfo ? rInfo.fc : 'transparent';
  const emptyColor = 'transparent';

  const fill = getCellShiftFill(h, startH, endH, winStart, winEnd);
  if (!fill) return { background: 'transparent', color: 'transparent' };
  const { fillFrom, fillTo } = fill;

  if (fillTo <= 0) return { background: 'transparent', color: 'transparent' };
  
  if (fillFrom <= 0 && fillTo >= 1) {
    return { background: shiftColor, color: shiftTextColor };
  }

  const pF = Math.round(fillFrom * 100);
  const pT = Math.round(fillTo * 100);
  
  return { 
    background: `linear-gradient(to right, ${emptyColor} ${pF}%, ${shiftColor} ${pF}%, ${shiftColor} ${pT}%, ${emptyColor} ${pT}%)`, 
    color: shiftTextColor 
  };
}

function isHourInShift(h, startH, endH, winStart, winEnd) {
  return !!getCellShiftFill(h, startH, endH, winStart, winEnd);
}

// Zmiana danej osoby w danym dniu (godziny, czy pracuje, potwierdzona, status nieobecności)
function getEmpDayShift(emp, scheduleMap, dateStr) {
  const sched = scheduleMap[`${emp.id}_${dateStr}`];
  const dow = new Date(dateStr + 'T00:00:00').getDay();
  const isWe = dow === 0 || dow === 6;
  const defaultStart = parseHour(emp.default_start);
  const defaultEndRaw = parseHour(emp.default_end);
  const defaultEnd = defaultEndRaw < defaultStart ? defaultEndRaw + 24 : defaultEndRaw;
  const startH = sched ? sched.start : defaultStart;
  const endH = sched ? sched.end : defaultEnd;
  const working = sched ? sched.working : !isWe;
  const confirmed = sched ? sched.confirmed : false;
  const dayStatus = sched?.status || null;
  const duration = sched?.duration ?? getShiftDuration(startH, endH);
  return { startH, endH, duration, working, confirmed, dayStatus, fullDay: sched?.fullDay || false };
}

// Zmemoizowany komponent wiersza
const TimelineRow = React.memo(({
  emp, weekDays, scheduleMap, entries, isAdmin, rowBg, hours, winStart, winEnd,
  brushRole, onBrushCell, isPaintingRef, copyMode, copySource, onCopyClick
}) => {
  const { t } = useTranslation();
  const cells = weekDays.map((d, di) => {
    const isWe = d.getDay() === 0 || d.getDay() === 6;
    const dateStr = toDateStr(d);
    const sched = scheduleMap[`${emp.id}_${dateStr}`];
    const defaultStart = parseHour(emp.default_start);
    const defaultEndRaw = parseHour(emp.default_end);
    const defaultEnd = defaultEndRaw < defaultStart ? defaultEndRaw + 24 : defaultEndRaw;
    const startH = sched ? sched.start : defaultStart;
    const endH = sched ? sched.end : defaultEnd;
    // Dwie 15-min przerwy: start+3h i start+6h
    const breakCell1 = ((Math.floor(startH + 3) % 24) + 24) % 24;
    const breakCell2 = ((Math.floor(startH + 6) % 24) + 24) % 24;
    const holiday = isHoliday(d);
    const working = sched ? sched.working : false;
    const confirmed = sched ? sched.confirmed : false;
    // Brak wpisu = domyślna wartość grafiku: weekend/święto → 'W' (wolne), powszedni → 'I' (Planowany)
    const dayStatus = sched ? sched.status : ((isWe || holiday) ? 'W' : 'I');
    const statusSt = dayStatus ? STATUS_STYLE[dayStatus] : null;
    const duration = sched?.duration ?? getShiftDuration(startH, endH);
    const schedHours = working ? fmtHours(duration) : '';
    const fullDay = working && !dayStatus && (sched?.fullDay ?? isFullDayDuty(endH, duration));
    const dutyTitle = fullDay
      ? t('timeline.dutyTitle', {
          range: `${fmtHourLabel(startH)}–${fmtHourLabel(endH)}`,
          hours: fmtHours(duration),
        })
      : undefined;
    const isCopySource = copyMode && copySource === `${emp.id}_${dateStr}`;
    const canCopyHere = copyMode && isAdmin && working && !dayStatus;

    return (
      <React.Fragment key={di}>
        <td className={`tl-sum-col ${fullDay ? 'tl-duty-sum' : ''}`}
          onClick={canCopyHere ? () => onCopyClick(emp.id, dateStr) : undefined}
          title={canCopyHere ? (copySource ? t('timeline.pasteHere') : t('timeline.copyThisDay')) : dutyTitle}
          style={{
            background: isCopySource ? 'var(--accent)' : dayStatus ? (statusSt?.bg || '#f5f5f7') : fullDay ? '#ffedd5' : working ? 'var(--accent-green-light)' : '#f5f5f7',
            color: isCopySource ? '#fff' : dayStatus ? (statusSt?.color || '#ccc') : fullDay ? '#c2410c' : working ? 'var(--accent-green)' : '#ccc',
            cursor: canCopyHere ? 'copy' : 'default',
            outline: isCopySource ? '2px solid var(--accent)' : 'none',
            boxShadow: copyMode && copySource && canCopyHere && !isCopySource
              ? 'inset 0 0 0 1px var(--accent)'
              : fullDay && !isCopySource
                ? 'inset 0 0 0 2px rgba(249, 115, 22, 0.35)'
                : 'none',
          }}>
          {dayStatus || (working ? schedHours : '')}
        </td>
        {hours.map(h => {
          const key = `${emp.id}_${dateStr}_${h}`;
          const role = entries[key];
          const cellStyle = statusSt
            ? { background: statusSt.bg, color: statusSt.color }
            : getCellBackground(h, startH, endH, working, role, confirmed, winStart, winEnd);

          const isShiftHour = isHourInShift(h, startH, endH, winStart, winEnd);

          const isBrushable = isAdmin && brushRole && !dayStatus && working && isShiftHour && confirmed;
          const isBreakHour = working && !dayStatus && !fullDay && isShiftHour && (h === breakCell1 || h === breakCell2);

          return (
            <td key={h}
              className={`tl-cell ${isBrushable ? 'brushable' : ''}`}
              onMouseDown={() => {
                if (!isBrushable) return;
                isPaintingRef.current = true;
                onBrushCell(emp.id, dateStr, h, dayStatus, working, confirmed, isShiftHour);
              }}
              onMouseEnter={() => {
                if (!isPaintingRef.current || !isBrushable) return;
                onBrushCell(emp.id, dateStr, h, dayStatus, working, confirmed, isShiftHour);
              }}
              onContextMenu={(e) => {
                if (!brushRole || !isAdmin) return;
                e.preventDefault();
              }}
              style={{ cursor: isBrushable ? (brushRole === '__erase__' ? 'cell' : 'crosshair') : 'default' }}
            >
              <div
                className="tl-cell-inner"
                style={cellStyle}
                title={dutyTitle}
              >
                {isBreakHour && <span className="tl-break-mark" title={t('timeline.break15')} />}
                {!dayStatus && (role || '')}
              </div>
            </td>
          );
        })}
      </React.Fragment>
    );
  });

  return (
    <tr style={{ background: rowBg, height: '30px' }}>
      <td className="tl-sticky-col" style={{ background: rowBg, padding: 0, minWidth: '200px' }}>
        <div style={{ display: 'flex', width: '100%', height: '100%' }}>
          <div style={{ flex: 1, padding: '0 8px 0 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 650, fontSize: '11px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emp.name}</span>
            <span style={{ fontSize: '9px', color: 'var(--text-quaternary)', fontWeight: 600, flexShrink: 0, marginLeft: '6px', background: 'rgba(0,0,0,0.03)', padding: '2px 4px', borderRadius: '6px' }}>
              {emp.default_start}–{emp.default_end}
            </span>
          </div>
        </div>
      </td>
      {cells}
    </tr>
  );
}, (prev, next) => {
  if (prev.emp.id !== next.emp.id) return false;
  if (prev.isAdmin !== next.isAdmin) return false;
  if (prev.brushRole !== next.brushRole) return false;
  if (prev.copyMode !== next.copyMode) return false;
  if (prev.copySource !== next.copySource) return false;
  if (prev.winStart !== next.winStart || prev.winEnd !== next.winEnd) return false;
  for (let d of next.weekDays) {
    const dateStr = toDateStr(d);
    if (prev.scheduleMap[`${prev.emp.id}_${dateStr}`] !== next.scheduleMap[`${next.emp.id}_${dateStr}`]) return false;
    for (let h of next.hours) {
      const key = `${next.emp.id}_${dateStr}_${h}`;
      if (prev.entries[key] !== next.entries[key]) return false;
    }
  }
  return true;
});



export default function TimelineView() {
  const { t } = useTranslation();
  const { user, isAdmin, sessionToken } = useAuth();
  const DAY_NAMES = dayNamesSunSat();
  const today = new Date();
  const [monday, setMonday] = useState(() => getMondayOfWeek(new Date()));
  const [employees, setEmployees] = useState([]);
  const [groupData, setGroupData] = useState([]);
  const [entries, setEntries] = useState({});
  const [scheduleMap, setScheduleMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [brushRole, setBrushRole] = useState(null);
  const [copyMode, setCopyMode] = useState(false);
  const [copySource, setCopySource] = useState(null); // `${empId}_${dateStr}` | null
  const isPainting = useRef(false);
  const paintedInStroke = useRef(new Map()); // key -> prevRole for undo on cancel
  const containerRef = useRef(null);

  const allWeekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);
  const weekNum = getWeekNum(monday);

  const weekDays = allWeekDays.filter(d => {
    const dw = d.getDay();
    if (dw !== 0 && dw !== 6) return true;
    const ds = toDateStr(d);
    return Object.keys(entries).some(k => k.includes(`_${ds}_`));
  });

  // Oś godzin dopasowuje się do treści tygodnia: domyślnie 5–21, ale rozszerza się,
  // gdy ktoś ma realnie wpisaną zmianę poza tym zakresem lub dobę (przez północ) —
  // wtedy nocne godziny stają się klikalnymi kolumnami zamiast bursztynowej poświaty.
  // Liczone tylko z faktycznych wpisów grafiku (tych, które rysują pasmo zmiany).
  const { winStart, winEnd, hours } = useMemo(() => {
    let s = DEFAULT_VISIBLE_START;
    let e = DEFAULT_VISIBLE_END;
    const weekDateSet = new Set(weekDays.map(toDateStr));
    for (const [key, sh] of Object.entries(scheduleMap)) {
      if (!sh || !sh.working || sh.status) continue;
      if (!weekDateSet.has(key.slice(-10))) continue; // ostatnie 10 znaków = YYYY-MM-DD
      const dayEnd = Math.min(sh.end, 24);
      if (dayEnd > sh.start) {
        s = Math.min(s, Math.floor(Math.max(sh.start, 0)));
        e = Math.max(e, Math.ceil(dayEnd));
      }
      if (sh.end > 24) s = Math.min(s, 0); // poranne godziny doby (po północy)
    }
    s = Math.max(0, Math.min(s, DEFAULT_VISIBLE_START));
    e = Math.min(24, Math.max(e, DEFAULT_VISIBLE_END));
    return { winStart: s, winEnd: e, hours: range(s, e) };
  }, [scheduleMap, weekDays]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const dateFrom = toDateStr(monday);
    const dateTo = toDateStr(addDays(monday, 6));

    const [emps, { data: tl }, { data: sched }, { data: grps }] = await Promise.all([
      loadMonthRoster(monday.getFullYear(), monday.getMonth() + 1),
      supabase.from('timeline_entries').select('*').gte('entry_date', dateFrom).lte('entry_date', dateTo),
      supabase.from('schedule_entries').select('employee_id,day,value').eq('year', monday.getFullYear()).eq('month', monday.getMonth() + 1),
      supabase.from('groups').select('*').order('sort_order').order('name')
    ]);
    setEmployees(emps || []);
    setGroupData(grps || []);
    const map = {};
    (tl || []).forEach(e => { map[`${e.employee_id}_${e.entry_date}_${e.hour}`] = e.role; });
    setEntries(map);
    const sm = {};
    (sched || []).forEach(e => {
      const emp = (emps || []).find(x => x.id === e.employee_id);
      if (!emp) return;
      const dayDate = allWeekDays.find(d => d.getDate() === e.day && d.getMonth() === monday.getMonth());
      if (!dayDate) return;
      const ds = toDateStr(dayDate);
      sm[`${e.employee_id}_${ds}`] = parseScheduleShift(e.value, emp);
    });
    setScheduleMap(sm);
    setLoading(false);
  }, [allWeekDays, monday]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Brush / copy mode: keyboard escape to exit
  useEffect(() => {
    if (!brushRole && !copyMode) return;
    const onKey = (e) => { if (e.key === 'Escape') { setBrushRole(null); setCopyMode(false); setCopySource(null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [brushRole, copyMode]);

  // Zmiana tygodnia kasuje zaznaczone źródło kopiowania
  useEffect(() => { setCopySource(null); }, [monday]);

  // Stop painting on mouseup anywhere
  useEffect(() => {
    const stop = () => { isPainting.current = false; paintedInStroke.current.clear(); };
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, []);

  // Mysz: pionowe kółko przewija tabelę w bok
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (e.deltaY === 0) return;
      // trackpad poziomy gest – zostaw natywne zachowanie
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      // brak poziomego przewijania – nie przejmuj kółka
      if (el.scrollWidth <= el.clientWidth) return;
      const atStart = el.scrollLeft <= 0;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
      // na krańcach pozwól stronie przewijać się pionowo
      if ((e.deltaY < 0 && atStart) || (e.deltaY > 0 && atEnd)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [loading]);

  const handleBrushCell = useCallback(async (empId, dateStr, hour, dayStatus, working, confirmed, isShiftHour) => {
    if (!isAdmin || !brushRole || dayStatus || !working || !isShiftHour || !confirmed) return;
    const key = `${empId}_${dateStr}_${hour}`;
    const isErase = brushRole === '__erase__';
    const newRole = isErase ? null : brushRole;
    const current = entries[key];
    if (current === newRole) return;
    setEntries(prev => {
      const next = { ...prev };
      if (newRole) next[key] = newRole; else delete next[key];
      return next;
    });
    const { data, error } = await supabase.rpc('admin_save_timeline_entry', {
      p_session_token: sessionToken,
      p_employee_id: empId,
      p_entry_date: dateStr,
      p_hour: hour,
      p_role: newRole,
      p_updated_by: user?.name || null,
    });
    if (error || data?.error) {
      // cofnij zmianę lokalną gdy zapis się nie powiódł
      setEntries(prev => {
        const next = { ...prev };
        if (current) next[key] = current; else delete next[key];
        return next;
      });
      toastError(t('timeline.saveError'));
    }
  }, [isAdmin, brushRole, entries, user, sessionToken, t]);

  // Kopiowanie dnia jednej osoby na inny dzień (tryb "dołóż")
  const handleCopyClick = useCallback(async (empId, dateStr) => {
    if (!isAdmin) return;
    const srcKey = `${empId}_${dateStr}`;
    // pierwszy klik (lub klik w to samo źródło) — ustaw/wyczyść źródło
    if (!copySource || copySource === srcKey) {
      setCopySource(copySource === srcKey ? null : srcKey);
      return;
    }
    // drugi klik = cel; wklejamy źródło na ten dzień tej osoby
    const [srcEmpId, srcDateStr] = copySource.split('_');
    const tgtEmp = employees.find(e => e.id === empId);
    if (!tgtEmp) return;

    const tShift = getEmpDayShift(tgtEmp, scheduleMap, dateStr);
    if (tShift.dayStatus || !tShift.working) { toastWarn(t('timeline.targetFreeOrAbsent')); return; }
    if (!tShift.confirmed) { toastWarn(t('timeline.targetNotConfirmed')); return; }

    // godziny ze źródła, które mieszczą się w zmianie docelowej
    const toWrite = [];
    for (const h of hours) {
      const role = entries[`${srcEmpId}_${srcDateStr}_${h}`];
      if (!role) continue;
      if (!isHourInShift(h, tShift.startH, tShift.endH)) continue;
      toWrite.push({ h, role });
    }
    if (!toWrite.length) { toastWarn(t('timeline.noHoursToCopy')); return; }

    const prevValues = toWrite.map(({ h }) => ({ h, role: entries[`${empId}_${dateStr}_${h}`] }));
    setEntries(prev => {
      const next = { ...prev };
      toWrite.forEach(({ h, role }) => { next[`${empId}_${dateStr}_${h}`] = role; });
      return next;
    });

    const results = await Promise.all(toWrite.map(({ h, role }) =>
      supabase.rpc('admin_save_timeline_entry', {
        p_session_token: sessionToken,
        p_employee_id: empId,
        p_entry_date: dateStr,
        p_hour: h,
        p_role: role,
        p_updated_by: user?.name || null,
      })
    ));
    if (results.some(r => r.error || r.data?.error)) {
      setEntries(prev => {
        const next = { ...prev };
        prevValues.forEach(({ h, role }) => { if (role) next[`${empId}_${dateStr}_${h}`] = role; else delete next[`${empId}_${dateStr}_${h}`]; });
        return next;
      });
      toastError(t('timeline.copyError'));
    } else {
      toastSuccess(t('timeline.copied', { count: toWrite.length, name: tgtEmp.name, date: fmtDate(new Date(dateStr + 'T00:00:00')) }));
    }
  }, [isAdmin, copySource, employees, scheduleMap, entries, user, sessionToken, hours, t]);

  const minMonday = getMondayOfWeek(new Date(2026, 0, 1)); // start: tydzień ze stycznia 2026
  const atMinWeek = monday <= minMonday;
  const prevWeek = () => setMonday(m => { const p = addDays(m, -7); return p < minMonday ? m : p; });
  const nextWeek = () => setMonday(m => addDays(m, 7));

  const groups = useMemo(() => {
    // Pracownicy w grupie sortowani alfabetycznie po nazwisku (locale PL).
    const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pl');
    const grps = groupData.map(g => ({ g: g.name, color: g.color, members: employees.filter(e => e.group_name === g.name).sort(byName) }))
      .filter(({ members }) => members.length > 0);
    const extraNames = [...new Set(employees.map(e => e.group_name))].filter(name => !groupData.find(g => g.name === name));
    extraNames.forEach(name => {
      const m = employees.filter(e => e.group_name === name).sort(byName);
      if (m.length) grps.push({ g: name, color: '#455a64', members: m });
    });
    return grps;
  }, [groupData, employees]);

  const buildSummary = useCallback((d) => {
    const dateStr = toDateStr(d);
    const result = {};
    Object.entries(ROLES).forEach(([role]) => { result[role] = {}; });
    groups.forEach(({ g, members }) => {
      members.forEach(emp => {
        hours.forEach(h => {
          const role = entries[`${emp.id}_${dateStr}_${h}`];
          if (!role) return;
          if (!result[role]) result[role] = {};
          if (!result[role][g]) result[role][g] = { os: new Set(), godz: 0 };
          result[role][g].os.add(emp.id);
          result[role][g].godz += 1;
        });
      });
    });
    return result;
  }, [entries, groups, hours]);

  if (loading) return <div className="loader">{t('timeline.loading')}</div>;

  const NAME_W = 160;
  const HOUR_W = 24;
  const todayStr = toDateStr(today);

  const groupNames = groups.map(g => g.g);
  const summaries = Object.fromEntries(weekDays.map(d => [toDateStr(d), buildSummary(d)]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Nawigacja */}
      <div className="print-hide" style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        background: 'var(--bg-card)', backdropFilter: 'blur(16px)',
        padding: '12px 16px', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)'
      }}>
        <button onClick={prevWeek} disabled={atMinWeek} style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)', borderRadius: '10px', padding: '7px 14px', fontSize: '14px', cursor: atMinWeek ? 'not-allowed' : 'pointer', opacity: atMinWeek ? 0.4 : 1, fontWeight: 700, color: 'var(--text-primary)' }}>{t('timeline.prev')}</button>
        <div style={{ fontWeight: 700, fontSize: '16px', flex: 1, textAlign: 'center', color: 'var(--text-primary)' }}>
          {t('timeline.week', { num: weekNum })} · {fmtDate(monday)} – {fmtDate(addDays(monday, 6))}
        </div>
        <button onClick={nextWeek} style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)', borderRadius: '10px', padding: '7px 14px', fontSize: '14px', cursor: 'pointer', fontWeight: 700, color: 'var(--text-primary)' }}>{t('timeline.next')}</button>
      </div>

      {/* Pasek pędzla */}
      {isAdmin && (
        <div className="print-hide" style={{
          display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap',
          background: 'var(--bg-card)', backdropFilter: 'blur(16px)',
          padding: '10px 14px', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)'
        }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-quaternary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: '4px', whiteSpace: 'nowrap' }}>
            {t('timeline.brush')}
          </span>
          {Object.entries(ROLES).map(([key, r]) => {
            const isActive = brushRole === key;
            return (
              <button key={key} onClick={() => { setBrushRole(isActive ? null : key); setCopyMode(false); setCopySource(null); }} style={{
                background: isActive ? r.bg : `${r.bg}18`,
                color: isActive ? r.fc : r.bg,
                border: isActive ? `2px solid ${r.bg}` : '2px solid transparent',
                borderRadius: '10px', padding: '4px 8px',
                fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                transition: 'all 0.15s', boxShadow: isActive ? `0 0 0 3px ${r.bg}35` : 'none',
                transform: isActive ? 'scale(1.08)' : 'scale(1)',
              }}>
                {key}
              </button>
            );
          })}
          <div style={{ width: '1px', height: '20px', background: 'var(--border-strong)', margin: '0 4px' }} />
          <button onClick={() => { setBrushRole(brushRole === '__erase__' ? null : '__erase__'); setCopyMode(false); setCopySource(null); }} style={{
            background: brushRole === '__erase__' ? '#ef4444' : 'rgba(239,68,68,0.1)',
            color: brushRole === '__erase__' ? '#fff' : '#ef4444',
            border: brushRole === '__erase__' ? '2px solid #ef4444' : '2px solid transparent',
            borderRadius: '10px', padding: '4px 10px',
            fontSize: '11px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
            boxShadow: brushRole === '__erase__' ? '0 0 0 3px rgba(239,68,68,0.25)' : 'none',
            transform: brushRole === '__erase__' ? 'scale(1.08)' : 'scale(1)',
          }}>
            {t('timeline.eraser')}
          </button>
          {brushRole && (
            <button onClick={() => setBrushRole(null)} style={{
              background: 'transparent', color: 'var(--text-tertiary)',
              border: '1px dashed var(--border-strong)', borderRadius: '10px', padding: '4px 10px',
              fontSize: '11px', cursor: 'pointer', marginLeft: '4px',
            }}>
              {t('timeline.escDisable')}
            </button>
          )}
          {!brushRole && !copyMode && (
            <span style={{ fontSize: '10px', color: 'var(--text-quaternary)', marginLeft: '4px' }}>
              {t('timeline.brushHint')}
            </span>
          )}

          <div style={{ width: '1px', height: '20px', background: 'var(--border-strong)', margin: '0 4px' }} />
          <button onClick={() => { setCopyMode(m => !m); setCopySource(null); setBrushRole(null); }} style={{
            background: copyMode ? 'var(--accent)' : 'var(--accent-light, rgba(0,122,255,0.12))',
            color: copyMode ? '#fff' : 'var(--accent)',
            border: copyMode ? '2px solid var(--accent)' : '2px solid transparent',
            borderRadius: '10px', padding: '4px 10px',
            fontSize: '11px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
            boxShadow: copyMode ? '0 0 0 3px rgba(0,122,255,0.25)' : 'none',
            transform: copyMode ? 'scale(1.08)' : 'scale(1)',
          }}>
            {t('timeline.copyDay')}
          </button>
          {copyMode && (
            <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginLeft: '4px', fontWeight: 600 }}>
              {copySource
                ? t('timeline.copyHintTarget')
                : t('timeline.copyHintSource')}
            </span>
          )}
          {copyMode && (
            <button onClick={() => { setCopyMode(false); setCopySource(null); }} style={{
              background: 'transparent', color: 'var(--text-tertiary)',
              border: '1px dashed var(--border-strong)', borderRadius: '10px', padding: '4px 10px',
              fontSize: '11px', cursor: 'pointer', marginLeft: '4px',
            }}>
              {t('timeline.escDisable')}
            </button>
          )}
        </div>
      )}



      {/* Tabela połączona */}
      <div className="tl-container" ref={containerRef}>
        <table className="tl-table" style={{ minWidth: `${NAME_W + weekDays.length * (hours.length * HOUR_W + 29)}px` }}>
          <thead>
            <tr>
              <th rowSpan={2} className="tl-th-corner" style={{ padding: 0, minWidth: '200px' }}>
                <div style={{ display: 'flex', height: '100%', alignItems: 'center', padding: '0 10px' }}>
                  {t('timeline.empStation')}
                </div>
              </th>
              {weekDays.map((d, di) => {
                const dw = d.getDay();
                const isWe = dw === 0 || dw === 6;
                const isToday = toDateStr(d) === todayStr;
                return (
                  <th key={di} colSpan={hours.length + 1} className="tl-th-day" style={{
                    background: isToday ? 'var(--accent)' : isWe ? 'var(--accent-red-light)' : 'var(--bg-secondary)',
                    color: isToday ? '#fff' : isWe ? 'var(--accent-red)' : 'var(--text-secondary)',
                  }}>
                    {DAY_NAMES[dw]} {fmtDate(d)}
                  </th>
                );
              })}
            </tr>
            <tr>
              {weekDays.map((d, di) => {
                const isWe = d.getDay() === 0 || d.getDay() === 6;
                const isToday = toDateStr(d) === todayStr;
                return [
                  <th key={`sum-${di}`} style={{ width: '28px', background: 'var(--bg-tertiary)', color: 'var(--text-quaternary)', fontSize: '8px', fontWeight: 700, textAlign: 'center', borderBottom: '2px solid var(--border)', borderLeft: '2px solid var(--border-strong)', padding: '2px 0' }}>Σ</th>,
                  ...hours.map(h => (
                    <th key={`h-${di}-${h}`} className="tl-th-hour" style={{ width: `${HOUR_W}px`, background: isToday ? 'var(--accent-light)' : isWe ? 'var(--accent-red-light)' : 'var(--bg-secondary)', color: isWe ? 'var(--accent-red)' : 'var(--text-tertiary)' }}>{h}</th>
                  )),
                ];
              })}
            </tr>
          </thead>
          
          {/* Ciało tabeli: Grupy i Pracownicy */}
          {groups.map(({ g, color: grpColor, members }) => (
            <tbody key={`grp-${g}`}>
              <tr style={{ height: '22px' }}>
                <td className="tl-sticky-col" style={{ background: `${grpColor}15`, borderTop: `1px solid ${grpColor}30`, borderBottom: `1px solid ${grpColor}30`, padding: 0, minWidth: '200px' }}>
                  <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                    <div style={{ flex: 1, padding: '0 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: grpColor }} />
                      <span style={{ fontWeight: 800, fontSize: '10px', color: grpColor, letterSpacing: '0.5px', textTransform: 'uppercase' }}>{g}</span>
                    </div>
                  </div>
                </td>
                <td colSpan={weekDays.length * (hours.length + 1)} style={{ background: `${grpColor}08`, borderTop: `1px solid ${grpColor}20`, borderBottom: `1px solid ${grpColor}20` }} />
              </tr>
              {members.map((emp) => {
                const rowBg = '#ffffff';

                return (
                  <TimelineRow
                    key={emp.id}
                    emp={emp}
                    weekDays={weekDays}
                    scheduleMap={scheduleMap}
                    entries={entries}
                    isAdmin={isAdmin}
                    rowBg={rowBg}
                    hours={hours}
                    winStart={winStart}
                    winEnd={winEnd}
                    brushRole={brushRole}
                    onBrushCell={handleBrushCell}
                    isPaintingRef={isPainting}
                    copyMode={copyMode}
                    copySource={copySource}
                    onCopyClick={handleCopyClick}
                  />
                );
              })}
            </tbody>
          ))}

          {/* Oś czasu - Stopka (Powtórzenie godzin) */}
          <tbody style={{ borderTop: '2px solid var(--border-strong)', borderBottom: '4px solid var(--border-strong)' }}>
            <tr>
              <td className="tl-sticky-col" style={{ background: 'var(--bg-card-solid)', borderRight: '1px solid var(--border)' }}></td>
              {weekDays.map((d, di) => {
                const isToday = toDateStr(d) === todayStr;
                return [
                  <td key={`sum-${di}`} style={{ width: '28px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: '10px', fontWeight: 800, textAlign: 'center', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border-strong)' }}>Σ</td>,
                  ...hours.map(h => (
                    <td key={`h-${di}-${h}`} className="tl-th-hour" style={{ width: `${HOUR_W}px`, background: isToday ? 'var(--accent-light)' : 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: '10px', fontWeight: 700, textAlign: 'center', borderBottom: '1px solid var(--border)' }}>{h}</td>
                  )),
                ];
              })}
            </tr>
          </tbody>

          {/* Ciało tabeli: Podsumowanie */}
          <tbody>
            <tr className="tl-summary-header">
              <th className="tl-sticky-col" style={{ background: 'var(--bg-card-solid)', padding: 0, minWidth: '200px', borderRight: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 12px', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 800, borderBottom: '1px solid var(--border)' }}>
                    {t('timeline.sum')}
                  </div>
                  <div style={{ flex: 1, display: 'flex', background: 'var(--bg-tertiary)' }}>
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '10px', fontWeight: 700, borderRight: '1px solid var(--border)' }}>OS.</div>
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '10px', fontWeight: 700 }}>GODZ.</div>
                  </div>
                </div>
              </th>
              {weekDays.map((d, di) => {
                const isToday = toDateStr(d) === todayStr;
                return (
                  <td key={di} colSpan={hours.length + 1} style={{ padding: 0, borderLeft: '2px solid var(--border-strong)', background: isToday ? 'var(--accent-light)' : 'var(--bg-card-solid)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: '52px' }}>
                      
                      {/* TOP ROW: GROUP NAMES */}
                      <div style={{ display: 'flex', flex: 1, borderBottom: '1px solid var(--border)' }}>
                        <div style={{ flex: 2, display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: '11px', fontWeight: 800, borderRight: '1px solid var(--border)' }}>
                          RAZEM
                        </div>
                        {groupNames.map((gn, idx) => {
                          const gc = groups.find(g => g.g === gn)?.color || '#555';
                          return (
                            <div key={gn} style={{ flex: 2, display: 'flex', justifyContent: 'center', alignItems: 'center', background: `${gc}15`, color: gc, fontSize: '11px', fontWeight: 800, borderRight: idx === groupNames.length - 1 ? 'none' : '1px solid var(--border)' }}>
                              {gn.toUpperCase()}
                            </div>
                          );
                        })}
                      </div>

                      {/* BOTTOM ROW: Os. Godz. */}
                      <div style={{ display: 'flex', flex: 1, background: 'transparent' }}>
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', borderRight: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: '10px', fontWeight: 700 }}>
                          OS.
                        </div>
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', borderRight: '1px solid var(--border-strong)', color: 'var(--text-secondary)', fontSize: '10px', fontWeight: 700 }}>
                          GODZ.
                        </div>
                        {groupNames.flatMap((gn, idx) => {
                          const gc = groups.find(g => g.g === gn)?.color || '#555';
                          const isLast = idx === groupNames.length - 1;
                          return [
                            <div key={`${gn}-o`} style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', borderRight: '1px solid var(--border)', color: gc, fontSize: '10px', fontWeight: 700 }}>
                              OS.
                            </div>,
                            <div key={`${gn}-g`} style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', borderRight: isLast ? 'none' : '1px solid var(--border)', color: gc, fontSize: '10px', fontWeight: 700 }}>
                              GODZ.
                            </div>
                          ];
                        })}
                      </div>

                    </div>
                  </td>
                );
              })}
            </tr>
            {Object.entries(ROLES).map(([role, r], ri) => {
              const rowBg = ri % 2 === 0 ? 'var(--bg-card-solid)' : 'var(--bg-secondary)';
              
              const weekOs = new Set(weekDays.flatMap(d => {
                const rd = summaries[toDateStr(d)]?.[role] || {};
                return Object.values(rd).flatMap(x => [...(x?.os || [])]);
              }));
              const weekGodz = weekDays.reduce((s, d) => {
                const rd = summaries[toDateStr(d)]?.[role] || {};
                return s + Object.values(rd).reduce((ss, x) => ss + (x?.godz || 0), 0);
              }, 0);

              return (
                <tr key={role} style={{ background: rowBg, height: '36px' }}>
                  <td className="tl-sticky-col" style={{ background: r.bg, borderBottom: '1px solid rgba(0,0,0,0.1)', padding: 0, minWidth: '200px' }}>
                    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                      <div style={{ flex: 1, padding: '0 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: r.fc, fontSize: '13px', fontWeight: 800, flexShrink: 0 }}>{role}</span>
                        <span style={{ fontSize: '11px', color: r.fc, fontWeight: 600, opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden' }}>{t(`timeline.roles.${role}`)}</span>
                      </div>
                      <div style={{ display: 'flex', width: '88px', background: 'rgba(0,0,0,0.15)', borderLeft: '1px solid rgba(255,255,255,0.15)' }}>
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: r.fc, fontWeight: weekOs.size ? 800 : 500, fontSize: '12px', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                          {weekOs.size || '·'}
                        </div>
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: r.fc, fontWeight: weekGodz ? 800 : 500, fontSize: '12px' }}>
                          {weekGodz || '·'}
                        </div>
                      </div>
                    </div>
                  </td>
                  {weekDays.map((d, di) => {
                    const dateStr = toDateStr(d);
                    const isToday = dateStr === todayStr;
                    const roleData = summaries[dateStr]?.[role] || {};
                    const totalOs = new Set(Object.values(roleData).flatMap(x => [...(x?.os || [])])).size;
                    const totalGodz = Object.values(roleData).reduce((s, x) => s + (x?.godz || 0), 0);

                    return (
                      <td key={di} colSpan={hours.length + 1} style={{ padding: 0, borderLeft: '2px solid var(--border-strong)', background: isToday ? 'rgba(56,189,248,0.03)' : 'transparent' }}>
                        <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                          
                          {/* RAZEM */}
                          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', borderRight: '1px solid var(--border)', color: totalOs ? 'var(--text-primary)' : 'var(--text-quaternary)', fontWeight: totalOs ? 800 : 500, fontSize: '12px' }}>
                            {totalOs || '·'}
                          </div>
                          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', borderRight: '1px solid var(--border-strong)', color: totalGodz ? 'var(--text-primary)' : 'var(--text-quaternary)', fontWeight: totalGodz ? 800 : 500, fontSize: '12px' }}>
                            {totalGodz || '·'}
                          </div>

                          {/* GROUPS */}
                          {groupNames.flatMap((gn, idx) => {
                            const gc = groups.find(g => g.g === gn)?.color || '#555';
                            const gd = roleData[gn];
                            const isLast = idx === groupNames.length - 1;
                            return [
                              <div key={`${gn}-o`} style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', borderRight: '1px solid var(--border)', color: gd?.os?.size ? gc : 'var(--text-quaternary)', fontWeight: gd?.os?.size ? 800 : 500, fontSize: '12px' }}>
                                {gd?.os?.size || '·'}
                              </div>,
                              <div key={`${gn}-g`} style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', borderRight: isLast ? 'none' : '1px solid var(--border)', color: gd?.godz ? gc : 'var(--text-quaternary)', fontWeight: gd?.godz ? 800 : 500, fontSize: '12px' }}>
                                {gd?.godz || '·'}
                              </div>
                            ];
                          })}

                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr style={{ height: '36px' }}>
              {(() => {
                const wOs = new Set(weekDays.flatMap(d => {
                  const ds = toDateStr(d);
                  return employees.filter(e => hours.some(h => entries[`${e.id}_${ds}_${h}`])).map(e => e.id);
                }));
                const wGodz = weekDays.reduce((s, d) => {
                  const ds = toDateStr(d);
                  return s + employees.reduce((ss, e) => ss + hours.filter(h => entries[`${e.id}_${ds}_${h}`]).length, 0);
                }, 0);

                return (
                  <td className="tl-sticky-col" style={{ background: 'var(--bg-tertiary)', padding: 0, minWidth: '200px', borderRight: '1px solid var(--border)', borderTop: '2px solid var(--border-strong)' }}>
                    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                      <div style={{ flex: 1, padding: '0 12px', display: 'flex', alignItems: 'center', color: 'var(--text-primary)', fontWeight: 800, fontSize: '13px' }}>
                        {t('timeline.total')}
                      </div>
                      <div style={{ display: 'flex', width: '88px', borderLeft: '1px solid var(--border)' }}>
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: wOs.size ? 'var(--text-primary)' : 'var(--text-quaternary)', fontWeight: 800, fontSize: '12px', borderRight: '1px solid var(--border)' }}>
                          {wOs.size || '·'}
                        </div>
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: wGodz ? 'var(--text-primary)' : 'var(--text-quaternary)', fontWeight: 800, fontSize: '12px' }}>
                          {wGodz || '·'}
                        </div>
                      </div>
                    </div>
                  </td>
                );
              })()}
              {weekDays.map((d, di) => {
                const dateStr = toDateStr(d);
                const isToday = dateStr === todayStr;
                const allOs = new Set(employees.filter(e => hours.some(h => entries[`${e.id}_${dateStr}_${h}`])).map(e => e.id));
                const allGodz = employees.reduce((s, e) => s + hours.filter(h => entries[`${e.id}_${dateStr}_${h}`]).length, 0);
                
                return (
                  <td key={di} colSpan={hours.length + 1} style={{ padding: 0, borderLeft: '2px solid var(--border-strong)', background: isToday ? 'rgba(56,189,248,0.06)' : 'var(--bg-tertiary)', borderTop: '2px solid var(--border-strong)' }}>
                    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                      
                      {/* RAZEM */}
                      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', borderRight: '1px solid var(--border)', color: 'var(--text-primary)', fontWeight: 800, fontSize: '13px' }}>
                        {allOs.size || '·'}
                      </div>
                      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', borderRight: '1px solid var(--border-strong)', color: 'var(--text-primary)', fontWeight: 800, fontSize: '13px' }}>
                        {allGodz || '·'}
                      </div>

                      {/* GROUPS */}
                      {groupNames.flatMap((gn, idx) => {
                        const gc = groups.find(g => g.g === gn)?.color || '#555';
                        const gm = groups.find(g => g.g === gn)?.members || [];
                        const gOs = new Set(gm.filter(e => hours.some(h => entries[`${e.id}_${dateStr}_${h}`])).map(e => e.id));
                        const gGodz = gm.reduce((s, e) => s + hours.filter(h => entries[`${e.id}_${dateStr}_${h}`]).length, 0);
                        const isLast = idx === groupNames.length - 1;
                        
                        return [
                          <div key={`${gn}-o`} style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', borderRight: '1px solid var(--border)', color: gc, fontWeight: 800, fontSize: '13px' }}>
                            {gOs.size || '·'}
                          </div>,
                          <div key={`${gn}-g`} style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', borderRight: isLast ? 'none' : '1px solid var(--border)', color: gc, fontWeight: 800, fontSize: '13px' }}>
                            {gGodz || '·'}
                          </div>
                        ];
                      })}

                    </div>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="print-hide" style={{ fontSize: '11px', color: 'var(--text-quaternary)', textAlign: 'right' }}>
        {t('timeline.week', { num: weekNum })} · {t('timeline.employees', { count: employees.length })}
      </div>
    </div>
  );
}
