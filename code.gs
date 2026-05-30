// ============================================================
//  PRALNIA – Harmonogram (BACKEND)
//  Wklej ten kod do pliku Code.gs w Apps Script
// ============================================================

const SHEET_NAME = 'Dane';
const CLIENTS_SHEET = 'Klienci';
const ROUTES_SHEET = 'Trasy';
const DAY_NAMES = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek'];

const BASE_LAT = 52.7229319;
const BASE_LNG = 15.2520164;

const GRAFIK_SPREADSHEET_ID = '1HLdnzsHWyQdKe6wpo6t29c3hjk6UETlA9Du7ylWFzsw';
const GRAFIK_SHEET_GID = 715483314;

function TEST_ZgodyGoogle() {
  SpreadsheetApp.openById(GRAFIK_SPREADSHEET_ID);
  console.log("Uprawnienia zostały pomyślnie zaktualizowane.");
}

function parseDateToKey(dateObj) {
  if (!(dateObj instanceof Date)) return String(dateObj);
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('LEBUSER Textilservice Sp. z o.o. – Harmonogram')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getGrafikDataForDate(dateStr) {
  try {
    const ss = SpreadsheetApp.openById(GRAFIK_SPREADSHEET_ID);
    let sheet = null;
    const sheets = ss.getSheets();
    for (let i = 0; i < sheets.length; i++) {
      if (sheets[i].getSheetId() === GRAFIK_SHEET_GID) { sheet = sheets[i]; break; }
    }
    if (!sheet) sheet = ss.getSheets()[0];

    const parts = dateStr.split('-');
    const dayNum = parseInt(parts[2], 10);
    const targetColIdx = 5 + dayNum;

    const data = sheet.getRange(1, 1, 40, 40).getValues();
    const result = { date: dateStr, day: dayNum, zd1: [], zd2: [], kierowcy: [] };
    let currentSection = '';

    for (let i = 4; i < data.length; i++) {
      const name = String(data[i][1]).trim();
      if (!name) continue;
      if (name.includes('ZD 1')) { currentSection = 'ZD 1'; continue; }
      if (name.includes('ZD 2')) { currentSection = 'ZD 2'; continue; }
      if (name.includes('KIEROWCY') || name.includes('FAHRER')) { currentSection = 'KIEROWCY'; continue; }
      if (name.includes('Obecni pracy') || name.includes('Godziny łącznie')) break;

      const defStart = data[i][3];
      const defEnd = data[i][4];
      const status = String(data[i][targetColIdx - 1]).trim();

      let timeRange = '';
      if (defStart && defEnd) {
        const formatTime = (t) => t instanceof Date ? t.toLocaleTimeString('pl-PL', {hour: '2-digit', minute:'2-digit'}) : String(t);
        timeRange = formatTime(defStart) + ' - ' + formatTime(defEnd);
      }

      const person = { name: name, status: status || 'W', defaultHours: timeRange };
      if (currentSection === 'ZD 1') result.zd1.push(person);
      else if (currentSection === 'ZD 2') result.zd2.push(person);
      else if (currentSection === 'KIEROWCY') result.kierowcy.push(person);
    }
    return result;
  } catch (e) {
    return { error: 'Błąd połączenia. Upewnij się, że odpaliłeś funkcję TEST_ZgodyGoogle. Szczegóły: ' + e.message };
  }
}

function initSheets() {
  const ss = SpreadsheetApp.getActive();
  if (!ss) return 'Błąd: Skrypt nie jest podpięty pod arkusz';

  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['ID', 'WeekKey', 'Klient', 'DzienPrzyjazdu', 'DzienOdbioru', 'Odebrane', 'DataDodania', 'PickWeekKey', 'Waga', 'Trasa']);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 10).setFontWeight('bold');
  }

  let rk = ss.getSheetByName(ROUTES_SHEET);
  if (!rk) {
    rk = ss.insertSheet(ROUTES_SHEET);
    rk.appendRow(['ID', 'Nazwa']);
    rk.setFrozenRows(1);
    rk.getRange(1, 1, 1, 2).setFontWeight('bold');
    const defaultRoutes = [
      [1, 'Codzienne (Pn-Pt)'], [2, 'Miasto Pn-Śr-Pt'], [3, 'Północ Wt-Czw']
    ];
    defaultRoutes.forEach(r => rk.appendRow(r));
  }

  let ck = ss.getSheetByName(CLIENTS_SHEET);
  if (!ck) {
    ck = ss.insertSheet(CLIENTS_SHEET);
    ck.appendRow(['Nazwa klienta', 'Trasa', 'Kolejnosc', 'Lat', 'Lng']);
    ck.setFrozenRows(1);
    const defaultClients = [
      ['Radisson', 1, 1, '', ''], ['Hilton', 2, 1, '', ''], ['Novotel', 3, 1, '', '']
    ];
    defaultClients.forEach(c => ck.appendRow(c));
  } else {
    const maxCols = ck.getMaxColumns();
    if (maxCols < 5) ck.insertColumnsAfter(maxCols, 5 - maxCols);
    if (ck.getRange(1, 3).getValue() === '') ck.getRange(1, 3).setValue('Kolejnosc').setFontWeight('bold');
    if (ck.getRange(1, 4).getValue() === '') ck.getRange(1, 4).setValue('Lat').setFontWeight('bold');
    if (ck.getRange(1, 5).getValue() === '') ck.getRange(1, 5).setValue('Lng').setFontWeight('bold');
  }
  return 'OK';
}

function getAppData() {
  const ss = SpreadsheetApp.getActive();
  if (!ss) return { clients: [], routes: [] };

  let rk = ss.getSheetByName(ROUTES_SHEET);
  let routes = [];
  if (rk) {
    const rData = rk.getDataRange().getValues();
    routes = rData.slice(1).map(r => ({ id: Number(r[0]), name: String(r[1]) }));
  }

  let ck = ss.getSheetByName(CLIENTS_SHEET);
  let clients = [];
  if (ck) {
    const cData = ck.getDataRange().getValues();
    clients = cData.slice(1).map((r, idx) => ({
      name: String(r[0]),
      route: Number(r[1]) || 1,
      order: r[2] !== '' && r[2] !== undefined ? Number(r[2]) : 9999 + idx,
      lat: r[3] !== '' && r[3] !== undefined ? parseFloat(String(r[3]).replace(',', '.')) : null,
      lng: r[4] !== '' && r[4] !== undefined ? parseFloat(String(r[4]).replace(',', '.')) : null
    })).filter(c => c.name && c.name.trim() !== '' && c.name !== 'undefined');

    clients.sort((a, b) => {
      if (a.route !== b.route) return a.route - b.route;
      return a.order - b.order;
    });
  }

  return { clients: clients, routes: routes };
}

function updateRoutesOrder(fromRouteId, fromNames, toRouteId, toNames) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(CLIENTS_SHEET);
  const data = sh.getDataRange().getValues();

  function processList(routeId, names) {
    for (let i = 1; i < data.length; i++) {
      const cName = String(data[i][0]).trim();
      const idx = names.indexOf(cName);
      if (idx !== -1) {
        sh.getRange(i + 1, 2).setValue(routeId);
        sh.getRange(i + 1, 3).setValue(idx + 1);
      }
    }
  }

  processList(fromRouteId, fromNames);
  if (fromRouteId !== toRouteId) processList(toRouteId, toNames);
  SpreadsheetApp.flush();
  return {ok: true};
}

function addRoute(name) {
  if (!name || !name.trim()) return { error: 'Pusta nazwa' };
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(ROUTES_SHEET);
  if (!sh) return { error: 'Brak arkusza tras' };
  const data = sh.getDataRange().getValues();
  let maxId = 0;
  for (let i = 1; i < data.length; i++) {
    let currentId = Number(data[i][0]);
    if (currentId > maxId) maxId = currentId;
  }
  const newId = maxId + 1;
  sh.appendRow([newId, name.trim()]);
  SpreadsheetApp.flush();
  return { ok: true, newId: newId };
}

function updateRouteName(id, newName) {
  if (!newName || !newName.trim()) return { error: 'Pusta nazwa' };
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(ROUTES_SHEET);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (Number(data[i][0]) === Number(id)) {
      sh.getRange(i + 1, 2).setValue(newName.trim());
      SpreadsheetApp.flush();
      return { ok: true };
    }
  }
  return { error: 'Nie znaleziono trasy' };
}

function removeRoute(id) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(ROUTES_SHEET);
  const clientsSheet = ss.getSheetByName(CLIENTS_SHEET);
  if (clientsSheet) {
    const clientsData = clientsSheet.getDataRange().getValues();
    for (let i = 1; i < clientsData.length; i++) {
      if (Number(clientsData[i][1]) === Number(id)) {
        return { error: 'Nie można usunąć trasy, do której są przypisani klienci' };
      }
    }
  }
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (Number(data[i][0]) === Number(id)) {
      sh.deleteRow(i + 1);
      SpreadsheetApp.flush();
      return { ok: true };
    }
  }
  return { error: 'Nie znaleziono trasy' };
}

function addClient(name, route) {
  if (!name || !name.trim()) return { error: 'Pusta nazwa' };
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(CLIENTS_SHEET);
  const existingData = sh.getDataRange().getValues().slice(1);
  if (existingData.map(r => String(r[0]).trim()).includes(name.trim())) return { error: 'Klient już istnieje' };
  sh.appendRow([name.trim(), Number(route) || 1, 9999, '', '']);
  return { ok: true };
}

function updateClient(oldName, newName, newRoute, lat, lng) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(CLIENTS_SHEET);
  const data = sh.getDataRange().getValues();
  const cleanOldName = String(oldName).trim();
  const cleanNewName = String(newName || '').trim();
  if (!cleanNewName) return { error: 'Pusta nazwa' };
  for (let i = 1; i < data.length; i++) {
    const currentName = String(data[i][0]).trim();
    if (currentName === cleanNewName && currentName !== cleanOldName) {
      return { error: 'Klient o tej nazwie już istnieje' };
    }
  }
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === cleanOldName) {
      sh.getRange(i + 1, 1).setValue(cleanNewName);
      const prevRoute = Number(data[i][1]);
      const nextRoute = Number(newRoute) || 1;
      sh.getRange(i + 1, 2).setValue(nextRoute);
      if (prevRoute !== nextRoute) sh.getRange(i + 1, 3).setValue(9999);
      let parsedLat = ''; let parsedLng = '';
      if (lat !== undefined && lat !== null && String(lat).trim() !== '') {
        let nLat = parseFloat(String(lat).replace(',', '.')); if (!isNaN(nLat)) parsedLat = nLat;
      }
      if (lng !== undefined && lng !== null && String(lng).trim() !== '') {
        let nLng = parseFloat(String(lng).replace(',', '.')); if (!isNaN(nLng)) parsedLng = nLng;
      }
      sh.getRange(i + 1, 4).setValue(parsedLat);
      sh.getRange(i + 1, 5).setValue(parsedLng);

      const entriesSheet = ss.getSheetByName(SHEET_NAME);
      if (entriesSheet) {
        const entriesData = entriesSheet.getDataRange().getValues();
        for (let j = 1; j < entriesData.length; j++) {
          if (String(entriesData[j][2]).trim() === cleanOldName) {
            entriesSheet.getRange(j + 1, 3).setValue(cleanNewName);
            entriesSheet.getRange(j + 1, 10).setValue(nextRoute);
          }
        }
      }

      SpreadsheetApp.flush();
      return { ok: true };
    }
  }
  return { error: 'Nie znaleziono klienta' };
}

function removeClient(name) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(CLIENTS_SHEET);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(name).trim()) {
      sh.deleteRow(i + 1);
      SpreadsheetApp.flush();
      return { ok: true };
    }
  }
  return { error: 'Nie znaleziono' };
}

function getEntriesForWeeks(weeks) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) return [];
  const data = sh.getDataRange().getValues();
  return data.slice(1).map(r => {
    let aKey = parseDateToKey(r[1]).trim();
    let pKey = r[7] ? parseDateToKey(r[7]).trim() : aKey;
    return {
      id: String(r[0]).trim(), weekKey: aKey, pickWeekKey: pKey, client: String(r[2]),
      arrDay: Number(r[3]), pickDay: Number(r[4]),
      done: r[5] === true || r[5] === 'TRUE' || String(r[5]).toUpperCase() === 'TRUE',
      weight: Number(r[8]) || 0, route: Number(r[9]) || 1
    };
  }).filter(e => weeks.includes(e.weekKey) || weeks.includes(e.pickWeekKey));
}

function addEntry(arrWeekKey, client, arrDay, pickDay, pickWeekKey, weight, route) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (sh.getMaxColumns() < 10) sh.insertColumnsAfter(sh.getMaxColumns(), 10 - sh.getMaxColumns());
  let parsedWeight = '';
  if (weight) {
    let num = parseFloat(String(weight).trim().replace(',', '.'));
    if (!isNaN(num) && num > 0) parsedWeight = num;
  }
  const id = 'ID_' + new Date().getTime().toString();
  sh.appendRow([id, arrWeekKey, client, Number(arrDay), Number(pickDay), false, new Date(), pickWeekKey, parsedWeight, Number(route) || 1]);
  SpreadsheetApp.flush();
  return { ok: true, id };
}

function updateEntry(id, newArrDay, newPickDay, isNextWeek, newWeight, fallback) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_NAME);
  const data = sh.getDataRange().getValues();
  let parsedWeight = '';
  if (newWeight) {
    let num = parseFloat(String(newWeight).trim().replace(',', '.'));
    if (!isNaN(num) && num > 0) parsedWeight = num;
  }
  function writeEntry(rowIdx) {
    const arrWkKey = parseDateToKey(data[rowIdx][1]);
    let pickWkKey = arrWkKey;
    if (isNextWeek) {
      const parts = arrWkKey.split('-');
      const d = new Date(parts[0], parts[1]-1, parts[2]);
      d.setDate(d.getDate() + 7);
      pickWkKey = parseDateToKey(d);
    }
    const existingId = String(data[rowIdx][0]).trim();
    if (!existingId) sh.getRange(rowIdx + 1, 1).setValue('ID_' + new Date().getTime().toString() + '_' + rowIdx);
    sh.getRange(rowIdx + 1, 4).setValue(newArrDay);
    sh.getRange(rowIdx + 1, 5).setValue(newPickDay);
    sh.getRange(rowIdx + 1, 8).setValue(pickWkKey);
    sh.getRange(rowIdx + 1, 9).setValue(parsedWeight);
    SpreadsheetApp.flush();
    return { ok: true };
  }

  const cleanId = String(id || '').trim();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === cleanId) return writeEntry(i);
  }

  if (fallback && fallback.client && fallback.weekKey !== undefined && fallback.arrDay !== undefined && fallback.pickDay !== undefined) {
    const matches = [];
    for (let i = 1; i < data.length; i++) {
      const rowWeekKey = parseDateToKey(data[i][1]).trim();
      const rowPickWeekKey = data[i][7] ? parseDateToKey(data[i][7]).trim() : rowWeekKey;
      const sameClient = String(data[i][2]).trim() === String(fallback.client).trim();
      const sameArr = Number(data[i][3]) === Number(fallback.arrDay);
      const samePick = Number(data[i][4]) === Number(fallback.pickDay);
      const sameWeek = rowWeekKey === String(fallback.weekKey).trim();
      const samePickWeek = rowPickWeekKey === String(fallback.pickWeekKey || fallback.weekKey).trim();
      if (sameClient && sameArr && samePick && sameWeek && samePickWeek) matches.push(i);
    }
    if (matches.length === 1) return writeEntry(matches[0]);
  }

  return { error: 'Nie znaleziono wpisu' };
}

function toggleDone(id) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_NAME);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(id).trim()) {
      sh.getRange(i + 1, 6).setValue(!data[i][5]);
      SpreadsheetApp.flush();
      return { ok: true };
    }
  }
  return { error: 'Błąd' };
}

function removeEntry(id) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_NAME);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(id).trim()) {
      sh.deleteRow(i + 1);
      SpreadsheetApp.flush();
      return { ok: true };
    }
  }
  return { error: 'Błąd' };
}

function getAllEntries() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_NAME);
  return sh.getDataRange().getValues().slice(1).map(r => {
    let aKey = parseDateToKey(r[1]).trim();
    let pKey = r[7] ? parseDateToKey(r[7]).trim() : aKey;
    return {
      id: String(r[0]).trim(), weekKey: aKey, pickWeekKey: pKey, client: String(r[2]),
      arrDay: Number(r[3]), pickDay: Number(r[4]),
      done: r[5] === true || r[5] === 'TRUE' || String(r[5]).toUpperCase() === 'TRUE',
      weight: Number(r[8]) || 0, route: Number(r[9]) || 1
    };
  });
}
