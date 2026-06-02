import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

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
  if (!working) return { background: '#fff', color: '#ccc' };

  const rData = role ? ROLES[role] : null;
  const shiftColor = rData ? rData.bg : (confirmed ? '#bfdbfe' : '#e8e8ea');
  const shiftTextColor = rData ? rData.fc : (confirmed ? '#1d4ed8' : '#999');
  const emptyColor = '#fff';

  const cellStart = h, cellEnd = h + 1;
  let fillFrom, fillTo;
  if (startH <= endH) {
    const os = Math.max(cellStart, startH), oe = Math.min(cellEnd, endH);
    const ov = Math.max(0, oe - os);
    fillFrom = os - cellStart; fillTo = fillFrom + ov;
  } else {
    const inNight = cellStart >= startH || cellEnd <= endH;
    if (!inNight) return { background: emptyColor, color: '#ccc' };
    const os = cellStart >= startH ? Math.max(cellStart, startH) : cellStart;
    const oe = cellEnd <= endH ? Math.min(cellEnd, endH) : cellEnd;
    const ov = Math.max(0, oe - os);
    fillFrom = os - cellStart; fillTo = fillFrom + ov;
  }
  if (fillTo <= 0) return { background: emptyColor, color: '#ccc' };
  if (fillFrom <= 0 && fillTo >= 1) return { background: shiftColor, color: shiftTextColor };
  const pF = Math.round(fillFrom * 100), pT = Math.round(fillTo * 100);
  return { background: `linear-gradient(to right, ${emptyColor} ${pF}%, ${shiftColor} ${pF}%, ${shiftColor} ${pT}%, ${emptyColor} ${pT}%)`, color: shiftTextColor };
}

function RolePicker({ onSelect, onClear, onClose, selCount }) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 999 }} onClick={onClose} />
      <div style={{
        position: 'fixed', zIndex: 1000, background: '#fff',
        border: '1px solid #e8e8ec', borderRadius: '16px', padding: '16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
        top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '300px',
      }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#999', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Wybierz stanowisko
        </div>
        <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '10px' }}>
          Zaznaczono {selCount} {selCount === 1 ? 'komórkę' : 'komórek'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '10px' }}>
          {Object.entries(ROLES).map(([key, r]) => (
            <button key={key} onClick={() => onSelect(key)} style={{
              background: `${r.bg}22`, color: r.bg,
              border: `1px solid ${r.bg}44`, borderRadius: '10px', padding: '7px 4px',
              fontSize: '11px', fontWeight: 700, cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', transition: 'all 0.12s',
            }}>
              <span style={{ fontSize: '14px' }}>{key}</span>
              <span style={{ fontSize: '8px', fontWeight: 500, opacity: 0.8 }}>{r.name.slice(0, 7)}</span>
            </button>
          ))}
        </div>
        <button onClick={onClear} style={{
          width: '100%', background: '#fee2e2', color: '#b91c1c',
          border: 'none', borderRadius: '10px', padding: '9px',
          fontSize: '12px', fontWeight: 700, cursor: 'pointer',
        }}>Wyczyść zaznaczone</button>
      </div>
    </>
  );
}

export default function TimelineView() {
  const { user, isAdmin } = useAuth();
  const today = new Date();
  const [monday, setMonday] = useState(() => getMondayOfWeek(new Date()));
  const [employees, setEmployees] = useState([]);
  const [groupData, setGroupData] = useState([]);
  const [entries, setEntries] = useState({});
  const [scheduleMap, setScheduleMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedCells, setSelectedCells] = useState(new Set());
  const [showPicker, setShowPicker] = useState(false);

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
    const [{ data: emps }, { data: tl }, { data: sched }, { data: grps }] = await Promise.all([
      supabase.from('employees').select('*').eq('active', true).order('sort_order').order('name'),
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
      const isWorking = v && v !== 'W' && v !== 'UW' && v !== 'L4' && v !== 'NN' && v !== 'END';
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
  useEffect(() => { setSelectedCells(new Set()); }, [monday]);

  const prevWeek = () => setMonday(m => addDays(m, -7));
  const nextWeek = () => setMonday(m => addDays(m, 7));

  const handleCellClick = (empId, dateStr, hour, dayStatus) => {
    if (!isAdmin || dayStatus) return;
    const key = `${empId}_${dateStr}_${hour}`;
    setSelectedCells(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleAssign = async (role) => {
    const updates = [...selectedCells].map(key => {
      const [empId, dateStr, hourStr] = key.split('_').reduce((acc, v, i) => {
        if (i === 0) acc[0] = v;
        else if (i <= 2) acc[1] = (acc[1] ? acc[1] + '-' : '') + v;
        else acc[2] = v;
        return acc;
      }, ['', '', '']);
      return { key, empId, dateStr, hour: parseInt(hourStr) };
    });

    // Parse keys properly
    const parsed = [...selectedCells].map(key => {
      const parts = key.split('_');
      const hour = parseInt(parts[parts.length - 1]);
      const dateStr = parts.slice(1, parts.length - 1).join('_');
      const empId = parts[0];
      return { key, empId, dateStr, hour };
    });

    const newEntries = { ...entries };
    for (const { key, empId, dateStr, hour } of parsed) {
      newEntries[key] = role;
    }
    setEntries(newEntries);

    await Promise.all(parsed.map(({ empId, dateStr, hour }) =>
      supabase.from('timeline_entries').upsert(
        { employee_id: empId, entry_date: dateStr, hour, role, updated_at: new Date().toISOString(), updated_by: user?.name },
        { onConflict: 'employee_id,entry_date,hour' }
      )
    ));
    setSelectedCells(new Set());
    setShowPicker(false);
  };

  const handleClear = async () => {
    const parsed = [...selectedCells].map(key => {
      const parts = key.split('_');
      const hour = parseInt(parts[parts.length - 1]);
      const dateStr = parts.slice(1, parts.length - 1).join('_');
      const empId = parts[0];
      return { key, empId, dateStr, hour };
    });
    const newEntries = { ...entries };
    for (const { key } of parsed) delete newEntries[key];
    setEntries(newEntries);
    await Promise.all(parsed.map(({ empId, dateStr, hour }) =>
      supabase.from('timeline_entries').delete().eq('employee_id', empId).eq('entry_date', dateStr).eq('hour', hour)
    ));
    setSelectedCells(new Set());
    setShowPicker(false);
  };

  const groups = groupData.map(g => ({ g: g.name, color: g.color, members: employees.filter(e => e.group_name === g.name) }))
    .filter(({ members }) => members.length > 0);
  const extraNames = [...new Set(employees.map(e => e.group_name))].filter(name => !groupData.find(g => g.name === name));
  extraNames.forEach(name => {
    const m = employees.filter(e => e.group_name === name);
    if (m.length) groups.push({ g: name, color: '#455a64', members: m });
  });

  // Podsumowanie: per rola, per dzień, per grupa
  const buildSummary = (d) => {
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
  };

  if (loading) return <div className="loader">Ładowanie osi czasu…</div>;

  const NAME_W = 150;
  const HOUR_W = 24;
  const todayStr = toDateStr(today);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Nawigacja */}
      <div className="print-hide" style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        background: 'var(--bg-card)', backdropFilter: 'blur(16px)',
        padding: '12px 16px', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)'
      }}>
        <button onClick={prevWeek} style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)', borderRadius: '10px', padding: '7px 14px', fontSize: '14px', cursor: 'pointer', fontWeight: 700, color: 'var(--text-primary)' }}>‹ Poprzedni</button>
        <div style={{ fontWeight: 700, fontSize: '16px', flex: 1, textAlign: 'center', color: 'var(--text-primary)' }}>
          Tydzień {weekNum} · {fmtDate(monday)} – {fmtDate(addDays(monday, 6))}
        </div>
        <button onClick={nextWeek} style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)', borderRadius: '10px', padding: '7px 14px', fontSize: '14px', cursor: 'pointer', fontWeight: 700, color: 'var(--text-primary)' }}>Następny ›</button>
      </div>

      {/* Legenda + toolbar */}
      <div className="print-hide" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', background: 'var(--bg-card-solid)', padding: '10px 14px', borderRadius: '12px', border: '1px solid var(--border)' }}>
        {Object.entries(ROLES).map(([k, r]) => (
          <span key={k} style={{ background: r.bg, color: r.fc, fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '6px' }}>{k} — {r.name}</span>
        ))}
        {selectedCells.size > 0 && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#555', fontWeight: 600 }}>Zaznaczono: <strong>{selectedCells.size}</strong></span>
            <button onClick={() => setShowPicker(true)} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Przypisz stanowisko</button>
            <button onClick={() => setSelectedCells(new Set())} style={{ background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Odznacz</button>
          </div>
        )}
      </div>

      {/* Tabela */}
      <div style={{ overflowX: 'auto', borderRadius: '16px', border: '1px solid #e8e8ec', boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06)', background: '#fff' }}>
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: `${NAME_W + weekDays.length * (HOURS.length * HOUR_W + 29)}px` }}>
          <thead>
            <tr>
              <th rowSpan={2} style={{ width: `${NAME_W}px`, position: 'sticky', left: 0, zIndex: 3, background: '#f8f8f9', color: '#555', fontSize: '11px', fontWeight: 700, padding: '8px 12px', borderBottom: '2px solid #e8e8e8', borderRight: '1px solid #e8e8ec', textAlign: 'left' }}>
                Pracownik
              </th>
              {weekDays.map((d, di) => {
                const dw = d.getDay();
                const isWe = dw === 0 || dw === 6;
                const isToday = toDateStr(d) === todayStr;
                return (
                  <th key={di} colSpan={HOURS.length + 1} style={{
                    background: isToday ? 'var(--accent)' : isWe ? '#fef2f2' : '#f8f8f9',
                    color: isToday ? '#fff' : isWe ? '#b91c1c' : '#444',
                    fontSize: '11px', fontWeight: 700, textAlign: 'center',
                    borderBottom: '1px solid #e8e8ec', borderLeft: '2px solid #c8c8d0', padding: '5px 2px', whiteSpace: 'nowrap',
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
                  <th key={`sum-${di}`} style={{ width: '28px', background: '#f0f0f2', color: '#888', fontSize: '8px', fontWeight: 700, textAlign: 'center', borderBottom: '2px solid #e8e8e8', borderLeft: '2px solid #c8c8d0', padding: '2px 0' }}>Σ</th>,
                  ...HOURS.map(h => (
                    <th key={`h-${di}-${h}`} style={{ width: `${HOUR_W}px`, background: isToday ? '#eff6ff' : isWe ? '#fef2f2' : '#f8f8f9', color: isWe ? '#f87171' : '#aaa', fontSize: '8px', fontWeight: 700, textAlign: 'center', borderBottom: '2px solid #e8e8e8', borderLeft: 'none', padding: '2px 0' }}>{h}</th>
                  )),
                ];
              })}
            </tr>
          </thead>
          <tbody>
            {groups.map(({ g, color: grpColor, members }) => [
              <tr key={`grp-${g}`} style={{ height: '26px' }}>
                <td style={{ position: 'sticky', left: 0, zIndex: 2, background: `${grpColor}12`, padding: '0 10px', borderTop: `1px solid ${grpColor}30`, borderBottom: `1px solid ${grpColor}30`, borderRight: '1px solid #e8e8ec' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: grpColor }} />
                    <span style={{ fontWeight: 700, fontSize: '10px', color: grpColor, letterSpacing: '0.5px', textTransform: 'uppercase' }}>{g}</span>
                  </div>
                </td>
                <td colSpan={weekDays.length * (HOURS.length + 1)} style={{ background: `${grpColor}08`, borderTop: `1px solid ${grpColor}20`, borderBottom: `1px solid ${grpColor}20` }} />
              </tr>,
              ...members.map((emp, idx) => {
                const rowBg = idx % 2 === 0 ? '#ffffff' : '#fafbfc';
                return (
                  <tr key={emp.id} style={{ height: '30px' }}>
                    <td style={{ position: 'sticky', left: 0, zIndex: 1, background: rowBg, padding: '0 8px 0 12px', borderRight: '1px solid #e8e8ec', borderBottom: '1px solid #f0f0f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, fontSize: '11px', color: '#222', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emp.name}</span>
                        <span style={{ fontSize: '9px', color: '#bbb', fontWeight: 500, flexShrink: 0, marginLeft: '4px' }}>{emp.default_start}–{emp.default_end}</span>
                      </div>
                    </td>
                    {weekDays.map((d, di) => {
                      const isWe = d.getDay() === 0 || d.getDay() === 6;
                      const isToday = toDateStr(d) === todayStr;
                      const dateStr = toDateStr(d);
                      const sched = scheduleMap[`${emp.id}_${dateStr}`];
                      const startH = sched ? sched.start : parseHour(emp.default_start);
                      const endH = sched ? sched.end : parseHour(emp.default_end);
                      const working = sched ? sched.working : !isWe;
                      const confirmed = sched ? sched.confirmed : false;
                      const dayStatus = sched?.status;
                      const statusSt = dayStatus ? STATUS_STYLE[dayStatus] : null;
                      const schedHours = working ? Math.round((endH >= startH ? endH - startH : 24 - startH + endH) * 10) / 10 : 0;

                      return [
                        <td key={`sum-${di}`} style={{
                          width: '28px', textAlign: 'center', fontSize: '9px', fontWeight: 700,
                          background: dayStatus ? (statusSt?.bg || '#f5f5f7') : working ? '#f0fdf4' : '#f5f5f7',
                          color: dayStatus ? (statusSt?.color || '#ccc') : working ? '#15803d' : '#ccc',
                          borderBottom: '1px solid #f0f0f0', borderLeft: '2px solid #c8c8d0', padding: '0 2px',
                        }}>
                          {dayStatus || (working ? schedHours : '')}
                        </td>,
                        ...HOURS.map(h => {
                          const key = `${emp.id}_${dateStr}_${h}`;
                          const role = entries[key];
                          const isSelected = selectedCells.has(key);
                          const cellStyle = statusSt
                            ? { background: statusSt.bg, color: statusSt.color }
                            : getCellBackground(h, startH, endH, working, role, confirmed);

                          return (
                            <td key={h}
                              onClick={() => handleCellClick(emp.id, dateStr, h, dayStatus)}
                              style={{
                                width: `${HOUR_W}px`, height: '30px',
                                ...cellStyle,
                                textAlign: 'center', fontWeight: 700, fontSize: '9px',
                                borderBottom: '1px solid #f0f0f0', borderLeft: 'none',
                                outline: isSelected ? '2px solid #f59e0b' : 'none',
                                outlineOffset: '-2px',
                                cursor: isAdmin && !dayStatus ? 'pointer' : 'default',
                                userSelect: 'none', padding: 0, boxSizing: 'border-box',
                              }}
                            >
                              {!dayStatus && (role || '')}
                            </td>
                          );
                        }),
                      ];
                    })}
                  </tr>
                );
              }),
            ])}
          </tbody>
        </table>
        {/* Tabela podsumowania */}
        {(() => {
          const groupNames = groups.map(g => g.g);
          const COLS = 2 + groupNames.length * 2;
          const DAY_TOTAL_W = HOURS.length * HOUR_W + 28;
          const COL_W = Math.floor(DAY_TOTAL_W / COLS);

          const summaries = Object.fromEntries(weekDays.map(d => [toDateStr(d), buildSummary(d)]));

          const numCell = (val, color, extra = {}) => (
            <td style={{ textAlign: 'center', fontWeight: val ? 700 : 400, fontSize: '11px',
              color: val ? color : '#d1d5db', padding: '5px 4px',
              borderBottom: '1px solid #f0f0f0', ...extra }}>
              {val || '—'}
            </td>
          );

          return (
            <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed',
              minWidth: `${NAME_W + weekDays.length * DAY_TOTAL_W}px`,
              borderTop: '3px solid #1a2e40' }}>
              <thead>
                {/* Rząd 1: nagłówek tygodnia + dni */}
                <tr>
                  <th style={{ width: `${NAME_W}px`, position: 'sticky', left: 0, zIndex: 3,
                    background: '#1a2e40', color: '#94a3b8', fontSize: '10px', fontWeight: 600,
                    padding: '8px 12px', textAlign: 'left', borderRight: '1px solid #2d3f50' }}>
                    Stanowisko
                  </th>
                  <th colSpan={2} style={{ background: '#0f172a', color: '#4ade80', fontSize: '11px',
                    fontWeight: 700, textAlign: 'center', padding: '8px 4px',
                    borderLeft: '2px solid #2d3f50', whiteSpace: 'nowrap', letterSpacing: '0.3px' }}>
                    Σ Tydzień
                  </th>
                  {weekDays.map((d, di) => {
                    const isToday = toDateStr(d) === todayStr;
                    const dw = d.getDay();
                    return (
                      <th key={di} colSpan={COLS} style={{
                        background: isToday ? 'var(--accent)' : '#1a2e40',
                        color: isToday ? '#fff' : '#cbd5e1',
                        fontSize: '11px', fontWeight: 700, textAlign: 'center',
                        borderLeft: '2px solid #2d3f50', padding: '8px 4px',
                        letterSpacing: '0.3px',
                      }}>
                        {DAY_NAMES[dw]} {fmtDate(d)}
                      </th>
                    );
                  })}
                </tr>
                {/* Rząd 2: Σ Os / Σ Godz / grupy */}
                <tr>
                  <th style={{ position: 'sticky', left: 0, zIndex: 3, background: '#f0f4f8',
                    borderBottom: '2px solid #e2e8f0', borderRight: '1px solid #e2e8f0' }} />
                  <th style={{ width: `${COL_W}px`, background: '#1e293b', color: '#4ade80',
                    fontSize: '9px', fontWeight: 700, textAlign: 'center',
                    borderBottom: '2px solid #0f172a', borderLeft: '2px solid #2d3f50',
                    padding: '4px 2px' }}>Σ Os.</th>
                  <th style={{ width: `${COL_W}px`, background: '#1e293b', color: '#4ade80',
                    fontSize: '9px', fontWeight: 700, textAlign: 'center',
                    borderBottom: '2px solid #0f172a', padding: '4px 2px' }}>Σ Godz.</th>
                  {weekDays.map((d, di) => {
                    const isToday = toDateStr(d) === todayStr;
                    const hBg = isToday ? '#eff6ff' : '#f0f4f8';
                    return [
                      <th key={`${di}-o`} style={{ width: `${COL_W}px`, background: hBg,
                        color: '#15803d', fontSize: '9px', fontWeight: 700, textAlign: 'center',
                        borderBottom: '2px solid #e2e8f0', borderLeft: '2px solid #c8c8d0',
                        padding: '4px 2px' }}>Σ Os.</th>,
                      <th key={`${di}-g`} style={{ width: `${COL_W}px`, background: hBg,
                        color: '#15803d', fontSize: '9px', fontWeight: 700, textAlign: 'center',
                        borderBottom: '2px solid #e2e8f0', padding: '4px 2px' }}>Σ Godz.</th>,
                      ...groupNames.flatMap(gn => {
                        const gc = groups.find(g => g.g === gn)?.color || '#555';
                        return [
                          <th key={`${di}-${gn}-o`} style={{ width: `${COL_W}px`, background: `${hBg}`,
                            color: gc, fontSize: '9px', fontWeight: 700, textAlign: 'center',
                            borderBottom: '2px solid #e2e8f0', borderLeft: '1px solid #e2e8f0',
                            padding: '4px 2px' }}>{gn} Os.</th>,
                          <th key={`${di}-${gn}-g`} style={{ width: `${COL_W}px`, background: hBg,
                            color: gc, fontSize: '9px', fontWeight: 600, textAlign: 'center',
                            borderBottom: '2px solid #e2e8f0', padding: '4px 2px' }}>Godz.</th>,
                        ];
                      }),
                    ];
                  })}
                </tr>
              </thead>
              <tbody>
                {Object.entries(ROLES).map(([role, r], ri) => {
                  const rowBg = ri % 2 === 0 ? '#fff' : '#f8fafc';
                  const hasAny = weekDays.some(d => {
                    const rd = summaries[toDateStr(d)]?.[role] || {};
                    return Object.keys(rd).length > 0;
                  });
                  return (
                    <tr key={role} style={{ background: rowBg, height: '28px' }}>
                      <td style={{ position: 'sticky', left: 0, zIndex: 1,
                        background: r.bg,
                        padding: '0 10px', borderRight: '2px solid rgba(0,0,0,0.15)',
                        borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                          <span style={{ color: r.fc, fontSize: '11px', fontWeight: 800, flexShrink: 0, opacity: 0.9 }}>{role}</span>
                          <span style={{ fontSize: '10px', color: r.fc, fontWeight: 500, opacity: 0.85 }}>{r.name}</span>
                        </div>
                      </td>
                      {/* Tygodniowe sumy */}
                      {(() => {
                        const weekOs = new Set(weekDays.flatMap(d => {
                          const rd = summaries[toDateStr(d)]?.[role] || {};
                          return Object.values(rd).flatMap(x => [...x.os]);
                        }));
                        const weekGodz = weekDays.reduce((s, d) => {
                          const rd = summaries[toDateStr(d)]?.[role] || {};
                          return s + Object.values(rd).reduce((ss, x) => ss + x.godz, 0);
                        }, 0);
                        return [
                          <td key="w-os" style={{ textAlign: 'center', fontWeight: weekOs.size ? 700 : 400, fontSize: '11px', color: weekOs.size ? '#4ade80' : '#334155', background: '#1e293b', borderLeft: '2px solid #2d3f50', borderBottom: '1px solid #0f172a' }}>{weekOs.size || '—'}</td>,
                          <td key="w-godz" style={{ textAlign: 'center', fontWeight: weekGodz ? 700 : 400, fontSize: '11px', color: weekGodz ? '#4ade80' : '#334155', background: '#1e293b', borderBottom: '1px solid #0f172a' }}>{weekGodz || '—'}</td>,
                        ];
                      })()}
                      {weekDays.map((d, di) => {
                        const dateStr = toDateStr(d);
                        const roleData = summaries[dateStr]?.[role] || {};
                        const totalOs = new Set(Object.values(roleData).flatMap(x => [...x.os])).size;
                        const totalGodz = Object.values(roleData).reduce((s, x) => s + x.godz, 0);
                        return [
                          numCell(totalOs, '#15803d', { borderLeft: '2px solid #c8c8d0' }),
                          numCell(totalGodz, '#15803d'),
                          ...groupNames.flatMap(gn => {
                            const gc = groups.find(g => g.g === gn)?.color || '#555';
                            const gd = roleData[gn];
                            return [
                              numCell(gd?.os.size, gc, { borderLeft: '1px solid #eee' }),
                              numCell(gd?.godz, gc),
                            ];
                          }),
                        ];
                      })}
                    </tr>
                  );
                })}
                {/* RAZEM */}
                <tr style={{ height: '32px' }}>
                  <td style={{ position: 'sticky', left: 0, zIndex: 1,
                    background: '#0f172a', color: '#e2e8f0',
                    fontWeight: 700, fontSize: '11px', padding: '0 10px',
                    borderRight: '1px solid #1e293b', letterSpacing: '0.5px' }}>
                    RAZEM
                  </td>
                  {(() => {
                    const wOs = new Set(weekDays.flatMap(d => {
                      const ds = toDateStr(d);
                      return employees.filter(e => HOURS.some(h => entries[`${e.id}_${ds}_${h}`])).map(e => e.id);
                    }));
                    const wGodz = weekDays.reduce((s, d) => {
                      const ds = toDateStr(d);
                      return s + employees.reduce((ss, e) => ss + HOURS.filter(h => entries[`${e.id}_${ds}_${h}`]).length, 0);
                    }, 0);
                    return [
                      <td key="w-os" style={{ textAlign: 'center', fontWeight: 700, fontSize: '11px', color: wOs.size ? '#4ade80' : '#334155', background: '#0f172a', borderLeft: '2px solid #1e293b' }}>{wOs.size || '—'}</td>,
                      <td key="w-godz" style={{ textAlign: 'center', fontWeight: 700, fontSize: '11px', color: wGodz ? '#4ade80' : '#334155', background: '#0f172a' }}>{wGodz || '—'}</td>,
                    ];
                  })()}
                  {weekDays.map((d, di) => {
                    const dateStr = toDateStr(d);
                    const allOs = new Set(employees.filter(e => HOURS.some(h => entries[`${e.id}_${dateStr}_${h}`])).map(e => e.id));
                    const allGodz = employees.reduce((s, e) => s + HOURS.filter(h => entries[`${e.id}_${dateStr}_${h}`]).length, 0);
                    return [
                      <td key={`${di}-o`} style={{ textAlign: 'center', fontWeight: 700, fontSize: '11px',
                        color: allOs.size ? '#4ade80' : '#334155',
                        background: '#0f172a', borderLeft: '2px solid #1e293b' }}>
                        {allOs.size || '—'}
                      </td>,
                      <td key={`${di}-g`} style={{ textAlign: 'center', fontWeight: 700, fontSize: '11px',
                        color: allGodz ? '#4ade80' : '#334155', background: '#0f172a' }}>
                        {allGodz || '—'}
                      </td>,
                      ...groupNames.flatMap(gn => {
                        const gm = groups.find(g => g.g === gn)?.members || [];
                        const gOs = new Set(gm.filter(e => HOURS.some(h => entries[`${e.id}_${dateStr}_${h}`])).map(e => e.id));
                        const gGodz = gm.reduce((s, e) => s + HOURS.filter(h => entries[`${e.id}_${dateStr}_${h}`]).length, 0);
                        return [
                          <td key={`${di}-${gn}-o`} style={{ textAlign: 'center', fontWeight: 700, fontSize: '11px',
                            color: gOs.size ? '#4ade80' : '#334155',
                            background: '#0f172a', borderLeft: '1px solid #1e293b' }}>
                            {gOs.size || '—'}
                          </td>,
                          <td key={`${di}-${gn}-g`} style={{ textAlign: 'center', fontWeight: 700, fontSize: '11px',
                            color: gGodz ? '#4ade80' : '#334155', background: '#0f172a' }}>
                            {gGodz || '—'}
                          </td>,
                        ];
                      }),
                    ];
                  })}
                </tr>
              </tbody>
            </table>
          );
        })()}
      </div>

      <div className="print-hide" style={{ fontSize: '11px', color: '#aaa', textAlign: 'right' }}>
        Tydzień {weekNum} · {employees.length} pracowników
      </div>

      {showPicker && (
        <RolePicker
          selCount={selectedCells.size}
          onSelect={handleAssign}
          onClear={handleClear}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
