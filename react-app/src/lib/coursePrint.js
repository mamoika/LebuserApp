import { getTripCourse } from './courseRpc';
import {
  dirtyEntriesForStop, fmtTime, splitCleanTasks, sumTaskWeight,
} from './courseTaskHelpers';
import { routeNamesForTrip } from './tripUiHelpers';
import { toastError } from './toast';
import { VEHICLE_LABELS, vehicleEndColumn } from './vehicles';

function escHtml(value) {
  return String(value ?? '').replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
}

function fmtDuration(startIso, endIso) {
  if (!startIso) return '';
  const end = endIso ? new Date(endIso) : new Date();
  const mins = Math.max(0, Math.round((end - new Date(startIso)) / 60000));
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  if (!hours) return `${minutes} min`;
  if (!minutes) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

function entriesForStop(stop, entries) {
  const ids = new Set((stop?.tasks || []).map(task => task.entry_id).filter(Boolean));
  if (!ids.size) return [];
  return entries.filter(entry => ids.has(entry.id));
}

function pickedBaskets(stopEntries) {
  const value = stopEntries.find(entry => entry.picked_baskets != null)?.picked_baskets;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 1;
}

function distanceForTrip(trip, dailyCosts = []) {
  if (!trip?.end_km) return null;
  const field = vehicleEndColumn(trip.car);
  const current = Number(trip.end_km);
  const previous = dailyCosts
    .filter(row => row.entry_date < trip.trip_date)
    .find(row => row[field] != null && row[field] !== '');
  const previousValue = previous ? Number(String(previous[field]).replace(',', '.')) : NaN;
  if (!Number.isFinite(current) || !Number.isFinite(previousValue)) return null;
  const distance = current - previousValue;
  return distance >= 0 ? Number(distance.toFixed(1)) : null;
}

function stopPrintData(stop, entries, tripDate) {
  const stopEntries = entriesForStop(stop, entries);
  const clean = splitCleanTasks(stop?.tasks || []);
  const hasPickup = clean.pickup.length > 0;
  const pralnia = hasPickup && clean.pendingPickup.length === 0 && clean.completedPickup.length > 0;
  const delivered = hasPickup && clean.pendingDelivery.length === 0 && clean.completedDelivery.length > 0;
  const pickedTime = fmtTime(
    clean.pickup.find(task => task.completed_at)?.completed_at
    || stopEntries.find(entry => entry.picked_at)?.picked_at,
  );
  const deliveredTime = fmtTime(
    clean.delivery.find(task => task.completed_at)?.completed_at
    || stopEntries.find(entry => entry.delivered_at)?.delivered_at,
  );
  const dirtyEntries = dirtyEntriesForStop(entries, stop.client_name, tripDate);
  return {
    client_name: stop.client_name,
    pralnia,
    delivered,
    pickedTime,
    deliveredTime,
    kg: hasPickup ? sumTaskWeight(clean.pickup) : '',
    cleanBaskets: pralnia ? pickedBaskets(stopEntries) : '',
    dirtyBaskets: dirtyEntries.reduce((sum, entry) => sum + (Number(entry.trolleys) || 1), 0) || '',
    dirtyTimes: [...new Set(dirtyEntries.map(entry => fmtTime(entry.added_at)).filter(Boolean))].join(', '),
    note: stop.note || '',
  };
}

function stopRowHtml(data, index) {
  return `<tr>
    <td>${index + 2}</td>
    <td class="l">${escHtml(data.client_name)}</td>
    <td>${data.pralnia ? data.pickedTime || '✓' : '—'}</td>
    <td>${data.delivered ? data.deliveredTime || '✓' : '—'}</td>
    <td>${data.kg}</td>
    <td>${data.cleanBaskets}</td>
    <td>${data.dirtyBaskets}</td>
    <td>${data.dirtyTimes || '—'}</td>
    <td class="l">${escHtml(data.note)}</td>
  </tr>`;
}

function openPrintWindow(html) {
  const win = window.open('', '_blank');
  if (!win) {
    toastError('Wyłącz blokadę wyskakujących okienek, aby wydrukować');
    return false;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
  return true;
}

const PRINT_STYLES = `
  body{font-family:Arial,sans-serif;padding:24px;color:#000}
  h1{font-size:18px;text-align:center;margin:0 0 14px}
  h2{font-size:14px;margin:18px 0 8px}
  .head,.summary{display:flex;flex-wrap:wrap;gap:6px 24px;font-size:13px;margin-bottom:14px}
  .head div,.summary div{min-width:150px}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px}
  th,td{border:1px solid #000;padding:5px 6px;text-align:center}
  td.l,th.l{text-align:left}
  thead{background:#eee}
  .route-marker{background:#f3f3f3}
  @media print{button{display:none}}
`;

async function loadTripStops(sessionToken, trip) {
  const data = await getTripCourse(sessionToken, trip.id);
  return data.stops || [];
}

export async function printTripWorkCard({
  sessionToken,
  trip,
  entries = [],
  routeMap = {},
  driverName,
  dailyCosts = [],
}) {
  if (!trip || trip.status !== 'finished') {
    toastError('Karta jest dostępna po zakończeniu kursu');
    return;
  }
  const stops = await loadTripStops(sessionToken, trip);
  const stopRows = stops.map((stop, index) => stopRowHtml(stopPrintData(stop, entries, trip.trip_date), index)).join('');
  const startRow = `<tr class="route-marker">
    <td>1</td><td class="l"><b>Pralnia</b></td>
    <td>${escHtml(fmtTime(trip.started_at) || '—')}</td><td>Start kursu</td>
    <td></td><td></td><td></td><td></td><td class="l">Wyjazd z pralni</td>
  </tr>`;
  const endRow = `<tr class="route-marker">
    <td>${stops.length + 2}</td><td class="l"><b>Pralnia</b></td>
    <td></td><td>${escHtml(fmtTime(trip.ended_at) || '—')}</td>
    <td></td><td></td><td></td><td></td><td class="l">Koniec kursu / powrót do pralni</td>
  </tr>`;
  const distance = distanceForTrip(trip, dailyCosts);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Karta pracy kierowcy</title><style>${PRINT_STYLES}</style></head><body>
    <h1>KARTA PRACY KIEROWCY</h1>
    <div class="head">
      <div><b>Kierowca:</b> ${escHtml(trip.driver_name || driverName)}</div>
      <div><b>Data:</b> ${escHtml(trip.trip_date)}</div>
      <div><b>Trasy:</b> ${escHtml(routeNamesForTrip(trip, routeMap))}</div>
      <div><b>Samochód:</b> ${escHtml(VEHICLE_LABELS[trip.car] || trip.car || '')}</div>
      <div><b>Start:</b> ${escHtml(fmtTime(trip.started_at) || '')}</div>
      <div><b>Koniec:</b> ${escHtml(fmtTime(trip.ended_at) || '')}</div>
      <div><b>Czas kursu:</b> ${escHtml(fmtDuration(trip.started_at, trip.ended_at))}</div>
      <div><b>KM zgłoszony:</b> ${trip.end_km ?? ''}</div>
      <div><b>Przejazd:</b> ${distance !== null ? `${distance} km` : '—'}</div>
    </div>
    <table>
      <thead><tr><th>Lp.</th><th class="l">Hotel/Klient</th><th>Z pralni godz.</th><th>Dostarczono godz.</th><th>Kg</th><th>Wózki z pralni</th><th>Brudne wózki</th><th>Brudne godz.</th><th class="l">Uwagi</th></tr></thead>
      <tbody>${startRow}${stopRows}${endRow}</tbody>
    </table>
    <p style="margin-top:40px;font-size:13px">Podpis kierowcy: ______________________</p>
  </body></html>`;
  openPrintWindow(html);
}

export async function printDayWorkCard({
  sessionToken,
  trip,
  allTrips = [],
  entries = [],
  routeMap = {},
  driverName,
  dailyCosts = [],
}) {
  if (!trip?.trip_date || trip.status !== 'finished') {
    toastError('Karta dnia jest dostępna po zakończeniu kursu');
    return;
  }
  const sameDriver = row => (trip.driver_id
    ? String(row.driver_id) === String(trip.driver_id)
    : (row.driver_name || '') === (trip.driver_name || driverName || ''));
  const dayTrips = allTrips
    .filter(row => row.status === 'finished' && row.trip_date === trip.trip_date && sameDriver(row))
    .sort((a, b) => new Date(a.started_at || `${a.trip_date}T00:00:00`) - new Date(b.started_at || `${b.trip_date}T00:00:00`));
  if (!dayTrips.length) {
    toastError('Brak zakończonych kursów dla tego dnia');
    return;
  }

  const merged = new Map();
  for (const dayTrip of dayTrips) {
    const stops = await loadTripStops(sessionToken, dayTrip);
    stops.forEach(stop => {
      const key = stop.client_name || '—';
      if (!merged.has(key)) merged.set(key, { stop, data: stopPrintData(stop, entries, dayTrip.trip_date) });
      else {
        const existing = merged.get(key);
        const next = stopPrintData(stop, entries, dayTrip.trip_date);
        if (next.pralnia && !existing.data.pralnia) existing.data = { ...existing.data, ...next };
        if (next.delivered) existing.data.delivered = true;
        if (next.kg && !existing.data.kg) existing.data.kg = next.kg;
        if (next.dirtyBaskets) existing.data.dirtyBaskets = String(Number(existing.data.dirtyBaskets || 0) + Number(next.dirtyBaskets || 0));
        if (next.dirtyTimes) {
          existing.data.dirtyTimes = [...new Set([existing.data.dirtyTimes, next.dirtyTimes].filter(Boolean))].join(', ');
        }
      }
    });
  }

  const dayStops = [...merged.values()].map(item => item.data);
  const cleanStops = dayStops.filter(row => row.kg);
  const dirtyStops = dayStops.filter(row => row.dirtyBaskets);
  const totalKg = Number(cleanStops.reduce((sum, row) => sum + (Number(row.kg) || 0), 0).toFixed(1));
  const cleanTrolleys = cleanStops.reduce((sum, row) => sum + (Number(row.cleanBaskets) || 0), 0);
  const dirtyTrolleys = dirtyStops.reduce((sum, row) => sum + (Number(row.dirtyBaskets) || 0), 0);
  const firstTrip = dayTrips[0];
  const lastTrip = dayTrips[dayTrips.length - 1];

  const tripRows = dayTrips.map((dayTrip, index) => {
    const distance = distanceForTrip(dayTrip, dailyCosts);
    return `<tr>
      <td>${index + 1}</td>
      <td>${escHtml(VEHICLE_LABELS[dayTrip.car] || dayTrip.car || '')}</td>
      <td>${escHtml(routeNamesForTrip(dayTrip, routeMap))}</td>
      <td>${escHtml(fmtTime(dayTrip.started_at) || '—')}</td>
      <td>${escHtml(fmtTime(dayTrip.ended_at) || '—')}</td>
      <td>${escHtml(fmtDuration(dayTrip.started_at, dayTrip.ended_at))}</td>
      <td>${dayTrip.end_km ?? ''}</td>
      <td>${distance !== null ? distance : '—'}</td>
    </tr>`;
  }).join('');

  const stopRows = dayStops.map((row, index) => stopRowHtml(row, index)).join('');
  const startRow = `<tr class="route-marker">
    <td>1</td><td class="l"><b>Pralnia</b></td>
    <td>${escHtml(fmtTime(firstTrip.started_at) || '—')}</td><td>Start dnia</td>
    <td></td><td></td><td></td><td></td><td class="l">Pierwszy wyjazd z pralni</td>
  </tr>`;
  const endRow = `<tr class="route-marker">
    <td>${dayStops.length + 2}</td><td class="l"><b>Pralnia</b></td>
    <td></td><td>${escHtml(fmtTime(lastTrip.ended_at) || '—')}</td>
    <td></td><td></td><td></td><td></td><td class="l">Koniec dnia / ostatni powrót</td>
  </tr>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Karta dnia kierowcy</title><style>${PRINT_STYLES}</style></head><body>
    <h1>KARTA DNIA KIEROWCY</h1>
    <div class="head">
      <div><b>Kierowca:</b> ${escHtml(trip.driver_name || driverName)}</div>
      <div><b>Data:</b> ${escHtml(trip.trip_date)}</div>
      <div><b>Start dnia:</b> ${escHtml(fmtTime(firstTrip.started_at) || '')}</div>
      <div><b>Koniec dnia:</b> ${escHtml(fmtTime(lastTrip.ended_at) || '')}</div>
      <div><b>Kursów/aut:</b> ${dayTrips.length}</div>
    </div>
    <div class="summary">
      <div><b>Punkty razem:</b> ${dayStops.length}</div>
      <div><b>Z czystym:</b> ${cleanStops.length}</div>
      <div><b>Z brudnym:</b> ${dirtyStops.length}</div>
      <div><b>Kg:</b> ${totalKg}</div>
      <div><b>Wózki z pralni:</b> ${cleanTrolleys}</div>
      <div><b>Brudne wózki:</b> ${dirtyTrolleys}</div>
    </div>
    <h2>Odcinki / auta</h2>
    <table>
      <thead><tr><th>Odc.</th><th>Samochód</th><th>Trasy</th><th>Start</th><th>Koniec</th><th>Czas</th><th>KM zgłoszony</th><th>Przejazd km</th></tr></thead>
      <tbody>${tripRows}</tbody>
    </table>
    <h2>Punkty dnia</h2>
    <table>
      <thead><tr><th>Lp.</th><th class="l">Hotel/Klient</th><th>Z pralni godz.</th><th>Dostarczono godz.</th><th>Kg</th><th>Wózki z pralni</th><th>Brudne wózki</th><th>Brudne godz.</th><th class="l">Uwagi</th></tr></thead>
      <tbody>${startRow}${stopRows}${endRow}</tbody>
    </table>
    <p style="margin-top:40px;font-size:13px">Podpis kierowcy: ______________________</p>
  </body></html>`;
  openPrintWindow(html);
}
