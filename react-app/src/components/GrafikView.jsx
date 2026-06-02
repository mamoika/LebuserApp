import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { isHoliday } from '../utils/holidays';
import * as XLSX from 'xlsx';
import { ChevronLeft, ChevronRight, Download, Printer, Info } from 'lucide-react';

const MONTH_NAMES = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
const DAY_NAMES = ['Nd','Pn','Wt','Śr','Cz','Pt','So'];

const VALUE_STYLE = {
  'W':  { bg: '#f4f6f7', color: '#aaaaaa' },
  'UW': { bg: '#d6eaf8', color: '#0c5460' },
  'L4': { bg: '#fcf3cf', color: '#856404' },
  'NN': { bg: '#fadbd8', color: '#721c24' },
  'I':  { bg: '#ebdef0', color: '#432874' },
};

function getCellStyle(value, isWeekendOrHoliday) {
  const v = String(value || '').trim().toUpperCase();
  if (!v) return { bg: isWeekendOrHoliday ? '#fdf2f2' : '#fff', color: '#999' };
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

function countSymbolForEmployee(emp, days, getValue, sym) {
  return days.filter(d => String(getValue(emp, d) || '').toUpperCase() === sym).length;
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
  const [groupData, setGroupData] = useState([]);
  const [entries, setEntries] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedCell, setSelectedCell] = useState(null);
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef(null);
  const containerRef = useRef(null);

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
    setLoading(true);
    const [{ data: emps }, { data: sched }, { data: grps }] = await Promise.all([
      supabase.from('employees').select('*').eq('active', true).order('sort_order').order('name'),
      supabase.from('schedule_entries').select('*').eq('year', year).eq('month', month),
      supabase.from('groups').select('*').order('sort_order').order('name')
    ]);
    setEmployees(emps || []);
    setGroupData(grps || []);
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
    const res = groupData.map(g => ({ g: g.name, color: g.color, members: employees.filter(e => e.group_name === g.name) }))
      .filter(({ members }) => members.length > 0);
    
    const extraNames = [...new Set(employees.map(e => e.group_name))].filter(name => !groupData.find(g => g.name === name));
    extraNames.forEach(name => {
      const members = employees.filter(e => e.group_name === name);
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

  const handleContainerKeyDown = (e) => {
    if (!selectedCell || !isAdmin) return;
    const { empIdx, day } = selectedCell;

    if (editingCell) return;

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

  const exportToExcel = () => {
    const wsData = [];
    const headers = ['Pracownik', ...days.map(d => `${d}`), 'Σ godz', 'Norma', 'Różn.', 'L4', 'UW', 'NN'];
    wsData.push([`${MONTH_NAMES[month - 1]} ${year}`, `Dni robocze: ${workingDays}`, `Norma: ${norm}h`]);
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
    wsData.push(['Podsumowanie']);
    const obecniRow = ['Obecni', ...days.map(d => employees.filter(e => isPresent(getValue(e, d))).length)];
    const l4Row = ['L4', ...days.map(d => countSymbol(employees, getValue, d, 'L4'))];
    const uwRow = ['Urlopy (UW)', ...days.map(d => countSymbol(employees, getValue, d, 'UW'))];
    const nnRow = ['Nieob. (NN)', ...days.map(d => countSymbol(employees, getValue, d, 'NN'))];
    
    wsData.push(obecniRow);
    wsData.push(l4Row);
    wsData.push(uwRow);
    wsData.push(nnRow);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Grafik");
    XLSX.writeFile(wb, `Grafik_${MONTH_NAMES[month-1]}_${year}.xlsx`);
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) return <div className="loader">Ładowanie grafiku…</div>;

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

  const thBase  = { padding: '8px 2px', fontSize: '11px', fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap', border: '1px solid var(--border)' };
  const nameColW = 160;
  const dayColW  = 38;

  const todayDay = today.getFullYear() === year && today.getMonth() + 1 === month ? today.getDate() : null;

  return (
    <div className="grafik-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Pasek nawigacji i akcji (Apple UI) */}
      <div className="print-hide" style={{ 
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
        background: 'var(--bg-card)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        padding: '12px 16px', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)'
      }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button style={btnStyle} onClick={prevMonth} onMouseOver={e=>e.currentTarget.style.background='var(--bg-secondary)'} onMouseOut={e=>e.currentTarget.style.background='var(--bg-card-solid)'}>
            <ChevronLeft size={16} /> Poprzedni
          </button>
          
          <div style={{ fontWeight: 800, fontSize: '18px', minWidth: '160px', textAlign: 'center', color: 'var(--text-primary)' }}>
            {MONTH_NAMES[month - 1]} {year}
          </div>
          
          <button style={btnStyle} onClick={nextMonth} onMouseOver={e=>e.currentTarget.style.background='var(--bg-secondary)'} onMouseOut={e=>e.currentTarget.style.background='var(--bg-card-solid)'}>
            Następny <ChevronRight size={16} />
          </button>
        </div>

        <div className="action-buttons" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)', padding: '6px 12px', borderRadius: '12px' }}>
            <Info size={14} />
            <span>Dni robocze: <strong style={{color:'var(--text-primary)'}}>{workingDays}</strong> | Norma: <strong style={{color:'var(--text-primary)'}}>{norm} h</strong></span>
          </div>
          <button style={btnStyle} onClick={exportToExcel} title="Eksportuj do Excela" onMouseOver={e=>e.currentTarget.style.background='var(--bg-secondary)'} onMouseOut={e=>e.currentTarget.style.background='var(--bg-card-solid)'}>
            <Download size={16} /> Excel
          </button>
          <button style={btnStyle} onClick={handlePrint} title="Drukuj do PDF" onMouseOver={e=>e.currentTarget.style.background='var(--bg-secondary)'} onMouseOut={e=>e.currentTarget.style.background='var(--bg-card-solid)'}>
            <Printer size={16} /> Drukuj
          </button>
        </div>
      </div>

      {/* Legenda */}
      <div className="print-hide" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', background: 'var(--bg-card-solid)', padding: '10px 16px', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        {[['W','Wolne'],['UW','Urlop'],['L4','Choroba'],['NN','Nieobecny'],['I','Planowany'],['8','Godz. pracy'],['6+8','Start+Godz']].map(([sym, label]) => {
          const st = getCellStyle(sym, false);
          return (
            <div key={sym} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600 }}>
              <span style={{ background: st.bg, color: st.color, padding: '2px 8px', borderRadius: '6px', border: '1px solid rgba(0,0,0,0.07)' }}>{sym}</span>
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
          boxShadow: 'var(--shadow-md)', border: '1px solid var(--border)', 
          outline: 'none', background: 'var(--bg-card-solid)' 
        }}
      >
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: `${nameColW + days.length * dayColW + 280}px`, width: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...thBase, width: `${nameColW}px`, position: 'sticky', left: 0, zIndex: 3, background: '#f2f2f7', textAlign: 'left', paddingLeft: '12px', color: '#1c1c1e', borderRight: '2px solid var(--border)' }}>Pracownik</th>
              {days.map(d => {
                const dateObj = new Date(year, month - 1, d);
                const dw = dateObj.getDay();
                const isWe = dw === 0 || dw === 6;
                const hol = isHoliday(dateObj);
                const isToday = d === todayDay;
                
                let bg = '#f2f2f7';
                let color = '#1c1c1e';
                if (isToday) { bg = 'var(--accent)'; color = '#fff'; }
                else if (hol) { bg = '#ffefef'; color = '#d70015'; }
                else if (isWe) { bg = '#f8d7da'; color = '#721c24'; }

                return (
                  <th key={d} title={hol ? hol.name : ''} style={{ ...thBase, width: `${dayColW}px`, background: bg, color: color, position: 'relative' }}>
                    <div style={{ fontSize: '12px' }}>{d}</div>
                    <div style={{ fontSize: '9px', fontWeight: 600, opacity: 0.8 }}>{DAY_NAMES[dw]}</div>
                    {hol && <div style={{ position: 'absolute', top: 0, right: 0, width: '4px', height: '4px', background: '#d70015', borderRadius: '50%', margin: '2px' }} />}
                  </th>
                );
              })}
              {/* Statystyki po prawej */}
              <th style={{ ...thBase, width: '46px', background: '#e8f5e9', color: '#1b5e20', borderLeft: '2px solid var(--border)' }}>Σ h</th>
              <th style={{ ...thBase, width: '46px', background: '#fff8e1', color: '#6d4c00' }}>Norma</th>
              <th style={{ ...thBase, width: '46px', background: '#fce4ec', color: '#880e4f' }}>Różn.</th>
              <th style={{ ...thBase, width: '40px', background: '#fcf3cf', color: '#856404', fontSize: '10px' }}>L4</th>
              <th style={{ ...thBase, width: '40px', background: '#d6eaf8', color: '#0c5460', fontSize: '10px' }}>UW</th>
              <th style={{ ...thBase, width: '40px', background: '#fadbd8', color: '#721c24', fontSize: '10px' }}>NN</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ g, color: grpColor, members }) => {
              return [
                <tr key={`grp-${g}`}>
                  <td colSpan={daysInMonth + 7} style={{ background: grpColor, color: '#fff', fontWeight: 700, fontSize: '12px', padding: '6px 12px', letterSpacing: '0.5px' }}>
                    {g}
                  </td>
                </tr>,
                ...members.map((emp) => {
                  const empIdx = allEmps.indexOf(emp);
                  const totalHours = days.reduce((sum, d) => sum + parseHours(getValue(emp, d)), 0);
                  const diff = totalHours - norm;
                  const l4Count = countSymbolForEmployee(emp, days, getValue, 'L4');
                  const uwCount = countSymbolForEmployee(emp, days, getValue, 'UW');
                  const nnCount = countSymbolForEmployee(emp, days, getValue, 'NN');
                  
                  const rowBg = empIdx % 2 === 0 ? '#ffffff' : '#fafafa';
                  return (
                    <tr key={emp.id} style={{ height: '32px' }}>
                      <td style={{ width: `${nameColW}px`, position: 'sticky', left: 0, zIndex: 1, background: rowBg, fontWeight: 600, fontSize: '12px', padding: '0 12px', border: '1px solid var(--border)', borderRight: '2px solid var(--border)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {emp.name}
                      </td>
                      {days.map(d => {
                        const dateObj = new Date(year, month - 1, d);
                        const isWeOrHol = dateObj.getDay() === 0 || dateObj.getDay() === 6 || isHoliday(dateObj);
                        const val = getValue(emp, d);
                        const cs = getCellStyle(val, isWeOrHol);
                        const isEditing = editingCell?.empIdx === empIdx && editingCell?.day === d;
                        const isSelected = !isEditing && selectedCell?.empIdx === empIdx && selectedCell?.day === d;
                        
                        return (
                          <td key={d}
                            onClick={() => { setSelectedCell({ empIdx, day: d }); containerRef.current?.focus(); }}
                            onDoubleClick={() => startEdit(empIdx, d)}
                            style={{
                              background: isSelected ? '#e5f1ff' : cs.bg,
                              color: cs.color,
                              textAlign: 'center', fontWeight: 700, fontSize: '11px',
                              border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                              cursor: isAdmin ? 'text' : 'default',
                              padding: 0, width: `${dayColW}px`,
                              boxSizing: 'border-box',
                              position: 'relative'
                            }}>
                            {isEditing ? (
                              <input
                                ref={inputRef}
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={() => commitEdit(empIdx, d)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') { commitEdit(empIdx, d); setSelectedCell({ empIdx, day: Math.min(d + 1, daysInMonth) }); e.preventDefault(); containerRef.current?.focus(); }
                                  if (e.key === 'Escape') { setEditingCell(null); containerRef.current?.focus(); }
                                  if (e.key === 'Tab') { e.preventDefault(); commitEdit(empIdx, d); setSelectedCell({ empIdx, day: Math.min(d + 1, daysInMonth) }); containerRef.current?.focus(); }
                                  if (e.key === 'ArrowRight' && e.target.selectionEnd === e.target.value.length) { commitEdit(empIdx, d); setSelectedCell({ empIdx, day: Math.min(d + 1, daysInMonth) }); containerRef.current?.focus(); }
                                  if (e.key === 'ArrowLeft' && e.target.selectionStart === 0) { commitEdit(empIdx, d); setSelectedCell({ empIdx, day: Math.max(d - 1, 1) }); containerRef.current?.focus(); }
                                }}
                                style={{ width: '100%', height: '100%', border: 'none', background: '#fff', textAlign: 'center', fontSize: '12px', fontWeight: 800, padding: 0, outline: '2px solid var(--accent)', color: 'var(--accent)', boxSizing: 'border-box' }}
                              />
                            ) : val}
                          </td>
                        );
                      })}
                      {/* Σ godzin */}
                      <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '12px', background: '#e8f5e9', color: '#1b5e20', border: '1px solid var(--border)', borderLeft: '2px solid var(--border)', padding: '0 2px' }}>
                        {totalHours > 0 ? totalHours : '—'}
                      </td>
                      {/* Norma */}
                      <td style={{ textAlign: 'center', fontWeight: 600, fontSize: '11px', background: '#fff8e1', color: '#6d4c00', border: '1px solid var(--border)' }}>
                        {norm}
                      </td>
                      {/* Różnica */}
                      <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '11px', background: totalHours === 0 ? '#fafafa' : diff >= 0 ? '#e8f5e9' : '#fce4ec', color: totalHours === 0 ? '#aaa' : diff >= 0 ? '#1b5e20' : '#c62828', border: '1px solid var(--border)' }}>
                        {totalHours === 0 ? '—' : (diff >= 0 ? '+' : '') + diff}
                      </td>
                      {/* Stats: L4, UW, NN */}
                      <td style={{ textAlign: 'center', fontWeight: 600, fontSize: '11px', background: l4Count > 0 ? '#fcf3cf' : '#fafafa', color: '#856404', border: '1px solid var(--border)' }}>
                        {l4Count || ''}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 600, fontSize: '11px', background: uwCount > 0 ? '#d6eaf8' : '#fafafa', color: '#0c5460', border: '1px solid var(--border)' }}>
                        {uwCount || ''}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 600, fontSize: '11px', background: nnCount > 0 ? '#fadbd8' : '#fafafa', color: '#721c24', border: '1px solid var(--border)' }}>
                        {nnCount || ''}
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
              <tr key={label} style={{ height: '28px' }}>
                <td style={{ position: 'sticky', left: 0, zIndex: 1, background: bg, color, fontWeight: 700, fontSize: '11px', padding: '0 12px', border: '1px solid rgba(0,0,0,0.1)', borderRight: '2px solid var(--border)' }}>
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
                <td colSpan={6} style={{ background: bg, border: '1px solid rgba(0,0,0,0.08)' }} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="print-hide" style={{ fontSize: '11px', color: 'var(--text-quaternary)', textAlign: 'right', paddingRight: '4px' }}>
        {employees.length} pracowników · Apple UI Engine · Skróty klawiszowe aktywne
      </div>
    </div>
  );
}
