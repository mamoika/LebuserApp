const fs = require('fs');
let code = fs.readFileSync('react-app/src/components/GrafikView.jsx', 'utf8');

// 1. Add formatTotalHours function
const formatFnCode = `function formatTotalHours(totalNum) {
  if (!totalNum) return '';
  const h = Math.floor(totalNum);
  const m = Math.round((totalNum - h) * 60);
  if (m === 0) return h;
  return \`\${h}:\${m.toString().padStart(2, '0')}\`;
}

export default function GrafikView`;

code = code.replace("export default function GrafikView", formatFnCode);

// 2. Add 'Godziny łącznie' row under 'Obecni'
const oldSummary = `            {/* Wiersze podsumowania */}
            {[
              { label: 'Obecni', bg: '#004b79', color: '#fff', fn: (d) => employees.filter(e => isPresent(getValue(e, d))).length },`;

const newSummary = `            {/* Wiersze podsumowania */}
            {[
              { label: 'Obecni', bg: '#004b79', color: '#fff', fn: (d) => employees.filter(e => isPresent(getValue(e, d))).length },
              { label: 'Godz. łącznie', bg: '#f5f9f5', color: '#2e7d32', fn: (d) => {
                  const total = employees.reduce((sum, e) => sum + parseHours(getValue(e, d)), 0);
                  return formatTotalHours(total);
                }
              },`;

code = code.replace(oldSummary, newSummary);

// 3. Update the Σ godzin rendering in employee rows to use formatTotalHours
code = code.replace("{totalHours > 0 ? totalHours : '—'}", "{totalHours > 0 ? formatTotalHours(totalHours) : '—'}");

// 4. Remove the footer text
const footerTextPattern = /<div className="print-hide" style=\{\{ fontSize: '11px', color: 'var\(--text-quaternary\)', textAlign: 'right', paddingRight: '4px' \}\}>\s*\{employees\.length\} pracowników · Apple UI Engine · Skróty klawiszowe aktywne\s*<\/div>/;
code = code.replace(footerTextPattern, "");

fs.writeFileSync('react-app/src/components/GrafikView.jsx', code);
