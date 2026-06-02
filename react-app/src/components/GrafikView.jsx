import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

const GROUP_COLORS = {
  'BIURO / BÜRO':           '#d35400',
  'TECHNICZNY / TECHNIKER': '#607d8b',
  'KIEROWCY / FAHRER':      '#1565c0',
  'ZD 1':                   '#2e7d32',
  'ZD 2':                   '#c62828',
};
const GROUP_ORDER = ['BIURO / BÜRO', 'TECHNICZNY / TECHNIKER', 'ZD 1', 'ZD 2', 'KIEROWCY / FAHRER'];
const MONTH_NAMES = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
const DAY_NAMES = ['Nd','Pn','Wt','Śr','Cz','Pt','So'];

const VALUE_STYLE = {
  'W':  { bg: '#f4f6f7', color: '#aaaaaa' },
  'UW': { bg: '#d6eaf8', color: '#0c5460' },
  'L4': { bg: '#fcf3cf', color: '#856404' },
  'NN': { bg: '#fadbd8', color: '#721c24' },
  'I':  { bg: '#ebdef0', color: '#432874' },
};

function getCellStyle(value, isWeekend) {
  const v = String(value || '').trim().toUpperCase();
  if (!v) return { bg: isWeekend ? '#f4f6f7' : '#fff', color: '#999' };
  if (VALUE_STYLE[v]) return VALUE_STYLE[v];
  if (v.includes('+')) return { bg: '#ffe0b2', color: '#e65100' };
  if (!isNaN(parseFloat(v.replace(',', '.')))) return { bg: '#d4edda', color: '#155724' };
  return { bg: '#fff', color: '#333' };
}

function parseHours(value) {
  const v = String(value || '').trim().toUpperCase();
  if (!v || v === 'W' || v === 'UW' || v === 'L4' || v === 'NN' || v === 'I') return 0;
  if (v.includes('+')) return parseFloat(v.split('+')[1].replace(',', '.')) || 0;
  return parseFloat(v.replace(',', '.')) || 0;
}

function countSymbol(employees, getValue, day, sym) {
  return employees.filter(e => String(getValue(e, day) || '').toUpperCase() === sym).length;
}

function isPresent(value) {
  const v = String(value || '').trim().toUpperCase();
  return v && v !== 'W' && v !== 'UW' && v !== 'L4' && v !== 'NN' && v !== 'I' && v !== '';
}

export default function GrafikView() {
  const { user, isAdmin } = useAuth();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [employees, setEmployees] = useState([]);
  const [entries, setEntries] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedCell, setSelectedCell] = useState(null); // { empIdx, day }
  const [editingCell, setEditingCell] = useState(null);   // { empIdx, day }
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);

  // Norma: dni robocze × 8
  const workingDays = useMemo(() =>
    days.filter(d => { const dw = new Date(year, month - 1, d).getDay(); return dw !== 0 && dw !== 6; }).length,
    [days, year, month]);
  const norm = workingDays * 8;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: emps }, { data: sched }] = await Promise.all([
      supabase.from('employees').select('*').eq('active', true).order('sort_order').order('name'),
      supabase.from('schedule_entries').select('*').eq('year', year).eq('month', month),
    ]);
    setEmployees(emps || []);
    const map = {};
    (sched || []).forEach(e => { map[`${e.employee_id}_${e.day}`] = e.value; });
    setEntries(map);
    setLoading(false);
  }, [year, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (editingCell && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [editingCell]);

  const groups = useMemo(() => {
    const g = GROUP_ORDER
      .map(g => ({ g, members: employees.filter(e => e.group_name === g) }))
      .filter(({ members }) => members.length > 0);
    [...new Set(employees.map(e => e.group_name))].filter(g => !GROUP_ORDER.includes(g))
      .forEach(g => { const m = employees.filter(e => e.group_name === g); if (m.length) g.push({ g, members: m }); });
    return g;
  }, [employees]);

  // Spłaszczona lista pracowników (dla indeksów nawigacji)
  const allEmps = useMemo(() => groups.flatMap(({ members }) => members), [groups]);

  const getDefaultValue = (emp, day) => {
    const dw = new Date(year, month - 1, day).getDay();
    return (dw === 0 || dw === 6) ? 'W' : 'I';
  };

  const getValue = useCallback((emp, day) => {
    const key = `${emp.id}_${day}`;
    return entries[key] !== undefined ? entries[key] : getDefaultValue(emp, day);
  }, [entries, year, month]);

  const saveCell = async (empId, day, raw) => {
    const val = raw.trim().toUpperCase() || getDefaultValue(employees.find(e => e.id === empId), day);
    setEntries(prev => ({ ...prev, [`${empId}_${day}`]: val }));
    await supabase.from('schedule_entries').upsert(
      { employee_id: empId, year, month, day, value: val, updated_at: new Date().toISOString(), updated_by: user?.name },
      { onConflict: 'employee_id,year,month,day' }
    );
  };

  const commitEdit = (empIdx, day, value) => {
    const emp = allEmps[empIdx];
    if (emp) saveCell(emp.id, day, value ?? editValue);
    setEditingCell(null);
  };

  const startEdit = (empIdx, day, initChar = null) => {
    if (!isAdmin) return;
    const emp = allEmps[empIdx];
    if (!emp) return;
    const current = getValue(emp, day);
    const def = getDefaultValue(emp, day);
    setEditingCell({ empIdx, day });
    setEditValue(initChar !== null ? initChar : (current === def ? '' : current));
    setSelectedCell({ empIdx, day });
  };

  // Keyboard navigation na kontenerze
  const handleContainerKeyDown = (e) => {
    if (!selectedCell || !isAdmin) return;
    const { empIdx, day } = selectedCell;

    if (editingCell) return; // input sam obsługuje klawisze

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
    else if (e.key === 'Enter' || e.key === 'F2') startEdit(empIdx, day);
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      const emp = allEmps[empIdx];
      if (emp) saveCell(emp.id, day, getDefaultValue(emp, day));
      e.preventDefault();
    }
    else if (e.key === 'Escape') setSelectedCell(null);
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      startEdit(empIdx, day, e.key.toUpperCase());
    }
  };

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); };

  if (loading) return <div className="loader">Ładowanie grafiku…</div>;

  const btnStyle = { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '8px 16px', fontSize: '18px', cursor: 'pointer', fontWeight: 700 };
  const thBase  = { padding: '4px 2px', fontSize: '11px', fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap', border: '1px solid var(--border)' };
  const nameColW = 150;
  const dayColW  = 38;

  const todayDay = today.getFullYear() === year && today.getMonth() + 1 === month ? today.getDate() : null;

  return (
    <div>
      {/* Nawigacja */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        <button style={btnStyle} onClick={prevMonth}>‹</button>
        <div style={{ fontWeight: 700, fontSize: '17px', minWidth: '200px', textAlign: 'center' }}>
          {MONTH_NAMES[month - 1]} {year}
        </div>
        <button style={btnStyle} onClick={nextMonth}>›</button>
        <div style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-tertiary)' }}>
          Dni robocze: <strong>{workingDays}</strong> · Norma: <strong>{norm} h</strong>
          {isAdmin && <span> · Klik lub strzałki + pisz</span>}
        </div>
      </div>

      {/* Legenda */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '10px' }}>
        {[['W','Wolne'],['UW','Urlop'],['L4','Choroba'],['NN','Nieobecny'],['I','Planowany'],['8','Godz. pracy'],['6+8','Start+Godz']].map(([sym, label]) => {
          const st = getCellStyle(sym, false);
          return (
            <div key={sym} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 600 }}>
              <span style={{ background: st.bg, color: st.color, padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.07)' }}>{sym}</span>
              <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
            </div>
          );
        })}
      </div>

      {/* Tabela */}
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleContainerKeyDown}
        style={{ overflowX: 'auto', borderRadius: '12px', boxShadow: '0 1px 8px rgba(0,0,0,0.07)', border: '1px solid var(--border)', outline: 'none' }}
      >
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: `${nameColW + days.length * dayColW + 160}px` }}>
          <thead>
            <tr>
              <th style={{ ...thBase, width: `${nameColW}px`, position: 'sticky', left: 0, zIndex: 2, background: '#e1e8ed', textAlign: 'left', paddingLeft: '8px' }}>Pracownik</th>
              {days.map(d => {
                const dw = new Date(year, month - 1, d).getDay();
                const isWe = dw === 0 || dw === 6;
                const isToday = d === todayDay;
                return (
                  <th key={d} style={{ ...thBase, width: `${dayColW}px`, background: isToday ? '#007AFF' : isWe ? '#f8d7da' : '#e1e8ed', color: isToday ? '#fff' : isWe ? '#721c24' : '#1a1a2e' }}>
                    <div>{d}</div>
                    <div style={{ fontSize: '9px', fontWeight: 500 }}>{DAY_NAMES[dw]}</div>
                  </th>
                );
              })}
              <th style={{ ...thBase, width: '46px', background: '#e8f5e9', color: '#1b5e20' }}>Σ godz.</th>
              <th style={{ ...thBase, width: '46px', background: '#fff8e1', color: '#6d4c00' }}>Norma</th>
              <th style={{ ...thBase, width: '46px', background: '#fce4ec', color: '#880e4f' }}>Różn.</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ g, members }) => {
              const grpColor = GROUP_COLORS[g] || '#455a64';
              return [
                <tr key={`grp-${g}`}>
                  <td colSpan={daysInMonth + 4} style={{ background: grpColor, color: '#fff', fontWeight: 700, fontSize: '11px', padding: '5px 10px', letterSpacing: '0.3px' }}>
                    ▸ {g}
                  </td>
                </tr>,
                ...members.map((emp) => {
                  const empIdx = allEmps.indexOf(emp);
                  const totalHours = days.reduce((sum, d) => sum + parseHours(getValue(emp, d)), 0);
                  const diff = totalHours - norm;
                  const rowBg = empIdx % 2 === 0 ? '#ffffff' : '#f7fafd';
                  return (
                    <tr key={emp.id}>
                      <td style={{ width: `${nameColW}px`, position: 'sticky', left: 0, zIndex: 1, background: rowBg, fontWeight: 600, fontSize: '12px', padding: '0 8px', height: '28px', border: '1px solid var(--border)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {emp.name}
                      </td>
                      {days.map(d => {
                        const dw = new Date(year, month - 1, d).getDay();
                        const isWe = dw === 0 || dw === 6;
                        const val = getValue(emp, d);
                        const cs = getCellStyle(val, isWe);
                        const isEditing = editingCell?.empIdx === empIdx && editingCell?.day === d;
                        const isSelected = !isEditing && selectedCell?.empIdx === empIdx && selectedCell?.day === d;
                        return (
                          <td key={d}
                            onClick={() => { setSelectedCell({ empIdx, day: d }); containerRef.current?.focus(); }}
                            onDoubleClick={() => startEdit(empIdx, d)}
                            style={{
                              background: isSelected ? '#e3f2fd' : cs.bg,
                              color: cs.color,
                              textAlign: 'center', fontWeight: 700, fontSize: '11px',
                              border: isSelected ? '2px solid #007AFF' : '1px solid rgba(0,0,0,0.06)',
                              cursor: isAdmin ? 'pointer' : 'default',
                              padding: 0, height: '28px', width: `${dayColW}px`,
                              boxSizing: 'border-box',
                            }}>
                            {isEditing ? (
                              <input
                                ref={inputRef}
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={() => commitEdit(empIdx, d)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') { commitEdit(empIdx, d); setSelectedCell({ empIdx, day: d }); containerRef.current?.focus(); }
                                  if (e.key === 'Escape') { setEditingCell(null); containerRef.current?.focus(); }
                                  if (e.key === 'Tab') { e.preventDefault(); commitEdit(empIdx, d); setSelectedCell({ empIdx, day: Math.min(d + 1, daysInMonth) }); containerRef.current?.focus(); }
                                  if (e.key === 'ArrowRight' && e.target.selectionEnd === e.target.value.length) { commitEdit(empIdx, d); setSelectedCell({ empIdx, day: Math.min(d + 1, daysInMonth) }); containerRef.current?.focus(); }
                                  if (e.key === 'ArrowLeft' && e.target.selectionStart === 0) { commitEdit(empIdx, d); setSelectedCell({ empIdx, day: Math.max(d - 1, 1) }); containerRef.current?.focus(); }
                                }}
                                style={{ width: '100%', height: '100%', border: 'none', background: '#fff', textAlign: 'center', fontSize: '11px', fontWeight: 700, padding: 0, outline: '2px solid #007AFF', boxSizing: 'border-box' }}
                              />
                            ) : val}
                          </td>
                        );
                      })}
                      {/* Σ godzin */}
                      <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '12px', background: '#e8f5e9', color: '#1b5e20', border: '1px solid rgba(0,0,0,0.08)', padding: '0 2px' }}>
                        {totalHours > 0 ? totalHours : '—'}
                      </td>
                      {/* Norma */}
                      <td style={{ textAlign: 'center', fontWeight: 600, fontSize: '11px', background: '#fff8e1', color: '#6d4c00', border: '1px solid rgba(0,0,0,0.08)' }}>
                        {norm}
                      </td>
                      {/* Różnica */}
                      <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '11px', background: totalHours === 0 ? '#fafafa' : diff >= 0 ? '#e8f5e9' : '#fce4ec', color: totalHours === 0 ? '#aaa' : diff >= 0 ? '#1b5e20' : '#c62828', border: '1px solid rgba(0,0,0,0.08)' }}>
                        {totalHours === 0 ? '—' : (diff >= 0 ? '+' : '') + diff}
                      </td>
                    </tr>
                  );
                }),
              ];
            })}

            {/* Wiersze podsumowania */}
            {[
              { label: 'Obecni', bg: '#004b79', color: '#fff', fn: (d) => employees.filter(e => isPresent(getValue(e, d))).length },
              { label: 'L4', bg: '#fcf3cf', color: '#856404', fn: (d) => countSymbol(employees, getValue, d, 'L4') },
              { label: 'Urlopy (UW)', bg: '#d6eaf8', color: '#0c5460', fn: (d) => countSymbol(employees, getValue, d, 'UW') },
              { label: 'Nieob. (NN)', bg: '#fadbd8', color: '#721c24', fn: (d) => countSymbol(employees, getValue, d, 'NN') },
            ].map(({ label, bg, color, fn }) => (
              <tr key={label}>
                <td style={{ position: 'sticky', left: 0, zIndex: 1, background: bg, color, fontWeight: 700, fontSize: '11px', padding: '0 8px', height: '24px', border: '1px solid rgba(0,0,0,0.1)' }}>
                  {label}
                </td>
                {days.map(d => {
                  const cnt = fn(d);
                  return (
                    <td key={d} style={{ textAlign: 'center', fontWeight: 700, fontSize: '11px', background: bg, color, border: '1px solid rgba(0,0,0,0.08)' }}>
                      {cnt || ''}
                    </td>
                  );
                })}
                <td colSpan={3} style={{ background: bg, border: '1px solid rgba(0,0,0,0.08)' }} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: '11px', color: 'var(--text-quaternary)', marginTop: '8px', textAlign: 'right' }}>
        {employees.length} pracowników · {MONTH_NAMES[month - 1]} {year} · strzałki do nawigacji
      </div>
    </div>
  );
}
