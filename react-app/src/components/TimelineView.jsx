import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { toastError, toastSuccess, toastWarn } from '../lib/toast';
import { loadMonthRoster } from '../lib/roster';
import { isHoliday } from '../utils/holidays';

const ROLES = {
  "T":  { bg: "#607D8B", fc: "#fff", name: "Tunnel" },
  "S":  { bg: "#2E7D32", fc: "#fff", name: "Składarka" },
  "M":  { bg: "#E65100", fc: "#fff", name: "Magiel" },
  "R":  { bg: "#C62828", fc: "#fff", name: "Roztrzepywanie" },
  "PR": { bg: "#00838F", fc: "#fff", name: "Pranie" },
  "P":  { bg: "#6A1B9A", fc: "#fff", name: "Prasowanie" },
  "SZ": { bg: "#4E342E", fc: "#fff", name: "Szycie" },
  "PP": { bg: "#F9A825", fc: "#1a1a1a", name: "Punkt przyjęć" },
  "SP": { bg: "#37474F", fc: "#fff", name: "Sprzątanie" },
  "O":  { bg: "#AD1457", fc: "#fff", name: "Oznakowanie" },
  "PK": { bg: "#558B2F", fc: "#fff", name: "Pakowanie" },
  "SC": { bg: "#FF6F00", fc: "#fff", name: "Spedycja" },
  "K":  { bg: "#1155cc", fc: "#fff", name: "Kierowca" },
};

const STATUS_STYLE = {
  'W':   { bg: '#f0f0f0', color: '#aaa' },
  'UW':  { bg: '#bfdbfe', color: '#1e40af' },
  'L4':  { bg: '#ffe4e6', color: '#be123c' },
  'NN':  { bg: '#ff0000', color: '#fff' },
  'END': { bg: '#e2e8f0', color: '#64748b' },
  'I':   { bg: '#ede9fe', color: '#6d28d9' },
};

const DAY_NAMES = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];
const HOURS = Array.from({ length: 17 }, (_, i) => i + 5);

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
function parseHour(str) {
  if (!str) return 0;
  const s = String(str).trim();
  if (s.includes(':')) { const p = s.split(':'); return parseInt(p[0]) + (parseInt(p[1]) || 0) / 60; }
  return parseFloat(s.replace(',', '.')) || 0;
}
function getWeekNum(d) {
  const date = new Date(d); date.setHours(0,0,0,0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const w1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
}

function getCellBackground(h, startH, endH, working, role, confirmed) {
  if (!working) return { background: 'transparent', color: 'transparent' };

  const rInfo = ROLES[role];
  const unassignedColor = confirmed ? 'rgba(0, 122, 255, 0.15)' : 'rgba(0, 0, 0, 0.04)';
  const shiftColor = rInfo ? rInfo.bg : unassignedColor;
  const shiftTextColor = rInfo ? rInfo.fc : 'transparent';
  const emptyColor = 'transparent';

  let fillFrom = 0;
  let fillTo = 0;
  const cellStart = h;
  const cellEnd = h + 1;

  if (startH <= endH) {
    if (cellEnd <= startH || cellStart >= endH) return { background: 'transparent', color: 'transparent' };
    const os = Math.max(cellStart, startH);
    const oe = Math.min(cellEnd, endH);
    const ov = oe - os;
    fillFrom = os - cellStart; fillTo = fillFrom + ov;
  } else {
    const inNight = cellStart >= startH || cellEnd <= endH;
    if (!inNight) return { background: 'transparent', color: 'transparent' };
    const os = cellStart >= startH ? Math.max(cellStart, startH) : cellStart;
    const oe = cellEnd <= endH ? Math.min(cellEnd, endH) : cellEnd;
    const ov = Math.max(0, oe - os);
    fillFrom = os - cellStart; fillTo = fillFrom + ov;
  }

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

function isHourInShift(h, startH, endH) {
  if (startH <= endH) return h >= Math.floor(startH) && h < Math.ceil(endH);
  return h >= Math.floor(startH) || h < Math.ceil(endH);
}

// Zmiana danej osoby w danym dniu (godziny, czy pracuje, potwierdzona, status nieobecności)
function getEmpDayShift(emp, scheduleMap, dateStr) {
  const sched = scheduleMap[`${emp.id}_${dateStr}`];
  const dow = new Date(dateStr + 'T00:00:00').getDay();
  const isWe = dow === 0 || dow === 6;
  const startH = sched ? sched.start : parseHour(emp.default_start);
  const endH = sched ? sched.end : parseHour(emp.default_end);
  const working = sched ? sched.working : !isWe;
  const confirmed = sched ? sched.confirmed : false;
  const dayStatus = sched?.status || null;
  return { startH, endH, working, confirmed, dayStatus };
}

// Zmemoizowany komponent wiersza
const TimelineRow = React.memo(({
  emp, weekDays, todayStr, scheduleMap, entries, isAdmin, rowBg,
  brushRole, onBrushCell, isPaintingRef, copyMode, copySource, onCopyClick
}) => {
  let empWeekHours = 0;
  let empWeekDays = 0;

  const cells = weekDays.map((d, di) => {
    const isWe = d.getDay() === 0 || d.getDay() === 6;
    const dateStr = toDateStr(d);
    const sched = scheduleMap[`${emp.id}_${dateStr}`];
    const startH = sched ? sched.start : parseHour(emp.default_start);
    const endH = sched ? sched.end : parseHour(emp.default_end);
    // Dwie 15-min przerwy: start+3h i start+6h
    const breakCell1 = Math.floor(startH + 3);
    const breakCell2 = Math.floor(startH + 6);
    const holiday = isHoliday(d);
    const working = sched ? sched.working : false;
    const confirmed = sched ? sched.confirmed : false;
    // Brak wpisu = domyślna wartość grafiku: weekend/święto → 'W' (wolne), powszedni → 'I' (Planowany)
    const dayStatus = sched ? sched.status : ((isWe || holiday) ? 'W' : 'I');
    const statusSt = dayStatus ? STATUS_STYLE[dayStatus] : null;
    const schedHours = working ? Math.round((endH >= startH ? endH - startH : 24 - startH + endH) * 10) / 10 : 0;

    if (working && !dayStatus) {
      empWeekHours += schedHours;
      if (schedHours > 0) empWeekDays += 1;
    }

    const isCopySource = copyMode && copySource === `${emp.id}_${dateStr}`;
    const canCopyHere = copyMode && isAdmin && working && !dayStatus;

    return (
      <React.Fragment key={di}>
        <td className="tl-sum-col"
          onClick={canCopyHere ? () => onCopyClick(emp.id, dateStr) : undefined}
          title={canCopyHere ? (copySource ? 'Kliknij, aby wkleić tutaj' : 'Kliknij, aby skopiować ten dzień') : undefined}
          style={{
            background: isCopySource ? 'var(--accent)' : dayStatus ? (statusSt?.bg || '#f5f5f7') : working ? 'var(--accent-green-light)' : '#f5f5f7',
            color: isCopySource ? '#fff' : dayStatus ? (statusSt?.color || '#ccc') : working ? 'var(--accent-green)' : '#ccc',
            cursor: canCopyHere ? 'copy' : 'default',
            outline: isCopySource ? '2px solid var(--accent)' : 'none',
            boxShadow: copyMode && copySource && canCopyHere && !isCopySource ? 'inset 0 0 0 1px var(--accent)' : 'none',
          }}>
          {dayStatus || (working ? schedHours : '')}
        </td>
        {HOURS.map(h => {
          const key = `${emp.id}_${dateStr}_${h}`;
          const role = entries[key];
          const cellStyle = statusSt
            ? { background: statusSt.bg, color: statusSt.color }
            : getCellBackground(h, startH, endH, working, role, confirmed);

          let isShiftHour = false;
          if (startH <= endH) {
            isShiftHour = h >= Math.floor(startH) && h < Math.ceil(endH);
          } else {
            isShiftHour = h >= Math.floor(startH) || h < Math.ceil(endH);
          }

          const isBrushable = isAdmin && brushRole && !dayStatus && working && isShiftHour && confirmed;
          const isBreakHour = working && !dayStatus && isShiftHour && (h === breakCell1 || h === breakCell2);

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
              <div className="tl-cell-inner" style={cellStyle}>
                {isBreakHour && <span className="tl-break-mark" title="Przerwa 15 min" />}
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
      <td className="tl-sticky-col" style={{ background: rowBg, padding: 0, minWidth: '180px' }}>
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
  for (let d of next.weekDays) {
    const dateStr = toDateStr(d);
    if (prev.scheduleMap[`${prev.emp.id}_${dateStr}`] !== next.scheduleMap[`${next.emp.id}_${dateStr}`]) return false;
    for (let h of HOURS) {
      const key = `${next.emp.id}_${dateStr}_${h}`;
      if (prev.entries[key] !== next.entries[key]) return false;
    }
  }
  return true;
});

const sumCellStyle = (val, color, isLast, borderColor = 'var(--border)') => ({
  flex: 1,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  borderRight: isLast ? 'none' : `1px solid ${borderColor}`,
  color: val ? color : 'var(--text-quaternary)',
  fontWeight: val ? 700 : 400,
  fontSize: '11px'
});

export default function TimelineView() {
  const { user, isAdmin } = useAuth();
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

  const allWeekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const weekNum = getWeekNum(monday);

  const weekDays = allWeekDays.filter(d => {
    const dw = d.getDay();
    if (dw !== 0 && dw !== 6) return true;
    const ds = toDateStr(d);
    return Object.keys(entries).some(k => k.includes(`_${ds}_`));
  });

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
      const v = String(e.value || '').toUpperCase();
      // 'I' (Planowany/na zleceniu) = jeszcze nie pracuje → nie liczony, nie malowalny, ale oznaczony
      const isWorking = v && v !== 'W' && v !== 'UW' && v !== 'L4' && v !== 'NN' && v !== 'END' && v !== 'I';
      let finalStart = parseHour(emp.default_start), finalEnd = parseHour(emp.default_end);
      if (isWorking && v) {
        if (v.includes('-')) {
          const [a, b] = v.split('-');
          const st = parseFloat(a.replace(',', '.')), en = parseFloat(b.replace(',', '.'));
          if (!isNaN(st) && !isNaN(en)) { finalStart = st; finalEnd = en; }
        } else if (v.includes('+')) {
          const [a, b] = v.split('+');
          const st = parseFloat(a.replace(',', '.')), dur = parseFloat(b.replace(',', '.'));
          if (!isNaN(st) && !isNaN(dur)) { finalStart = st; finalEnd = (st + dur) % 24; }
        } else if (!isNaN(parseFloat(v.replace(',', '.')))) {
          const dur = parseFloat(v.replace(',', '.'));
          if (!isNaN(dur)) finalEnd = (finalStart + dur) % 24;
        }
      }
      sm[`${e.employee_id}_${ds}`] = { start: finalStart, end: finalEnd, working: isWorking, status: isWorking ? null : v, confirmed: isWorking && v !== 'I' };
    });
    setScheduleMap(sm);
    setLoading(false);
  }, [monday]);

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
    // Zapis do bazy — supabase wykonuje żądanie dopiero po await/.then()
    const { error } = newRole
      ? await supabase.from('timeline_entries').upsert(
          { employee_id: empId, entry_date: dateStr, hour, role: newRole, updated_at: new Date().toISOString(), updated_by: user?.name },
          { onConflict: 'employee_id,entry_date,hour' }
        )
      : await supabase.from('timeline_entries').delete().eq('employee_id', empId).eq('entry_date', dateStr).eq('hour', hour);
    if (error) {
      // cofnij zmianę lokalną gdy zapis się nie powiódł
      setEntries(prev => {
        const next = { ...prev };
        if (current) next[key] = current; else delete next[key];
        return next;
      });
      toastError('Nie udało się zapisać — spróbuj ponownie');
    }
  }, [isAdmin, brushRole, entries, user]);

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
    if (tShift.dayStatus || !tShift.working) { toastWarn('Dzień docelowy jest wolny lub to nieobecność'); return; }
    if (!tShift.confirmed) { toastWarn('Dzień docelowy nie jest potwierdzony'); return; }

    // godziny ze źródła, które mieszczą się w zmianie docelowej
    const toWrite = [];
    for (const h of HOURS) {
      const role = entries[`${srcEmpId}_${srcDateStr}_${h}`];
      if (!role) continue;
      if (!isHourInShift(h, tShift.startH, tShift.endH)) continue;
      toWrite.push({ h, role });
    }
    if (!toWrite.length) { toastWarn('Brak godzin do skopiowania w grafiku docelowym'); return; }

    const prevValues = toWrite.map(({ h }) => ({ h, role: entries[`${empId}_${dateStr}_${h}`] }));
    setEntries(prev => {
      const next = { ...prev };
      toWrite.forEach(({ h, role }) => { next[`${empId}_${dateStr}_${h}`] = role; });
      return next;
    });

    const results = await Promise.all(toWrite.map(({ h, role }) =>
      supabase.from('timeline_entries').upsert(
        { employee_id: empId, entry_date: dateStr, hour: h, role, updated_at: new Date().toISOString(), updated_by: user?.name },
        { onConflict: 'employee_id,entry_date,hour' }
      )
    ));
    if (results.some(r => r.error)) {
      setEntries(prev => {
        const next = { ...prev };
        prevValues.forEach(({ h, role }) => { if (role) next[`${empId}_${dateStr}_${h}`] = role; else delete next[`${empId}_${dateStr}_${h}`]; });
        return next;
      });
      toastError('Nie udało się skopiować — spróbuj ponownie');
    } else {
      toastSuccess(`Skopiowano ${toWrite.length} godz. → ${tgtEmp.name}, ${fmtDate(new Date(dateStr + 'T00:00:00'))}`);
    }
  }, [isAdmin, copySource, employees, scheduleMap, entries, user]);

  const minMonday = getMondayOfWeek(new Date(2026, 0, 1)); // start: tydzień ze stycznia 2026
  const atMinWeek = monday <= minMonday;
  const prevWeek = () => setMonday(m => { const p = addDays(m, -7); return p < minMonday ? m : p; });
  const nextWeek = () => setMonday(m => addDays(m, 7));

  const groups = useMemo(() => {
    const grps = groupData.map(g => ({ g: g.name, color: g.color, members: employees.filter(e => e.group_name === g.name) }))
      .filter(({ members }) => members.length > 0);
    const extraNames = [...new Set(employees.map(e => e.group_name))].filter(name => !groupData.find(g => g.name === name));
    extraNames.forEach(name => {
      const m = employees.filter(e => e.group_name === name);
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
        HOURS.forEach(h => {
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
  }, [entries, groups]);

  if (loading) return <div className="loader">Ładowanie osi czasu…</div>;

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
        <button onClick={prevWeek} disabled={atMinWeek} style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)', borderRadius: '10px', padding: '7px 14px', fontSize: '14px', cursor: atMinWeek ? 'not-allowed' : 'pointer', opacity: atMinWeek ? 0.4 : 1, fontWeight: 700, color: 'var(--text-primary)' }}>‹ Poprzedni</button>
        <div style={{ fontWeight: 700, fontSize: '16px', flex: 1, textAlign: 'center', color: 'var(--text-primary)' }}>
          Tydzień {weekNum} · {fmtDate(monday)} – {fmtDate(addDays(monday, 6))}
        </div>
        <button onClick={nextWeek} style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)', borderRadius: '10px', padding: '7px 14px', fontSize: '14px', cursor: 'pointer', fontWeight: 700, color: 'var(--text-primary)' }}>Następny ›</button>
      </div>

      {/* Pasek pędzla */}
      {isAdmin && (
        <div className="print-hide" style={{
          display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap',
          background: 'var(--bg-card)', backdropFilter: 'blur(16px)',
          padding: '10px 14px', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)'
        }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-quaternary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: '4px', whiteSpace: 'nowrap' }}>
            Pędzel:
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
            ✕ Gumka
          </button>
          {brushRole && (
            <button onClick={() => setBrushRole(null)} style={{
              background: 'transparent', color: 'var(--text-tertiary)',
              border: '1px dashed var(--border-strong)', borderRadius: '10px', padding: '4px 10px',
              fontSize: '11px', cursor: 'pointer', marginLeft: '4px',
            }}>
              Esc / wyłącz
            </button>
          )}
          {!brushRole && !copyMode && (
            <span style={{ fontSize: '10px', color: 'var(--text-quaternary)', marginLeft: '4px' }}>
              Wybierz stanowisko i maluj po komórkach
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
            📋 Kopiuj dzień
          </button>
          {copyMode && (
            <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginLeft: '4px', fontWeight: 600 }}>
              {copySource
                ? 'Kliknij dzień docelowy (kolumnę Σ), aby wkleić. Można wkleić na kilka dni.'
                : 'Kliknij dzień źródłowy w kolumnie Σ przy osobie.'}
            </span>
          )}
          {copyMode && (
            <button onClick={() => { setCopyMode(false); setCopySource(null); }} style={{
              background: 'transparent', color: 'var(--text-tertiary)',
              border: '1px dashed var(--border-strong)', borderRadius: '10px', padding: '4px 10px',
              fontSize: '11px', cursor: 'pointer', marginLeft: '4px',
            }}>
              Esc / wyłącz
            </button>
          )}
        </div>
      )}



      {/* Tabela połączona */}
      <div className="tl-container" ref={containerRef}>
        <table className="tl-table" style={{ minWidth: `${NAME_W + weekDays.length * (HOURS.length * HOUR_W + 29)}px` }}>
          <thead>
            <tr>
              <th rowSpan={2} className="tl-th-corner" style={{ padding: 0, minWidth: '180px' }}>
                <div style={{ display: 'flex', height: '100%', alignItems: 'center', padding: '0 10px' }}>
                  Pracownik / Stanowisko
                </div>
              </th>
              {weekDays.map((d, di) => {
                const dw = d.getDay();
                const isWe = dw === 0 || dw === 6;
                const isToday = toDateStr(d) === todayStr;
                return (
                  <th key={di} colSpan={HOURS.length + 1} className="tl-th-day" style={{
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
                  ...HOURS.map(h => (
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
                <td className="tl-sticky-col" style={{ background: `${grpColor}15`, borderTop: `1px solid ${grpColor}30`, borderBottom: `1px solid ${grpColor}30`, padding: 0, minWidth: '180px' }}>
                  <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                    <div style={{ flex: 1, padding: '0 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: grpColor }} />
                      <span style={{ fontWeight: 800, fontSize: '10px', color: grpColor, letterSpacing: '0.5px', textTransform: 'uppercase' }}>{g}</span>
                    </div>
                  </div>
                </td>
                <td colSpan={weekDays.length * (HOURS.length + 1)} style={{ background: `${grpColor}08`, borderTop: `1px solid ${grpColor}20`, borderBottom: `1px solid ${grpColor}20` }} />
              </tr>
              {members.map((emp) => {
                const isDark = document.documentElement.style.getPropertyValue('color-scheme') === 'dark';
                const rowBg = isDark ? '#1C1C1E' : '#ffffff';
                
                return (
                  <TimelineRow
                    key={emp.id}
                    emp={emp}
                    weekDays={weekDays}
                    todayStr={todayStr}
                    scheduleMap={scheduleMap}
                    entries={entries}
                    isAdmin={isAdmin}
                    rowBg={rowBg}
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

          {/* Ciało tabeli: Podsumowanie */}
          <tbody style={{ borderTop: '3px solid #1a2e40' }}>
            <tr className="tl-summary-header">
              <th className="tl-sticky-col" style={{ background: '#1a2e40', padding: 0, minWidth: '180px' }}>
                <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                  <div style={{ width: '100px', padding: '0 10px', display: 'flex', alignItems: 'center', color: '#94a3b8', fontSize: '10px', fontWeight: 600, borderRight: '1px solid #2d3f50' }}>
                    Suma
                  </div>
                  <div style={{ width: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#4ade80', fontSize: '9px', borderRight: '1px solid #2d3f50' }}>Σ Os.</div>
                  <div style={{ width: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#4ade80', fontSize: '9px', borderRight: '1px solid #2d3f50' }}>Σ Gdz.</div>
                </div>
              </th>
              {weekDays.map((d, di) => {
                const isToday = toDateStr(d) === todayStr;
                return (
                  <td key={di} colSpan={HOURS.length + 1} style={{ padding: 0, borderLeft: '2px solid var(--border-strong)', background: isToday ? '#eff6ff' : '#f0f4f8' }}>
                    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', borderRight: '1px solid #e2e8f0', minHeight: '32px' }}>
                        <span style={{ fontSize: '9px', color: '#15803d', fontWeight: 700 }}>Σ Os.</span>
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', borderRight: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: '9px', color: '#15803d', fontWeight: 700 }}>Σ Gdz.</span>
                      </div>
                      {groupNames.flatMap((gn, idx) => {
                        const gc = groups.find(g => g.g === gn)?.color || '#555';
                        return [
                          <div key={`${gn}-o`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', borderRight: '1px solid #e2e8f0' }}>
                            <span style={{ fontSize: '9px', color: gc, fontWeight: 700 }}>{gn.slice(0,3)}</span>
                          </div>,
                          <div key={`${gn}-g`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', borderRight: idx === groupNames.length - 1 ? 'none' : '1px solid #e2e8f0' }}>
                            <span style={{ fontSize: '9px', color: gc, fontWeight: 600 }}>Gdz</span>
                          </div>
                        ];
                      })}
                    </div>
                  </td>
                );
              })}
            </tr>
            {Object.entries(ROLES).map(([role, r], ri) => {
              const rowBg = ri % 2 === 0 ? 'var(--bg-card-solid)' : 'var(--bg-secondary)';
              
              const weekOs = new Set(weekDays.flatMap(d => {
                const rd = summaries[toDateStr(d)]?.[role] || {};
                return Object.values(rd).flatMap(x => [...x.os]);
              }));
              const weekGodz = weekDays.reduce((s, d) => {
                const rd = summaries[toDateStr(d)]?.[role] || {};
                return s + Object.values(rd).reduce((ss, x) => ss + x.godz, 0);
              }, 0);

              return (
                <tr key={role} style={{ background: rowBg, height: '24px' }}>
                  <td className="tl-sticky-col" style={{ background: r.bg, borderBottom: '1px solid rgba(0,0,0,0.1)', padding: 0, minWidth: '180px' }}>
                    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                      <div style={{ width: '100px', padding: '0 8px', display: 'flex', alignItems: 'center', gap: '5px', borderRight: '1px solid rgba(0,0,0,0.1)' }}>
                        <span style={{ color: r.fc, fontSize: '11px', fontWeight: 800, flexShrink: 0, opacity: 0.9 }}>{role}</span>
                        <span style={{ fontSize: '9px', color: r.fc, fontWeight: 500, opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden' }}>{r.name}</span>
                      </div>
                      <div style={{ width: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'rgba(0,0,0,0.15)', color: r.fc, fontWeight: weekOs.size ? 700 : 400, borderRight: '1px solid rgba(0,0,0,0.1)', fontSize: '10px' }}>
                        {weekOs.size || '—'}
                      </div>
                      <div style={{ width: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'rgba(0,0,0,0.15)', color: r.fc, fontWeight: weekGodz ? 800 : 400, borderRight: '2px solid rgba(0,0,0,0.15)', fontSize: '10px' }}>
                        {weekGodz || '—'}
                      </div>
                    </div>
                  </td>
                  {weekDays.map((d, di) => {
                    const dateStr = toDateStr(d);
                    const roleData = summaries[dateStr]?.[role] || {};
                    const totalOs = new Set(Object.values(roleData).flatMap(x => [...x.os])).size;
                    const totalGodz = Object.values(roleData).reduce((s, x) => s + x.godz, 0);

                    return (
                      <td key={di} colSpan={HOURS.length + 1} style={{ padding: 0, borderLeft: '2px solid var(--border-strong)' }}>
                        <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                          <div style={sumCellStyle(totalOs, '#15803d', false)}>{totalOs || '—'}</div>
                          <div style={sumCellStyle(totalGodz, '#15803d', false)}>{totalGodz || '—'}</div>
                          {groupNames.flatMap((gn, idx) => {
                            const gc = groups.find(g => g.g === gn)?.color || '#555';
                            const gd = roleData[gn];
                            return [
                              <div key={`${gn}-o`} style={sumCellStyle(gd?.os.size, gc, false)}>{gd?.os.size || '—'}</div>,
                              <div key={`${gn}-g`} style={sumCellStyle(gd?.godz, gc, idx === groupNames.length - 1)}>{gd?.godz || '—'}</div>
                            ];
                          })}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr style={{ height: '28px' }}>
              {(() => {
                const wOs = new Set(weekDays.flatMap(d => {
                  const ds = toDateStr(d);
                  return employees.filter(e => HOURS.some(h => entries[`${e.id}_${ds}_${h}`])).map(e => e.id);
                }));
                const wGodz = weekDays.reduce((s, d) => {
                  const ds = toDateStr(d);
                  return s + employees.reduce((ss, e) => ss + HOURS.filter(h => entries[`${e.id}_${ds}_${h}`]).length, 0);
                }, 0);

                return (
                  <td className="tl-sticky-col" style={{ background: '#0f172a', padding: 0, minWidth: '180px' }}>
                    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                      <div style={{ width: '100px', padding: '0 10px', display: 'flex', alignItems: 'center', color: '#e2e8f0', fontWeight: 700, fontSize: '10px', letterSpacing: '0.5px', borderRight: '1px solid #1e293b' }}>
                        RAZEM
                      </div>
                      <div style={{ width: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', color: wOs.size ? '#4ade80' : 'var(--text-quaternary)', fontWeight: 700, fontSize: '10px', borderRight: '1px solid #1e293b' }}>
                        {wOs.size || '—'}
                      </div>
                      <div style={{ width: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', color: wGodz ? '#4ade80' : 'var(--text-quaternary)', fontWeight: 700, fontSize: '10px', borderRight: '1px solid #1e293b' }}>
                        {wGodz || '—'}
                      </div>
                    </div>
                  </td>
                );
              })()}
              {weekDays.map((d, di) => {
                const dateStr = toDateStr(d);
                const allOs = new Set(employees.filter(e => HOURS.some(h => entries[`${e.id}_${dateStr}_${h}`])).map(e => e.id));
                const allGodz = employees.reduce((s, e) => s + HOURS.filter(h => entries[`${e.id}_${dateStr}_${h}`]).length, 0);
                
                return (
                  <td key={di} colSpan={HOURS.length + 1} style={{ padding: 0, borderLeft: '2px solid #1e293b', background: '#0f172a' }}>
                    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                      <div style={sumCellStyle(allOs.size, '#4ade80', false, '#1e293b')}>{allOs.size || '—'}</div>
                      <div style={sumCellStyle(allGodz, '#4ade80', false, '#1e293b')}>{allGodz || '—'}</div>
                      {groupNames.flatMap((gn, idx) => {
                        const gm = groups.find(g => g.g === gn)?.members || [];
                        const gOs = new Set(gm.filter(e => HOURS.some(h => entries[`${e.id}_${dateStr}_${h}`])).map(e => e.id));
                        const gGodz = gm.reduce((s, e) => s + HOURS.filter(h => entries[`${e.id}_${dateStr}_${h}`]).length, 0);
                        const isLast = idx === groupNames.length - 1;
                        return [
                          <div key={`${gn}-o`} style={sumCellStyle(gOs.size, '#4ade80', false, '#1e293b')}>{gOs.size || '—'}</div>,
                          <div key={`${gn}-g`} style={sumCellStyle(gGodz, '#4ade80', isLast, '#1e293b')}>{gGodz || '—'}</div>
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
        Tydzień {weekNum} · {employees.length} pracowników
      </div>
    </div>
  );
}
