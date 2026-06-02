import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef(null);

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

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
    if (editingCell && inputRef.current) inputRef.current.focus();
  }, [editingCell]);

  const getDefaultValue = (emp, day) => {
    const dw = new Date(year, month - 1, day).getDay();
    return (dw === 0 || dw === 6) ? 'W' : 'I';
  };

  const getValue = (emp, day) => {
    const key = `${emp.id}_${day}`;
    return entries[key] !== undefined ? entries[key] : getDefaultValue(emp, day);
  };

  const saveCell = async (empId, day, raw) => {
    const val = raw.trim().toUpperCase() || getDefaultValue(employees.find(e => e.id === empId), day);
    const key = `${empId}_${day}`;
    setEntries(prev => ({ ...prev, [key]: val }));
    await supabase.from('schedule_entries').upsert(
      { employee_id: empId, year, month, day, value: val, updated_at: new Date().toISOString(), updated_by: user?.name },
      { onConflict: 'employee_id,year,month,day' }
    );
  };

  const startEdit = (emp, day) => {
    if (!isAdmin) return;
    const current = getValue(emp, day);
    const def = getDefaultValue(emp, day);
    setEditingCell({ empId: emp.id, day });
    setEditValue(current === def ? '' : current);
  };

  const commitEdit = (empId, day) => {
    saveCell(empId, day, editValue);
    setEditingCell(null);
  };

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); };

  const groups = GROUP_ORDER
    .map(g => ({ g, members: employees.filter(e => e.group_name === g) }))
    .filter(({ members }) => members.length > 0);
  const extraGroups = [...new Set(employees.map(e => e.group_name))].filter(g => !GROUP_ORDER.includes(g));
  extraGroups.forEach(g => { const m = employees.filter(e => e.group_name === g); if (m.length) groups.push({ g, members: m }); });

  if (loading) return <div className="loader">Ładowanie grafiku…</div>;

  const btnStyle = { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '8px 16px', fontSize: '18px', cursor: 'pointer', fontWeight: 700, color: 'var(--text-primary)' };
  const thBase = { padding: '4px 2px', fontSize: '11px', fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap', border: '1px solid var(--border)', userSelect: 'none' };
  const nameColW = 150;
  const dayColW = 38;

  return (
    <div>
      {/* Nawigacja miesiąca */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <button style={btnStyle} onClick={prevMonth}>‹</button>
        <div style={{ fontWeight: 700, fontSize: '17px', minWidth: '200px', textAlign: 'center' }}>
          {MONTH_NAMES[month - 1]} {year}
        </div>
        <button style={btnStyle} onClick={nextMonth}>›</button>
        {isAdmin && (
          <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-tertiary)' }}>
            Kliknij komórkę aby edytować
          </div>
        )}
      </div>

      {/* Legenda */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
        {[['W','Wolne'],['UW','Urlop'],['L4','Choroba'],['NN','Nieobecny'],['I','Planowany'],['8','Godziny pracy'],['6+8','Start+Godz']].map(([sym, label]) => {
          const style = getCellStyle(sym, false);
          return (
            <div key={sym} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 600 }}>
              <span style={{ background: style.bg, color: style.color, padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.06)' }}>{sym}</span>
              <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
            </div>
          );
        })}
      </div>

      {/* Tabela */}
      <div style={{ overflowX: 'auto', borderRadius: '12px', boxShadow: '0 1px 8px rgba(0,0,0,0.07)', border: '1px solid var(--border)' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '12px', tableLayout: 'fixed', minWidth: `${nameColW + days.length * dayColW + 60}px` }}>
          <thead>
            <tr>
              <th style={{ ...thBase, width: `${nameColW}px`, position: 'sticky', left: 0, zIndex: 2, background: '#e1e8ed', textAlign: 'left', paddingLeft: '8px' }}>
                Pracownik
              </th>
              {days.map(d => {
                const dw = new Date(year, month - 1, d).getDay();
                const isWe = dw === 0 || dw === 6;
                return (
                  <th key={d} style={{ ...thBase, width: `${dayColW}px`, background: isWe ? '#f8d7da' : '#e1e8ed', color: isWe ? '#721c24' : '#1a1a2e' }}>
                    <div>{d}</div>
                    <div style={{ fontSize: '9px', fontWeight: 500 }}>{DAY_NAMES[dw]}</div>
                  </th>
                );
              })}
              <th style={{ ...thBase, width: '55px', background: '#fff8e1', color: '#6d4c00' }}>Σ godz.</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ g, members }) => {
              const grpColor = GROUP_COLORS[g] || '#455a64';
              return [
                <tr key={`grp-${g}`}>
                  <td colSpan={daysInMonth + 2} style={{ background: grpColor, color: '#fff', fontWeight: 700, fontSize: '11px', padding: '5px 10px', letterSpacing: '0.3px' }}>
                    ▸ {g}
                  </td>
                </tr>,
                ...members.map((emp, idx) => {
                  const totalHours = days.reduce((sum, d) => sum + parseHours(getValue(emp, d)), 0);
                  const rowBg = idx % 2 === 0 ? '#ffffff' : '#f7fafd';
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
                        const isEditing = editingCell?.empId === emp.id && editingCell?.day === d;
                        return (
                          <td key={d}
                            onClick={() => startEdit(emp, d)}
                            style={{ background: cs.bg, color: cs.color, textAlign: 'center', fontWeight: 700, fontSize: '11px', border: '1px solid rgba(0,0,0,0.06)', cursor: isAdmin ? 'pointer' : 'default', padding: 0, height: '28px', width: `${dayColW}px` }}>
                            {isEditing ? (
                              <input
                                ref={inputRef}
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={() => commitEdit(emp.id, d)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') commitEdit(emp.id, d);
                                  if (e.key === 'Escape') setEditingCell(null);
                                  if (e.key === 'Tab') { e.preventDefault(); commitEdit(emp.id, d); startEdit(emp, d + 1 <= daysInMonth ? d + 1 : d); }
                                }}
                                style={{ width: '100%', height: '100%', border: '2px solid var(--accent)', borderRadius: '0', background: '#fff', textAlign: 'center', fontSize: '11px', fontWeight: 700, padding: 0, outline: 'none', boxSizing: 'border-box' }}
                              />
                            ) : (
                              val
                            )}
                          </td>
                        );
                      })}
                      <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '12px', background: '#fffde7', color: '#6d4c00', border: '1px solid var(--border)', padding: '0 4px' }}>
                        {totalHours > 0 ? totalHours : '—'}
                      </td>
                    </tr>
                  );
                }),
              ];
            })}

            {/* Wiersz: Obecni */}
            <tr>
              <td style={{ position: 'sticky', left: 0, zIndex: 1, background: '#004b79', color: '#fff', fontWeight: 700, fontSize: '11px', padding: '0 8px', height: '26px', border: '1px solid #003a5c' }}>
                Obecni w pracy
              </td>
              {days.map(d => {
                const count = employees.filter(emp => isPresent(getValue(emp, d))).length;
                return (
                  <td key={d} style={{ textAlign: 'center', fontWeight: 700, fontSize: '12px', background: '#004b79', color: '#fff', border: '1px solid #003a5c' }}>
                    {count || ''}
                  </td>
                );
              })}
              <td style={{ background: '#004b79', border: '1px solid #003a5c' }} />
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: '11px', color: 'var(--text-quaternary)', marginTop: '10px', textAlign: 'right' }}>
        {employees.length} pracowników aktywnych · {MONTH_NAMES[month - 1]} {year}
      </div>
    </div>
  );
}
