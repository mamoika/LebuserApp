import { parse } from 'csv-parse/sync';
import { supabase } from './src/js/supabaseClient.js';

const sheetUrl = (sheet) => `https://docs.google.com/spreadsheets/d/1GhE9mUQvhazY24jOp7-IxcaUQvJzhtOSkFKK0TM75PA/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`;

async function fetchCsv(sheet) {
  const res = await fetch(sheetUrl(sheet));
  const text = await res.text();
  return parse(text, { columns: true, skip_empty_lines: true });
}

function parseNumber(val) {
  if (!val) return null;
  const num = parseFloat(String(val).replace(',', '.'));
  return isNaN(num) ? null : num;
}

async function migrate() {
  console.log("Rozpoczęcie migracji danych...");

  // 1. Trasy
  console.log("Pobieranie tras...");
  const routesCsv = await fetchCsv('Trasy');
  for (const row of routesCsv) {
    if (!row.Nazwa) continue;
    await supabase.from('routes').upsert({ id: parseInt(row.ID), name: row.Nazwa });
  }
  console.log(`Zaimportowano ${routesCsv.length} tras.`);

  // 2. Kierowcy
  console.log("Pobieranie kierowców...");
  const driversCsv = await fetchCsv('Kierowcy');
  for (const row of driversCsv) {
    if (!row.Nazwa) continue;
    await supabase.from('drivers').insert({ name: row.Nazwa, routes: row.Trasy });
  }
  console.log(`Zaimportowano ${driversCsv.length} kierowców.`);

  // 3. Klienci
  console.log("Pobieranie klientów...");
  const clientsCsv = await fetchCsv('Klienci');
  for (const row of clientsCsv) {
    if (!row['Nazwa klienta']) continue;
    
    // Header for route id might be empty string in google output due to header row configuration
    // But it's the second column in CSV. So let's find the route id column.
    // Object.keys(row)[1] usually gives the second column.
    const keys = Object.keys(row);
    const routeIdStr = row[keys[1]];
    const routeId = parseInt(routeIdStr);
    
    const lat = parseNumber(row.Lat);
    const lng = parseNumber(row.Lng);
    
    await supabase.from('clients').insert({
      name: row['Nazwa klienta'],
      route_id: isNaN(routeId) ? null : routeId,
      sort_order: parseInt(row.Kolejnosc) || 9999,
      lat: lat,
      lng: lng
    });
  }
  console.log(`Zaimportowano ${clientsCsv.length} klientów.`);

  // 4. Dane (Harmonogram)
  console.log("Pobieranie zamówień (Dane)...");
  const dataCsv = await fetchCsv('Dane');
  for (const row of dataCsv) {
    if (!row.ID) continue;
    const keys = Object.keys(row);
    // Based on visual inspection of the headers:
    // 0: ID, 1: WeekKey, 2: Klient, 3: DzienPrzyjazdu, 4: DzienOdbioru, 5: Odebrane, 6: DataDodania, 
    // 7: (PickWeek), 8: (Waga), 9: (Route), 10: Typ, 11: DodanePrzez, 12: OdebranePrzez, 13: DataOdbioru, 14: Komentarz, 15: Pilne, 16: SortOrder
    
    const pickWeek = row[keys[7]];
    const weightStr = row[keys[8]];
    const routeStr = row[keys[9]];

    const addedAtStr = row.DataDodania;
    // Data in google is e.g. "2026-05-30 16:50:07" or something. Needs to be passed directly to Postgres or parsed.
    let addedAt = null;
    if (addedAtStr) {
      // replace space with T if needed, or PG will parse it automatically
      addedAt = addedAtStr.replace(' ', 'T') + 'Z'; 
    }

    const isDone = row.Odebrane === 'TRUE' || row.Odebrane === 'true';
    const isUrgent = row.Pilne === 'TRUE' || row.Pilne === 'true';
    
    await supabase.from('entries').insert({
      id: row.ID,
      week_key: row.WeekKey,
      client_name: row.Klient,
      arr_day: parseInt(row.DzienPrzyjazdu) || 0,
      pick_day: parseInt(row.DzienOdbioru) || 0,
      done: isDone,
      pick_week_key: pickWeek || row.WeekKey,
      weight: parseNumber(weightStr),
      route_id: parseInt(routeStr) || null,
      type: row.Typ || 'P',
      added_by: row.DodanePrzez || null,
      picked_by: row.OdebranePrzez || null,
      picked_at: row.DataOdbioru === 'null' ? null : row.DataOdbioru,
      comment: row.Komentarz === 'null' ? null : row.Komentarz,
      urgent: isUrgent,
      sort_order: parseInt(row.SortOrder) || 9999
    });
  }
  console.log(`Zaimportowano ${dataCsv.length} wpisów zamówień.`);
  
  console.log("Migracja zakończona sukcesem!");
}

migrate().catch(err => {
  console.error("Błąd podczas migracji:", err);
});
