import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { dayNamesFull, dayNamesShort, formatWeekKey } from '../../lib/dateUtils';
import { toastError, toastSuccess } from '../../lib/toast';
import { logAction } from '../../lib/logger';

// arr_day: 1=PN, 2=WT, 3=ŚR, 4=CZ, 5=PT
function getDefaultPickInfo(arrDay, schedule = 'other') {
  const d = parseInt(arrDay);

  if (schedule === 'daily') {
    if (d <= 4) return { pickDay: d + 1, pickWeek: 0 };
    return { pickDay: 1, pickWeek: 1 }; // PT → PN nast.
  }

  if (schedule === 'mwf') {
    if (d <= 1) return { pickDay: 3, pickWeek: 0 }; // PN → ŚR
    if (d <= 3) return { pickDay: 5, pickWeek: 0 }; // WT/ŚR → PT
    return { pickDay: 1, pickWeek: 1 }; // CZ/PT → PN nast.
  }

  if (schedule === 'tth') {
    if (d <= 2) return { pickDay: 4, pickWeek: 0 }; // PN/WT → CZW
    return { pickDay: 2, pickWeek: 1 }; // ŚR/CZW/PT → WT nast.
  }

  if (d <= 3) return { pickDay: d + 2, pickWeek: 0 };
  if (d === 4) return { pickDay: 2, pickWeek: 1 };
  return { pickDay: 1, pickWeek: 1 };
}

function parseRouteIds(routesStr) {
  return new Set(
    (routesStr || '').split(',').map(s => Number(s.trim())).filter(Boolean)
  );
}

function firstClientByRouteOrder(clients, routes) {
  const sortedRoutes = [...routes].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const firstRoute = sortedRoutes.find(r => clients.some(c => c.route_id === r.id));
  return firstRoute
    ? [...clients].filter(c => c.route_id === firstRoute.id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0]
    : clients[0];
}

function clientRouteSchedule(clients, routes, clientName) {
  const client = (clients || []).find(c => c.name === clientName);
  const route = (routes || []).find(r => r.id === client?.route_id);
  return route?.schedule || 'other';
}

function nextWeekKey(weekKey) {
  const parts = weekKey.split('-');
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setDate(d.getDate() + 7);
  return formatWeekKey(d);
}

// Data dnia roboczego (1=Pn..5=Pt) w tygodniu zaczynającym się od weekKey (poniedziałek).
function dateForDay(weekKey, day) {
  const [y, m, d] = (weekKey || '').split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + (Number(day) - 1));
  return dt;
}
function shortDate(dt) {
  return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}`;
}
function dayWithDate(weekKey, day) {
  return `${dayNamesShort()[day - 1]} ${shortDate(dateForDay(weekKey, day))}`;
}
// Dni ODBIORU dla wybranego tygodnia. „Ten sam tydzień" (pickWeek 0) startuje od
// dnia przyjazdu — nie da się wybrać dnia wcześniejszego niż przyjazd. „Następny
// tydzień" (pickWeek 1) ma wszystkie dni (zawsze jest po przyjeździe). `includeDay`
// chroni bieżącą wartość (np. starszy wpis) przed cichą zmianą przy otwarciu.
function buildPickDayOptions(baseWeekKey, arrDay, pickWeek, includeDay) {
  const wk = Number(pickWeek) === 1 ? nextWeekKey(baseWeekKey) : baseWeekKey;
  const min = Number(pickWeek) === 1 ? 1 : (parseInt(arrDay) || 1);
  const out = [];
  const seen = new Set();
  for (let d = min; d <= 5; d++) { out.push({ value: d, label: dayWithDate(wk, d) }); seen.add(d); }
  const inc = Number(includeDay);
  if (inc && !seen.has(inc)) out.unshift({ value: inc, label: dayWithDate(wk, inc) });
  return out;
}

// Porównuje wpis przed i po edycji, zwraca listę zmienionych pól w formacie
// "etykieta: stara → nowa". Dzięki temu log edycji jest zawsze kompletny —
// łapie KAŻDE zmienione pole, nie tylko te wpisane ręcznie.
function buildEditDiff(entry, updates, routes, t) {
  const days = dayNamesShort();
  const dayLabel = v => days[v - 1] || '?';
  const fields = [
    { key: 'client_name',  label: t('entry.diffClient'),     fmt: v => (v ?? '') === '' ? '—' : String(v) },
    { key: 'type',         label: t('entry.diffType'),       fmt: v => v === 'O' ? t('entry.tablecloths') : (v === 'R' ? t('entry.workwear') : t('entry.sheets')) },
    { key: 'weight',       label: t('entry.diffWeight'),     fmt: v => (v === null || v === undefined || v === '') ? '—' : `${v} kg` },
    { key: 'arr_day',      label: t('entry.diffArrival'),    fmt: dayLabel },
    { key: 'pick_day',     label: t('entry.diffPickup'),     fmt: dayLabel },
    { key: 'pick_week_key', label: t('entry.diffPickupWeek'), fmt: v => (v ?? '') === '' ? '—' : String(v) },
    { key: 'urgent',       label: t('entry.diffUrgent'),     fmt: v => v ? t('entry.yes') : t('entry.no') },
    { key: 'route_id',     label: t('entry.diffRoute'),      fmt: v => (routes || []).find(r => r.id === v)?.name || '—' },
  ];
  const norm = v => (v === null || v === undefined) ? '' : (typeof v === 'number' ? String(v) : String(v).trim());
  const changes = [];
  for (const f of fields) {
    if (norm(entry[f.key]) !== norm(updates[f.key])) {
      changes.push(`${f.label}: ${f.fmt(entry[f.key])} → ${f.fmt(updates[f.key])}`);
    }
  }
  return changes;
}

function isWorkwearRoute(routes, routeId) {
  const route = (routes || []).find(r => r.id === routeId);
  return route?.is_workwear === true;
}

function receiptDate(weekKey, day) {
  return shortDate(dateForDay(weekKey, day));
}

function receiptNo(entry) {
  const raw = String(entry?.id || '').replace(/^ID_/, '').replace(/^pickup-/, '');
  return raw ? raw.slice(-8).toUpperCase() : String(Date.now()).slice(-8);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const RECEIPT_SERVICE_ROWS = [
  'Powłoki',
  'Powłoczki',
  'Prześcieradła',
  'Jaśki',
  'Ścierki',
  'Ręczniki frotte',
  'Serwetki',
  'Obrusy',
  'Fartuchy',
  'Podkoszulki',
  'Bluzy',
  'Spodnie',
  'Firany',
  'Inne',
];

// Nakłada zapisane pozycje (po nazwie usługi) na stałą listę RECEIPT_SERVICE_ROWS,
// zachowując kolejność druku. Dodatkowe pozycje (np. dopisane ręcznie) trafiają na koniec.
function mergeReceiptRows(savedItems) {
  const saved = Array.isArray(savedItems) ? savedItems : [];
  const byName = new Map(saved.map(item => [item.name, item]));
  const rows = RECEIPT_SERVICE_ROWS.map(name => {
    const hit = byName.get(name);
    return {
      name,
      accepted: hit?.accepted ?? '',
      issued: hit?.issued ?? '',
      notes: hit?.notes ?? '',
    };
  });
  const known = new Set(RECEIPT_SERVICE_ROWS);
  saved
    .filter(item => item.name && !known.has(item.name))
    .forEach(item => rows.push({
      name: item.name,
      accepted: item.accepted ?? '',
      issued: item.issued ?? '',
      notes: item.notes ?? '',
    }));
  return rows;
}

function buildLaundryReceiptDraft({ entry, entries, client, mode, existing = null }) {
  const sourceEntries = entries?.length ? entries : [entry];
  const sheetsKg = sourceEntries
    .filter(e => (e.type || 'P') === 'P')
    .reduce((sum, e) => sum + (parseFloat(e.weight) || 0), 0);
  const tableclothKg = sourceEntries
    .filter(e => e.type === 'O')
    .reduce((sum, e) => sum + (parseFloat(e.weight) || 0), 0);
  const totalKg = sourceEntries.reduce((sum, e) => sum + (parseFloat(e.weight) || 0), 0);
  const first = sourceEntries[0] || entry;
  const arrival = receiptDate(first.week_key, first.arr_day || 1);
  const pickup = receiptDate(first.pick_week_key || first.week_key, first.pick_day || first.arr_day || 1);

  // Kartka już zapisana w bazie — wczytujemy zapisane wartości, a nie budujemy od zera.
  if (existing) {
    return {
      id: existing.id,
      savedDocNo: existing.doc_no,
      status: existing.status || 'open',
      clientName: existing.client_name || client?.name || entry.client_name || '',
      address: existing.address || client?.address || '',
      docNo: String(existing.doc_no ?? ''),
      arrival: existing.arrival || arrival,
      pickup: existing.pickup || pickup,
      modeLabel: existing.mode_label || (mode === 'pick' ? 'wydanie/odbiór' : 'przyjęcie'),
      sheetsKg: existing.sheets_kg != null ? String(existing.sheets_kg) : '',
      tableclothKg: existing.tablecloth_kg != null ? String(existing.tablecloth_kg) : '',
      totalKg: existing.total_kg != null ? String(existing.total_kg) : '',
      rows: mergeReceiptRows(existing.items),
    };
  }

  return {
    id: null,
    savedDocNo: null,
    status: 'open',
    clientName: client?.name || entry.client_name || '',
    address: client?.address || '',
    docNo: '',
    arrival,
    pickup,
    modeLabel: mode === 'pick' ? 'wydanie/odbiór' : 'przyjęcie',
    sheetsKg: sheetsKg > 0 ? String(Number(sheetsKg.toFixed(1))) : '',
    tableclothKg: tableclothKg > 0 ? String(Number(tableclothKg.toFixed(1))) : '',
    totalKg: totalKg > 0 ? String(Number(totalKg.toFixed(1))) : '',
    rows: mergeReceiptRows(null),
  };
}

function printLaundryReceipt({ entry, entries, client, mode, receipt }) {
  const draft = receipt || buildLaundryReceiptDraft({ entry, entries, client, mode });
  const clientName = draft.clientName || '';
  const address = draft.address || '';
  const sheetsKg = parseFloat(String(draft.sheetsKg).replace(',', '.')) || 0;
  const tableclothKg = parseFloat(String(draft.tableclothKg).replace(',', '.')) || 0;
  const sourceEntries = entries?.length ? entries : [entry];
  const first = sourceEntries[0] || entry;
  const docNo = draft.docNo || receiptNo(first);
  const arrival = draft.arrival || receiptDate(first.week_key, first.arr_day || 1);
  const pickup = draft.pickup || receiptDate(first.pick_week_key || first.week_key, first.pick_day || first.arr_day || 1);
  const typeSummary = [
    sheetsKg > 0 ? `Pościel ${Number(sheetsKg.toFixed(1))} kg` : '',
    tableclothKg > 0 ? `Obrusy ${Number(tableclothKg.toFixed(1))} kg` : '',
  ].filter(Boolean).join(' · ');
  const rows = (draft.rows || RECEIPT_SERVICE_ROWS.map(name => ({ name }))).map((row, index) => `
    <tr>
      <td class="lp">${index + 1}</td>
      <td>${escapeHtml(row.name)}</td>
      <td>${escapeHtml(row.accepted || '')}</td>
      <td>${escapeHtml(row.issued || '')}</td>
      <td>${escapeHtml(row.notes || '')}</td>
    </tr>
  `).join('');

  const w = window.open('', '_blank', 'width=900,height=1200');
  if (!w) {
    toastError('Przeglądarka zablokowała okno wydruku');
    return;
  }
  w.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Kartka ${escapeHtml(clientName)}</title>
  <style>
    @page { size: A4; margin: 10mm; }
    body { font-family: "Times New Roman", serif; color: #111; margin: 0; }
    .page { width: 190mm; margin: 0 auto; }
    .top { display: grid; grid-template-columns: 1.15fr 1fr 1fr; border: 2px solid #111; border-bottom: 0; }
    .cell { padding: 6px 8px; border-right: 2px solid #111; min-height: 31mm; }
    .cell:last-child { border-right: 0; }
    .brand { font-size: 12px; line-height: 1.25; }
    .brand strong { font-size: 16px; }
    .title { text-align: center; font-size: 22px; font-weight: 800; line-height: 1.15; }
    .meta { font-size: 15px; line-height: 1.6; }
    .line { border-bottom: 1px dotted #111; min-height: 18px; display: inline-block; min-width: 65%; }
    .company { border-left: 2px solid #111; border-right: 2px solid #111; padding: 8px 10px; font-size: 15px; }
    .company-row { display: flex; gap: 8px; margin: 5px 0; }
    .company-row span:first-child { min-width: 44px; }
    .company-row .fill { flex: 1; border-bottom: 1px dotted #111; font-size: 18px; font-weight: 700; text-align: center; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; border: 2px solid #111; }
    th, td { border: 2px solid #111; height: 10mm; padding: 2px 5px; font-size: 15px; }
    th { text-align: center; font-weight: 700; }
    tbody td { border-top: 1px dotted #111; border-bottom: 1px dotted #111; }
    .lp { width: 9mm; text-align: center; }
    .kind { width: 58mm; }
    .qty { width: 34mm; }
    .notes { width: 55mm; }
    .summary { display: grid; grid-template-columns: 1fr 1fr 1fr; border-left: 2px solid #111; border-right: 2px solid #111; border-bottom: 2px solid #111; }
    .summary div { min-height: 13mm; padding: 6px 8px; border-right: 2px solid #111; font-size: 16px; font-weight: 700; }
    .summary div:last-child { border-right: 0; text-align: right; }
    .sign { display: grid; grid-template-columns: 1fr 1fr; border-left: 2px solid #111; border-right: 2px solid #111; border-bottom: 2px solid #111; }
    .sign > div { min-height: 34mm; border-right: 2px solid #111; display: flex; align-items: flex-end; justify-content: center; padding: 8px; font-size: 14px; }
    .sign > div:last-child { border-right: 0; }
    .hint { margin-top: 8px; font-size: 12px; color: #444; display: flex; justify-content: space-between; }
    .print { margin: 12px 0; padding: 10px 16px; font: 700 14px system-ui; border: 0; border-radius: 8px; background: #007aff; color: white; cursor: pointer; }
    @media print { .print, .hint { display: none; } }
  </style>
</head>
<body>
  <div class="page">
    <button class="print" onclick="window.print()">Drukuj</button>
    <div class="top">
      <div class="cell brand">
        <strong>PROFIWASH SP. z o.o.</strong><br>
        ul. Owcza 10, 66-400 Gorzów Wlkp<br>
        NIP: 5993278104 &nbsp; REGON: 526167000<br>
        kontakt@profwash.pl
      </div>
      <div class="cell title">DOWÓD<br>NR <span class="line">${escapeHtml(docNo)}</span><br>PRZYJĘCIA I WYDANIA<br>BIELIZNY DO PRANIA</div>
      <div class="cell meta">
        data przyjęcia: <span class="line">${escapeHtml(arrival)}</span><br>
        termin wykonania: <span class="line">${escapeHtml(pickup)}</span><br>
        ${escapeHtml(draft.modeLabel || (mode === 'pick' ? 'wydanie/odbiór' : 'przyjęcie'))}
      </div>
    </div>
    <div class="company">
      <div class="company-row"><span>Firma</span><div class="fill">${escapeHtml(clientName)}</div></div>
      <div class="company-row"><span>Adres</span><div class="fill">${escapeHtml(address)}</div></div>
    </div>
    <table>
      <thead>
        <tr>
          <th class="lp">Lp.</th>
          <th class="kind">Rodzaj usługi</th>
          <th class="qty">Ilość przyjęta</th>
          <th class="qty">Ilość wydana</th>
          <th class="notes">Uwagi</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="summary">
      <div>kg pościel: ${escapeHtml(draft.sheetsKg || '')}</div>
      <div>kg obrusy: ${escapeHtml(draft.tableclothKg || '')}</div>
      <div>razem: ${escapeHtml(draft.totalKg || '')} kg</div>
    </div>
    <div class="sign">
      <div>Zamawiający / podpis przekazującego</div>
      <div>Wykonujący / podpis przyjmującego</div>
    </div>
    <div class="hint">
      <span>${escapeHtml(typeSummary || 'Kartka wygenerowana automatycznie z harmonogramu')}</span>
      <span>${escapeHtml(clientName)} · ${escapeHtml(arrival)}</span>
    </div>
  </div>
</body>
</html>`);
  w.document.close();
  setTimeout(() => w.print(), 250);
}

// Ponowny wydruk zapisanej kartki (z listy/historii) — mapuje wiersz z bazy na
// kształt draftu i korzysta z tej samej funkcji druku co edytor.
export function printSavedLaundryReceipt(row) {
  if (!row) return;
  const draft = {
    clientName: row.client_name || '',
    address: row.address || '',
    docNo: String(row.doc_no ?? ''),
    arrival: row.arrival || '',
    pickup: row.pickup || '',
    modeLabel: row.mode_label || '',
    sheetsKg: row.sheets_kg != null ? String(row.sheets_kg) : '',
    tableclothKg: row.tablecloth_kg != null ? String(row.tablecloth_kg) : '',
    totalKg: row.total_kg != null ? String(row.total_kg) : '',
    rows: mergeReceiptRows(row.items),
  };
  printLaundryReceipt({ receipt: draft });
}

export function AddEntryModal({ isOpen, onClose, defaultArrDay, weekKey, clients, routes, onAdded, defaultClientName, defaultType }) {
  const { t } = useTranslation();
  const { user, isDriver, isAdmin, sessionToken } = useAuth();
  const [clientName, setClientName] = useState('');
  const [showOtherRoutes, setShowOtherRoutes] = useState(false);
  const [type, setType] = useState('P');
  const [weight, setWeight] = useState('');
  const [arrDay, setArrDay] = useState(defaultArrDay || 1);
  const [pickDay, setPickDay] = useState(defaultArrDay || 1);
  const [pickWeek, setPickWeek] = useState(0); // 0 = same, 1 = next
  const [trolleys, setTrolleys] = useState(1);
  const [urgent, setUrgent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [explicitRouteId, setExplicitRouteId] = useState('');
  const isClientScoped = !!defaultClientName;

  const assignedRouteIds = useMemo(() => parseRouteIds(user?.routes), [user?.routes]);
  const hasAssignedRouteFilter = isDriver && assignedRouteIds.size > 0;
  const ownClients = useMemo(() => hasAssignedRouteFilter
    ? clients.filter(c => assignedRouteIds.has(c.route_id))
    : clients, [assignedRouteIds, clients, hasAssignedRouteFilter]);
  const otherClients = useMemo(() => hasAssignedRouteFilter
    ? clients.filter(c => c.route_id && !assignedRouteIds.has(c.route_id))
    : [], [assignedRouteIds, clients, hasAssignedRouteFilter]);
  const selectableClients = useMemo(() => hasAssignedRouteFilter && showOtherRoutes ? otherClients : ownClients, [hasAssignedRouteFilter, showOtherRoutes, otherClients, ownClients]);
  const canToggleOtherRoutes = hasAssignedRouteFilter && otherClients.length > 0;

  useEffect(() => {
    if (isOpen) {
      const day = defaultArrDay || 1;
      // Jeśli podano defaultClientName, pre-wybierz tego klienta; inaczej pierwszy z tras
      let initClient;
      if (defaultClientName) {
        initClient = clients.find(c => c.name === defaultClientName);
      }
      if (!initClient) initClient = firstClientByRouteOrder(ownClients, routes);
      const { pickDay: pd, pickWeek: pw } = getDefaultPickInfo(day, clientRouteSchedule(clients, routes, initClient?.name));
      const isWorkwear = isWorkwearRoute(routes, initClient?.route_id);
      setArrDay(day);
      setPickDay(pd);
      setPickWeek(pw);
      setShowOtherRoutes(false);
      setClientName(initClient?.name || '');
      setWeight('');
      setType(isWorkwear ? 'R' : (defaultType || 'P'));
      setTrolleys(1);
      setUrgent(false);
      setExplicitRouteId('');
    }
  }, [isOpen, defaultArrDay, clients, routes, ownClients, defaultClientName, defaultType]);

  useEffect(() => {
    if (!isOpen) return;
    if (defaultClientName) return; // Blokada dla pre-wybranego klienta
    const nextClient = firstClientByRouteOrder(selectableClients, routes);
    if (!selectableClients.some(c => c.name === clientName)) {
      setClientName(nextClient?.name || '');
      const { pickDay: pd, pickWeek: pw } = getDefaultPickInfo(arrDay, clientRouteSchedule(clients, routes, nextClient?.name));
      setPickDay(pd);
      setPickWeek(pw);
      setType(isWorkwearRoute(routes, nextClient?.route_id) ? 'R' : 'P');
    }
  }, [isOpen, showOtherRoutes, selectableClients, routes, clients, clientName, arrDay, defaultClientName]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const client = clients.find(c => c.name === clientName);
      if (!client) throw new Error(t('entry.selectClient'));
      const routeId = explicitRouteId ? Number(explicitRouteId) : (client ? client.route_id : 1);

      // Calculate pick_week_key
      let pickWeekKey = weekKey;
      if (pickWeek === 1) {
        pickWeekKey = nextWeekKey(weekKey);
      }

      // Unikalne ID — sam timestamp w ms powodował kolizje przy szybkim dodawaniu
      // dwóch wpisów (ten sam id → akcje/grupowanie łączyły je w jedno zamówienie).
      const newEntryId = 'ID_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const { data, error } = await supabase.rpc('admin_insert_entry', {
        p_session_token: sessionToken,
        p_id: newEntryId,
        p_week_key: weekKey,
        p_client_name: clientName,
        p_arr_day: parseInt(arrDay),
        p_pick_day: parseInt(pickDay),
        p_pick_week_key: pickWeekKey,
        p_route_id: routeId,
        p_type: type,
        p_weight: weight ? parseFloat(weight.replace(',', '.')) : null,
        p_trolleys: trolleys !== '' ? Number(trolleys) : 1,
        p_urgent: urgent,
        p_added_by: user.name,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await logAction({ sessionToken, action: 'added', clientName, entryId: newEntryId, details: `${type === 'R' ? t('entry.workwear') : type === 'O' ? t('entry.tablecloths') : t('entry.sheets')}${weight ? ', ' + weight + ' kg' : ''}` });
      await onAdded?.({ id: newEntryId, clientName, routeId, type, weight, trolleys });
      onClose();
    } catch (err) {
      toastError(t('entry.errAdding') + ' ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ap-overlay" style={{ display: 'flex' }}>
      <div className="ap-sheet">
        <div className="ap-handle"></div>
        <div className="ap-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(145deg,#34C759,#25A244)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0, boxShadow: '0 3px 10px rgba(52,199,89,0.3)' }}>📦</div>
            <div>
              <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px', marginBottom: '1px' }}>
                {isClientScoped ? (clientName || defaultClientName) : t('entry.addArrival')}
              </div>
              <div style={{ fontSize: '12px', color: 'rgba(60,60,67,0.5)', fontWeight: 400 }}>
                {isClientScoped ? t('entry.dirtyToLaundry') : user?.name}
              </div>
            </div>
          </div>

          {!isClientScoped && (
            <>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.client')}</div>
              <select
                className="ap-input"
                style={{ padding: '12px 14px', marginBottom: '12px' }}
                value={clientName}
                onChange={e => {
                  setClientName(e.target.value);
                  const selectedClient = clients.find(c => c.name === e.target.value);
                  const { pickDay: pd, pickWeek: pw } = getDefaultPickInfo(arrDay, clientRouteSchedule(clients, routes, e.target.value));
                  setPickDay(pd);
                  setPickWeek(pw);
                  setType(isWorkwearRoute(routes, selectedClient?.route_id) ? 'R' : 'P');
                }}
              >
                {routes
                  .filter(r => selectableClients.some(c => c.route_id === r.id))
                  .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                  .map(r => (
                    <optgroup key={r.id} label={`${r.name}${hasAssignedRouteFilter && assignedRouteIds.has(r.id) ? t('entry.yourRouteSuffix') : ''}`}>
                      {selectableClients
                        .filter(c => c.route_id === r.id)
                        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                        .map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </optgroup>
                  ))}
              </select>
              {canToggleOtherRoutes && (
                <button
                  type="button"
                  onClick={() => setShowOtherRoutes(v => !v)}
                  style={{
                    width: '100%',
                    border: '1px solid rgba(0,122,255,0.22)',
                    background: showOtherRoutes ? 'rgba(0,122,255,0.12)' : 'rgba(0,122,255,0.06)',
                    color: 'var(--accent)',
                    borderRadius: '12px',
                    padding: '10px 12px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    marginTop: '-4px',
                    marginBottom: '12px',
                  }}
                >
                  {showOtherRoutes ? t('entry.backToMyRoutes') : t('entry.addFromOtherRoute')}
                </button>
              )}
            </>
          )}

          {isAdmin && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.assignToRoute')}</div>
              <select className="ap-input" value={explicitRouteId} onChange={e => setExplicitRouteId(e.target.value)}>
                <option value="">{t('entry.defaultClientRoute')}</option>
                {routes.map(r => (
                  <option key={r.id} value={r.id}>T{r.sort_order ?? r.id} - {r.name}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.laundryType')}</div>
          {isWorkwearRoute(routes, clients.find(c => c.name === clientName)?.route_id) ? (
            <div className="segmented-control" style={{ marginBottom: '12px' }}>
              <button type="button" className={`seg-btn type-R active`}>{t('entry.workwear')}</button>
            </div>
          ) : (
            <div className="segmented-control" style={{ marginBottom: '12px' }}>
              <button type="button" className={`seg-btn type-P ${type === 'P' ? 'active' : ''}`} onClick={() => setType('P')}>{t('entry.sheets')}</button>
              <button type="button" className={`seg-btn type-O ${type === 'O' ? 'active' : ''}`} onClick={() => setType('O')}>{t('entry.tablecloths')}</button>
            </div>
          )}

          <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.weightOptional')}</div>
          <input type="text" className="ap-input" placeholder={t('entry.weightPlaceholder')} style={{ marginBottom: '12px' }} inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.arrivalDay')}</div>
              <select className="ap-input" value={arrDay} onChange={e => { const { pickDay: pd, pickWeek: pw } = getDefaultPickInfo(e.target.value, clientRouteSchedule(clients, routes, clientName)); setArrDay(e.target.value); setPickDay(pd); setPickWeek(pw); }}>
                {dayNamesShort().map((name, i) => <option key={i} value={i + 1}>{name} {shortDate(dateForDay(weekKey, i + 1))}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.pickupDay')}</div>
              <select className="ap-input" value={pickDay} onChange={e => setPickDay(Number(e.target.value))}>
                {buildPickDayOptions(weekKey, arrDay, pickWeek, pickDay).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.pickupWeek')}</div>
              <select className="ap-input" value={pickWeek} onChange={e => { const w = Number(e.target.value); setPickWeek(w); if (w === 0 && Number(pickDay) < (parseInt(arrDay) || 1)) setPickDay(parseInt(arrDay) || 1); }}>
                <option value={0}>{t('entry.sameWeek')}</option>
                <option value={1}>{t('entry.nextWeek')}</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.trolleys')}</div>
              <input type="number" className="ap-input" value={trolleys} onChange={e => setTrolleys(e.target.value ? Number(e.target.value) : '')} min="0" />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, marginBottom: '4px', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: '18px', height: '18px' }} checked={urgent} onChange={e => setUrgent(e.target.checked)} />
            <span style={{ color: 'var(--accent-red)' }}>{t('entry.urgent')}</span>
          </label>

          <div className="ap-btn-group" style={{ marginTop: '18px' }}>
            <button className="ap-btn ap-btn-primary" onClick={handleSubmit} disabled={loading}>{loading ? t('entry.adding') : t('entry.add')}</button>
            <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={loading}>{t('common.cancel')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ViewEditEntryModal({ isOpen, onClose, entry, relatedEntries = [], onUpdated, onDeleted, routes, clients = [], receipts = [], contextMode = 'view', initiallyEditing = false, source = null }) {
  const { t } = useTranslation();
  const { isAdmin, canEdit, isViewer, user, sessionToken } = useAuth();
  const [editing, setEditing] = useState(false);
  const [clientName, setClientName] = useState('');
  const [type, setType] = useState('P');
  const [weight, setWeight] = useState('');
  const [arrDay, setArrDay] = useState(1);
  const [pickDay, setPickDay] = useState(1);
  const [pickWeek, setPickWeek] = useState(0); // 0 = same, 1 = next week
  const [trolleys, setTrolleys] = useState(1);
  const [urgent, setUrgent] = useState(false);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [routeId, setRouteId] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [washing, setWashing] = useState(false);
  const [receiptDraft, setReceiptDraft] = useState(null);
  const [savingReceipt, setSavingReceipt] = useState(false);

  useEffect(() => {
    if (isOpen && entry) {
      setEditing(initiallyEditing);
      setClientName(entry.client_name || '');
      setType(entry.type || 'P');
      setWeight(entry.weight || '');
      setArrDay(entry.arr_day || 1);
      setPickDay(entry.pick_day || 1);
      setPickWeek(entry.week_key === entry.pick_week_key ? 0 : 1);
      setTrolleys(entry.trolleys ?? 1);
      setUrgent(entry.urgent || false);
      // Komentarz klienta (wspólna notatka) — preferuj clients.note, fallback na stary entry.comment
      const clientNote = (clients || []).find(c => c.name === entry.client_name)?.note;
      setComment(clientNote !== undefined ? (clientNote || '') : (entry.comment || ''));
      setRouteId(entry.route_id || 1);
      setReceiptDraft(null);
    }
  }, [isOpen, entry, clients, initiallyEditing]);

  if (!isOpen || !entry) return null;

  const sortedRoutes = [...(routes || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const knownClientNames = new Set((clients || []).map(c => c.name));
  const selectedClient = (clients || []).find(c => c.name === clientName);
  const isPickupContext = contextMode === 'pick';
  const pickupEntries = isPickupContext && relatedEntries.length > 0 ? relatedEntries : [entry];
  const isGroupedPickup = isPickupContext && pickupEntries.length > 1;
  // W widoku ODBIORÓW „entry" to syntetyczna grupa z id "pickup-..." (patrz
  // groupPickupEntries w ScheduleView) — taki wiersz nie istnieje w bazie.
  // Dla pojedynczego odbioru operujemy więc na PRAWDZIWYM wpisie, żeby edycja /
  // usuwanie / „wyprane" trafiały w istniejący rekord (inaczej: „Nie znaleziono wpisu").
  const targetEntry = isPickupContext && pickupEntries.length === 1 ? pickupEntries[0] : entry;
  const pickupTotalWeight = pickupEntries.reduce((sum, e) => sum + (parseFloat(e.weight) || 0), 0);
  const allPickupDone = pickupEntries.every(e => e.done);
  const pickedByNames = [...new Set(pickupEntries.map(e => e.picked_by).filter(Boolean))];
  const daysFull = dayNamesFull();
  const pickupArrivalDays = [...new Set(pickupEntries.map(e => daysFull[(e.arr_day || 1) - 1]).filter(Boolean))].join(', ');
  const hasPickupSheets = pickupEntries.some(e => (e.type || 'P') === 'P');
  const hasPickupTablecloths = pickupEntries.some(e => e.type === 'O');
  const hasPickupWorkwear = pickupEntries.some(e => e.type === 'R');
  const pickupTypeLabel = hasPickupWorkwear ? t('entry.workwear') :
    (hasPickupSheets && hasPickupTablecloths
      ? t('entry.sheetsTablecloths')
      : hasPickupTablecloths
        ? t('entry.tablecloths')
        : t('entry.sheets'));
  const directEditMode = contextMode === 'arr' && initiallyEditing;
  const showEditForm = canEdit && (editing || directEditMode);
  const selectedClientDetails = (clients || []).find(c => c.name === entry.client_name);
  const canPrintLaundryReceipt = source === 'schedule' && (isViewer || isAdmin);
  const canSaveLaundryReceipt = source === 'schedule' && canEdit;
  const receiptEntries = isPickupContext ? pickupEntries : [targetEntry];

  // Znajdź już zapisaną kartkę dla tego przyjęcia — najpierw po powiązanym wpisie,
  // a w razie braku po kliencie + tygodniu (gdy P i O były na osobnych wpisach).
  const findExistingReceipt = () => {
    const entryIds = new Set(receiptEntries.map(e => String(e.id)));
    const clientName = selectedClientDetails?.name || targetEntry.client_name;
    const weekKey = targetEntry.week_key;
    return (receipts || []).find(r => r.entry_id && entryIds.has(String(r.entry_id)))
      || (receipts || []).find(r => r.client_name === clientName && r.week_key === weekKey);
  };

  const openReceiptEditor = () => {
    setReceiptDraft(buildLaundryReceiptDraft({
      entry: targetEntry,
      entries: receiptEntries,
      client: selectedClientDetails,
      mode: contextMode,
      existing: findExistingReceipt() || null,
    }));
  };

  const saveReceipt = async () => {
    if (!receiptDraft) return;
    try {
      setSavingReceipt(true);
      const toNum = (v) => {
        const n = parseFloat(String(v ?? '').replace(',', '.'));
        return Number.isFinite(n) ? n : null;
      };
      // Status: w kontekście odbioru zapis domyka kartkę (wydanie), inaczej zostaje otwarta.
      const status = contextMode === 'pick' ? 'closed' : (receiptDraft.status || 'open');
      const items = (receiptDraft.rows || [])
        .filter(row => row.accepted || row.issued || row.notes)
        .map(row => ({
          name: row.name,
          accepted: row.accepted || '',
          issued: row.issued || '',
          notes: row.notes || '',
        }));
      const { data, error } = await supabase.rpc('admin_save_laundry_receipt', {
        p_session_token: sessionToken,
        p_id: receiptDraft.id || null,
        p_entry_id: String(targetEntry.id),
        p_client_name: receiptDraft.clientName || '',
        p_address: receiptDraft.address || '',
        p_week_key: targetEntry.week_key || null,
        p_arrival: receiptDraft.arrival || '',
        p_pickup: receiptDraft.pickup || '',
        p_mode_label: receiptDraft.modeLabel || '',
        p_sheets_kg: toNum(receiptDraft.sheetsKg),
        p_tablecloth_kg: toNum(receiptDraft.tableclothKg),
        p_total_kg: toNum(receiptDraft.totalKg),
        p_items: items,
        p_status: status,
        p_by: user.name,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const saved = data?.receipt;
      if (saved) {
        setReceiptDraft(prev => ({
          ...prev,
          id: saved.id,
          savedDocNo: saved.doc_no,
          docNo: String(saved.doc_no ?? prev.docNo),
          status: saved.status || status,
        }));
      }
      await logAction({
        sessionToken,
        action: receiptDraft.id ? 'edited' : 'added',
        clientName: receiptDraft.clientName,
        entryId: targetEntry.id,
        details: `Kartka prania NR ${saved?.doc_no ?? receiptDraft.docNo}`,
      });
      toastSuccess(`Kartka zapisana (NR ${saved?.doc_no ?? receiptDraft.docNo})`);
      // Nie wołamy onUpdated() — zamknęłoby okno. Lista kartek odświeży się przez realtime.
    } catch (err) {
      toastError(t('entry.errGeneric') + ' ' + err.message);
    } finally {
      setSavingReceipt(false);
    }
  };

  const setReceiptField = (field, value) => {
    setReceiptDraft(prev => ({ ...prev, [field]: value }));
  };

  const setReceiptRow = (index, field, value) => {
    setReceiptDraft(prev => ({
      ...prev,
      rows: prev.rows.map((row, i) => i === index ? { ...row, [field]: value } : row),
    }));
  };

  const handleClientChange = (name) => {
    setClientName(name);
    const selected = (clients || []).find(c => c.name === name);
    if (selected?.route_id) {
      setRouteId(selected.route_id);
      const { pickDay: pd, pickWeek: pw } = getDefaultPickInfo(arrDay, clientRouteSchedule(clients, routes, name));
      setPickDay(pd);
      setPickWeek(pw);
      setType(isWorkwearRoute(routes, selected.route_id) ? 'R' : 'P');
    }
  };

  const toggleDone = async () => {
    try {
      setLoading(true);
      const isDone = !allPickupDone;

      const ids = pickupEntries.map(e => e.id);
      const { data, error } = await supabase.rpc('admin_set_entries_done', {
        p_session_token: sessionToken,
        p_ids: ids,
        p_done: isDone,
        p_by: user.name,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await logAction({
        sessionToken,
        action: isDone ? 'done' : 'undone',
        clientName: entry.client_name,
        entryId: entry.id,
        details: isGroupedPickup ? t('entry.logDoneDetails', { count: pickupEntries.length, weight: pickupTotalWeight ? Number(pickupTotalWeight.toFixed(1)) + ' kg' : t('entry.noWeight') }) : undefined,
      });
      onUpdated();
      onClose();
    } catch (err) {
      toastError(t('entry.errGeneric') + ' ' + err.message);
      setLoading(false);
    }
    };

    // Prywatny status „wyprane" — nie rusza odbioru (done) ani dostawy.
    // Pomniejsza tylko licznik „Do prania" w harmonogramie.
    const toggleWashed = async () => {
    try {
      setWashing(true);
      const next = !targetEntry.washed;
      const { data, error } = await supabase.rpc('admin_set_entry_washed', {
        p_session_token: sessionToken,
        p_id: targetEntry.id,
        p_washed: next,
        p_by: user.name,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await logAction({
        sessionToken,
        action: next ? 'washed' : 'unwashed',
        clientName: targetEntry.client_name,
        entryId: targetEntry.id,
        details: `${targetEntry.type === 'R' ? t('entry.workwear') : targetEntry.type === 'O' ? t('entry.tablecloths') : t('entry.sheets')}${targetEntry.weight ? ', ' + targetEntry.weight + ' kg' : ''}`,
      });
      onUpdated();
      onClose();
    } catch (err) {
      toastError(t('entry.errGeneric') + ' ' + err.message);
      setWashing(false);
    }
    };

    const handleSaveEdit = async () => {
    try {
      setLoading(true);

      let pickWeekKey = targetEntry.week_key;
      if (pickWeek === 1) pickWeekKey = nextWeekKey(targetEntry.week_key);

      const nextRouteId = routeId || selectedClient?.route_id || targetEntry.route_id || null;

      let updates = {
        client_name: clientName,
        type: type,
        weight: weight ? parseFloat(String(weight).replace(',', '.')) : null,
        arr_day: parseInt(arrDay),
        pick_day: parseInt(pickDay),
        pick_week_key: pickWeekKey,
        trolleys: trolleys !== '' ? Number(trolleys) : 1,
        urgent,
        route_id: nextRouteId
        // comment usunięty z entries — teraz w clients.note (wspólna notatka)
      };

      const { data: editData, error } = await supabase.rpc('admin_update_entry', {
        p_session_token: sessionToken,
        p_id: targetEntry.id,
        p_client_name: clientName,
        p_type: type,
        p_arr_day: parseInt(arrDay),
        p_pick_day: parseInt(pickDay),
        p_pick_week_key: pickWeekKey,
        p_route_id: nextRouteId,
        p_weight: weight ? parseFloat(String(weight).replace(',', '.')) : null,
        p_trolleys: trolleys !== '' ? Number(trolleys) : 1,
        p_urgent: urgent,
      });
      if (error) throw error;
      if (editData?.error) throw new Error(editData.error);

      // Zapisz komentarz do clients.note (wspólny dla całego klienta)
      const currentClientNote = (clients || []).find(c => c.name === entry.client_name)?.note || '';
      if (comment !== (currentClientNote || '')) {
        await supabase.rpc('admin_set_client_note', {
          p_session_token: sessionToken,
          p_name: clientName.trim() || entry.client_name,
          p_note: comment || null,
        });
      }
      // Loguj tylko realne zmiany — automatycznie wykrywamy każde zmienione pole.
      const changes = buildEditDiff(targetEntry, updates, routes, t);
      // Śledź też zmianę komentarza klienta
      const currentClientNote2 = (clients || []).find(c => c.name === entry.client_name)?.note || '';
      if (comment !== (currentClientNote2 || '')) {
        changes.push(`${t('entry.diffComment')}: "${currentClientNote2 || '—'}" → "${comment || '—'}"`);
      }
      if (changes.length > 0) {
        await logAction({
          sessionToken,
          action: 'edited',
          clientName: updates.client_name,
          entryId: targetEntry.id,
          details: changes.join(', '),
        });
      }
      onUpdated();
      onClose();
    } catch (err) {
      toastError(t('entry.errEdit') + ' ' + err.message);
      setLoading(false);
    }
    };

    const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    try {
      setLoading(true);
      // Miękkie usuwanie: oznaczamy wpis jako usunięty zamiast kasować go z bazy,
      // dzięki czemu zostaje w historii i nic nie przepada.
      const { data, error } = await supabase.rpc('admin_soft_delete_entry', {
        p_session_token: sessionToken,
        p_id: targetEntry.id,
        p_by: user.name,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await logAction({
        sessionToken,
        action: 'deleted',
        clientName: targetEntry.client_name,
        entryId: targetEntry.id,
        details: t('entry.logDeletedDetails', {
          type: targetEntry.type === 'R' ? t('entry.workwear') : targetEntry.type === 'O' ? t('entry.tablecloths') : t('entry.sheets'),
          arrival: daysFull[targetEntry.arr_day - 1] || '?',
          pickup: daysFull[targetEntry.pick_day - 1] || '?',
          weight: targetEntry.weight ?? '—',
        }),      });
      onDeleted();
      onClose();
    } catch (err) {
      toastError(t('entry.errGeneric') + ' ' + err.message);
      setLoading(false);
    }
    };

    if (receiptDraft) {
    return (
      <div className="ap-overlay" style={{ display: 'flex' }}>
        <div className="ap-sheet" style={{ maxWidth: '760px' }}>
          <div className="ap-handle"></div>
          <div className="ap-content">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(145deg,#007AFF,#0055CC)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0, boxShadow: '0 3px 10px rgba(0,122,255,0.3)' }}>🧾</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px', marginBottom: '2px' }}>Kartka prania</div>
                  {receiptDraft.id && (
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', color: receiptDraft.status === 'closed' ? '#1b7a3d' : '#9a6b00', background: receiptDraft.status === 'closed' ? 'rgba(52,199,89,0.15)' : 'rgba(255,179,0,0.18)' }}>
                      {receiptDraft.status === 'closed' ? 'Zamknięta' : 'Otwarta'}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{receiptDraft.clientName}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
              <label style={pfLabelLike}>Nr dowodu
                {receiptDraft.id
                  ? <input className="ap-input" value={receiptDraft.docNo} readOnly style={{ marginTop: '5px', background: 'var(--bg-secondary)' }} />
                  : <input className="ap-input" value="" readOnly placeholder="nadany przy zapisie" style={{ marginTop: '5px', background: 'var(--bg-secondary)' }} />}
              </label>
              <label style={pfLabelLike}>Data przyjęcia<input className="ap-input" value={receiptDraft.arrival} onChange={e => setReceiptField('arrival', e.target.value)} style={{ marginTop: '5px' }} /></label>
              <label style={pfLabelLike}>Termin wykonania<input className="ap-input" value={receiptDraft.pickup} onChange={e => setReceiptField('pickup', e.target.value)} style={{ marginTop: '5px' }} /></label>
            </div>

            <label style={pfLabelLike}>Firma / hotel<input className="ap-input" value={receiptDraft.clientName} onChange={e => setReceiptField('clientName', e.target.value)} style={{ marginTop: '5px', marginBottom: '8px' }} /></label>
            <label style={pfLabelLike}>Adres<input className="ap-input" value={receiptDraft.address} onChange={e => setReceiptField('address', e.target.value)} style={{ marginTop: '5px', marginBottom: '12px' }} /></label>

            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '12px', marginBottom: '12px' }}>
              <table style={{ width: '100%', minWidth: '640px', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)', color: 'var(--text-tertiary)', textAlign: 'left' }}>
                    <th style={receiptTh}>Lp.</th>
                    <th style={receiptTh}>Rodzaj usługi</th>
                    <th style={receiptTh}>Ilość przyjęta</th>
                    <th style={receiptTh}>Ilość wydana</th>
                    <th style={receiptTh}>Uwagi</th>
                  </tr>
                </thead>
                <tbody>
                  {receiptDraft.rows.map((row, index) => {
                    const acc = String(row.accepted ?? '').trim();
                    const iss = String(row.issued ?? '').trim();
                    const mismatch = acc !== '' && iss !== '' && acc !== iss;
                    return (
                    <tr key={`${row.name}-${index}`} style={mismatch ? { background: 'rgba(255,59,48,0.08)' } : undefined}>
                      <td style={receiptTd}>{index + 1}</td>
                      <td style={receiptTd}>
                        <input className="ap-input" value={row.name} onChange={e => setReceiptRow(index, 'name', e.target.value)} style={receiptCellInput} />
                      </td>
                      <td style={receiptTd}>
                        <input className="ap-input" value={row.accepted} onChange={e => setReceiptRow(index, 'accepted', e.target.value)} style={receiptCellInput} />
                      </td>
                      <td style={receiptTd}>
                        <input className="ap-input" value={row.issued} onChange={e => setReceiptRow(index, 'issued', e.target.value)} style={{ ...receiptCellInput, ...(mismatch ? { color: '#d70015', fontWeight: 700 } : {}) }} />
                      </td>
                      <td style={receiptTd}>
                        <input className="ap-input" value={row.notes} onChange={e => setReceiptRow(index, 'notes', e.target.value)} style={receiptCellInput} />
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '14px' }}>
              <label style={pfLabelLike}>kg pościel<input className="ap-input" value={receiptDraft.sheetsKg} onChange={e => setReceiptField('sheetsKg', e.target.value)} inputMode="decimal" style={{ marginTop: '5px' }} /></label>
              <label style={pfLabelLike}>kg obrusy<input className="ap-input" value={receiptDraft.tableclothKg} onChange={e => setReceiptField('tableclothKg', e.target.value)} inputMode="decimal" style={{ marginTop: '5px' }} /></label>
              <label style={pfLabelLike}>razem kg<input className="ap-input" value={receiptDraft.totalKg} onChange={e => setReceiptField('totalKg', e.target.value)} inputMode="decimal" style={{ marginTop: '5px' }} /></label>
            </div>

            {(() => {
              const mismatches = (receiptDraft.rows || []).filter(r => {
                const a = String(r.accepted ?? '').trim();
                const i = String(r.issued ?? '').trim();
                return a !== '' && i !== '' && a !== i;
              }).length;
              return mismatches > 0 ? (
                <div style={{ fontSize: '12px', color: '#d70015', fontWeight: 600, marginBottom: '10px' }}>
                  ⚠ Różnica przyjęte/wydane w {mismatches} {mismatches === 1 ? 'pozycji' : 'pozycjach'}
                </div>
              ) : null;
            })()}

            <div className="ap-btn-group">
              {canSaveLaundryReceipt && (
                <button className="ap-btn ap-btn-primary" onClick={saveReceipt} disabled={savingReceipt}>
                  {savingReceipt ? 'Zapisywanie…' : (receiptDraft.id ? 'Zapisz zmiany' : 'Zapisz')}
                </button>
              )}
              <button className="ap-btn ap-btn-secondary" onClick={() => printLaundryReceipt({ entry: targetEntry, entries: receiptEntries, client: selectedClientDetails, mode: contextMode, receipt: receiptDraft })}>Drukuj</button>
              <button className="ap-btn ap-btn-secondary" onClick={() => setReceiptDraft(null)}>Wróć</button>
              <button className="ap-btn ap-btn-secondary" onClick={onClose}>Zamknij</button>
            </div>
          </div>
        </div>
      </div>
    );
    }

    // Widok Edycji (tylko dla Admin/Driver po kliknięciu 'Edytuj')
    if (showEditForm) {
    return (
      <div className="ap-overlay" style={{ display: 'flex' }}>
        <div className="ap-sheet">
          <div className="ap-handle"></div>
          <div className="ap-content">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(145deg,#007AFF,#0055CC)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0, boxShadow: '0 3px 10px rgba(0,122,255,0.3)' }}>✏️</div>
              <div>
                <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px', marginBottom: '1px' }}>
                  {contextMode === 'arr' ? (clientName || entry.client_name) : t('entry.editEntry')}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 600 }}>
                  {contextMode === 'arr' ? t('entry.editEntry') : entry.client_name}
                </div>
              </div>
            </div>

            {contextMode !== 'arr' && (
              <>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.client')}</div>
                <select className="ap-input" style={{ padding: '12px 14px', marginBottom: '14px' }} value={clientName} onChange={e => handleClientChange(e.target.value)}>
                  {!knownClientNames.has(entry.client_name) && <option value={entry.client_name}>{entry.client_name}</option>}
                  {sortedRoutes
                    .filter(r => clients.some(c => c.route_id === r.id))
                    .map((r, index) => (
                      <optgroup key={r.id} label={`T${index + 1} - ${r.name}`}>
                        {clients
                          .filter(c => c.route_id === r.id)
                          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                          .map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </optgroup>
                    ))}
                </select>
              </>
            )}

            <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.laundryType')}</div>
            {isWorkwearRoute(routes, clients.find(c => c.name === clientName)?.route_id || routeId) ? (
              <div className="segmented-control" style={{ marginBottom: '14px' }}>
                <button type="button" className={`seg-btn type-R active`}>{t('entry.workwear')}</button>
              </div>
            ) : (
              <div className="segmented-control" style={{ marginBottom: '14px' }}>
                <button type="button" className={`seg-btn type-P ${type === 'P' ? 'active' : ''}`} onClick={() => setType('P')}>{t('entry.sheets')}</button>
                <button type="button" className={`seg-btn type-O ${type === 'O' ? 'active' : ''}`} onClick={() => setType('O')}>{t('entry.tablecloths')}</button>
              </div>
            )}

            <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.weight')}</div>
            <input type="text" className="ap-input" value={weight} onChange={e => setWeight(e.target.value)} style={{ marginBottom: '14px' }} inputMode="decimal" />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.arrival')}</div>
                <select
                  className="ap-input"
                  value={arrDay}
                  onChange={e => {
                    const { pickDay: pd, pickWeek: pw } = getDefaultPickInfo(e.target.value, clientRouteSchedule(clients, routes, clientName));
                    setArrDay(e.target.value);
                    setPickDay(pd);
                    setPickWeek(pw);
                  }}
                >
                  {daysFull.map((name, i) => <option key={i} value={i + 1}>{name} {shortDate(dateForDay(entry.week_key, i + 1))}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.pickup')}</div>
                <select className="ap-input" value={pickDay} onChange={e => setPickDay(Number(e.target.value))}>
                  {buildPickDayOptions(entry.week_key, arrDay, pickWeek, pickDay).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.pickupWeek')}</div>
                <select className="ap-input" value={pickWeek} onChange={e => { const w = Number(e.target.value); setPickWeek(w); if (w === 0 && Number(pickDay) < (parseInt(arrDay) || 1)) setPickDay(parseInt(arrDay) || 1); }}>
                  <option value={0}>{t('entry.sameWeek')}</option>
                  <option value={1}>{t('entry.nextWeek')}</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.trolleys')}</div>
                <input type="number" className="ap-input" value={trolleys} onChange={e => setTrolleys(e.target.value ? Number(e.target.value) : '')} min="0" />
              </div>
            </div>

            {isAdmin && (
              <div className="ap-field" style={{ marginBottom: '14px' }}>
                <label className="ap-label" style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: '6px' }}>{t('entry.logisticsRoute')}</label>
                <select className="ap-select ap-input" value={routeId} onChange={e => setRouteId(Number(e.target.value))} style={{ width: '100%', padding: '12px 14px' }}>
                  {sortedRoutes.map((r, index) => (
                    <option key={r.id} value={r.id}>T{index + 1} - {r.name}</option>
                  ))}
                </select>
              </div>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px', fontWeight: 500, marginBottom: '14px', cursor: 'pointer', padding: '12px 14px', background: 'rgba(255,59,48,0.06)', borderRadius: '12px', border: '1px solid rgba(255,59,48,0.15)' }}>
              <input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} style={{ width: '20px', height: '20px', accentColor: '#FF3B30' }} />
              <span style={{ color: '#FF3B30', fontWeight: 600 }}>{t('entry.urgent')}</span>
            </label>

            <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.comment')}</div>
            <input type="text" className="ap-input" value={comment} onChange={e => setComment(e.target.value)} style={{ marginBottom: '18px' }} />

            <div className="ap-btn-group">
              <button className="ap-btn ap-btn-primary" onClick={handleSaveEdit} disabled={loading}>{t('entry.save')}</button>
              <button className="ap-btn ap-btn-secondary" onClick={() => directEditMode ? onClose() : setEditing(false)} disabled={loading}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Widok Szczegółów (Domyślny)
  const routeName = routes?.find(r => r.id === entry.route_id)?.name || '—';

  return (
    <div className="ap-overlay" style={{ display: 'flex' }}>
      <div className="ap-sheet">
        <div className="ap-handle"></div>
        <div className="ap-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(145deg,#007AFF,#0055CC)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0, boxShadow: '0 3px 10px rgba(0,122,255,0.3)' }}>📋</div>
            <div>
              <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px', marginBottom: '2px' }}>{entry.client_name}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{routeName}{entry.urgent ? ` · ${t('entry.urgentShort')}` : ''}</div>
            </div>
          </div>

          <ROW label={t('entry.status')} value={allPickupDone ? t('entry.pickedUpCheck') : t('entry.inProgress')} valueColor={allPickupDone ? 'var(--accent-green)' : undefined} />
          <ROW label={t('entry.view')} value={isPickupContext ? t('entry.pickup') : contextMode === 'arr' ? t('entry.arrival') : t('entry.viewDetails')} valueColor={isPickupContext ? 'var(--accent-green)' : undefined} />
          <ROW label={t('entry.kind')} value={isPickupContext ? pickupTypeLabel : entry.type === 'R' ? t('entry.workwear') : entry.type === 'O' ? t('entry.tablecloths') : t('entry.sheets')} />
          <ROW label={t('entry.weight')} value={isPickupContext ? (pickupTotalWeight ? `${Number(pickupTotalWeight.toFixed(1))} kg` : '—') : (entry.weight ? `${entry.weight} kg` : '—')} />
          {!isGroupedPickup && <ROW label={t('entry.trolleys')} value={entry.trolleys ?? 1} />}
          {isGroupedPickup && <ROW label={t('entry.entriesField')} value={t('entry.arrivalsCount', { count: pickupEntries.length })} />}
          <ROW label={isGroupedPickup ? t('entry.arrivals') : t('entry.arrival')} value={isGroupedPickup ? pickupArrivalDays : daysFull[entry.arr_day - 1]} />
          <ROW label={t('entry.pickup')} value={daysFull[entry.pick_day - 1]} />
          {entry.added_by && <ROW label={t('entry.addedBy')} value={`${entry.added_by} · ${fmtDateTime(entry.added_at)}`} />}
          {allPickupDone && pickedByNames.length > 0 && <ROW label={t('entry.pickedBy')} value={pickedByNames.join(', ')} valueColor="var(--accent-green)" />}
          {!isGroupedPickup && entry.washed && <ROW label={t('entry.washingRow')} value={`${t('entry.washedCheck')}${entry.washed_by ? ` · ${entry.washed_by}` : ''}${entry.washed_at ? ` · ${fmtDateTime(entry.washed_at)}` : ''}`} valueColor="var(--accent-green)" />}
          {(() => { const cn = (clients || []).find(c => c.name === entry.client_name)?.note || entry.comment; return cn ? <ROW label={t('entry.comment')} value={cn} /> : null; })()}

          {isGroupedPickup && (
            <div style={{ marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>
                {t('entry.arrivalDetails')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {pickupEntries.map((item, index) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '28px 1fr auto auto',
                      gap: '8px',
                      alignItems: 'center',
                      padding: '8px 10px',
                      borderRadius: '10px',
                      background: item.done ? 'rgba(142,142,147,0.08)' : 'var(--accent-light)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                      fontWeight: 650,
                    }}
                  >
                    <span style={{ color: 'var(--text-tertiary)' }}>#{index + 1}</span>
                    <span>
                      {daysFull[item.arr_day - 1]}
                      <span style={{ color: 'var(--text-tertiary)', fontWeight: 550 }}> · {item.added_by || '—'}</span>
                    </span>
                    <span>{item.type === 'R' ? t('entry.workwear') : item.type === 'O' ? t('entry.tablecloths') : t('entry.sheets')}</span>
                    <span>{item.weight ? `${item.weight} kg` : '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(() => {
            const canUndone = isPickupContext && (!allPickupDone || isAdmin || pickupEntries.some(e => e.picked_by === user?.name));
            return (
              <div className="ap-btn-group" style={{ marginTop: '16px' }}>
                {canPrintLaundryReceipt && (
                  <button
                    className="ap-btn"
                    style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
                    onClick={openReceiptEditor}
                    disabled={loading}
                  >
                    Kartka
                  </button>
                )}
                {canUndone && (
                  <button className="ap-btn" style={{ background: 'var(--accent-green-light)', color: 'var(--accent-green)' }} onClick={toggleDone} disabled={loading}>
                    {allPickupDone ? t('entry.undoPickup') : t('entry.markPickedUp')}
                  </button>
                )}
                <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={loading}>{t('entry.close')}</button>
              </div>
            );
          })()}

          {canEdit && !isGroupedPickup && !isPickupContext && (
            <button
              className="ap-btn"
              style={{
                width: '100%', marginTop: '8px',
                background: entry.washed ? 'var(--accent-green-light)' : 'var(--bg-secondary)',
                color: entry.washed ? 'var(--accent-green)' : 'var(--text-primary)',
              }}
              onClick={toggleWashed}
              disabled={washing || loading}
            >
              {entry.washed ? t('entry.washedUndo') : t('entry.markWashed')}
            </button>
          )}

          {canEdit && !isGroupedPickup && (
            <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? '1fr 1fr' : '1fr', gap: '8px', marginTop: '8px' }}>
              <button className="ap-btn" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} onClick={() => setEditing(true)} disabled={loading}>{t('entry.edit')}</button>
              {isAdmin && (
                <button className="ap-btn ap-btn-danger" onClick={handleDelete} disabled={loading}>
                  {confirmDelete ? t('entry.confirmDeleteShort') : t('entry.delete')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const fmtDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const hh = String(d.getHours()).padStart(2,'0');
  const min = String(d.getMinutes()).padStart(2,'0');
  return `${dd}.${mm} ${hh}:${min}`;
};

const pfLabelLike = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  fontSize: '11px',
  fontWeight: 700,
  color: 'var(--text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.3px',
};

const receiptTh = {
  padding: '8px 7px',
  borderBottom: '1px solid var(--border)',
  fontSize: '11px',
  fontWeight: 800,
  whiteSpace: 'nowrap',
};

const receiptTd = {
  padding: '5px',
  borderBottom: '1px solid var(--border)',
  verticalAlign: 'middle',
};

const receiptCellInput = {
  width: '100%',
  minHeight: '32px',
  padding: '6px 8px',
  fontSize: '12px',
  boxSizing: 'border-box',
};

const ROW = ({ label, value, valueColor }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', padding: '10px 0' }}>
    <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>{label}</span>
    <span style={{ fontWeight: 600, fontSize: '13px', color: valueColor || 'var(--text-primary)', textAlign: 'right', maxWidth: '60%' }}>{value}</span>
  </div>
);
