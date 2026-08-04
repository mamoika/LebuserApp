import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Package } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { dayNamesFull, dayNamesShort, formatWeekKey, operationalWeekday } from '../../lib/dateUtils';
import { toastError, toastSuccess } from '../../lib/toast';
import { logAction } from '../../lib/logger';
import { effectiveServiceRules, nextServiceSlot } from '../../lib/serviceSchedule';
import {
  LAUNDRY_CATEGORIES,
  firstAllowedLaundryType,
  laundryCategoriesForClient,
  laundryTypeLabel,
} from '../../lib/laundryCategories';
import ArrivalTrolleyPicker, { arrivalTrolleyModeFromEntry, arrivalTrolleyPayload } from './ArrivalTrolleyPicker';
import '../mockups/mockups.css';

// arr_day: 1=PN, 2=WT, 3=ŚR, 4=CZ, 5=PT
function getDefaultPickInfo(arrDay, schedule = 'other', serviceRules = [], weekKey = null) {
  const planned = weekKey ? nextServiceSlot(serviceRules, weekKey, arrDay) : null;
  if (planned) return planned;
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

// Do wyszukiwania klienta: bez wielkości liter i polskich znaków diakrytycznych
// (np. "lodz" trafia "Łódź"). "ł" nie rozkłada się przez NFD, więc
// składamy je ręcznie po normalizacji.
function normalizeSearch(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\u0142/g, 'l');
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

function defaultPickInfoForClient(arrDay, weekKey, clients, routes, clientName) {
  const client = (clients || []).find(item => item.name === clientName);
  return getDefaultPickInfo(
    arrDay,
    clientRouteSchedule(clients, routes, clientName),
    client ? effectiveServiceRules(client, routes) : [],
    weekKey,
  );
}

// Klucz tygodnia przesunięty o n tygodni (n może być >1 — odbiór w dalszym terminie).
function addWeeks(weekKey, n) {
  const parts = (weekKey || '').split('-');
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setDate(d.getDate() + 7 * (Number(n) || 0));
  return formatWeekKey(d);
}

// Ile tygodni dzieli dwa klucze tygodni (do odtworzenia offsetu przy edycji wpisu).
function weeksBetween(fromWeekKey, toWeekKey) {
  if (!fromWeekKey || !toWeekKey) return 0;
  const [ay, am, ad] = fromWeekKey.split('-').map(Number);
  const [by, bm, bd] = toWeekKey.split('-').map(Number);
  const a = new Date(ay, am - 1, ad), b = new Date(by, bm - 1, bd);
  return Math.max(0, Math.round((b - a) / (7 * 86400000)));
}

// Data dnia roboczego (1=Pn..5=Pt) w tygodniu zaczynającym się od weekKey (poniedziałek).
function dateForDay(weekKey, day) {
  const parts = (weekKey || '').split('-').map(Number);
  if (parts.length < 3 || parts.some(Number.isNaN)) {
    const fallback = new Date();
    const wd = Math.min(5, Math.max(1, Number(day) || 1));
    const monday = new Date(fallback);
    monday.setDate(fallback.getDate() - ((fallback.getDay() + 6) % 7));
    monday.setDate(monday.getDate() + (wd - 1));
    return monday;
  }
  const [y, m, d] = parts;
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
  const wk = addWeeks(baseWeekKey, Number(pickWeek) || 0);
  const min = Number(pickWeek) >= 1 ? 1 : (parseInt(arrDay) || 1);
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
    { key: 'type',         label: t('entry.diffType'),       fmt: v => laundryTypeLabel(v, t) },
    { key: 'weight',       label: t('entry.diffWeight'),     fmt: v => (v === null || v === undefined || v === '') ? '—' : `${v} kg` },
    { key: 'arr_day',      label: t('entry.diffArrival'),    fmt: dayLabel },
    { key: 'pick_day',     label: t('entry.diffPickup'),     fmt: dayLabel },
    { key: 'pick_week_key', label: t('entry.diffPickupWeek'), fmt: v => (v ?? '') === '' ? '—' : String(v) },
    { key: 'urgent',       label: t('entry.diffUrgent'),     fmt: v => v ? t('entry.yes') : t('entry.no') },
    { key: 'route_id',     label: t('entry.diffRoute'),      fmt: v => (routes || []).find(r => r.id === v)?.name || '—' },
    { key: 'trolleys',     label: t('entry.trolleys'),       fmt: v => String(v ?? 0) },
    { key: 'arrival_trolley_nos', label: t('entry.trolleyNumbers'), fmt: v => (v ?? '') === '' ? '—' : String(v) },
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

function LaundryTypeSelector({
  client,
  routes,
  value,
  onChange,
  includeCurrent = false,
}) {
  const { t } = useTranslation();
  const enabled = laundryCategoriesForClient(client, routes);
  const visible = LAUNDRY_CATEGORIES.filter(category => (
    enabled.includes(category.code)
    || (includeCurrent && category.code === value)
  ));

  if (visible.length === 0) {
    return (
      <div className="service-schedule-disabled" style={{ marginBottom: '12px' }}>
        {t('clients.laundryOffer.none')}
      </div>
    );
  }

  return (
    <div className="segmented-control" style={{ marginBottom: '12px' }}>
      {visible.map(category => (
        <button
          type="button"
          key={category.code}
          className={`seg-btn type-${category.code} ${value === category.code ? 'active' : ''}`}
          onClick={() => onChange(category.code)}
        >
          {t(category.translationKey)}
        </button>
      ))}
    </div>
  );
}

function receiptDate(weekKey, day) {
  return shortDate(dateForDay(weekKey, day));
}

// „Nazwisko I." — nazwisko + pierwsza litera imienia (Imię Nazwisko -> Nazwisko I.).
function shortSignatory(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const last = parts[parts.length - 1];
  return `${last} ${first[0].toUpperCase()}.`;
}

function formatStamp(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Stałe pozycje druku (zawsze obecne, nazwy nieedytowalne). „Inne" celowo
// usunięte — dodatkowe pozycje dodaje się ręcznie przyciskiem w edytorze.
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
];

// Nakłada zapisane pozycje (po nazwie usługi) na stałą listę RECEIPT_SERVICE_ROWS,
// zachowując kolejność druku. Pozycje dopisane ręcznie (spoza listy) trafiają na koniec
// i są oznaczone custom:true (edytowalna nazwa + możliwość usunięcia).
function mergeReceiptRows(savedItems) {
  const saved = Array.isArray(savedItems) ? savedItems : [];
  const byName = new Map(saved.map(item => [item.name, item]));
  const rows = RECEIPT_SERVICE_ROWS.map(name => {
    const hit = byName.get(name);
    return {
      name,
      custom: false,
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
      custom: true,
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
  // „Zamawiający / podpis przyjmującego" = kto przywiózł/dodał wpis (kierowca),
  // czyli added_by/added_at z wpisu — niezależnie od tego, kto zapisał kartkę.
  const addedBy = first?.added_by || '';
  const addedAt = first?.added_at || null;

  // Kartka już zapisana w bazie — wczytujemy zapisane wartości, a nie budujemy od zera.
  if (existing) {
    return {
      id: existing.id,
      savedDocNo: existing.doc_no,
      status: existing.status || 'open',
      clientName: existing.client_name || client?.name || entry.client_name || '',
      address: existing.address || client?.address || '',
      docNo: existing.doc_no != null ? String(existing.doc_no) : '',
      createdBy: addedBy || existing.created_by || '',
      createdAt: addedAt || existing.created_at || null,
      arrival: existing.arrival || arrival,
      pickup: existing.pickup || pickup,
      modeLabel: existing.mode_label || (mode === 'pick' ? 'wydanie' : 'przyjęcie'),
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
    createdBy: addedBy,
    createdAt: addedAt,
    arrival,
    pickup,
    modeLabel: mode === 'pick' ? 'wydanie' : 'przyjęcie',
    sheetsKg: sheetsKg > 0 ? String(Number(sheetsKg.toFixed(1))) : '',
    tableclothKg: tableclothKg > 0 ? String(Number(tableclothKg.toFixed(1))) : '',
    totalKg: totalKg > 0 ? String(Number(totalKg.toFixed(1))) : '',
    rows: mergeReceiptRows(null),
  };
}

function printLaundryReceipt({ entry, entries, client, mode, receipt, printedBy }) {
  const draft = receipt || buildLaundryReceiptDraft({ entry, entries, client, mode });
  const clientName = draft.clientName || '';
  const address = draft.address || '';
  const sheetsKg = parseFloat(String(draft.sheetsKg).replace(',', '.')) || 0;
  const tableclothKg = parseFloat(String(draft.tableclothKg).replace(',', '.')) || 0;
  const sourceEntries = entries?.length ? entries : [entry];
  const first = sourceEntries[0] || entry;
  const docNo = draft.docNo || '';
  const arrival = draft.arrival || (first ? receiptDate(first.week_key, first.arr_day || 1) : '');
  const pickup = draft.pickup || (first ? receiptDate(first.pick_week_key || first.week_key, first.pick_day || first.arr_day || 1) : '');
  // Zamawiający / podpis przyjmującego = kto dodał pozycje + czas dodania.
  const addedSign = shortSignatory(draft.createdBy);
  const addedStamp = draft.createdAt ? formatStamp(draft.createdAt) : '';
  // Wykonujący / podpis przekazującego = kto drukuje dowód + czas wydruku.
  const printSign = shortSignatory(printedBy);
  const printStamp = formatStamp();
  const typeSummary = [
    sheetsKg > 0 ? `Pościel ${Number(sheetsKg.toFixed(1))} kg` : '',
    tableclothKg > 0 ? `Obrusy ${Number(tableclothKg.toFixed(1))} kg` : '',
  ].filter(Boolean).join(' · ');
  const rows = (draft.rows || RECEIPT_SERVICE_ROWS.map(name => ({ name }))).map((row, index) => {
    const acc = String(row.accepted ?? '').trim();
    const iss = String(row.issued ?? '').trim();
    const diff = acc !== '' && iss !== '' && acc !== iss;
    return `
    <tr class="${diff ? 'diff' : ''}">
      <td class="lp">${index + 1}</td>
      <td class="kind">${escapeHtml(row.name)}</td>
      <td class="qty">${escapeHtml(acc)}</td>
      <td class="qty issued">${escapeHtml(iss)}</td>
      <td class="notes">${escapeHtml(row.notes || '')}</td>
    </tr>`;
  }).join('');
  const generatedAt = new Date().toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });

  const w = window.open('', '_blank', 'width=900,height=1200');
  if (!w) {
    toastError('Przeglądarka zablokowała okno wydruku');
    return;
  }
  w.document.write(`<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8" />
  <title>Kartka prania ${escapeHtml(clientName)} · NR ${escapeHtml(docNo)}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: A4; margin: 12mm; }
    html, body { margin: 0; }
    body {
      font-family: "Times New Roman", Georgia, serif; color: #1a1a1a;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
      background: #f4f5f7;
    }
    .page { width: 186mm; margin: 0 auto; background: #fff; }
    .frame { border: 1.6px solid #1a1a1a; }

    .top { display: grid; grid-template-columns: 1.25fr 1.1fr 1fr; }
    .cell { padding: 9px 11px; border-right: 1px solid #1a1a1a; }
    .cell:last-child { border-right: 0; }
    .brand .logo { font-weight: 800; font-size: 15px; letter-spacing: .4px; }
    .brand .sub { font-size: 10.5px; line-height: 1.5; color: #333; margin-top: 4px; }
    .title { text-align: center; display: flex; flex-direction: column; justify-content: center; }
    .title .doc { font-size: 12px; letter-spacing: 3px; font-weight: 700; color: #444; }
    .title .nr { font-size: 25px; font-weight: 800; margin: 1px 0 3px; }
    .title .nr small { font-size: 12px; font-weight: 700; color: #888; letter-spacing: 1px; }
    .title .what { font-size: 12.5px; font-weight: 700; line-height: 1.25; letter-spacing: .6px; }
    .meta { font-size: 12px; display: flex; flex-direction: column; justify-content: center; }
    .meta .r { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; margin-bottom: 6px; }
    .meta .k { color: #555; white-space: nowrap; }
    .meta .v { font-weight: 700; flex: 1; text-align: right; border-bottom: 1px solid #aaa; padding: 0 0 1px 8px; }
    .badges { display: flex; gap: 6px; margin-top: 2px; }
    .badge { font-size: 10px; font-weight: 700; padding: 2px 9px; border-radius: 999px; text-transform: uppercase; letter-spacing: .5px; border: 1px solid #1a1a1a; }
    .badge.mode { background: #eef3ff; border-color: #2b5fd0; color: #1b3f96; }
    .badge.open { background: #fff6e0; border-color: #b9860b; color: #8a6200; }
    .badge.closed { background: #e7f7ec; border-color: #1f8a45; color: #166534; }

    .company { border-top: 1px solid #1a1a1a; padding: 9px 11px; display: flex; gap: 26px; }
    .company .field { display: flex; align-items: baseline; gap: 9px; }
    .company .field.firm { flex: 1.4; }
    .company .field.addr { flex: 1; }
    .company .label { font-size: 10.5px; color: #555; text-transform: uppercase; letter-spacing: .5px; white-space: nowrap; }
    .company .value { flex: 1; font-size: 16px; font-weight: 700; border-bottom: 1px solid #aaa; padding-bottom: 2px; min-height: 20px; }

    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead th {
      background: #ececec; border: 1px solid #1a1a1a; border-top: 1.4px solid #1a1a1a;
      text-transform: uppercase; font-size: 10px; letter-spacing: .4px; font-weight: 700;
      padding: 5px 6px; height: 9mm;
    }
    tbody td { border: 1px solid #bdbdbd; height: 8.2mm; padding: 1px 7px; font-size: 12.5px; }
    tbody tr:nth-child(even) td { background: #fafafa; }
    .lp { width: 8mm; text-align: center; color: #777; }
    .kind { width: 52mm; }
    .qty { width: 28mm; text-align: center; font-weight: 700; }
    .notes { width: auto; color: #333; }
    tbody tr.diff td { background: #fdebe9; }
    tbody tr.diff td.issued { color: #c0392b; font-weight: 800; }

    .summary { display: grid; grid-template-columns: 1fr 1fr 1fr; border: 1px solid #1a1a1a; border-top: 1.4px solid #1a1a1a; }
    .summary .box { padding: 7px 11px; border-right: 1px solid #bdbdbd; }
    .summary .box:last-child { border-right: 0; }
    .summary .box.total { background: #ececec; }
    .summary .lbl { font-size: 9.5px; text-transform: uppercase; color: #555; letter-spacing: .4px; }
    .summary .val { font-size: 17px; font-weight: 800; }
    .summary .val small { font-size: 11px; font-weight: 700; color: #777; }

    .sign-head { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #1a1a1a; border-top: 0; }
    .sign-head div { text-align: center; font-weight: 700; font-size: 11.5px; padding: 5px; border-right: 1px solid #1a1a1a; text-transform: uppercase; letter-spacing: .5px; }
    .sign-head div:last-child { border-right: 0; }
    .sign-grid { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid #1a1a1a; border-top: 0; }
    .sign-grid .box { border-right: 1px solid #bdbdbd; padding: 5px 8px 7px; min-height: 23mm; display: flex; flex-direction: column; justify-content: flex-end; }
    .sign-grid .box:nth-child(2) { border-right: 1.4px solid #1a1a1a; }
    .sign-grid .box:last-child { border-right: 0; }
    .sign-grid .filled { text-align: center; margin-bottom: 4px; }
    .sign-grid .filled .who { font-weight: 700; font-size: 12.5px; }
    .sign-grid .filled .when { font-size: 9.5px; color: #555; }
    .sign-grid .cap { border-top: 1px dotted #888; padding-top: 3px; font-size: 9px; color: #666; text-align: center; }

    .foot { display: flex; justify-content: space-between; align-items: center; margin-top: 7px; font-size: 9.5px; color: #888; }

    .toolbar { padding: 14px 0; text-align: center; }
    .print-btn { padding: 9px 20px; font: 700 13px system-ui; border: 0; border-radius: 8px; background: #007aff; color: #fff; cursor: pointer; box-shadow: 0 2px 8px rgba(0,122,255,.3); }
    @media print { .toolbar { display: none; } body { background: #fff; } .page { width: auto; } }
  </style>
</head>
<body>
  <div class="toolbar"><button class="print-btn" onclick="window.print()">🖨 Drukuj kartkę</button></div>
  <div class="page">
    <div class="frame">
      <div class="top">
        <div class="cell brand">
          <div class="logo">Lebuser Textilservice Sp. z o.o.</div>
          <div class="sub">
            ul. Owcza 10, 66-400 Gorzów Wielkopolski<br>
            NIP: 9271945131 · REGON: 365910038<br>
            KRS: 0000648492<br>
            tel. 502 552 123 · kontakt@lebuser.pl<br>
            www.lebuser.pl
          </div>
        </div>
        <div class="cell title">
          <div class="doc">DOWÓD</div>
          <div class="nr"><small>NR</small> ${escapeHtml(docNo)}</div>
          <div class="what">PRZYJĘCIA I WYDANIA<br>BIELIZNY DO PRANIA</div>
        </div>
        <div class="cell meta">
          <div class="r"><span class="k">Data przyjęcia</span><span class="v">${escapeHtml(arrival)}</span></div>
          <div class="r"><span class="k">Termin wykonania</span><span class="v">${escapeHtml(pickup)}</span></div>
        </div>
      </div>
      <div class="company">
        <div class="field firm"><span class="label">Firma / hotel</span><span class="value">${escapeHtml(clientName)}</span></div>
        <div class="field addr"><span class="label">Adres</span><span class="value">${escapeHtml(address)}</span></div>
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
        <div class="box"><div class="lbl">Pościel</div><div class="val">${escapeHtml(draft.sheetsKg || '—')} <small>kg</small></div></div>
        <div class="box"><div class="lbl">Obrusy</div><div class="val">${escapeHtml(draft.tableclothKg || '—')} <small>kg</small></div></div>
        <div class="box total"><div class="lbl">Razem</div><div class="val">${escapeHtml(draft.totalKg || '—')} <small>kg</small></div></div>
      </div>
      <div class="sign-head">
        <div>Zamawiający</div>
        <div>Wykonujący</div>
      </div>
      <div class="sign-grid">
        <div class="box"><div class="cap">podpis przekazującego</div></div>
        <div class="box">
          ${addedSign ? `<div class="filled"><div class="who">${escapeHtml(addedSign)}</div>${addedStamp ? `<div class="when">${escapeHtml(addedStamp)}</div>` : ''}</div>` : ''}
          <div class="cap">podpis przyjmującego</div>
        </div>
        <div class="box">
          ${printSign ? `<div class="filled"><div class="who">${escapeHtml(printSign)}</div><div class="when">${escapeHtml(printStamp)}</div></div>` : ''}
          <div class="cap">podpis przekazującego</div>
        </div>
        <div class="box"><div class="cap">podpis przyjmującego</div></div>
      </div>
    </div>
    <div class="foot">
      <span>${escapeHtml(typeSummary || 'Kartka wygenerowana z systemu harmonogramu')}</span>
      <span>Wygenerowano: ${escapeHtml(generatedAt)}</span>
    </div>
  </div>
</body>
</html>`);
  w.document.close();
  setTimeout(() => w.print(), 250);
}

// Ponowny wydruk zapisanej kartki (z listy/historii) — mapuje wiersz z bazy na
// kształt draftu i korzysta z tej samej funkcji druku co edytor.
export function printSavedLaundryReceipt(row, printedBy) {
  if (!row) return;
  const draft = {
    clientName: row.client_name || '',
    address: row.address || '',
    docNo: row.doc_no != null ? String(row.doc_no) : '',
    createdBy: row.created_by || '',
    createdAt: row.created_at || null,
    arrival: row.arrival || '',
    pickup: row.pickup || '',
    modeLabel: row.mode_label || '',
    sheetsKg: row.sheets_kg != null ? String(row.sheets_kg) : '',
    tableclothKg: row.tablecloth_kg != null ? String(row.tablecloth_kg) : '',
    totalKg: row.total_kg != null ? String(row.total_kg) : '',
    rows: mergeReceiptRows(row.items),
  };
  printLaundryReceipt({ receipt: draft, printedBy });
}

export function AddEntryModal({ isOpen, onClose, defaultArrDay, weekKey, clients, routes, onAdded, defaultClientName, defaultType }) {
  const { t } = useTranslation();
  const { user, isDriver, isAdmin, sessionToken } = useAuth();
  const [clientName, setClientName] = useState('');
  const [clientQuery, setClientQuery] = useState('');
  const [clientListOpen, setClientListOpen] = useState(false);
  const [showOtherRoutes, setShowOtherRoutes] = useState(false);
  const [type, setType] = useState('P');
  const [weight, setWeight] = useState('');
  const [arrDay, setArrDay] = useState(defaultArrDay || 1);
  const [pickDay, setPickDay] = useState(defaultArrDay || 1);
  const [pickWeek, setPickWeek] = useState(0); // 0 = same, 1 = next
  const [trolleyMode, setTrolleyMode] = useState('none');
  const [selectedTrolleys, setSelectedTrolleys] = useState([]);
  const [urgent, setUrgent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [explicitRouteId, setExplicitRouteId] = useState('');
  const isClientScoped = !!defaultClientName;
  const resolvedWeekKey = useMemo(() => {
    if (weekKey) return weekKey;
    const anchor = new Date();
    const day = defaultArrDay || operationalWeekday(anchor);
    const monday = new Date(anchor);
    monday.setDate(anchor.getDate() - (day - 1));
    return formatWeekKey(monday);
  }, [weekKey, defaultArrDay]);
  const isDriverStopFlow = isClientScoped && Boolean(weekKey) && isDriver;

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
  const filteredClients = useMemo(() => {
    const q = normalizeSearch(clientQuery);
    if (!q) return selectableClients;
    return selectableClients.filter(c => normalizeSearch(c.name).includes(q));
  }, [selectableClients, clientQuery]);

  const selectClient = (name) => {
    setClientName(name);
    setClientQuery(name);
    setClientListOpen(false);
    const selectedClient = clients.find(c => c.name === name);
    const { pickDay: pd, pickWeek: pw } = defaultPickInfoForClient(arrDay, resolvedWeekKey, clients, routes, name);
    setPickDay(pd);
    setPickWeek(pw);
    setType(firstAllowedLaundryType(selectedClient, routes) || '');
  };

  useEffect(() => {
    if (isOpen) {
      const day = defaultArrDay || 1;
      // Jeśli podano defaultClientName, pre-wybierz tego klienta; inaczej pierwszy z tras
      let initClient;
      if (defaultClientName) {
        initClient = clients.find(c => c.name === defaultClientName);
      }
      if (!initClient) initClient = firstClientByRouteOrder(ownClients, routes);
      const { pickDay: pd, pickWeek: pw } = defaultPickInfoForClient(day, resolvedWeekKey, clients, routes, initClient?.name);
      setArrDay(day);
      setPickDay(pd);
      setPickWeek(pw);
      setShowOtherRoutes(false);
      setClientName(initClient?.name || '');
      setClientQuery(initClient?.name || '');
      setClientListOpen(false);
      setWeight('');
      setType(firstAllowedLaundryType(initClient, routes, defaultType) || '');
      setTrolleyMode('none');
      setSelectedTrolleys([]);
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
      setClientQuery(nextClient?.name || '');
      const { pickDay: pd, pickWeek: pw } = defaultPickInfoForClient(arrDay, resolvedWeekKey, clients, routes, nextClient?.name);
      setPickDay(pd);
      setPickWeek(pw);
      setType(firstAllowedLaundryType(nextClient, routes) || '');
    }
  }, [isOpen, showOtherRoutes, selectableClients, routes, clients, clientName, arrDay, defaultClientName]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const client = clients.find(c => c.name === clientName);
      if (!client) throw new Error(t('entry.selectClient'));
      if (!laundryCategoriesForClient(client, routes).includes(type)) {
        throw new Error(t('entry.noLaundryTypeEnabled'));
      }
      if (trolleyMode === 'trolley' && selectedTrolleys.length === 0) {
        throw new Error(t('entry.trolleyRequired'));
      }
      const routeId = explicitRouteId ? Number(explicitRouteId) : (client ? client.route_id : 1);
      const trolleyData = arrivalTrolleyPayload(trolleyMode, selectedTrolleys);

      // Calculate pick_week_key — offset 0/1 (kierowca) lub dalej (admin)
      const pickWeekKey = addWeeks(resolvedWeekKey, Number(pickWeek) || 0);

      // Unikalne ID — sam timestamp w ms powodował kolizje przy szybkim dodawaniu
      // dwóch wpisów (ten sam id → akcje/grupowanie łączyły je w jedno zamówienie).
      const newEntryId = 'ID_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const { data, error } = await supabase.rpc('admin_insert_entry', {
        p_session_token: sessionToken,
        p_id: newEntryId,
        p_week_key: resolvedWeekKey,
        p_client_name: clientName,
        p_arr_day: parseInt(arrDay),
        p_pick_day: parseInt(pickDay),
        p_pick_week_key: pickWeekKey,
        p_route_id: routeId,
        p_type: type,
        p_weight: weight ? parseFloat(weight.replace(',', '.')) : null,
        p_trolleys: trolleyData.trolleys,
        p_arrival_trolley_nos: trolleyData.arrival_trolley_nos,
        p_urgent: urgent,
        p_added_by: user.name,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const trolleyLabel = trolleyData.arrival_trolley_nos || t('entry.trolleyNoneShort');
      await logAction({ sessionToken, action: 'added', clientName, entryId: newEntryId, details: `${laundryTypeLabel(type, t)}${weight ? ', ' + weight + ' kg' : ''}, ${t('entry.trolleys')}: ${trolleyLabel}` });
      await onAdded?.({ id: newEntryId, clientName, routeId, type, weight, trolleys: trolleyData.trolleys, arrival_trolley_nos: trolleyData.arrival_trolley_nos });
      onClose();
    } catch (err) {
      toastError(t('entry.errAdding') + ' ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ap-overlay" style={{ display: 'flex' }}>
      <div className={`ap-sheet ${isDriverStopFlow ? 'is-driver-dirty' : ''}`}>
        <div className="ap-handle"></div>
        <div className="ap-content">
          <div className="live-entry-modal-head">
            <div className="live-entry-modal-icon" aria-hidden="true"><Package size={22} /></div>
            <div>
              <div className="ap-title live-entry-modal-title">
                {isClientScoped ? (clientName || defaultClientName) : t('entry.addArrival')}
              </div>
              <div className="live-entry-modal-subtitle">
                {isClientScoped ? t('entry.dirtyToLaundry') : user?.name}
              </div>
            </div>
          </div>

          {!isClientScoped && (
            <>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.client')}</div>
              <div style={{ marginBottom: '12px' }}>
                <input
                  type="text"
                  className="ap-input"
                  style={{ padding: '12px 14px' }}
                  placeholder={t('entry.searchClientPlaceholder')}
                  value={clientQuery}
                  onFocus={() => { if (clientQuery === clientName) setClientQuery(''); setClientListOpen(true); }}
                  onBlur={() => setTimeout(() => setClientListOpen(false), 150)}
                  onChange={e => { setClientQuery(e.target.value); setClientListOpen(true); }}
                />
                {clientListOpen && (
                  <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '12px', marginTop: '6px' }}>
                    {routes
                      .filter(r => filteredClients.some(c => c.route_id === r.id))
                      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                      .map(r => (
                        <div key={r.id}>
                          <div style={{ padding: '6px 14px', fontSize: '10px', fontWeight: 700, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', background: 'var(--bg-secondary)' }}>
                            {r.name}{hasAssignedRouteFilter && assignedRouteIds.has(r.id) ? t('entry.yourRouteSuffix') : ''}
                          </div>
                          {filteredClients
                            .filter(c => c.route_id === r.id)
                            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                            .map(c => (
                              <button
                                type="button"
                                key={c.id}
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => selectClient(c.name)}
                                style={{
                                  display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px',
                                  border: 'none', cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit',
                                  background: clientName === c.name ? 'rgba(0,122,255,0.1)' : 'transparent',
                                  fontWeight: clientName === c.name ? 700 : 400,
                                  color: clientName === c.name ? 'var(--accent)' : 'inherit',
                                }}
                              >
                                {c.name}
                              </button>
                            ))}
                        </div>
                      ))}
                    {filteredClients.length === 0 && (
                      <div style={{ padding: '14px', textAlign: 'center', color: 'rgba(60,60,67,0.4)', fontSize: '13px' }}>{t('entry.noClientResults')}</div>
                    )}
                  </div>
                )}
              </div>
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

          {isAdmin && !isDriverStopFlow && (
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
          <LaundryTypeSelector
            client={clients.find(c => c.name === clientName)}
            routes={routes}
            value={type}
            onChange={setType}
          />

          <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.weightOptional')}</div>
          <input type="text" className="ap-input" placeholder={t('entry.weightPlaceholder')} style={{ marginBottom: '12px' }} inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} />

          <div className="live-entry-date-grid">
            <div>
              <div className="live-entry-field-label">{t('entry.arrivalDay')}</div>
              {isDriverStopFlow ? (
                <div className="live-entry-locked-day">{dayWithDate(resolvedWeekKey, arrDay)}</div>
              ) : (
                <select className="ap-input" value={arrDay} onChange={e => { const { pickDay: pd, pickWeek: pw } = defaultPickInfoForClient(e.target.value, resolvedWeekKey, clients, routes, clientName); setArrDay(e.target.value); setPickDay(pd); setPickWeek(pw); }}>
                  {dayNamesShort().map((name, i) => <option key={i} value={i + 1}>{name} {shortDate(dateForDay(resolvedWeekKey, i + 1))}</option>)}
                </select>
              )}
            </div>
            <div>
              <div className="live-entry-field-label">{t('entry.pickupDay')}</div>
              <select className="ap-input" value={pickDay} onChange={e => setPickDay(Number(e.target.value))}>
                {buildPickDayOptions(resolvedWeekKey, arrDay, pickWeek, pickDay).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div className="live-entry-field-label">{t('entry.pickupWeek')}</div>
            <div className="live-entry-week-row">
              <select className="ap-input" style={{ flex: 1 }} value={pickWeek} onChange={e => { const w = Number(e.target.value); setPickWeek(w); if (w === 0 && Number(pickDay) < (parseInt(arrDay) || 1)) setPickDay(parseInt(arrDay) || 1); }}>
                <option value={0}>{t('entry.sameWeek')}</option>
                <option value={1}>{t('entry.nextWeek')}</option>
                {(isAdmin || pickWeek > 1) && Array.from({ length: Math.max(2, pickWeek) - 1 }, (_, i) => i + 2).map(n => (
                  <option key={n} value={n}>+{n} tyg. ({shortDate(dateForDay(addWeeks(resolvedWeekKey, n), 1))})</option>
                ))}
              </select>
              {isAdmin && !isDriverStopFlow && (
                <button type="button" className="live-entry-week-plus" title="Przesuń odbiór o tydzień dalej" onClick={() => setPickWeek(p => Number(p) + 1)}>+</button>
              )}
            </div>
          </div>

          <ArrivalTrolleyPicker
            sessionToken={sessionToken}
            clientName={clientName}
            mode={trolleyMode}
            onModeChange={setTrolleyMode}
            selected={selectedTrolleys}
            onSelectedChange={setSelectedTrolleys}
            disabled={loading}
          />

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, marginBottom: '4px', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: '18px', height: '18px' }} checked={urgent} onChange={e => setUrgent(e.target.checked)} />
            <span style={{ color: 'var(--accent-red)' }}>{t('entry.urgent')}</span>
          </label>

          <div className="ap-btn-group" style={{ marginTop: '18px' }}>
            <button className="ap-btn ap-btn-primary" onClick={handleSubmit} disabled={loading || !type}>{loading ? t('entry.adding') : t('entry.add')}</button>
            <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={loading}>{t('common.cancel')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ViewEditEntryModal({ isOpen, onClose, entry, relatedEntries = [], onUpdated, onDeleted, routes, clients = [], receipts = [], contextMode = 'view', initiallyEditing = false, source = null, entryAssignmentLabel = null, entryAssignmentCaption = 'Przywiezie' }) {
  const { t } = useTranslation();
  const { isAdmin, canEdit, isViewer, user, sessionToken } = useAuth();
  const [editing, setEditing] = useState(false);
  const [clientName, setClientName] = useState('');
  const [type, setType] = useState('P');
  const [weight, setWeight] = useState('');
  const [arrDay, setArrDay] = useState(1);
  const [pickDay, setPickDay] = useState(1);
  const [pickWeek, setPickWeek] = useState(0); // 0 = same, 1 = next week
  const [trolleyMode, setTrolleyMode] = useState('none');
  const [selectedTrolleys, setSelectedTrolleys] = useState([]);
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
      setPickWeek(weeksBetween(entry.week_key, entry.pick_week_key));
      const trolleyState = arrivalTrolleyModeFromEntry(entry);
      setTrolleyMode(trolleyState.mode);
      setSelectedTrolleys(trolleyState.numbers);
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
  const isPickupContext = contextMode === 'pick';
  const pickupEntries = isPickupContext && relatedEntries.length > 0 ? relatedEntries : [entry];
  const isGroupedPickup = isPickupContext && pickupEntries.length > 1;
  // W widoku ODBIORÓW „entry" to syntetyczna grupa z id "pickup-..." (patrz
  // groupPickupEntries w ScheduleView) — taki wiersz nie istnieje w bazie.
  // Dla pojedynczego odbioru operujemy więc na PRAWDZIWYM wpisie, żeby edycja /
  // usuwanie / „wyprane" trafiały w istniejący rekord (inaczej: „Nie znaleziono wpisu").
  const targetEntry = isPickupContext ? (pickupEntries[0] || entry) : entry;
  const pickupTotalWeight = pickupEntries.reduce((sum, e) => sum + (parseFloat(e.weight) || 0), 0);
  const pendingPickupEntries = pickupEntries.filter(e => !e.done);
  const pickupPendingWeight = pendingPickupEntries.reduce((sum, e) => sum + (parseFloat(e.weight) || 0), 0);
  const allPickupDone = pickupEntries.every(e => e.done);
  const pickedByNames = [...new Set(pickupEntries.map(e => e.picked_by).filter(Boolean))];
  const daysFull = dayNamesFull();
  const pickupArrivalDays = [...new Set(pickupEntries.map(e => daysFull[(e.arr_day || 1) - 1]).filter(Boolean))].join(', ');
  const pickupTypes = [...new Set(pickupEntries.map(item => item.type || 'P'))];
  const pickupTypeLabel = pickupTypes.map(item => laundryTypeLabel(item, t)).join(' + ');
  const directEditMode = contextMode === 'arr' && initiallyEditing;
  const showEditForm = canEdit && (editing || directEditMode);
  const selectedClientDetails = (clients || []).find(c => c.name === entry.client_name);
  const canPrintLaundryReceipt = source === 'schedule' && (isViewer || isAdmin);
  const canSaveLaundryReceipt = source === 'schedule' && canEdit;
  const receiptEntries = isPickupContext ? pickupEntries : [targetEntry];
  const canChangeClient = contextMode !== 'arr' || isAdmin;

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
        // Zapisujemy pozycje z jakąkolwiek wartością, a pozycje dopisane ręcznie
        // także gdy mają samą nazwę (żeby przetrwały po ponownym otwarciu kartki).
        .filter(row => row.accepted || row.issued || row.notes || (row.custom && row.name && row.name.trim()))
        .map(row => ({
          name: (row.name || '').trim(),
          accepted: row.accepted || '',
          issued: row.issued || '',
          notes: row.notes || '',
        }))
        .filter(row => row.name);
      const { data, error } = await supabase.rpc('admin_save_laundry_receipt', {
        p_session_token: sessionToken,
        p_id: receiptDraft.id || null,
        p_doc_no: (receiptDraft.docNo || '').trim() || null,
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
          docNo: saved.doc_no != null ? String(saved.doc_no) : prev.docNo,
          // createdBy/createdAt zostają z wpisu (kto przywiózł) — nie nadpisujemy ich
          // osobą zapisującą kartkę.
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

  const addReceiptRow = () => {
    setReceiptDraft(prev => ({
      ...prev,
      rows: [...prev.rows, { name: '', custom: true, accepted: '', issued: '', notes: '' }],
    }));
  };

  const removeReceiptRow = (index) => {
    setReceiptDraft(prev => ({
      ...prev,
      rows: prev.rows.filter((_, i) => i !== index),
    }));
  };

  const handleClientChange = (name) => {
    setClientName(name);
    const selected = (clients || []).find(c => c.name === name);
    if (selected?.route_id) {
      setRouteId(selected.route_id);
      const { pickDay: pd, pickWeek: pw } = defaultPickInfoForClient(arrDay, targetEntry.week_key, clients, routes, name);
      setPickDay(pd);
      setPickWeek(pw);
      setType(firstAllowedLaundryType(selected, routes) || '');
    }
  };

  const toggleDone = async () => {
    try {
      setLoading(true);
      const isDone = !allPickupDone;

      const affectedEntries = isDone ? pendingPickupEntries : pickupEntries;
      const ids = affectedEntries.map(e => e.id);
      if (ids.length === 0) {
        setLoading(false);
        return;
      }
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
        details: isGroupedPickup ? t('entry.logDoneDetails', {
          count: affectedEntries.length,
          weight: (isDone ? pickupPendingWeight : pickupTotalWeight)
            ? Number((isDone ? pickupPendingWeight : pickupTotalWeight).toFixed(1)) + ' kg'
            : t('entry.noWeight'),
        }) : undefined,
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
        details: `${laundryTypeLabel(targetEntry.type, t)}${targetEntry.weight ? ', ' + targetEntry.weight + ' kg' : ''}`,
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
      if (!type) {
        throw new Error(t('entry.noLaundryTypeEnabled'));
      }
      if (trolleyMode === 'trolley' && selectedTrolleys.length === 0) {
        throw new Error(t('entry.trolleyRequired'));
      }

      const pickWeekKey = addWeeks(targetEntry.week_key, Number(pickWeek) || 0);

      const effectiveClientName = canChangeClient ? clientName : targetEntry.client_name;
      const effectiveClient = (clients || []).find(c => c.name === effectiveClientName);
      const nextRouteId = canChangeClient
        ? (routeId || effectiveClient?.route_id || targetEntry.route_id || null)
        : (targetEntry.route_id || null);
      const trolleyData = arrivalTrolleyPayload(trolleyMode, selectedTrolleys);

      let updates = {
        client_name: effectiveClientName,
        type: type,
        weight: weight ? parseFloat(String(weight).replace(',', '.')) : null,
        arr_day: parseInt(arrDay),
        pick_day: parseInt(pickDay),
        pick_week_key: pickWeekKey,
        trolleys: trolleyData.trolleys,
        arrival_trolley_nos: trolleyData.arrival_trolley_nos,
        urgent,
        route_id: nextRouteId
        // comment usunięty z entries — teraz w clients.note (wspólna notatka)
      };

      const { data: editData, error } = await supabase.rpc('admin_update_entry', {
        p_session_token: sessionToken,
        p_id: targetEntry.id,
        p_client_name: effectiveClientName,
        p_type: type,
        p_arr_day: parseInt(arrDay),
        p_pick_day: parseInt(pickDay),
        p_pick_week_key: pickWeekKey,
        p_route_id: nextRouteId,
        p_weight: weight ? parseFloat(String(weight).replace(',', '.')) : null,
        p_trolleys: trolleyData.trolleys,
        p_arrival_trolley_nos: trolleyData.arrival_trolley_nos,
        p_urgent: urgent,
      });
      if (error) throw error;
      if (editData?.error) throw new Error(editData.error);

      // Zapisz komentarz do clients.note (wspólny dla całego klienta)
      const currentClientNote = (clients || []).find(c => c.name === entry.client_name)?.note || '';
      if (comment !== (currentClientNote || '')) {
        await supabase.rpc('admin_set_client_note', {
          p_session_token: sessionToken,
          p_name: effectiveClientName.trim() || entry.client_name,
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
      if (isAdmin && contextMode === 'arr' && targetEntry.client_name !== updates.client_name) {
        const originalBy = targetEntry.added_by || targetEntry.picked_by || targetEntry.delivered_by || '—';
        changes.unshift(`korekta hotelu przez admina: ${targetEntry.client_name || '—'} → ${updates.client_name || '—'}; pierwotnie dodał/przywiózł: ${originalBy}`);
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
          type: laundryTypeLabel(targetEntry.type, t),
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
    const kpMismatches = (receiptDraft.rows || []).filter(r => {
      const a = String(r.accepted ?? '').trim();
      const i = String(r.issued ?? '').trim();
      return a !== '' && i !== '' && a !== i;
    }).length;
    return (
      <div className="ap-overlay" style={{ display: 'flex' }}>
        <div className="ap-sheet" style={{ maxWidth: '780px' }}>
          <div className="ap-handle"></div>
          <div className="ap-content">
            <style>{KP_STYLE}</style>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '11px', background: 'linear-gradient(145deg,#007AFF,#0055CC)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '19px', flexShrink: 0 }}>🧾</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="ap-title" style={{ textAlign: 'left', fontSize: '18px' }}>Kartka prania</div>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{receiptDraft.clientName || '—'}</div>
              </div>
            </div>

            {/* Edytor stylizowany na papierowy DOWÓD — żeby nie mylił się z innym formularzem */}
            <div className="kp-doc">
              <div className="kp-top">
                <div className="kp-cell">
                  <div className="kp-logo">Lebuser Textilservice Sp. z o.o.</div>
                  <div className="kp-sub">ul. Owcza 10, 66-400 Gorzów Wielkopolski<br/>NIP: 9271945131 · REGON: 365910038<br/>tel. 502 552 123 · kontakt@lebuser.pl</div>
                </div>
                <div className="kp-cell kp-title">
                  <div className="kp-doclbl">DOWÓD</div>
                  <div className="kp-nr">
                    NR <input className="kp-in" value={receiptDraft.docNo} onChange={e => setReceiptField('docNo', e.target.value)} placeholder="wpisz nr" title="Numer dowodu — wpisywany ręcznie" />
                  </div>
                  <div className="kp-what">PRZYJĘCIA I WYDANIA<br/>BIELIZNY DO PRANIA</div>
                </div>
                <div className="kp-cell kp-meta">
                  <div className="kp-mrow"><span className="kp-mk">Data przyjęcia</span><input className="kp-in" value={receiptDraft.arrival} onChange={e => setReceiptField('arrival', e.target.value)} /></div>
                  <div className="kp-mrow"><span className="kp-mk">Termin wykonania</span><input className="kp-in" value={receiptDraft.pickup} onChange={e => setReceiptField('pickup', e.target.value)} /></div>
                  {receiptDraft.id && (
                    <div className="kp-badges">
                      <span className={`kp-badge ${receiptDraft.status === 'closed' ? 'closed' : 'open'}`}>{receiptDraft.status === 'closed' ? 'Zamknięta' : 'Otwarta'}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="kp-company">
                <div className="kp-field firm"><span className="kp-lbl">Firma / hotel</span><input className="kp-in" value={receiptDraft.clientName} onChange={e => setReceiptField('clientName', e.target.value)} /></div>
                <div className="kp-field"><span className="kp-lbl">Adres</span><input className="kp-in" value={receiptDraft.address} onChange={e => setReceiptField('address', e.target.value)} /></div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="kp-table">
                  <thead>
                    <tr>
                      <th className="kp-lp">Lp.</th>
                      <th className="kp-kind">Rodzaj usługi</th>
                      <th className="kp-qty">Ilość przyjęta</th>
                      <th className="kp-qty">Ilość wydana</th>
                      <th>Uwagi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiptDraft.rows.map((row, index) => {
                      const acc = String(row.accepted ?? '').trim();
                      const iss = String(row.issued ?? '').trim();
                      const mismatch = acc !== '' && iss !== '' && acc !== iss;
                      return (
                      <tr key={index} className={mismatch ? 'diff' : ''}>
                        <td className="kp-lp">{index + 1}</td>
                        <td className="kp-kind">
                          {row.custom ? (
                            <div className="kp-namewrap">
                              <input className="kp-cellin" value={row.name} placeholder="Nazwa pozycji" onChange={e => setReceiptRow(index, 'name', e.target.value)} />
                              <button type="button" className="kp-rm" onClick={() => removeReceiptRow(index)} title="Usuń pozycję">×</button>
                            </div>
                          ) : (
                            <span className="kp-kindname">{row.name}</span>
                          )}
                        </td>
                        <td className="kp-qty"><input className="kp-cellin" value={row.accepted} inputMode="numeric" onChange={e => setReceiptRow(index, 'accepted', e.target.value)} /></td>
                        <td className={`kp-qty kp-issued ${mismatch ? 'diff' : ''}`}><input className="kp-cellin" value={row.issued} inputMode="numeric" onChange={e => setReceiptRow(index, 'issued', e.target.value)} /></td>
                        <td><input className="kp-cellin" value={row.notes} onChange={e => setReceiptRow(index, 'notes', e.target.value)} /></td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <button type="button" className="kp-add" onClick={addReceiptRow}>+ Dodaj pozycję</button>

              <div className="kp-summary">
                <div className="kp-box">
                  <div className="kp-boxlbl">Pościel</div>
                  <div className="kp-boxval"><input className="kp-in" value={receiptDraft.sheetsKg} inputMode="decimal" onChange={e => setReceiptField('sheetsKg', e.target.value)} /><span className="kp-unit">kg</span></div>
                </div>
                <div className="kp-box">
                  <div className="kp-boxlbl">Obrusy</div>
                  <div className="kp-boxval"><input className="kp-in" value={receiptDraft.tableclothKg} inputMode="decimal" onChange={e => setReceiptField('tableclothKg', e.target.value)} /><span className="kp-unit">kg</span></div>
                </div>
                <div className="kp-box total">
                  <div className="kp-boxlbl">Razem</div>
                  <div className="kp-boxval"><input className="kp-in" value={receiptDraft.totalKg} inputMode="decimal" onChange={e => setReceiptField('totalKg', e.target.value)} /><span className="kp-unit">kg</span></div>
                </div>
              </div>
            </div>

            {kpMismatches > 0 && (
              <div style={{ fontSize: '12px', color: '#d70015', fontWeight: 600, margin: '10px 0 0' }}>
                ⚠ Różnica przyjęte/wydane w {kpMismatches} {kpMismatches === 1 ? 'pozycji' : 'pozycjach'}
              </div>
            )}

            <div className="ap-btn-group" style={{ marginTop: '14px' }}>
              {canSaveLaundryReceipt && (
                <button className="ap-btn ap-btn-primary" onClick={saveReceipt} disabled={savingReceipt}>
                  {savingReceipt ? 'Zapisywanie…' : (receiptDraft.id ? 'Zapisz zmiany' : 'Zapisz')}
                </button>
              )}
              <button className="ap-btn ap-btn-secondary" onClick={() => printLaundryReceipt({ entry: targetEntry, entries: receiptEntries, client: selectedClientDetails, mode: contextMode, receipt: receiptDraft, printedBy: user.name })}>Drukuj</button>
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

            {canChangeClient && (
              <>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>
                  {contextMode === 'arr' ? 'Hotel / klient do korekty' : t('entry.client')}
                </div>
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
            <LaundryTypeSelector
              client={clients.find(c => c.name === clientName)}
              routes={routes}
              value={type}
              onChange={setType}
              includeCurrent
            />

            <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.weight')}</div>
            <input type="text" className="ap-input" value={weight} onChange={e => setWeight(e.target.value)} style={{ marginBottom: '14px' }} inputMode="decimal" />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.arrival')}</div>
                <select
                  className="ap-input"
                  value={arrDay}
                  onChange={e => {
                    const { pickDay: pd, pickWeek: pw } = defaultPickInfoForClient(e.target.value, targetEntry.week_key, clients, routes, clientName);
                    setArrDay(e.target.value);
                    setPickDay(pd);
                    setPickWeek(pw);
                  }}
                >
                  {daysFull.map((name, i) => <option key={i} value={i + 1}>{name} {shortDate(dateForDay(targetEntry.week_key, i + 1))}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.pickup')}</div>
                <select className="ap-input" value={pickDay} onChange={e => setPickDay(Number(e.target.value))}>
                  {buildPickDayOptions(targetEntry.week_key, arrDay, pickWeek, pickDay).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.pickupWeek')}</div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <select className="ap-input" style={{ flex: 1 }} value={pickWeek} onChange={e => { const w = Number(e.target.value); setPickWeek(w); if (w === 0 && Number(pickDay) < (parseInt(arrDay) || 1)) setPickDay(parseInt(arrDay) || 1); }}>
                    <option value={0}>{t('entry.sameWeek')}</option>
                    <option value={1}>{t('entry.nextWeek')}</option>
                    {(isAdmin || pickWeek > 1) && Array.from({ length: Math.max(2, pickWeek) - 1 }, (_, i) => i + 2).map(n => (
                      <option key={n} value={n}>+{n} tyg. ({shortDate(dateForDay(addWeeks(targetEntry.week_key, n), 1))})</option>
                    ))}
                  </select>
                  {isAdmin && (
                    <button type="button" className="ap-input" style={{ width: '40px', flexShrink: 0, cursor: 'pointer', fontWeight: 700, color: 'var(--accent)' }} title="Przesuń odbiór o tydzień dalej" onClick={() => setPickWeek(p => Number(p) + 1)}>+</button>
                  )}
                </div>
              </div>
            </div>

            <ArrivalTrolleyPicker
              sessionToken={sessionToken}
              clientName={clientName || targetEntry.client_name}
              mode={trolleyMode}
              onModeChange={setTrolleyMode}
              selected={selectedTrolleys}
              onSelectedChange={setSelectedTrolleys}
              disabled={loading}
            />

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
              <button className="ap-btn ap-btn-primary" onClick={handleSaveEdit} disabled={loading || !type}>{t('entry.save')}</button>
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
          <ROW label={t('entry.kind')} value={isPickupContext ? pickupTypeLabel : laundryTypeLabel(entry.type, t)} />
          <ROW
            label={t('entry.weight')}
            value={isPickupContext
              ? (allPickupDone
                ? (pickupTotalWeight ? `${Number(pickupTotalWeight.toFixed(1))} kg` : '—')
                : (pickupPendingWeight ? `${Number(pickupPendingWeight.toFixed(1))} kg` : '—'))
              : (entry.weight ? `${entry.weight} kg` : '—')}
          />
          {!isGroupedPickup && (
            <ROW
              label={t('entry.trolleys')}
              value={entry.arrival_trolley_nos || (entry.trolleys ? String(entry.trolleys) : t('entry.trolleyNoneShort'))}
            />
          )}
          {isGroupedPickup && <ROW label={t('entry.entriesField')} value={t('entry.arrivalsCount', { count: pickupEntries.length })} />}
          <ROW label={isGroupedPickup ? t('entry.arrivals') : t('entry.arrival')} value={isGroupedPickup ? pickupArrivalDays : daysFull[entry.arr_day - 1]} />
          <ROW label={t('entry.pickup')} value={daysFull[entry.pick_day - 1]} />
          {entry.added_by && <ROW label={t('entry.addedBy')} value={`${entry.added_by} · ${fmtDateTime(entry.added_at)}`} />}
          {contextMode === 'arr' && entryAssignmentLabel && <ROW label={entryAssignmentCaption} value={entryAssignmentLabel} valueColor="var(--accent)" />}
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
                    <span>{laundryTypeLabel(item.type, t)}</span>
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

// Style edytora kartki prania — wygląd papierowego DOWODU (białe „pole",
// czarne ramki, szare nagłówki), żeby formularz wpisywania nie mylił się
// z innymi ekranami i odpowiadał wydrukowi.
const KP_STYLE = `
.kp-doc { background:#fff; color:#1a1a1a; font-family:"Times New Roman",Georgia,serif; border:1.6px solid #1a1a1a; border-radius:4px; overflow:hidden; }
.kp-doc input { font-family:inherit; color:#1a1a1a; }
.kp-doc input::placeholder { color:#aaa; font-style:italic; }
.kp-top { display:grid; grid-template-columns:1.2fr 1.1fr 1fr; }
.kp-cell { padding:8px 10px; border-right:1px solid #1a1a1a; }
.kp-cell:last-child { border-right:0; }
.kp-logo { font-weight:800; font-size:13.5px; letter-spacing:.3px; }
.kp-sub { font-size:9.5px; line-height:1.45; color:#333; margin-top:3px; }
.kp-title { text-align:center; display:flex; flex-direction:column; justify-content:center; gap:2px; }
.kp-doclbl { font-size:11px; letter-spacing:3px; font-weight:700; color:#444; }
.kp-nr { font-size:13px; font-weight:700; color:#444; }
.kp-nr .kp-in { font-size:18px; font-weight:800; text-align:center; width:96px; border:0; border-bottom:1px dotted #888; background:transparent; outline:none; }
.kp-what { font-size:10.5px; font-weight:700; line-height:1.2; letter-spacing:.5px; }
.kp-meta { font-size:11px; display:flex; flex-direction:column; justify-content:center; gap:5px; }
.kp-mrow { display:flex; align-items:baseline; gap:6px; }
.kp-mk { color:#555; white-space:nowrap; font-size:9px; text-transform:uppercase; letter-spacing:.3px; }
.kp-mrow .kp-in { flex:1; font-weight:700; border:0; border-bottom:1px solid #aaa; text-align:right; font-size:13px; background:transparent; outline:none; padding:0 0 1px; min-width:0; }
.kp-badges { display:flex; gap:6px; margin-top:2px; flex-wrap:wrap; }
.kp-badge { font-size:9px; font-weight:700; padding:2px 8px; border-radius:999px; text-transform:uppercase; letter-spacing:.4px; border:1px solid #1a1a1a; }
.kp-badge.mode { background:#eef3ff; border-color:#2b5fd0; color:#1b3f96; }
.kp-badge.open { background:#fff6e0; border-color:#b9860b; color:#8a6200; }
.kp-badge.closed { background:#e7f7ec; border-color:#1f8a45; color:#166534; }
.kp-company { border-top:1px solid #1a1a1a; padding:8px 10px; display:flex; gap:20px; }
.kp-field { display:flex; align-items:baseline; gap:8px; flex:1; min-width:0; }
.kp-field.firm { flex:1.5; }
.kp-lbl { font-size:9.5px; color:#555; text-transform:uppercase; letter-spacing:.4px; white-space:nowrap; }
.kp-company .kp-in { flex:1; font-size:15px; font-weight:700; border:0; border-bottom:1px solid #aaa; background:transparent; outline:none; padding-bottom:2px; min-width:0; }
.kp-table { width:100%; min-width:600px; border-collapse:collapse; table-layout:fixed; border-top:1.4px solid #1a1a1a; }
.kp-table th { background:#ececec; border:1px solid #1a1a1a; font-size:9px; text-transform:uppercase; letter-spacing:.3px; font-weight:700; padding:5px 6px; text-align:left; }
.kp-table td { border:1px solid #bdbdbd; padding:0; height:8.6mm; vertical-align:middle; }
.kp-table tbody tr:nth-child(even) td { background:#fafafa; }
.kp-table tr.diff td { background:#fdebe9; }
.kp-lp { width:9mm; text-align:center; color:#777; font-size:11px; padding:0 4px; }
.kp-kind { width:46mm; }
.kp-kindname { font-size:12.5px; font-weight:700; padding:0 8px; display:block; }
.kp-qty { width:26mm; }
.kp-cellin { border:0; background:transparent; width:100%; height:100%; box-sizing:border-box; padding:4px 8px; font-size:12.5px; outline:none; }
.kp-qty .kp-cellin { text-align:center; font-weight:700; }
.kp-qty.kp-issued.diff .kp-cellin { color:#c0392b; font-weight:800; }
.kp-cellin:focus { background:#eef3ff; }
.kp-namewrap { display:flex; align-items:center; gap:4px; padding:0 6px; }
.kp-rm { flex-shrink:0; width:22px; height:22px; border-radius:5px; border:1px solid #ccc; background:#f4f4f4; color:#c0392b; cursor:pointer; font-size:13px; line-height:1; padding:0; }
.kp-add { width:100%; display:flex; align-items:center; justify-content:center; gap:6px; padding:8px; border:1px dashed #2b5fd0; border-top:0; background:#f3f7ff; color:#1b3f96; font-weight:700; font-size:12px; cursor:pointer; font-family:inherit; }
.kp-summary { display:grid; grid-template-columns:1fr 1fr 1fr; border-top:1.4px solid #1a1a1a; }
.kp-box { padding:6px 10px; border-right:1px solid #bdbdbd; }
.kp-box:last-child { border-right:0; }
.kp-box.total { background:#ececec; }
.kp-boxlbl { font-size:9px; text-transform:uppercase; color:#555; letter-spacing:.3px; }
.kp-boxval { display:flex; align-items:baseline; gap:3px; }
.kp-box .kp-in { font-size:16px; font-weight:800; width:64px; border:0; border-bottom:1px solid #aaa; background:transparent; outline:none; }
.kp-unit { font-size:11px; font-weight:700; color:#777; }
`;

const ROW = ({ label, value, valueColor }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', padding: '10px 0' }}>
    <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>{label}</span>
    <span style={{ fontWeight: 600, fontSize: '13px', color: valueColor || 'var(--text-primary)', textAlign: 'right', maxWidth: '60%' }}>{value}</span>
  </div>
);
