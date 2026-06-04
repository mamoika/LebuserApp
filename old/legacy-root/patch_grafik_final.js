const fs = require('fs');
let code = fs.readFileSync('react-app/src/components/GrafikView.jsx', 'utf8');

// 1. Employee Name + Default Hours
const oldEmpName = `<td style={{ width: \`\${nameColW}px\`, position: 'sticky', left: 0, zIndex: 1, background: rowBg, fontWeight: 500, fontSize: '11px', padding: '0 8px', border: '1px solid rgba(0,0,0,0.04)', borderRight: '1px solid rgba(0,0,0,0.08)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {emp.name}
                      </td>`;
const newEmpName = `<td style={{ width: \`\${nameColW}px\`, position: 'sticky', left: 0, zIndex: 1, background: rowBg, padding: '0 8px', border: '1px solid rgba(0,0,0,0.04)', borderRight: '1px solid rgba(0,0,0,0.08)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                          <span style={{ fontWeight: 500, fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emp.name}</span>
                          <span style={{ fontSize: '9px', color: 'var(--text-quaternary)', fontWeight: 600, flexShrink: 0, marginLeft: '4px' }}>{emp.default_start}-{emp.default_end}</span>
                        </div>
                      </td>`;
code = code.replace(oldEmpName, newEmpName);

// 2. Remove L4, UW, NN summary rows
const oldSummaryRows = `              { label: 'Obecni', bg: '#004b79', color: '#fff', fn: (d) => employees.filter(e => isPresent(getValue(e, d))).length },
              { label: 'Godz. łącznie', bg: '#f5f9f5', color: '#2e7d32', fn: (d) => {
                  const total = employees.reduce((sum, e) => sum + parseHours(getValue(e, d)), 0);
                  return formatTotalHours(total);
                }
              },
              { label: 'L4', bg: '#fcf3cf', color: '#856404', fn: (d) => countSymbol(employees, getValue, d, 'L4') },
              { label: 'Urlopy (UW)', bg: '#d6eaf8', color: '#0c5460', fn: (d) => countSymbol(employees, getValue, d, 'UW') },
              { label: 'Nieob. (NN)', bg: '#fadbd8', color: '#721c24', fn: (d) => countSymbol(employees, getValue, d, 'NN') },
            ]`;
const newSummaryRows = `              { label: 'Obecni', bg: '#004b79', color: '#fff', fn: (d) => employees.filter(e => isPresent(getValue(e, d))).length },
              { label: 'Godz. łącznie', bg: '#f5f9f5', color: '#2e7d32', fn: (d) => {
                  const total = employees.reduce((sum, e) => sum + parseHours(getValue(e, d)), 0);
                  return formatTotalHours(total);
                }
              }
            ]`;
code = code.replace(oldSummaryRows, newSummaryRows);

// 3. Add hint about fractions below legend
const oldLegendBlock = `            </div>
          </div>
        ))}
      </div>
      
    </div>`;
const newLegendBlock = `            </div>
          </div>
        ))}
      </div>

      <div className="print-hide" style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '12px', background: 'var(--bg-card)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)', display: 'inline-block' }}>
        💡 <strong>Wskazówka:</strong> Ułamki godzinowe (np. pół godziny) wpisuj z użyciem kropki lub przecinka (np. <strong>7.5</strong> lub <strong>7,5</strong>). System automatycznie przeliczy to na <strong>7h 30m</strong> we wszystkich sumach.
      </div>
      
    </div>`;
code = code.replace(oldLegendBlock, newLegendBlock);

fs.writeFileSync('react-app/src/components/GrafikView.jsx', code);
