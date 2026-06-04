// Import danych z arkusza Google (lebuser.xlsx) → Supabase daily_costs
// DRY-RUN domyślnie. Zapis dopiero z:  node import_lebuser.mjs --write [MM]
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://suvyqbyrcpzrtxbnuunu.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1dnlxYnlyY3B6cnR4Ym51dW51Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNDQyNjAsImV4cCI6MjA5NTkyMDI2MH0.WrmLqJT-aNUb1a1uppvxzIJGeYMlL_jOy3BJvh4dfck'
);

const WRITE = process.argv.includes('--write');
const ONLY = process.argv.find(a => /^\d{2}$/.test(a)); // np. "02" → tylko luty

const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; };
const dateOf = (cell) => { const m = String(cell).match(/^(\d{2})\.(\d{2})\.(\d{2})/); return m ? `20${m[3]}-${m[2]}-${m[1]}` : null; };

// Kolumny sekcji KOSZTÓW
const C = { date: 0, fiatK: 2, isuzuK: 5, mercK: 8, ivecoK: 11, elec: 15, gasProdK: 20, gasHeatK: 24, waterK: 28, inne: 32 };

const wb = XLSX.readFile('/tmp/lebuser.xlsx');
const months = ['01.26', '02.26', '03.26', '04.26', '05.26']; // czerwiec już w bazie

const allRows = {};
for (const name of months) {
  const mm = name.slice(0, 2);
  if (ONLY && ONLY !== mm) continue;
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
  const importCars = mm !== '01'; // styczeń: auta trip-style → pomijamy

  // nagłówek sekcji wydajności (col1 ~ 'ZD ... kg') — granica sekcji kosztów
  let hdr = -1;
  for (let r = 0; r < aoa.length; r++) { const c1 = String(aoa[r][1] || ''); if (/kg/i.test(c1) && /ZD/i.test(c1)) { hdr = r; break; } }
  const costEnd = hdr >= 0 ? hdr : aoa.length;

  // sekcja kosztów: tylko wiersze PRZED sekcją wydajności
  const byDate = {};
  for (let r = 4; r < costEnd; r++) {
    if (/SUMA|Ø|PRZELICZNIK/i.test(String(aoa[r][C.date]))) break;
    const d = dateOf(aoa[r][C.date]); if (!d) continue;
    const row = { entry_date: d };
    const set = (k, v) => { if (v !== null) row[k] = v; };
    set('elec_end', num(aoa[r][C.elec]));
    set('water_end', num(aoa[r][C.waterK]));
    // gaz pominięty na życzenie — odczyty liczników gazu nie są importowane
    if (importCars) {
      set('fiat_end', num(aoa[r][C.fiatK])); set('isuzu_end', num(aoa[r][C.isuzuK]));
      set('merc_end', num(aoa[r][C.mercK])); set('iveco_end', num(aoa[r][C.ivecoK]));
    }
    set('other_costs', num(aoa[r][C.inne]));
    byDate[d] = row;
  }

  // sekcja wydajności (tonaż): wiersze po nagłówku hdr
  if (hdr >= 0) {
    for (let r = hdr + 1; r < aoa.length; r++) {
      const d = dateOf(aoa[r][C.date]); if (!d) { if (/SUMA|Ø/.test(String(aoa[r][0]))) break; continue; }
      const zd1 = num(aoa[r][1]), zd2 = num(aoa[r][2]), pr = num(aoa[r][3]);
      if (zd1 || zd2 || pr) {
        byDate[d] = byDate[d] || { entry_date: d };
        if (zd1) byDate[d].ton_zd1 = zd1;
        if (zd2) byDate[d].ton_zd2 = zd2;
        if (pr) byDate[d].ton_pralki = pr;
      }
    }
  }

  // tylko wiersze z jakimkolwiek polem ponad entry_date
  const rows = Object.values(byDate).filter(r => Object.keys(r).length > 1).sort((a, b) => a.entry_date.localeCompare(b.entry_date));
  allRows[name] = rows;
}

// Podsumowanie
const fld = (rows, k) => rows.filter(r => r[k] != null).length;
console.log(`\n========== ${WRITE ? '✍️  ZAPIS' : '🔍 DRY-RUN (bez zapisu)'} ==========\n`);
for (const [name, rows] of Object.entries(allRows)) {
  const kg = rows.reduce((s, r) => s + (r.ton_zd1 || 0) + (r.ton_zd2 || 0) + (r.ton_pralki || 0), 0);
  console.log(`${name}: ${rows.length} wierszy | elec:${fld(rows,'elec_end')} gazP:${fld(rows,'gas_prod_end')} gazG:${fld(rows,'gas_heat_end')} woda:${fld(rows,'water_end')} fiat:${fld(rows,'fiat_end')} tonaż-dni:${rows.filter(r=>r.ton_zd1||r.ton_zd2||r.ton_pralki).length} inne:${fld(rows,'other_costs')} | ∑kg=${kg.toFixed(0)}`);
  // pokaż 2 przykładowe wiersze z danymi
  rows.filter(r => r.elec_end || r.ton_zd2).slice(0, 2).forEach(r => console.log('     np.', JSON.stringify(r)));
}

if (WRITE) {
  for (const [name, rows] of Object.entries(allRows)) {
    if (!rows.length) continue;
    const payload = rows.map(r => ({ ...r, updated_at: new Date().toISOString() }));
    const { error } = await supabase.from('daily_costs').upsert(payload, { onConflict: 'entry_date' });
    console.log(error ? `❌ ${name}: ${error.message}` : `✅ ${name}: zapisano ${rows.length} wierszy`);
  }
} else {
  console.log('\n→ To był podgląd. Aby zapisać: node import_lebuser.mjs --write   (lub jeden miesiąc: --write 02)');
}
