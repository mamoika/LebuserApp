// ============================================================
//  PRALNIA – Harmonogram (BACKEND)
//  Wklej ten kod do pliku Code.gs w Apps Script
// ============================================================

const SHEET_NAME = 'Dane';
const CLIENTS_SHEET = 'Klienci';
const ROUTES_SHEET = 'Trasy';
const DRIVERS_SHEET = 'Kierowcy';
const DAY_NAMES = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek'];

const BASE_LAT = 52.7229319;
const BASE_LNG = 15.2520164;

// Domyślne ID (fallback gdy Properties nie jest jeszcze ustawione)
const GRAFIK_SPREADSHEET_ID_DEFAULT = '1HLdnzsHWyQdKe6wpo6t29c3hjk6UETlA9Du7ylWFzsw';
const GRAFIK_SHEET_GID_DEFAULT      = 715483314;

// ── HASŁO ADMINISTRATORA ─────────────────────────────────────────────────────
const ADMIN_PASSWORD_DEFAULT  = 'Lebuser2025!';
const ADMIN_SESSION_HOURS = 6;
const ADMIN_SESSION_PREFIX = 'admin_session_';

// Pomocnicza funkcja do obliczania bezpiecznego skrótu SHA-256 z hasła i soli
function hashPassword(password, salt) {
  const rawHash = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, 
    password + salt, 
    Utilities.Charset.UTF_8
  );
  let hash = '';
  for (let i = 0; i < rawHash.length; i++) {
    let byteVal = rawHash[i];
    if (byteVal < 0) byteVal += 256;
    let byteString = byteVal.toString(16);
    if (byteString.length === 1) byteString = '0' + byteString;
    hash += byteString;
  }
  return hash;
}

// Uruchom tę funkcję jednorazowo w edytorze Apps Script, aby ustawić własne hasło
function setAdminPasswordSecurely() {
  const newPassword = 'Lebuser2025!'; // Wpisz tutaj swoje nowe bezpieczne hasło
  const salt = Utilities.getUuid();
  const hash = hashPassword(newPassword, salt);
  
  const props = PropertiesService.getScriptProperties();
  props.setProperties({
    'ADMIN_PASSWORD_HASH': hash,
    'ADMIN_PASSWORD_SALT': salt
  });
  
  // Czyścimy stare jawne hasło ze Script Properties, jeśli istniało
  props.deleteProperty('ADMIN_PASSWORD');
  console.log("Hasło administratora zostało pomyślnie zahaszowane i zapisane!");
}

function checkAdminPassword(password) {
  if (!password) return { error: 'Nieprawidłowe hasło administratora' };
  
  // Weryfikacja drugiego hasła "tomas"
  if (password === 'tomas') {
    const token = Utilities.getUuid() + '-' + Utilities.getUuid();
    CacheService.getScriptCache().put(ADMIN_SESSION_PREFIX + token, '1', ADMIN_SESSION_HOURS * 3600);
    return { ok: true, token: token, sessionHours: ADMIN_SESSION_HOURS };
  }
  
  const props = PropertiesService.getScriptProperties();
  const storedHash = props.getProperty('ADMIN_PASSWORD_HASH');
  const storedSalt = props.getProperty('ADMIN_PASSWORD_SALT');
  
  // Fallback: dopóki administrator nie uruchomi funkcji setAdminPasswordSecurely
  if (!storedHash) {
    if (password === ADMIN_PASSWORD_DEFAULT) {
      const token = Utilities.getUuid() + '-' + Utilities.getUuid();
      CacheService.getScriptCache().put(ADMIN_SESSION_PREFIX + token, '1', ADMIN_SESSION_HOURS * 3600);
      return { ok: true, token: token, sessionHours: ADMIN_SESSION_HOURS };
    }
    return { error: 'Nieprawidłowe hasło administratora' };
  }
  
  // Bezpieczna weryfikacja zahaszowanego hasła z solą
  const incomingHash = hashPassword(password, storedSalt);
  if (incomingHash !== storedHash) {
    return { error: 'Nieprawidłowe hasło administratora' };
  }
  
  const token = Utilities.getUuid() + '-' + Utilities.getUuid();
  CacheService.getScriptCache().put(ADMIN_SESSION_PREFIX + token, '1', ADMIN_SESSION_HOURS * 3600);
  return { ok: true, token: token, sessionHours: ADMIN_SESSION_HOURS };
}

function checkAuth(adminToken) {
  if (!adminToken) throw new Error('Wymagane logowanie administratora');
  const ok = CacheService.getScriptCache().get(ADMIN_SESSION_PREFIX + String(adminToken));
  if (!ok) throw new Error('Sesja administratora wygasła. Zaloguj się ponownie.');
}

// ── USTAWIENIA PLIKU GRAFIKU ─────────────────────────────────────────────────
// ID jest przechowywane w Script Properties, więc można je zmienić z UI
// bez edycji kodu przy zmianie roku.

function getGrafikSettings() {
  const props = PropertiesService.getScriptProperties();
  return {
    spreadsheetId: props.getProperty('GRAFIK_SS_ID') || GRAFIK_SPREADSHEET_ID_DEFAULT,
    sheetGid:      parseInt(props.getProperty('GRAFIK_SS_GID') || GRAFIK_SHEET_GID_DEFAULT, 10)
  };
}

// Wyodrębnia ID z pełnego URL Sheets lub zwraca samo ID
function extractSpreadsheetId(input) {
  const match = String(input || '').match(/\/spreadsheets\/d\/([a-zA-Z0-9\-_]+)/);
  return match ? match[1] : String(input || '').trim();
}

// Otwiera plik grafiku i zwraca arkusz "Grafik" (lub pierwszy arkusz)
function openGrafikSpreadsheet() {
  const s = getGrafikSettings();
  const ss = SpreadsheetApp.openById(s.spreadsheetId);
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === s.sheetGid) return { ss: ss, sheet: sheets[i] };
  }
  // Szukaj po nazwie
  const byName = ss.getSheetByName('Grafik');
  if (byName) return { ss: ss, sheet: byName };
  return { ss: ss, sheet: sheets[0] };
}

// Zapisuje nowe ID pliku grafiku + weryfikuje dostęp
function saveGrafikFileId(urlOrId, adminToken) {
  checkAuth(adminToken);
  try {
    const id = extractSpreadsheetId(urlOrId);
    if (!id) return { error: 'Nieprawidłowy URL lub ID' };

    const ss = SpreadsheetApp.openById(id);
    const sheets = ss.getSheets();

    // Znajdź arkusz "Grafik" lub użyj pierwszego
    let grafikSheet = ss.getSheetByName('Grafik') || sheets[0];

    PropertiesService.getScriptProperties().setProperties({
      'GRAFIK_SS_ID':  id,
      'GRAFIK_SS_GID': String(grafikSheet.getSheetId())
    });

    const weekSheets = sheets
      .map(function(s){ return s.getName(); })
      .filter(function(n){ return /^W\d+/.test(n); })
      .sort(function(a,b){ return parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]); });

    // Odczytaj tytuł miesiąca z nagłówka
    let monthTitle = '';
    try { monthTitle = String(grafikSheet.getRange(1, 6).getValue() || '').trim(); } catch(e){}

    return {
      ok:            true,
      fileName:      ss.getName(),
      spreadsheetId: id,
      sheetName:     grafikSheet.getName(),
      monthTitle:    monthTitle,
      weekSheets:    weekSheets
    };
  } catch(e) {
    return { error: 'Nie można połączyć: ' + e.message };
  }
}

// Info o podłączonym pliku (do wyświetlenia w UI)
function getGrafikFileInfo() {
  try {
    const result = openGrafikSpreadsheet();
    const ss = result.ss;
    const allSheets = ss.getSheets();

    const weekSheets = allSheets
      .map(function(s){ return s.getName(); })
      .filter(function(n){ return /^W\d+/.test(n); })
      .sort(function(a,b){ return parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]); });

    let monthTitle = '';
    try { monthTitle = String(result.sheet.getRange(1, 6).getValue() || '').trim(); } catch(e){}

    const s = getGrafikSettings();
    return {
      fileName:      ss.getName(),
      spreadsheetId: s.spreadsheetId,
      sheetName:     result.sheet.getName(),
      monthTitle:    monthTitle,
      weekSheets:    weekSheets,
      totalSheets:   allSheets.length
    };
  } catch(e) {
    return { error: 'Błąd połączenia z plikiem grafiku: ' + e.message };
  }
}

function TEST_ZgodyGoogle() {
  const s = getGrafikSettings();
  SpreadsheetApp.openById(s.spreadsheetId);
  console.log("Uprawnienia OK. Plik: " + s.spreadsheetId);
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
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}



function initSheets() {
  const ss = SpreadsheetApp.getActive();
  if (!ss) return 'Błąd: Skrypt nie jest podpięty pod arkusz';

  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['ID', 'WeekKey', 'Klient', 'DzienPrzyjazdu', 'DzienOdbioru', 'Odebrane', 'DataDodania', 'PickWeekKey', 'Waga', 'Trasa', 'Typ', 'DodanePrzez', 'OdebranePrzez', 'DataOdbioru', 'Komentarz', 'Pilne', 'SortOrder']);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 17).setFontWeight('bold');
  } else {
    const maxCols = sh.getMaxColumns();
    if (maxCols < 17) sh.insertColumnsAfter(maxCols, 17 - maxCols);
    if (sh.getRange(1, 11).getValue() === '') sh.getRange(1, 11).setValue('Typ').setFontWeight('bold');
    if (sh.getRange(1, 12).getValue() === '') sh.getRange(1, 12).setValue('DodanePrzez').setFontWeight('bold');
    if (sh.getRange(1, 13).getValue() === '') sh.getRange(1, 13).setValue('OdebranePrzez').setFontWeight('bold');
    if (sh.getRange(1, 14).getValue() === '') sh.getRange(1, 14).setValue('DataOdbioru').setFontWeight('bold');
    if (sh.getRange(1, 15).getValue() === '') sh.getRange(1, 15).setValue('Komentarz').setFontWeight('bold');
    if (sh.getRange(1, 16).getValue() === '') sh.getRange(1, 16).setValue('Pilne').setFontWeight('bold');
    if (sh.getRange(1, 17).getValue() === '') sh.getRange(1, 17).setValue('SortOrder').setFontWeight('bold');
  }

  let lk = ss.getSheetByName('Logi');
  if (!lk) {
    lk = ss.insertSheet('Logi');
    lk.appendRow(['Data', 'Kto', 'Akcja', 'Wpis ID', 'Szczegóły']);
    lk.setFrozenRows(1);
    lk.getRange(1, 1, 1, 5).setFontWeight('bold');
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

  let dk = ss.getSheetByName(DRIVERS_SHEET);
  if (!dk) {
    dk = ss.insertSheet(DRIVERS_SHEET);
    dk.appendRow(['ID', 'Nazwa', 'Trasy']);
    dk.setFrozenRows(1);
    dk.getRange(1, 1, 1, 3).setFontWeight('bold');
    const defaultDrivers = [
      ['D1', 'Kierowca 1', '1'],
      ['D2', 'Kierowca 2', '2'],
      ['D3', 'Kierowca 3', '3'],
      ['D4', 'Kierowca 4', '1,2,3']
    ];
    defaultDrivers.forEach(d => dk.appendRow(d));
  }

  return 'OK';
}

function getAppData() {
  const ss = SpreadsheetApp.getActive();
  if (!ss) return { clients: [], routes: [], drivers: [] };

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

  let dk = ss.getSheetByName(DRIVERS_SHEET);
  if (!dk) {
    initSheets();
    dk = ss.getSheetByName(DRIVERS_SHEET);
  }
  let drivers = [];
  if (dk) {
    const dData = dk.getDataRange().getValues();
    const lastRow = dk.getLastRow();
    // Wymuszamy odczyt kolumny C jako tekst (getDisplayValues)
    const dDisplay = lastRow > 1 ? dk.getRange(2, 3, lastRow - 1, 1).getDisplayValues() : [];
    drivers = dData.slice(1).map((r, idx) => {
      // Parsuj trasy z wyświetlanej wartości (tekst), nie z getValues (może być liczba)
      const rawRoutesStr = String(dDisplay[idx] ? dDisplay[idx][0] : (r[2] || ''));
      const rawRoutes = rawRoutesStr.split(',').map(s => s.trim()).filter(s => s !== '');
      let parsedRoutes = [];
      rawRoutes.forEach(function(val) {
        const num = Number(val);
        if (!isNaN(num) && num > 0) {
          parsedRoutes.push(num);
        } else {
          // Szukaj trasy po nazwie
          for (let ri = 0; ri < routes.length; ri++) {
            if (routes[ri].name.toLowerCase().includes(val.toLowerCase())) {
              parsedRoutes.push(routes[ri].id);
              break;
            }
          }
        }
      });
      return {
        id: String(r[0]),
        name: String(r[1]),
        routes: parsedRoutes
      };
    }).filter(d => d.name && d.name.trim() !== '');
  }

  return { clients: clients, routes: routes, drivers: drivers };
}

function updateRoutesOrder(fromRouteId, fromNames, toRouteId, toNames, adminToken) {
  checkAuth(adminToken);
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

function addRoute(name, adminToken) {
  checkAuth(adminToken);
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

function updateRouteName(id, newName, adminToken) {
  checkAuth(adminToken);
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

function removeRoute(id, adminToken) {
  checkAuth(adminToken);
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

function addClient(name, route, adminToken) {
  checkAuth(adminToken);
  if (!name || !name.trim()) return { error: 'Pusta nazwa' };
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(CLIENTS_SHEET);
  const existingData = sh.getDataRange().getValues().slice(1);
  if (existingData.map(r => String(r[0]).trim()).includes(name.trim())) return { error: 'Klient już istnieje' };
  sh.appendRow([name.trim(), Number(route) || 1, 9999, '', '']);
  return { ok: true };
}

function updateClient(oldName, newName, newRoute, lat, lng, adminToken) {
  checkAuth(adminToken);
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

function removeClient(name, adminToken) {
  checkAuth(adminToken);
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
    let addedAt = '';
    if (r[6] instanceof Date) {
      const dd = String(r[6].getDate()).padStart(2,'0');
      const mm = String(r[6].getMonth()+1).padStart(2,'0');
      const yy = r[6].getFullYear();
      const hh = String(r[6].getHours()).padStart(2,'0');
      const mi = String(r[6].getMinutes()).padStart(2,'0');
      addedAt = dd+'.'+mm+'.'+yy+', '+hh+':'+mi;
    } else if (r[6]) {
      addedAt = String(r[6]);
    }
    return {
      id: String(r[0]).trim(), weekKey: aKey, pickWeekKey: pKey, client: String(r[2]),
      arrDay: Number(r[3]), pickDay: Number(r[4]),
      done: r[5] === true || r[5] === 'TRUE' || String(r[5]).toUpperCase() === 'TRUE',
      addedAt: addedAt,
      weight: Number(r[8]) || 0, route: Number(r[9]) || 1,
      type: r[10] ? String(r[10]).trim().toUpperCase() : 'P',
      addedBy: r[11] ? String(r[11]).trim() : '',
      pickedBy: r[12] ? String(r[12]).trim() : '',
      pickedAt: r[13] instanceof Date ? (String(r[13].getDate()).padStart(2,'0')+'.'+String(r[13].getMonth()+1).padStart(2,'0')+'.'+r[13].getFullYear()+', '+String(r[13].getHours()).padStart(2,'0')+':'+String(r[13].getMinutes()).padStart(2,'0')) : '',
      comment: r[14] ? String(r[14]).trim() : '',
      urgent: r[15] === true || r[15] === 'TRUE' || String(r[15]).toUpperCase() === 'TRUE',
      order: r[16] !== '' && r[16] !== undefined ? Number(r[16]) : 9999
    };
  }).filter(e => weeks.includes(e.weekKey) || weeks.includes(e.pickWeekKey));
}

function logAction(user, action, targetId, details) {
  try {
    const ss = SpreadsheetApp.getActive();
    let lk = ss.getSheetByName('Logi');
    if (lk) {
      lk.appendRow([new Date(), user || 'Nieznany', action, targetId || '', details || '']);
    }
  } catch(e) {}
}

function sendCommentEmail(driverName, clientName, route, type, weight, comment) {
  if (!comment || String(comment).trim() === '') return;
  try {
    let emailBody = 'Witaj,\n\n';
    emailBody += 'Kierowca ' + String(driverName) + ' zostawił nowy komentarz do zamówienia.\n\n';
    emailBody += 'Szczegóły zamówienia:\n';
    emailBody += '- Klient: ' + String(clientName) + '\n';
    emailBody += '- Trasa: T' + String(route) + '\n';
    emailBody += '- Rodzaj prania: ' + (String(type) === 'O' ? 'Obrusy' : 'Pościel') + '\n';
    if (weight && String(weight) !== '0' && String(weight) !== '') {
      emailBody += '- Waga: ' + String(weight) + ' kg\n';
    }
    emailBody += '\nTreść komentarza:\n"' + String(comment).trim() + '"\n\n';
    emailBody += 'Wiadomość wygenerowana automatycznie przez system Lebuser App.';
    
    MailApp.sendEmail({
      to: 'spedycja.profiwash@gmail.com',
      subject: 'Nowy komentarz od kierowcy ' + String(driverName) + ' (' + String(clientName) + ')',
      body: emailBody
    });
  } catch(e) {
    logAction('System', 'Błąd e-mail', '', e.message);
  }
}

function addEntry(arrWeekKey, client, arrDay, pickDay, pickWeekKey, weight, route, type, driverName, isUrgent, comment) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (sh.getMaxColumns() < 17) sh.insertColumnsAfter(sh.getMaxColumns(), 17 - sh.getMaxColumns());
  let parsedWeight = '';
  if (weight) {
    let num = parseFloat(String(weight).trim().replace(',', '.'));
    if (!isNaN(num) && num > 0) parsedWeight = num;
  }
  const id = 'ID_' + new Date().getTime().toString();
  // Columns: 1:ID, 2:WeekKey, 3:Klient, 4:ArrDay, 5:PickDay, 6:Done, 7:AddedAt, 8:PickWeekKey, 9:Waga, 10:Trasa, 11:Typ, 12:AddedBy, 13:PickedBy, 14:PickedAt, 15:Comment, 16:Urgent, 17:SortOrder
  sh.appendRow([id, arrWeekKey, client, Number(arrDay), Number(pickDay), false, new Date(), pickWeekKey, parsedWeight, Number(route) || 1, type || 'P', driverName || '', '', '', comment || '', isUrgent ? true : false, 9999]);
  SpreadsheetApp.flush();
  logAction(driverName, 'Dodanie', id, 'Klient: ' + client);
  if (comment && String(comment).trim() !== '') {
    sendCommentEmail(driverName, client, route, type, parsedWeight, String(comment).trim());
  }
  return { ok: true, id };
}

function updateEntry(id, newArrDay, newPickDay, isNextWeek, newWeight, fallback, adminToken, type, isUrgent, comment) {
  checkAuth(adminToken);
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_NAME);
  if (sh.getMaxColumns() < 11) sh.insertColumnsAfter(sh.getMaxColumns(), 11 - sh.getMaxColumns());
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
    sh.getRange(rowIdx + 1, 11).setValue(type || 'P');
    if (comment !== undefined) sh.getRange(rowIdx + 1, 15).setValue(String(comment).trim());
    if (isUrgent !== undefined) sh.getRange(rowIdx + 1, 16).setValue(isUrgent ? true : false);
    SpreadsheetApp.flush();
    logAction('Admin', 'Edycja', existingId, 'Dzień odb: ' + newPickDay);
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

function toggleDone(id, driverName, comment) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_NAME);
  if (sh.getMaxColumns() < 16) sh.insertColumnsAfter(sh.getMaxColumns(), 16 - sh.getMaxColumns());
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(id).trim()) {
      const isDone = !data[i][5];
      sh.getRange(i + 1, 6).setValue(isDone);
      sh.getRange(i + 1, 13).setValue(isDone ? (driverName || '') : '');
      sh.getRange(i + 1, 14).setValue(isDone ? new Date() : '');
      // Komentarz zapisujemy zawsze przy toggle (albo do pustego, albo z wartością)
      if (comment !== undefined) {
        const oldComment = String(data[i][14] || '').trim();
        const newComment = String(comment).trim();
        sh.getRange(i + 1, 15).setValue(newComment);
        if (newComment !== '' && newComment !== oldComment) {
          sendCommentEmail(driverName, String(data[i][2]), String(data[i][9]), String(data[i][10]), String(data[i][8]), newComment);
        }
      }
      SpreadsheetApp.flush();
      logAction(driverName, isDone ? 'Odbiór' : 'Cofnięcie odbioru', id, 'Komentarz: ' + (comment || ''));
      return { ok: true };
    }
  }
  return { error: 'Błąd' };
}

function updateEntriesOrder(orderedIds, adminToken) {
  checkAuth(adminToken);
  if (!orderedIds || !orderedIds.length) return {ok: true};
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_NAME);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][0]).trim();
    const idx = orderedIds.indexOf(id);
    if (idx !== -1) {
      sh.getRange(i + 1, 17).setValue(idx + 1);
    }
  }
  SpreadsheetApp.flush();
  logAction('Admin', 'Sortowanie', '', 'Zmieniono kolejność: ' + orderedIds.length + ' wpisów');
  return { ok: true };
}

function removeEntry(id, adminToken) {
  checkAuth(adminToken);
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_NAME);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(id).trim()) {
      sh.deleteRow(i + 1);
      SpreadsheetApp.flush();
      logAction('Admin', 'Usunięcie', id, '');
      return { ok: true };
    }
  }
  return { error: 'Błąd' };
}

// Kierowca może usunąć tylko wpis który sam dodał
function removeOwnEntry(id, driverName) {
  if (!driverName || !String(driverName).trim()) return { error: 'Wymagane logowanie kierowcy' };
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_NAME);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(id).trim()) {
      const addedBy = String(data[i][11] || '').trim();
      if (addedBy !== String(driverName).trim()) {
        return { error: 'Możesz usunąć tylko wpisy dodane przez siebie' };
      }
      sh.deleteRow(i + 1);
      SpreadsheetApp.flush();
      logAction(driverName, 'Usunięcie własne', id, '');
      return { ok: true };
    }
  }
  return { error: 'Nie znaleziono wpisu' };
}

function saveCommentByDriver(id, driverName, comment) {
  if (!driverName || !String(driverName).trim()) return { error: 'Wymagane logowanie kierowcy' };
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_NAME);
  if (sh.getMaxColumns() < 15) sh.insertColumnsAfter(sh.getMaxColumns(), 15 - sh.getMaxColumns());
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(id).trim()) {
      const addedBy = String(data[i][11] || '').trim();
      if (addedBy !== String(driverName).trim()) {
        return { error: 'Możesz edytować komentarz tylko własnych wpisów' };
      }
      const oldComment = String(data[i][14] || '').trim();
      const newComment = String(comment || '').trim();
      sh.getRange(i + 1, 15).setValue(newComment);
      if (newComment !== '' && newComment !== oldComment) {
        sendCommentEmail(driverName, String(data[i][2]), String(data[i][9]), String(data[i][10]), String(data[i][8]), newComment);
      }
      SpreadsheetApp.flush();
      logAction(driverName, 'Komentarz', id, newComment);
      return { ok: true };
    }
  }
  return { error: 'Nie znaleziono wpisu' };
}

function setUrgent(id, isUrgent, adminToken) {
  checkAuth(adminToken);
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_NAME);
  if (sh.getMaxColumns() < 16) sh.insertColumnsAfter(sh.getMaxColumns(), 16 - sh.getMaxColumns());
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(id).trim()) {
      sh.getRange(i + 1, 16).setValue(isUrgent ? true : false);
      SpreadsheetApp.flush();
      return { ok: true };
    }
  }
  return { error: 'Nie znaleziono wpisu' };
}

function getAllEntries() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_NAME);
  return sh.getDataRange().getValues().slice(1).map(r => {
    let aKey = parseDateToKey(r[1]).trim();
    let pKey = r[7] ? parseDateToKey(r[7]).trim() : aKey;
    let addedAt = '';
    if (r[6] instanceof Date) {
      const dd = String(r[6].getDate()).padStart(2,'0');
      const mm = String(r[6].getMonth()+1).padStart(2,'0');
      const yy = r[6].getFullYear();
      const hh = String(r[6].getHours()).padStart(2,'0');
      const mi = String(r[6].getMinutes()).padStart(2,'0');
      addedAt = dd+'.'+mm+'.'+yy+', '+hh+':'+mi;
    } else if (r[6]) {
      addedAt = String(r[6]);
    }
    return {
      id: String(r[0]).trim(), weekKey: aKey, pickWeekKey: pKey, client: String(r[2]),
      arrDay: Number(r[3]), pickDay: Number(r[4]),
      done: r[5] === true || r[5] === 'TRUE' || String(r[5]).toUpperCase() === 'TRUE',
      addedAt: addedAt,
      weight: Number(r[8]) || 0, route: Number(r[9]) || 1,
      type: r[10] ? String(r[10]).trim().toUpperCase() : 'P',
      addedBy: r[11] ? String(r[11]).trim() : '',
      pickedBy: r[12] ? String(r[12]).trim() : '',
      pickedAt: r[13] instanceof Date ? (String(r[13].getDate()).padStart(2,'0')+'.'+String(r[13].getMonth()+1).padStart(2,'0')+'.'+r[13].getFullYear()+', '+String(r[13].getHours()).padStart(2,'0')+':'+String(r[13].getMinutes()).padStart(2,'0')) : '',
      comment: r[14] ? String(r[14]).trim() : '',
      urgent: r[15] === true || r[15] === 'TRUE' || String(r[15]).toUpperCase() === 'TRUE',
      order: r[16] !== '' && r[16] !== undefined ? Number(r[16]) : 9999
    };
  });
}

function getLogs() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('Logi');
  if (!sh) return [];
  const data = sh.getDataRange().getValues();
  // Return last 100 logs
  return data.slice(1).slice(-100).reverse().map(r => {
    return {
      date: r[0] instanceof Date ? r[0].toLocaleString('pl-PL') : String(r[0]),
      user: String(r[1]),
      action: String(r[2]),
      target: String(r[3]),
      details: String(r[4])
    };
  });
}

// ============================================================
//  EDYTOR GRAFIKU — ODCZYT / ZAPIS (TEN SAM SKOROSZYT)
// ============================================================

// Stałe struktury tygodniowego arkusza (z grafik.gs)
const TL_COLS_PER_DAY   = 18; // 1 suma + 17 godzin (5–21)
const TL_START_H        = 5;
const TL_END_H          = 21;
const TL_COL_TL_START   = 4;  // kolumna D = pierwszy blok dzienny

// Stary helper — zastąpiony przez openGrafikSpreadsheet(), zostawiony dla kompatybilności
function getGrafikSheetAny() {
  return openGrafikSpreadsheet();
}

// Parsuje godzinę "7", "07:20", "7,5" → liczba dziesiętna
function parseHourStr(str) {
  if (!str && str !== 0) return 0;
  const s = String(str).trim();
  if (s.includes(':')) {
    const p = s.split(':');
    return parseInt(p[0]) + (parseInt(p[1]) || 0) / 60;
  }
  return parseFloat(s.replace(',', '.')) || 0;
}

// ── Odczyt miesięcznego grafiku ──────────────────────────────
function getGrafikMonthData(yearMonth) {
  // yearMonth = "2026-06"
  try {
    // Lokalny arkusz "Grafik" ma priorytet, potem podłączony plik
    const localSheet = SpreadsheetApp.getActive().getSheetByName('Grafik');
    const sheet = localSheet || openGrafikSpreadsheet().sheet;

    const parts = yearMonth.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10); // 1-based
    const daysInMonth = new Date(year, month, 0).getDate();

    const lastRow = Math.max(sheet.getLastRow(), 10);
    const lastCol = Math.max(sheet.getLastColumn(), 5 + daysInMonth + 2);
    const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();

    // Buduj informacje o dniach
    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, month - 1, d);
      const dow = dt.getDay();
      days.push({ d: d, dow: dow, weekend: dow === 0 || dow === 6,
        name: ['Nd','Pn','Wt','Śr','Cz','Pt','So'][dow] });
    }

    // Parsuj pracowników (wiersze od indeksu 4 = wiersz 5)
    const employees = [];
    let currentGroup = '';

    for (let i = 4; i < data.length; i++) {
      const colA = String(data[i][0] || '').trim();
      const colB = String(data[i][1] || '').trim();
      const rowLabel = colB || colA;

      if (!rowLabel) continue;

      // Nagłówki sekcji
      if (rowLabel.startsWith('▸') || colA.startsWith('▸') ||
          rowLabel.includes('ZD 1') || rowLabel.includes('ZD 2') ||
          rowLabel.includes('KIEROWCY') || rowLabel.includes('FAHRER') ||
          rowLabel.includes('BIURO') || rowLabel.includes('TECHNICZNY')) {
        currentGroup = rowLabel.replace(/^[▸▶]\s*/, '').replace(/^[▸▶]\s*/, '').trim();
        if (!currentGroup) currentGroup = colA.replace(/^[▸▶]\s*/, '').trim();
        continue;
      }
      if (rowLabel.includes('Obecni') || rowLabel.includes('Anwesend') ||
          rowLabel.includes('Godziny') || rowLabel.includes('Gesamtstunden')) break;
      if (!colB) continue;

      // Dni miesiąca: kolumna F = indeks 5 = dzień 1 → data[i][4+d]
      const empDays = [];
      for (let d = 1; d <= daysInMonth; d++) {
        empDays.push(String(data[i][4 + d] || '').trim());
      }

      employees.push({
        name: colB,
        group: currentGroup,
        start: String(data[i][3] || '').trim(),
        koniec: String(data[i][4] || '').trim(),
        sheetRow: i + 1, // 1-bazowany numer wiersza w arkuszu
        days: empDays
      });
    }

    return { year: year, month: month, daysInMonth: daysInMonth, days: days, employees: employees };
  } catch (e) {
    return { error: 'Błąd odczytu grafiku: ' + e.message };
  }
}

function setGrafikCell(sheetRow, day, value, adminToken) {
  checkAuth(adminToken);
  try {
    const sheet = openGrafikSpreadsheet().sheet;

    // Kolumna F (6) = dzień 1 → dzień D = kolumna 5 + D
    const col = 5 + day;
    sheet.getRange(sheetRow, col).setValue(value);
    SpreadsheetApp.flush();
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
}

function setGrafikRowBatch(sheetRow, day, value, employeeName, adminToken) {
  checkAuth(adminToken);
  try {
    const localSheet = SpreadsheetApp.getActive().getSheetByName('Grafik');
    const sheet = localSheet || openGrafikSpreadsheet().sheet;

    const nameInSheet = String(sheet.getRange(sheetRow, 2).getValue()).trim();
    if (employeeName && nameInSheet !== employeeName.trim()) {
      return { error: 'Niezgodność wiersza: oczekiwano "' + employeeName + '", znaleziono "' + nameInSheet + '"' };
    }

    const col = 5 + day;
    sheet.getRange(sheetRow, col).setValue(value);
    SpreadsheetApp.flush();
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
}

// ============================================================
//  EDYTOR OSI CZASU (TYGODNIOWEJ) — W1, W2...
// ============================================================

// Zwraca listę tygodniowych arkuszy (z podłączonego pliku lub lokalnie)
function listWeeklySheets() {
  try {
    // Lokalny plik ma priorytet (arkusz harmonogramu zawiera W* sheets)
    const localSS = SpreadsheetApp.getActive();
    const localWeekly = localSS.getSheets()
      .map(function(s){ return s.getName(); })
      .filter(function(n){ return /^W\d+/.test(n); });

    if (localWeekly.length > 0) {
      return localWeekly.sort(function(a,b){
        return parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]);
      });
    }

    // Fallback: podłączony plik grafiku
    const remoteResult = openGrafikSpreadsheet();
    return remoteResult.ss.getSheets()
      .map(function(s){ return s.getName(); })
      .filter(function(n){ return /^W\d+/.test(n); })
      .sort(function(a,b){
        return parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]);
      });
  } catch(e) { return []; }
}

// Odczytuje dane tygodniowego arkusza (stanowiska per pracownik per dzień per godzina)
function getWeeklyData(sheetName) {
  try {
    const localSheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
    let sheet = localSheet;
    if (!sheet) {
      const remoteResult = openGrafikSpreadsheet();
      sheet = remoteResult.ss.getSheetByName(sheetName);
    }
    if (!sheet) return { error: 'Nie znaleziono arkusza: ' + sheetName };

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 3 || lastCol < 4) return { error: 'Arkusz wygląda na pusty.' };

    const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();

    // Wykryj dni z wiersza 2 (index 1): nagłówki co TL_COLS_PER_DAY kolumn od index 3
    const days = [];
    let dCol = TL_COL_TL_START - 1; // 0-bazowany: D = 3
    while (dCol < data[1].length) {
      const label = String(data[1][dCol] || '').trim();
      if (!label) break;
      // Parsuj weekend z etykiety: "So / Sa" lub "Nd / So"
      const isWeekend = /So|Nd|Sa|So/.test(label);
      days.push({ label: label, colStart0: dCol, dayIndex: days.length, isWeekend: isWeekend });
      dCol += TL_COLS_PER_DAY;
    }
    if (!days.length) return { error: 'Nie wykryto dni w arkuszu.' };

    // Parsuj pracowników od wiersza 4 (index 3)
    const employees = [];
    let currentGroup = '';
    const SUMMARY_MARKERS = ['Kopiuj', 'PODSUMOWANIE', 'Kopieren', 'RAZEM', 'Stanowisko'];

    for (let r = 3; r < data.length; r++) {
      const colA = String(data[r][0] || '').trim();
      if (!colA) continue;
      if (SUMMARY_MARKERS.some(function(m){ return colA.includes(m); })) break;

      // Nagłówek grupy
      if (colA.startsWith('▸') || colA.startsWith('▶') ||
          colA.includes('ZD 1') || colA.includes('ZD 2') ||
          colA.includes('KIEROWCY') || colA.includes('FAHRER') ||
          colA.includes('BIURO') || colA.includes('TECHNICZNY')) {
        currentGroup = colA.replace(/^[▸▶]\s*/, '').trim();
        continue;
      }

      const startH  = parseHourStr(data[r][1]);
      const koniecH = parseHourStr(data[r][2]);
      if (!startH && !koniecH) continue;

      // Odczytaj stanowiska dla każdego dnia
      const dayStations = days.map(function(d) {
        const hours = {};
        for (let h = TL_START_H; h <= TL_END_H; h++) {
          const colIdx = d.colStart0 + 1 + (h - TL_START_H);
          if (colIdx < data[r].length) {
            const val = String(data[r][colIdx] || '').trim().toUpperCase();
            if (val) hours[h] = val;
          }
        }
        return hours;
      });

      employees.push({
        name:     colA,
        group:    currentGroup,
        startH:   startH,
        koniecH:  koniecH,
        sheetRow: r + 1,
        days:     dayStations
      });
    }

    return { sheetName: sheetName, days: days, employees: employees,
             tlStart: TL_START_H, tlEnd: TL_END_H };
  } catch(e) {
    return { error: 'Błąd odczytu osi czasu: ' + e.message };
  }
}

// Zapisuje pojedynczą komórkę stanowiska w arkuszu tygodniowym
function setWeeklyStationCell(sheetName, sheetRow, dayIndex, hour, value, empName, adminToken) {
  checkAuth(adminToken);
  try {
    const localSheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
    let sheet = localSheet;
    if (!sheet) {
      const remoteResult = openGrafikSpreadsheet();
      sheet = remoteResult.ss.getSheetByName(sheetName);
    }
    if (!sheet) return { error: 'Brak arkusza: ' + sheetName };

    if (empName) {
      const nameInRow = String(sheet.getRange(sheetRow, 1).getValue()).trim();
      if (nameInRow !== empName.trim()) {
        return { error: 'Niezgodność: oczekiwano "' + empName + '", znaleziono "' + nameInRow + '"' };
      }
    }

    // Kolumna = TL_COL_TL_START + dayIndex * TL_COLS_PER_DAY + 1 + (hour - TL_START_H)
    const col = TL_COL_TL_START + dayIndex * TL_COLS_PER_DAY + 1 + (hour - TL_START_H);
    sheet.getRange(sheetRow, col).setValue(value);
    SpreadsheetApp.flush();
    return { ok: true };
  } catch(e) {
    return { error: e.message };
  }
}

// Info o aktualnym grafiku w skoroszycie
function getGrafikOverview() {
  const ss = SpreadsheetApp.getActive();
  const grafikSheet = ss.getSheetByName('Grafik');
  let monthInfo = null;
  if (grafikSheet) {
    const title = String(grafikSheet.getRange(1, 6).getValue() || '').trim();
    monthInfo = { title: title, exists: true };
  }
  const weeklySheets = [];
  ss.getSheets().forEach(function(s) {
    if (/^W\d+/.test(s.getName())) weeklySheets.push(s.getName());
  });
  return { monthly: monthInfo, weekly: weeklySheets };
}

function updateDriverRoutes(driverId, routesStr, adminToken) {
  checkAuth(adminToken);
  const ss = SpreadsheetApp.getActive();
  let dk = ss.getSheetByName(DRIVERS_SHEET);
  if (!dk) return { error: 'Brak arkusza Kierowcy' };
  
  const data = dk.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(driverId).trim()) {
      const cell = dk.getRange(i + 1, 3);
      cell.setNumberFormat('@'); // Wymuszenie formatu tekstowego
      cell.setValue(String(routesStr));
      SpreadsheetApp.flush();
      return { ok: true };
    }
  }
  return { error: 'Nie znaleziono kierowcy' };
}

function archiveOldData(adminToken) {
  checkAuth(adminToken);
  const ss = SpreadsheetApp.getActive();
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - 60);
  
  let archivedCount = 0;

  // 1. Archiwizacja Harmonogramu
  const sh = ss.getSheetByName(SHEET_NAME);
  if (sh) {
    let archSh = ss.getSheetByName(SHEET_NAME + '_Archiwum');
    if (!archSh) archSh = ss.insertSheet(SHEET_NAME + '_Archiwum');
    
    const data = sh.getDataRange().getValues();
    if (data.length > 1) {
      if (archSh.getLastRow() === 0) archSh.appendRow(data[0]);
      
      let rowsToMove = [];
      let rowIndicesToDelete = [];
      
      for (let i = 1; i < data.length; i++) {
        const dateStr = data[i][1]; 
        if (dateStr) {
          const ds = String(dateStr);
          let entryDate = null;
          if (ds.includes('-')) {
            const parts = ds.split('-');
            if (parts.length === 3) entryDate = new Date(parts[0], parts[1] - 1, parts[2]);
          } else if (ds.includes('.')) {
            const parts = ds.split('.');
            if (parts.length === 3) entryDate = new Date(parts[2], parts[1] - 1, parts[0]);
          }
          if (entryDate && entryDate < thresholdDate) {
            rowsToMove.push(data[i]);
            rowIndicesToDelete.push(i + 1);
          }
        }
      }
      
      if (rowsToMove.length > 0) {
        archSh.getRange(archSh.getLastRow() + 1, 1, rowsToMove.length, rowsToMove[0].length).setValues(rowsToMove);
        for (let i = rowIndicesToDelete.length - 1; i >= 0; i--) {
          sh.deleteRow(rowIndicesToDelete[i]);
        }
        archivedCount += rowsToMove.length;
      }
    }
  }

  // 2. Archiwizacja Logów
  const shLogs = ss.getSheetByName('Logi');
  if (shLogs) {
    let archLogs = ss.getSheetByName('Logi_Archiwum');
    if (!archLogs) archLogs = ss.insertSheet('Logi_Archiwum');
    
    const data = shLogs.getDataRange().getValues();
    if (data.length > 1) {
      if (archLogs.getLastRow() === 0) archLogs.appendRow(data[0]);
      
      let rowsToMove = [];
      let rowIndicesToDelete = [];
      
      for (let i = 1; i < data.length; i++) {
        let entryDate = new Date(data[i][0]);
        if (isNaN(entryDate.getTime())) {
          const match = String(data[i][0]).match(/(\d{2})\.(\d{2})\.(\d{4})/);
          if (match) entryDate = new Date(match[3], match[2] - 1, match[1]);
        }
        
        if (!isNaN(entryDate.getTime()) && entryDate < thresholdDate) {
          rowsToMove.push(data[i]);
          rowIndicesToDelete.push(i + 1);
        }
      }
      
      if (rowsToMove.length > 0) {
        archLogs.getRange(archLogs.getLastRow() + 1, 1, rowsToMove.length, rowsToMove[0].length).setValues(rowsToMove);
        for (let i = rowIndicesToDelete.length - 1; i >= 0; i--) {
          shLogs.deleteRow(rowIndicesToDelete[i]);
        }
      }
    }
  }

  SpreadsheetApp.flush();
  return { ok: true, count: archivedCount };
}
