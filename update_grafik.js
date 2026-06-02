const fs = require('fs');
let code = fs.readFileSync('react-app/src/components/GrafikView.jsx', 'utf8');

// Update VALUE_STYLE
code = code.replace(/const VALUE_STYLE = \{[\s\S]*?\};\n/, `const VALUE_STYLE = {
  'W':  { bg: '#fbfbfb', color: '#bbbbbb' },
  'UW': { bg: '#e1f5fe', color: '#0277bd' },
  'L4': { bg: '#fff9c4', color: '#fbc02d' },
  'NN': { bg: '#fce4ec', color: '#c2185b' },
  'I':  { bg: '#f3e5f5', color: '#7b1fa2' },
};\n`);

// Update getCellStyle
code = code.replace("if (!v) return { bg: isWeekendOrHoliday ? '#fdf2f2' : '#fff', color: '#999' };", "if (!v) return { bg: isWeekendOrHoliday ? '#fcfcfc' : '#fff', color: '#ccc' };");
code = code.replace("if (v.includes('+')) return { bg: '#ffe0b2', color: '#e65100' };", "if (v.includes('+')) return { bg: '#fff3e0', color: '#e65100' };");
code = code.replace("if (!isNaN(parseFloat(v.replace(',', '.')))) return { bg: '#d4edda', color: '#155724' };", "if (!isNaN(parseFloat(v.replace(',', '.')))) return { bg: '#e8f5e9', color: '#2e7d32' };");

// Update base styling variables
code = code.replace("const thBase  = { padding: '8px 2px', fontSize: '11px', fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap', border: '1px solid var(--border)' };", "const thBase  = { padding: '4px 2px', fontSize: '10px', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap', border: '1px solid rgba(0,0,0,0.04)' };");
code = code.replace("const nameColW = 160;", "const nameColW = 140;");
code = code.replace("const dayColW  = 38;", "const dayColW  = 28;");

// Update Employee Column TH
code = code.replace("borderRight: '2px solid var(--border)'", "borderRight: '1px solid rgba(0,0,0,0.08)'");
code = code.replace("background: '#f2f2f7'", "background: '#fafafa'");
code = code.replace("color: '#1c1c1e'", "color: '#333'");
code = code.replace("paddingLeft: '12px'", "paddingLeft: '8px'");

// Update Weekend/Holiday headers
code = code.replace("let bg = '#f2f2f7';", "let bg = '#fafafa';");
code = code.replace("let color = '#1c1c1e';", "let color = '#333';");
code = code.replace("else if (hol) { bg = '#ffefef'; color = '#d70015'; }", "else if (hol) { bg = '#fcfcfc'; color = '#d70015'; }");
code = code.replace("else if (isWe) { bg = '#f8d7da'; color = '#721c24'; }", "else if (isWe) { bg = '#fcfcfc'; color = '#d70015'; }");

// Day header fonts
code = code.replace("fontSize: '12px'", "fontSize: '11px'");
code = code.replace("fontSize: '9px', fontWeight: 600, opacity: 0.8", "fontSize: '8px', fontWeight: 500, opacity: 0.7");

// Update Stats THs
const oldStatsTh = `              {/* Statystyki po prawej */}
              <th style={{ ...thBase, width: '46px', background: '#e8f5e9', color: '#1b5e20', borderLeft: '2px solid var(--border)' }}>Σ h</th>
              <th style={{ ...thBase, width: '46px', background: '#fff8e1', color: '#6d4c00' }}>Norma</th>
              <th style={{ ...thBase, width: '46px', background: '#fce4ec', color: '#880e4f' }}>Różn.</th>
              <th style={{ ...thBase, width: '40px', background: '#fcf3cf', color: '#856404', fontSize: '10px' }}>L4</th>
              <th style={{ ...thBase, width: '40px', background: '#d6eaf8', color: '#0c5460', fontSize: '10px' }}>UW</th>
              <th style={{ ...thBase, width: '40px', background: '#fadbd8', color: '#721c24', fontSize: '10px' }}>NN</th>`;
const newStatsTh = `              {/* Statystyki po prawej */}
              <th style={{ ...thBase, width: '40px', background: '#f5f9f5', color: '#2e7d32', borderLeft: '1px solid rgba(0,0,0,0.08)' }}>Σ h</th>
              <th style={{ ...thBase, width: '40px', background: '#fffcf5', color: '#f57f17' }}>Norma</th>
              <th style={{ ...thBase, width: '40px', background: '#fdf5f6', color: '#c62828' }}>Różn.</th>
              <th style={{ ...thBase, width: '30px', background: '#fff9c4', color: '#fbc02d', fontSize: '9px' }}>L4</th>
              <th style={{ ...thBase, width: '30px', background: '#e1f5fe', color: '#0277bd', fontSize: '9px' }}>UW</th>
              <th style={{ ...thBase, width: '30px', background: '#fce4ec', color: '#c2185b', fontSize: '9px' }}>NN</th>`;
code = code.replace(oldStatsTh, newStatsTh);

// Update Group row
const oldGroupRow = `                  <td colSpan={daysInMonth + 7} style={{ background: grpColor, color: '#fff', fontWeight: 700, fontSize: '12px', padding: '6px 12px', letterSpacing: '0.5px' }}>
                    {g}
                  </td>`;
const newGroupRow = `                  <td colSpan={daysInMonth + 7} style={{ background: '#fdfdfd', color: grpColor, fontWeight: 700, fontSize: '10px', padding: '4px 8px', letterSpacing: '0.5px', borderBottom: \`1px solid \${grpColor}40\`, borderTop: \`1px solid \${grpColor}40\`, textTransform: 'uppercase' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: grpColor }} />
                      {g}
                    </div>
                  </td>`;
code = code.replace(oldGroupRow, newGroupRow);

// Update TR height
code = code.replace("height: '32px'", "height: '26px'");

// Update Employee TD
const oldEmpTd = `                      <td style={{ width: \`\${nameColW}px\`, position: 'sticky', left: 0, zIndex: 1, background: rowBg, fontWeight: 600, fontSize: '12px', padding: '0 12px', border: '1px solid var(--border)', borderRight: '2px solid var(--border)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>`;
const newEmpTd = `                      <td style={{ width: \`\${nameColW}px\`, position: 'sticky', left: 0, zIndex: 1, background: rowBg, fontWeight: 500, fontSize: '11px', padding: '0 8px', border: '1px solid rgba(0,0,0,0.04)', borderRight: '1px solid rgba(0,0,0,0.08)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>`;
code = code.replace(oldEmpTd, newEmpTd);

// Update Cell TD styling
code = code.replace("border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)'", "border: isSelected ? '2px solid var(--accent)' : '1px solid rgba(0,0,0,0.04)'");
code = code.replace("fontWeight: 700, fontSize: '11px'", "fontWeight: 600, fontSize: '10px'");

// Update Input styling
code = code.replace("fontSize: '12px', fontWeight: 800", "fontSize: '11px', fontWeight: 700");

// Update Stats TDs
const oldStatsTd = `                      {/* Σ godzin */}
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
                      </td>`;
const newStatsTd = `                      {/* Σ godzin */}
                      <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '11px', background: '#f5f9f5', color: '#2e7d32', border: '1px solid rgba(0,0,0,0.04)', borderLeft: '1px solid rgba(0,0,0,0.08)', padding: '0 2px' }}>
                        {totalHours > 0 ? totalHours : '—'}
                      </td>
                      {/* Norma */}
                      <td style={{ textAlign: 'center', fontWeight: 600, fontSize: '10px', background: '#fffcf5', color: '#f57f17', border: '1px solid rgba(0,0,0,0.04)' }}>
                        {norm}
                      </td>
                      {/* Różnica */}
                      <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '10px', background: totalHours === 0 ? '#fafafa' : diff >= 0 ? '#f5f9f5' : '#fdf5f6', color: totalHours === 0 ? '#ccc' : diff >= 0 ? '#2e7d32' : '#c62828', border: '1px solid rgba(0,0,0,0.04)' }}>
                        {totalHours === 0 ? '—' : (diff >= 0 ? '+' : '') + diff}
                      </td>
                      {/* Stats: L4, UW, NN */}
                      <td style={{ textAlign: 'center', fontWeight: 600, fontSize: '10px', background: l4Count > 0 ? '#fff9c4' : '#fafafa', color: '#fbc02d', border: '1px solid rgba(0,0,0,0.04)' }}>
                        {l4Count || ''}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 600, fontSize: '10px', background: uwCount > 0 ? '#e1f5fe' : '#fafafa', color: '#0277bd', border: '1px solid rgba(0,0,0,0.04)' }}>
                        {uwCount || ''}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 600, fontSize: '10px', background: nnCount > 0 ? '#fce4ec' : '#fafafa', color: '#c2185b', border: '1px solid rgba(0,0,0,0.04)' }}>
                        {nnCount || ''}
                      </td>`;
code = code.replace(oldStatsTd, newStatsTd);

// Summary rows
code = code.replace("border: '1px solid rgba(0,0,0,0.1)'", "border: '1px solid rgba(0,0,0,0.04)'");
code = code.replace("border: '1px solid rgba(0,0,0,0.08)'", "border: '1px solid rgba(0,0,0,0.04)'");

// Write back
fs.writeFileSync('react-app/src/components/GrafikView.jsx', code);
