import { useState, useEffect, useCallback, useRef } from 'react';
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

const GROUP_COLORS = {
  'BIURO / BÜRO':           '#d35400',
  'TECHNICZNY / TECHNIKER': '#607d8b',
  'KIEROWCY / FAHRER':      '#1565c0',
  'ZD 1':                   '#2e7d32',
  'ZD 2':                   '#c62828',
};
const GROUP_ORDER = ['BIURO / BÜRO', 'TECHNICZNY / TECHNIKER', 'ZD 1', 'ZD 2', 'KIEROWCY / FAHRER'];
const DAY_NAMES = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];
const HOURS = Array.from({ length: 17 }, (_, i) => i + 5); // 5-21

function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function fmtDate(d) {
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}`;
}

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function parseHour(str) {
  if (!str) return 0;
  const s = String(str).trim();
  if (s.includes(':')) { const p = s.split(':'); return parseInt(p[0]) + (parseInt(p[1]) || 0) / 60; }
  return parseFloat(s.replace(',', '.')) || 0;
}

function getWeekNum(d) {
  const date = new Date(d);
  date.setHours(0,0,0,0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const w1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
}

// ----- Role Picker -----
function RolePicker({ current, onSelect, onClose, anchorRef }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={ref} style={{
      position: 'fixed', zIndex: 1000,
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '14px',
      padding: '12px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      width: '280px',
    }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
        Wybierz stanowisko
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '8px' }}>
        {Object.entries(ROLES).map(([key, r]) => (
          <button key={key} onClick={() => onSelect(key)} style={{
            background: r.bg, color: r.fc,
            border: current === key ? '2px solid #000' : '2px solid transparent',
            borderRadius: '8px', padding: '6px 2px',
            fontSize: '11px', fontWeight: 700, cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
            boxShadow: current === key ? '0 0 0 2px rgba(0,0,0,0.3)' : 'none',
          }}>
            <span style={{ fontSize: '13px' }}>{key}</span>
            <span style={{ fontSize: '8px', opacity: 0.85, fontWeight: 500 }}>{r.name.slice(0, 7)}</span>
          </button>
        ))}
      </div>
      {current && (
        <button onClick={() => onSelect(null)} style={{
          width: '100%', background: 'rgba(255,59,48,0.1)', color: '#FF3B30',
          border: 'none', borderRadius: '8px', padding: '8px',
          fontSize: '12px', fontWeight: 700, cursor: 'pointer',
        }}>
          Wyczyść komórkę
        </button>
      )}
    </div>
  );
}

export default function TimelineView() {
  const { user, isAdmin } = useAuth();
  const [monday, setMonday] = useState(() => getMondayOfWeek(new Date()));
  const [employees, setEmployees] = useState([]);
  const [entries, setEntries] = useState({});   // key: `${empId}_${dateStr}_${hour}`
  const [scheduleMap, setScheduleMap] = useState({}); // key: `${empId}_${dateStr}` → { start, end }
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState(null); // { empId, dateStr, hour, currentRole }

  const allWeekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const weekNum = getWeekNum(monday);

  // So/Nd pokazuj tylko jeśli ktoś ma przypisane stanowisko
  const weekDays = allWeekDays.filter(d => {
    const dw = d.getDay();
    if (dw !== 0 && dw !== 6) return true; // Pn-Pt zawsze
    const ds = toDateStr(d);
    return Object.keys(entries).some(k => k.includes(`_${ds}_`));
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const dateFrom = toDateStr(monday);
    const dateTo = toDateStr(addDays(monday, 6));

    const [{ data: emps }, { data: tl }, { data: sched }] = await Promise.all([
      supabase.from('employees').select('*').eq('active', true).order('sort_order').order('name'),
      supabase.from('timeline_entries').select('*').gte('entry_date', dateFrom).lte('entry_date', dateTo),
      supabase.from('schedule_entries').select('employee_id,day,value')
        .eq('year', monday.getFullYear())
        .eq('month', monday.getMonth() + 1),
    ]);

    setEmployees(emps || []);

    const map = {};
    (tl || []).forEach(e => { map[`${e.employee_id}_${e.entry_date}_${e.hour}`] = e.role; });
    setEntries(map);

    // Build schedule map (which value is set for each employee on each day of the week)
    const sm = {};
    (sched || []).forEach(e => {
      const emp = (emps || []).find(x => x.id === e.employee_id);
      if (!emp) return;
      const dayDate = weekDays.find(d => d.getDate() === e.day && d.getMonth() === monday.getMonth());
      if (!dayDate) return;
      const ds = toDateStr(dayDate);
      const v = String(e.value || '').toUpperCase();
      const isWorking = v && v !== 'W' && v !== 'UW' && v !== 'L4' && v !== 'NN';
      sm[`${e.employee_id}_${ds}`] = {
        start: parseHour(emp.default_start),
        end: parseHour(emp.default_end),
        working: isWorking,
      };
    });
    setScheduleMap(sm);
    setLoading(false);
  }, [monday]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const prevWeek = () => setMonday(m => addDays(m, -7));
  const nextWeek = () => setMonday(m => addDays(m, 7));

  const handleCellClick = (empId, dateStr, hour) => {
    if (!isAdmin) return;
    const key = `${empId}_${dateStr}_${hour}`;
    setPicker({ empId, dateStr, hour, currentRole: entries[key] || null });
  };

  const handleSelect = async (role) => {
    if (!picker) return;
    const { empId, dateStr, hour } = picker;
    const key = `${empId}_${dateStr}_${hour}`;

    if (role) {
      setEntries(prev => ({ ...prev, [key]: role }));
      await supabase.from('timeline_entries').upsert(
        { employee_id: empId, entry_date: dateStr, hour, role, updated_at: new Date().toISOString(), updated_by: user?.name },
        { onConflict: 'employee_id,entry_date,hour' }
      );
    } else {
      setEntries(prev => { const n = { ...prev }; delete n[key]; return n; });
      await supabase.from('timeline_entries').delete().eq('employee_id', empId).eq('entry_date', dateStr).eq('hour', hour);
    }
    setPicker(null);
  };

  // Group employees
  const groups = GROUP_ORDER
    .map(g => ({ g, members: employees.filter(e => e.group_name === g) }))
    .filter(({ members }) => members.length > 0);
  [...new Set(employees.map(e => e.group_name))].filter(g => !GROUP_ORDER.includes(g))
    .forEach(g => { const m = employees.filter(e => e.group_name === g); if (m.length) groups.push({ g, members: m }); });

  if (loading) return <div className="loader">Ładowanie osi czasu…</div>;

  const NAME_W = 150;
  const HOUR_W = 22;
  const DAY_W = HOURS.length * HOUR_W + 1; // +1 for sum col

  const btnStyle = { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '8px 16px', fontSize: '18px', cursor: 'pointer', fontWeight: 700, color: 'var(--text-primary)' };

  return (
    <div>
      {/* Nawigacja tygodnia */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        <button style={btnStyle} onClick={prevWeek}>‹</button>
        <div style={{ fontWeight: 700, fontSize: '16px', minWidth: '220px', textAlign: 'center' }}>
          Tydzień {weekNum} · {fmtDate(monday)} – {fmtDate(addDays(monday, 6))}
        </div>
        <button style={btnStyle} onClick={nextWeek}>›</button>
        {isAdmin && <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-tertiary)' }}>Kliknij komórkę aby przypisać stanowisko</div>}
      </div>

      {/* Legenda stanowisk */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '12px' }}>
        {Object.entries(ROLES).map(([k, r]) => (
          <span key={k} style={{ background: r.bg, color: r.fc, fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '5px' }}>{k} — {r.name}</span>
        ))}
      </div>

      {/* Tabela */}
      <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: '0 1px 8px rgba(0,0,0,0.07)' }}>
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: `${NAME_W + 7 * (DAY_W + 1)}px` }}>
          <thead>
            {/* Wiersz 1: dni */}
            <tr>
              <th rowSpan={2} style={{ width: `${NAME_W}px`, position: 'sticky', left: 0, zIndex: 3, background: '#1a2e40', color: '#fff', fontSize: '11px', fontWeight: 700, padding: '6px 8px', border: '1px solid #0d1f2d', textAlign: 'left' }}>
                Pracownik
              </th>
              {weekDays.map((d, di) => {
                const dw = d.getDay();
                const isWe = dw === 0 || dw === 6;
                return (
                  <th key={di} colSpan={HOURS.length + 1} style={{
                    width: `${DAY_W}px`, background: isWe ? '#8b0000' : '#004b79',
                    color: '#fff', fontSize: '11px', fontWeight: 700,
                    textAlign: 'center', border: '1px solid #0d1f2d', padding: '4px 2px',
                    whiteSpace: 'nowrap',
                  }}>
                    {DAY_NAMES[dw]} {fmtDate(d)}
                  </th>
                );
              })}
            </tr>
            {/* Wiersz 2: godziny */}
            <tr>
              {weekDays.map((d, di) => {
                const isWe = d.getDay() === 0 || d.getDay() === 6;
                return [
                  <th key={`sum-${di}`} style={{ width: '20px', background: isWe ? '#fce4e4' : '#e8edf2', color: isWe ? '#b71c1c' : '#1a2e40', fontSize: '9px', fontWeight: 700, textAlign: 'center', border: '1px solid rgba(0,0,0,0.1)', padding: '2px 0' }}>∑</th>,
                  ...HOURS.map(h => (
                    <th key={`h-${di}-${h}`} style={{ width: `${HOUR_W}px`, background: isWe ? '#fce4e4' : '#dce8f5', color: isWe ? '#b71c1c' : '#1a3a5c', fontSize: '8px', fontWeight: 700, textAlign: 'center', border: '1px solid rgba(0,0,0,0.08)', padding: '2px 0' }}>{h}</th>
                  )),
                ];
              })}
            </tr>
          </thead>
          <tbody>
            {groups.map(({ g, members }) => {
              const grpColor = GROUP_COLORS[g] || '#455a64';
              return [
                <tr key={`grp-${g}`}>
                  <td colSpan={1 + 7 * (HOURS.length + 1)} style={{ background: grpColor, color: '#fff', fontWeight: 700, fontSize: '11px', padding: '4px 10px', letterSpacing: '0.3px' }}>
                    ▸ {g}
                  </td>
                </tr>,
                ...members.map((emp, idx) => {
                  const rowBg = idx % 2 === 0 ? '#ffffff' : '#f7fafd';
                  return (
                    <tr key={emp.id}>
                      <td style={{ position: 'sticky', left: 0, zIndex: 1, background: rowBg, fontWeight: 600, fontSize: '11px', padding: '0 6px', height: '24px', border: '1px solid var(--border)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: `${NAME_W}px` }}>
                        <div>{emp.name}</div>
                        <div style={{ fontSize: '9px', color: 'var(--text-tertiary)', fontWeight: 500 }}>{emp.default_start}–{emp.default_end}</div>
                      </td>
                      {weekDays.map((d, di) => {
                        const isWe = d.getDay() === 0 || d.getDay() === 6;
                        const dateStr = toDateStr(d);
                        const sched = scheduleMap[`${emp.id}_${dateStr}`];
                        const startH = sched ? sched.start : parseHour(emp.default_start);
                        const endH   = sched ? sched.end   : parseHour(emp.default_end);
                        const working = sched ? sched.working : !isWe;

                        // Count roles this employee has on this day
                        const dayRoles = HOURS.filter(h => entries[`${emp.id}_${dateStr}_${h}`]).length;

                        return [
                          // Sum cell
                          <td key={`sum-${di}`} style={{ width: '20px', textAlign: 'center', fontSize: '9px', fontWeight: 700, background: isWe ? '#fce4e4' : '#e8edf2', color: isWe ? '#b71c1c' : '#1a2e40', border: '1px solid rgba(0,0,0,0.08)', padding: 0 }}>
                            {dayRoles || ''}
                          </td>,
                          // Hour cells
                          ...HOURS.map(h => {
                            const key = `${emp.id}_${dateStr}_${h}`;
                            const role = entries[key];
                            const inShift = working && h >= startH && h < endH;
                            const rData = role ? ROLES[role] : null;

                            let bg, color;
                            if (rData) { bg = rData.bg; color = rData.fc; }
                            else if (isWe) { bg = inShift ? '#ffcdd2' : '#fafafa'; color = '#b71c1c'; }
                            else { bg = inShift ? '#bbdefb' : '#f8fbff'; color = '#333'; }

                            return (
                              <td key={h}
                                onClick={() => handleCellClick(emp.id, dateStr, h)}
                                style={{
                                  width: `${HOUR_W}px`, height: '24px',
                                  background: bg, color,
                                  textAlign: 'center', fontWeight: 700, fontSize: '10px',
                                  border: '1px solid rgba(0,0,0,0.06)',
                                  cursor: isAdmin ? 'pointer' : 'default',
                                  userSelect: 'none',
                                  padding: 0,
                                }}
                              >
                                {role || ''}
                              </td>
                            );
                          }),
                        ];
                      })}
                    </tr>
                  );
                }),
              ];
            })}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: '11px', color: 'var(--text-quaternary)', marginTop: '10px', textAlign: 'right' }}>
        Tydzień {weekNum} · {employees.length} pracowników
      </div>

      {picker && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 999 }} onClick={() => setPicker(null)} />
          <RolePicker current={picker.currentRole} onSelect={handleSelect} onClose={() => setPicker(null)} />
        </>
      )}
    </div>
  );
}
