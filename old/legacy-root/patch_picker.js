const fs = require('fs');
let code = fs.readFileSync('react-app/src/components/GrafikView.jsx', 'utf8');

// 1. Add END to VALUE_STYLE
code = code.replace(/const VALUE_STYLE = \{([\s\S]*?)\};\n/, `const VALUE_STYLE = {
$1  'END': { bg: '#eeeeee', color: '#888888' },
};\n`);

// 2. parseHours and isPresent
code = code.replace(/if \(!v \|\| v === 'W' \|\| v === 'UW' \|\| v === 'L4' \|\| v === 'NN' \|\| v === 'I'\)/, `if (!v || v === 'W' || v === 'UW' || v === 'L4' || v === 'NN' || v === 'I' || v === 'END')`);
code = code.replace(/return v && v !== 'W' && v !== 'UW' && v !== 'L4' && v !== 'NN' && v !== 'I' && v !== '';/, `return v && v !== 'W' && v !== 'UW' && v !== 'L4' && v !== 'NN' && v !== 'I' && v !== 'END' && v !== '';`);

// 3. FloatingValuePicker component
const pickerCode = `
function FloatingValuePicker({ selectedValue, onSelect }) {
  const [customValue, setCustomValue] = useState('');
  useEffect(() => { setCustomValue(''); }, [selectedValue]);

  const btns = ['8', '10', '12', 'W', 'UW', 'L4', 'NN', 'I', 'END'];
  return (
    <div className="print-hide" style={{
      position: 'fixed', bottom: '32px', left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      border: '1px solid rgba(0,0,0,0.1)', borderRadius: '16px', padding: '10px 14px',
      boxShadow: '0 10px 40px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.5) inset', display: 'flex', alignItems: 'center', gap: '8px', zIndex: 9999
    }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', marginRight: '4px', textTransform: 'uppercase' }}>Wybierz:</div>
      {btns.map(b => (
        <button key={b} onClick={() => onSelect(b)} style={{
          background: selectedValue === b ? 'var(--accent)' : 'var(--bg-card-solid)',
          color: selectedValue === b ? '#fff' : 'var(--text-primary)',
          border: selectedValue === b ? '1px solid var(--accent)' : '1px solid rgba(0,0,0,0.06)', 
          borderRadius: '10px', padding: '8px 12px',
          fontSize: '13px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.04)',
          transition: 'all 0.15s'
        }}>
          {b}
        </button>
      ))}
      <div style={{ width: '1px', height: '24px', background: 'rgba(0,0,0,0.1)', margin: '0 4px' }} />
      <input 
        value={customValue} onChange={e => setCustomValue(e.target.value)}
        placeholder="Inna..."
        onKeyDown={e => { if(e.key === 'Enter' && customValue.trim()) onSelect(customValue.trim()); }}
        style={{ width: '64px', padding: '8px 10px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', fontSize: '13px', fontWeight: 600, textAlign: 'center', outline: 'none', background: 'var(--bg-card-solid)' }}
      />
      <button onClick={() => { if(customValue.trim()) onSelect(customValue.trim()); }} style={{
        background: 'transparent', color: 'var(--accent)', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '14px', padding: '6px 8px'
      }}>Zapisz</button>
    </div>
  );
}
`;

code = code.replace(/export default function GrafikView/, pickerCode + '\nexport default function GrafikView');

// 4. In GrafikView, add handlePickerSelect
const handlePickerCode = `  const handlePickerSelect = (val) => {
    if (!selectedCell || !isAdmin) return;
    const { empIdx, day } = selectedCell;
    const emp = allEmps[empIdx];
    if (emp) saveCell(emp.id, day, val);
    setSelectedCell({ empIdx, day: Math.min(day + 1, daysInMonth) });
    containerRef.current?.focus();
  };`;
code = code.replace("const prevMonth = () =>", handlePickerCode + "\n\n  const prevMonth = () =>");

// 5. Render FloatingValuePicker
const pickerRenderCode = `
      {/* Pasek nawigacji i akcji (Apple UI) */}`;

code = code.replace("{/* Pasek nawigacji i akcji (Apple UI) */}", `      {isAdmin && selectedCell && !editingCell && (
        <FloatingValuePicker 
          selectedValue={allEmps[selectedCell.empIdx] ? getValue(allEmps[selectedCell.empIdx], selectedCell.day) : null} 
          onSelect={handlePickerSelect} 
        />
      )}\n\n      {/* Pasek nawigacji i akcji (Apple UI) */}`);

// 6. Legenda
const oldLegend = `[['W','Wolne'],['UW','Urlop'],['L4','Choroba'],['NN','Nieobecny'],['I','Planowany'],['8','Godz. pracy'],['6+8','Start+Godz']]`;
const newLegend = `[['W','Wolne'],['UW','Urlop'],['L4','Choroba'],['NN','Nieob.'],['I','Planowany'],['END','Zakończono'],['8','Godz.'],['6+8','Start+Godz']]`;
code = code.replace(oldLegend, newLegend);

// Write changes
fs.writeFileSync('react-app/src/components/GrafikView.jsx', code);
