import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { toastError, toastSuccess } from '../lib/toast';
import { upsertAppSetting, upsertCostSettings, upsertDailyCosts } from '../lib/adminRpc';
import { getCostsHistory, getCostsMonth, getPerformanceProgi } from '../lib/readRpc';
import { Droplet, Zap, Flame, Truck, Users, Save, Sigma, Settings, Scale, Package, CalendarDays, Download } from 'lucide-react';
import { isHoliday } from '../utils/holidays';
import { currentLocale, dayNamesSunSat, monthNames } from '../lib/dateUtils';
import { exportSheetsAsXlsx } from '../lib/excelExport';

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Parsuje godzinę z tekstu ("7", "6:30", "7,5") na liczbę
function parseHour(str) {
  if (!str && str !== 0) return 0;
  const s = String(str).trim();
  if (s.includes(':')) { const p = s.split(':'); return parseInt(p[0]) + (parseInt(p[1]) || 0) / 60; }
  return parseFloat(s.replace(',', '.')) || 0;
}

// Godzina rozpoczęcia zmiany danego dnia: z wartości grafiku (np. "6-14", "6+8") lub z domyślnej
function shiftStartHour(value, defaultStartH) {
  const v = String(value || '').toUpperCase().trim();
  const off = ['', 'W', 'UW', 'L4', 'NN', 'END'];
  if (off.includes(v)) return defaultStartH;
  if (v.includes('-')) { const s = parseFloat(v.split('-')[0].replace(',', '.')); if (!isNaN(s)) return s; }
  if (v.includes('+')) { const s = parseFloat(v.split('+')[0].replace(',', '.')); if (!isNaN(s)) return s; }
  return defaultStartH; // sama liczba = długość zmiany, start bez zmian
}

// Dwie 15-min przerwy: start+3h i start+6h. Zwraca wagę godziny (1 = pełna, 0.75 = z przerwą)
function hourWeight(hour, startH) {
  const b1 = Math.floor(startH + 3);
  const b2 = Math.floor(startH + 6);
  return (hour === b1 || hour === b2) ? 0.75 : 1;
}

// Łączne godziny zmiany z wartości grafiku ("8", "6-14", "6+8"); 0 dla nieobecności (jak w Grafiku pracy)
function scheduleDayHours(value) {
  const v = String(value || '').trim().toUpperCase();
  if (!v || ['W', 'UW', 'L4', 'NN', 'I', 'END'].includes(v)) return 0;
  if (v.includes('-')) {
    const [a, b] = v.split('-');
    const st = parseFloat(a.replace(',', '.')), en = parseFloat(b.replace(',', '.'));
    if (!isNaN(st) && !isNaN(en)) return en >= st ? en - st : (24 - st) + en;
  }
  if (v.includes('+')) return parseFloat(v.split('+')[1].replace(',', '.')) || 0;
  return parseFloat(v.replace(',', '.')) || 0;
}

const FMT = (num) => typeof num === 'number' && isFinite(num) ? num.toLocaleString(currentLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---';
const FMT0 = (num) => typeof num === 'number' && isFinite(num) ? num.toLocaleString(currentLocale(), { maximumFractionDigits: 0 }) : '---';
const FMT1 = (num) => typeof num === 'number' && isFinite(num) ? num.toLocaleString(currentLocale(), { maximumFractionDigits: 1 }) : '---';
const FMT3 = (num) => typeof num === 'number' && isFinite(num) ? num.toLocaleString(currentLocale(), { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '---';

function parseDecimalInput(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let s = String(value).trim();
  if (!s) return null;
  s = s.replace(/\s/g, '').replace(/[^\d,.-]/g, '');
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    const dotParts = s.split('.');
    if (dotParts.length > 2) {
      s = `${dotParts.slice(0, -1).join('')}.${dotParts.at(-1)}`;
    }
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

const decimalValue = (value) => parseDecimalInput(value) ?? 0;

function normalizeDailyCostRow(row) {
  const numericFields = ['other_costs', 'ton_zd1', 'ton_zd2', 'ton_pralki'];
  const normalized = { ...row };
  numericFields.forEach(field => {
    if (field in normalized) normalized[field] = parseDecimalInput(normalized[field]);
  });
  return normalized;
}

// iOS 18 Design Constants
const IOS_THEME = {
  bg: '#F9FAFB',
  cardBg: '#FFFFFF',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  accent: '#2563EB',
  success: '#10B981',
  warning: '#F59E0B',
  border: 'rgba(0, 0, 0, 0.08)',
  radius: '20px',
  shadow: '0 10px 30px rgba(0,0,0,0.04)'
};

// Category colors
const CAT = {
  transport: '#E65100',
  elec: '#F57F17',
  gas: '#6A1B9A',
  water: '#0277BD',
  workers: '#1B5E20',
  other: '#8E8E93'
};
// Light tint for a hex color
const tint = (hex, a = 0.06) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

// Opaque tint blended with #F9F9FB background to prevent text bleed-through in sticky headers
const opaqueTint = (hex, a = 0.08) => {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const bgR = 249, bgG = 249, bgB = 251;
  return `rgb(${Math.round(r * a + bgR * (1 - a))}, ${Math.round(g * a + bgG * (1 - a))}, ${Math.round(b * a + bgB * (1 - a))})`;
};

const todayStr = toDateStr(new Date());

// Performance thresholds (kg/rbh) — same as the old spreadsheet (PROGI)
const PROGI_DEFAULT = {
  ZD1: { slaba: 4.0, srednia: 5.5, dobra: 8.0 },
  ZD2: { slaba: 14, srednia: 21, dobra: 26 },
  WSP: { slaba: 15, srednia: 20, dobra: 27 },
};
// Progi są PER MIESIĄC — osobny klucz w app_settings i osobny cache na każdy month_key
const PROGI_DB_PREFIX = 'performance_progi_';            // app_settings: performance_progi_2026-06
const progiDbKey = (mk) => `${PROGI_DB_PREFIX}${mk}`;
const progiLsKey = (mk) => `lebuser_progi_${mk}`;        // cache lokalny per miesiąc
// Domknij surowy obiekt progów domyślnymi (odporne na braki pól / starszy kształt)
const normalizeProgi = (p) => {
  if (!(p?.ZD1 && p?.ZD2 && p?.WSP)) return null;
  return {
    ZD1: { ...PROGI_DEFAULT.ZD1, ...p.ZD1 },
    ZD2: { ...PROGI_DEFAULT.ZD2, ...p.ZD2 },
    WSP: { ...PROGI_DEFAULT.WSP, ...p.WSP },
  };
};
// Wczytaj progi danego miesiąca z cache localStorage (DB nadpisze je po zalogowaniu)
const loadProgiCache = (mk) => {
  try {
    const p = normalizeProgi(JSON.parse(localStorage.getItem(progiLsKey(mk))));
    if (p) return p;
  } catch { /* ignore */ }
  return PROGI_DEFAULT;
};
const EFF_COLORS = {
  slaba: { bg: '#FFCDD2', fc: '#B71C1C' },   // red
  srednia: { bg: '#FFF9C4', fc: '#F57F17' }, // yellow
  dobra: { bg: '#C8E6C9', fc: '#1B5E20' },   // green
  bdb: { bg: '#BBDEFB', fc: '#0D47A1' },     // blue (very good)
};
const effStyle = (val, thr) => {
  if (!(val > 0)) return null;
  return val < thr.slaba ? EFF_COLORS.slaba : val < thr.srednia ? EFF_COLORS.srednia : val < thr.dobra ? EFF_COLORS.dobra : EFF_COLORS.bdb;
};
// id pasma (slaba/srednia/dobra/bdb) dla wartości — null gdy brak danych
const bandOf = (val, thr) => {
  if (!(val > 0)) return null;
  return val < thr.slaba ? 'slaba' : val < thr.srednia ? 'srednia' : val < thr.dobra ? 'dobra' : 'bdb';
};
// Pasma wydajności: id, etykieta, kolor + granice przedziału od/do (klucze w progach; null = 0 / ∞)
const PERF_BANDS = [
  { id: 'slaba',   labelKey: 'costs.bandWeak',     c: EFF_COLORS.slaba,   from: null,      to: 'slaba'   },
  { id: 'srednia', labelKey: 'costs.bandMedium',   c: EFF_COLORS.srednia, from: 'slaba',   to: 'srednia' },
  { id: 'dobra',   labelKey: 'costs.bandGood',     c: EFF_COLORS.dobra,   from: 'srednia', to: 'dobra'   },
  { id: 'bdb',     labelKey: 'costs.bandVeryGood', c: EFF_COLORS.bdb,     from: 'dobra',   to: null      },
];

const DEFAULT_SETTINGS = {
  fiat_l_100km: 9.01, isuzu_l_100km: 10.88, merc_l_100km: 13.04, iveco_l_100km: 12.25,
  fuel_price: 4.85,
  elec_multiplier: 80, elec_fixed_monthly: 3562.12, elec_price_kwh: 0.6823,
  gas_prod_price_m3: 1.95, gas_prod_fixed_daily: 173.51,
  gas_heat_price_m3: 6.15, gas_heat_fixed_monthly: 49.78,
  water_price_m3: 16.25, water_fixed_monthly: 20.10,
  worker_hourly_rate: 45.82
};

/* ───────────── HISTORIA MIESIĘCZNA (silnik dla Przeglądu) ───────────── */
// Stawki dla danego miesiąca: własne, inaczej z ostatniego wcześniejszego (jak w fetchData)
function settingsForMonth(monthKey, settsAsc) {
  let chosen = null;
  for (const s of settsAsc) { if (s.month_key <= monthKey) chosen = s; else break; }
  return { ...DEFAULT_SETTINGS, ...(chosen || {}) };
}
// Zużycie licznika kumulatywnego w miesiącu = ostatni odczyt w mies. − ostatni przed mies. (teleskopowo)
function meterMonthUsage(base, costsAsc, monthStart, monthEnd) {
  let before = null, firstIn = null, lastIn = null;
  for (const c of costsAsc) {
    const raw = c[`${base}_end`];
    const n = (raw === '' || raw == null) ? null : parseFloat(String(raw).replace(',', '.'));
    if (n == null || isNaN(n)) continue;
    if (c.entry_date < monthStart) before = n;
    else if (c.entry_date <= monthEnd) { if (firstIn == null) firstIn = n; lastIn = n; }
  }
  if (lastIn == null) return 0;
  const prev = before != null ? before : firstIn;
  return Math.max(0, lastIn - prev);
}
// Agregat kosztów jednego (przeszłego, zamkniętego) miesiąca — wszystkie dni „przeszłe", więc pełne koszty stałe
function aggregateMonth(year, month, { costsAsc, settsAsc, laborByMonth }) {
  const mk = `${year}-${String(month).padStart(2, '0')}`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStart = `${mk}-01`;
  const monthEnd = `${mk}-${String(daysInMonth).padStart(2, '0')}`;
  const s = settingsForMonth(mk, settsAsc);
  const u = (base) => meterMonthUsage(base, costsAsc, monthStart, monthEnd);
  const fiat = u('fiat'), isuzu = u('isuzu'), merc = u('merc'), iveco = u('iveco');
  const transport = ((fiat * s.fiat_l_100km) + (isuzu * s.isuzu_l_100km) + (merc * s.merc_l_100km) + (iveco * s.iveco_l_100km)) / 100 * s.fuel_price;
  const elec = u('elec') * s.elec_multiplier * s.elec_price_kwh + s.elec_fixed_monthly;
  const gasProd = u('gas_prod') * s.gas_prod_price_m3 + s.gas_prod_fixed_daily * daysInMonth;
  const gasHeat = u('gas_heat') * s.gas_heat_price_m3 + s.gas_heat_fixed_monthly;
  const water = u('water') * s.water_price_m3 + s.water_fixed_monthly;
  const workers = (laborByMonth[mk] || 0) * s.worker_hourly_rate;
  let other = 0, kg = 0;
  for (const c of costsAsc) {
    if (c.entry_date >= monthStart && c.entry_date <= monthEnd) {
      other += c.other_costs || 0;
      kg += (c.ton_zd1 || 0) + (c.ton_zd2 || 0) + (c.ton_pralki || 0);
    }
  }
  const total = transport + elec + gasProd + gasHeat + water + workers + other;
  return { mk, year, month, transport, elec, gasProd, gasHeat, gas: gasProd + gasHeat, water, workers, other, total, kg, plnPerKg: kg > 0 ? total / kg : 0 };
}

export default function CostsView() {
  const { t } = useTranslation();
  const { isAdmin, canViewAdminData, sessionToken } = useAuth();

  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0,0,0,0);
    return d;
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'entry' | 'performance'
  const [showRates, setShowRates] = useState(false);
  const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
  // progi wydajności (kg/rbh) — PER MIESIĄC (app_settings: performance_progi_<month>)
  const [progi, setProgi] = useState(() => loadProgiCache(`${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`));
  const updateProgi = useCallback(async (next) => {
    if (!isAdmin) return;
    const mk = monthKey;
    setProgi(next);
    try { localStorage.setItem(progiLsKey(mk), JSON.stringify(next)); } catch { /* ignore */ }
    try {
      await upsertAppSetting(sessionToken, progiDbKey(mk), next);
    } catch {
      toastError(t('costs.errSaveThresholds'));
    }
  }, [isAdmin, monthKey, sessionToken, t]);

  const [settings, setSettings] = useState({});
  const [dailyData, setDailyData] = useState({});
  const [timelineStats, setTimelineStats] = useState({});
  const [laborHours, setLaborHours] = useState({}); // dateStr → łączne godziny grafiku (do kosztu pracownika)
  const [prevReadings, setPrevReadings] = useState({}); // last meter readings before this month (for day-1 baseline)
  const [history, setHistory] = useState([]); // agregaty kosztów miesięcy WSTECZ (bieżący doklejany z monthlyTotals)
  const [autoSave, setAutoSave] = useState('idle'); // 'idle' | 'saving' | 'saved'

  // Refy z najświeższym stanem (do auto-zapisu z debounce)
  const dailyDataRef = useRef(dailyData);
  const settingsRef = useRef(settings);
  useEffect(() => { dailyDataRef.current = dailyData; }, [dailyData]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  const dirtyDays = useRef(new Set());
  const dirtySettings = useRef(false);
  const dirtySettingsMonthKey = useRef(null);
  const saveTimer = useRef(null);

  const fetchData = useCallback(async () => {
    if (!canViewAdminData) return;
    setLoading(true);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;

    try {
      const monthData = await getCostsMonth(sessionToken, monthKey);
      const sets = monthData?.settings || null;
      const prevSet = monthData?.previous_settings || null;
      const costs = monthData?.daily_costs || [];
      const prevRows = monthData?.previous_daily_costs || [];
      const emps = monthData?.employees || [];
      const sched = monthData?.schedule_entries || [];
      const timeline = monthData?.timeline_entries || [];

    // Stawki: jeśli miesiąc nie ma własnych, dziedzicz z ostatniego ZAPISANEGO wcześniejszego miesiąca.
    // Domyślne z kodu tylko gdy nie ma żadnej historii.
    if (sets) {
      setSettings(sets);
    } else {
      if (prevSet) {
        // odrzucamy id (i znacznik czasu), żeby zapis utworzył NOWY wiersz dla tego miesiąca, nie nadpisał poprzedni
        const { id, updated_at, ...rates } = prevSet; // eslint-disable-line no-unused-vars
        setSettings({ ...rates, month_key: monthKey });
      } else {
        setSettings({ month_key: monthKey, ...DEFAULT_SETTINGS });
      }
    }
    let compositePrev = {};
    if (prevRows && prevRows.length > 0) {
      prevRows.forEach(row => {
        ['fiat_end', 'isuzu_end', 'merc_end', 'iveco_end', 'elec_end', 'gas_prod_end', 'gas_heat_end', 'water_end'].forEach(k => {
          if (compositePrev[k] === undefined && row[k] != null && row[k] !== '') {
            compositePrev[k] = row[k];
          }
        });
      });
    }
    setPrevReadings(compositePrev);

    const costMap = {};
    (costs || []).forEach(c => costMap[c.entry_date] = c);
    setDailyData(costMap);

    // employee_id → performance bucket, derived from employee group_name ("ZD 1" / "ZD 2" / "KIEROWCY")
    // oraz domyślna godzina startu
    const empBucket = {};
    const empDefaultStart = {};
    (emps || []).forEach(e => {
      const g = (e.group_name || '').replace(/\s+/g, '').toUpperCase();
      empBucket[e.id] = g.startsWith('ZD1') ? 'ZD1' : g.startsWith('ZD2') ? 'ZD2' : g.includes('KIEROW') ? 'Kierowcy' : null;
      empDefaultStart[e.id] = parseHour(e.default_start);
    });

    // start zmiany per (pracownik, dzień) z grafiku — do wyznaczenia godzin przerw
    const startMap = {};
    (sched || []).forEach(s => {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(s.day).padStart(2, '0')}`;
      startMap[`${s.employee_id}_${dateStr}`] = shiftStartHour(s.value, empDefaultStart[s.employee_id] ?? 0);
    });
    const startFor = (empId, dateStr) => startMap[`${empId}_${dateStr}`] ?? (empDefaultStart[empId] ?? 0);

    // Koszt pracownika: łączne godziny z Grafiku pracy per dzień (suma wszystkich osób)
    const labor = {};
    (sched || []).forEach(s => {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(s.day).padStart(2, '0')}`;
      labor[dateStr] = (labor[dateStr] || 0) + scheduleDayHours(s.value);
    });
    setLaborHours(labor);

    // Timeline stats (wydajność): godziny stanowiskowe z osi czasu, godzina z przerwą = 0.75.
    const tStats = {};
    (timeline || []).forEach(t => {
      if (!tStats[t.entry_date]) {
        tStats[t.entry_date] = {
          roles: { ZD1: { hrs: 0, emp: new Set() }, ZD2: { hrs: 0, emp: new Set() }, Kierowcy: { hrs: 0, emp: new Set() } }
        };
      }
      const w = hourWeight(t.hour, startFor(t.employee_id, t.entry_date));

      // bucket by employee group; fall back to station "K" (Kierowca) for drivers
      const bucket = empBucket[t.employee_id] || (t.role === 'K' ? 'Kierowcy' : null);
      if (bucket && tStats[t.entry_date].roles[bucket]) {
        tStats[t.entry_date].roles[bucket].hrs += w; // wydajność: godzina z przerwą = 0.75
        tStats[t.entry_date].roles[bucket].emp.add(t.employee_id);
      }
    });
    setTimelineStats(tStats);
    } catch (err) {
      console.error('Error fetching CostsView data:', err);
    } finally {
      setLoading(false);
    }
  }, [currentDate, monthKey, canViewAdminData, sessionToken]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Historia: agreguj miesiące od STYCZNIA bieżącego roku do miesiąca przed bieżącym
  // (bieżący doklejamy w renderze z monthlyTotals → na ekranie styczeń → aktualny miesiąc).
  useEffect(() => {
    if (!canViewAdminData) return;
    let alive = true;
    const y = currentDate.getFullYear(), m = currentDate.getMonth() + 1;
    (async () => {
      try {
        const data = await getCostsHistory(sessionToken, y, monthKey);
        const sched = data?.schedule_entries || [];
        const laborByMonth = {};
        sched.forEach(e => { const k = `${e.year}-${String(e.month).padStart(2, '0')}`; laborByMonth[k] = (laborByMonth[k] || 0) + scheduleDayHours(e.value); });
        const ctx = { costsAsc: data?.daily_costs || [], settsAsc: data?.settings || [], laborByMonth };
        const months = [];
        for (let mm = 1; mm <= m - 1; mm++) {
          months.push(aggregateMonth(y, mm, ctx));
        }
        if (alive) setHistory(months);
      } catch (err) {
        if (alive) toastError(t('common.error') + ': ' + err.message);
      }
    })();
    return () => { alive = false; };
  }, [canViewAdminData, monthKey, currentDate, sessionToken, t]);

  // Progi wydajności są PER MIESIĄC — wczytaj progi tego miesiąca z app_settings.
  // Brak własnych → odziedzicz z ostatniego wcześniejszego miesiąca (jak stawki); inaczej domyślne.
  useEffect(() => {
    if (!canViewAdminData) return;
    let alive = true;
    setProgi(loadProgiCache(monthKey)); // natychmiast z cache tego miesiąca
    (async () => {
      try {
        const data = await getPerformanceProgi(sessionToken, monthKey);
        const p = data?.progi ? normalizeProgi(data.progi) : null;
        if (alive) {
          const next = p || PROGI_DEFAULT;
          setProgi(next);
          try { localStorage.setItem(progiLsKey(monthKey), JSON.stringify(next)); } catch { /* ignore */ }
        }
      } catch (err) {
        if (alive) toastError(t('common.error') + ': ' + err.message);
      }
    })();
    return () => { alive = false; };
  }, [canViewAdminData, monthKey, sessionToken, t]);

  // Auto-zapis z debounce — zapisuje tylko „brudne" dni i ewentualnie stawki
  const flushSave = useCallback(async () => {
    if (!isAdmin) return;
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const days = [...dirtyDays.current];
    const setDirty = dirtySettings.current;
    const setKey = dirtySettingsMonthKey.current;
    if (!days.length && !setDirty) return;
    dirtyDays.current.clear();
    dirtySettings.current = false;
    setAutoSave('saving');
    try {
      if (setDirty && setKey) {
        await upsertCostSettings(sessionToken, { ...settingsRef.current, month_key: setKey });
      }
      const rows = days
        .map(ds => dailyDataRef.current[ds])
        .filter(d => d && Object.keys(d).length > 1)
        .map(d => normalizeDailyCostRow({ ...d, updated_at: new Date().toISOString() }));
      if (rows.length) {
        await upsertDailyCosts(sessionToken, rows);
      }
      setAutoSave('saved');
      setTimeout(() => setAutoSave(s => (s === 'saved' ? 'idle' : s)), 1500);
    } catch {
      // przywróć „brudne" wpisy, żeby ponowić zapis i pokaż błąd zamiast fałszywego „Zapisano"
      days.forEach(d => dirtyDays.current.add(d));
      if (setDirty) { dirtySettings.current = true; dirtySettingsMonthKey.current = setKey; }
      setAutoSave('idle');
      toastError(t('costs.errUnsavedChanges'));
    }
  }, [isAdmin, sessionToken, t]);

  const scheduleAutoSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { flushSave(); }, 700);
  }, [flushSave]);

  // Zapisz oczekujące zmiany przy zmianie miesiąca / odmontowaniu
  useEffect(() => () => { flushSave(); }, [monthKey, flushSave]);

  const handleCostChange = (dateStr, field, value) => {
    if (!isAdmin) return;
    let parsed = value;
    if (value === '') {
      parsed = null;
    } else if (field.endsWith('_end')) {
      parsed = value.trim(); // preserve leading zeros
    } else if (field === 'other_costs') {
      parsed = value;
    } else {
      parsed = parseDecimalInput(value);
    }
    
    setDailyData(prev => ({
      ...prev,
      [dateStr]: { ...prev[dateStr], entry_date: dateStr, [field]: parsed }
    }));
    dirtyDays.current.add(dateStr);
    scheduleAutoSave();
  };

  const handleSettingChange = (field, value) => {
    if (!isAdmin) return;
    const num = parseDecimalInput(value);
    setSettings(prev => ({ ...prev, [field]: num }));
    dirtySettings.current = true;
    dirtySettingsMonthKey.current = monthKey;
    scheduleAutoSave();
  };

  const saveAll = async () => {
    if (!isAdmin) return;
    setSaving(true);
    try {
      await upsertCostSettings(sessionToken, { ...settings, month_key: monthKey });
      const toSave = Object.values(dailyData).filter(d => Object.keys(d).length > 1);
      if (toSave.length > 0) {
        await upsertDailyCosts(sessionToken, toSave.map(normalizeDailyCostRow));
      }
    } catch {
      setSaving(false);
      toastError(t('costs.errSave'));
      return;
    }
    setSaving(false);
    toastSuccess(t('admin.saved'));
    fetchData();
  };

  if (!canViewAdminData) return <div style={{ padding: '40px', textAlign: 'center' }}>{t('admin.noAccess')}</div>;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const months = monthNames();
  const weekdays = dayNamesSunSat();
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => toDateStr(new Date(year, month - 1, i + 1)));

  // Cumulative meter model: each meter stores ONE end-of-day reading in <base>_end.
  // Consumption = today's reading − last available earlier reading (carryover from prev month for day 1).
  const getReading = (dStr, base) => {
    const v = dailyData[dStr]?.[`${base}_end`];
    return (v === 0 || v) ? v : null;
  };

  const parseMeter = (val) => {
    if (val == null || val === '') return null;
    const n = parseFloat(String(val).replace(',', '.'));
    return isNaN(n) ? null : n;
  };

  const consumptionAt = (idx, base) => {
    const curStr = getReading(days[idx], base);
    const cur = parseMeter(curStr);
    if (cur == null) return 0;
    
    let prev = null;
    for (let j = idx - 1; j >= 0; j--) {
      const r = parseMeter(getReading(days[j], base));
      if (r != null) { prev = r; break; }
    }
    if (prev == null) {
      const c = prevReadings?.[`${base}_end`];
      prev = parseMeter(c);
    }
    if (prev == null) return 0; 
    return Math.max(0, cur - prev);
  };

  const todayDate = new Date();
  todayDate.setHours(0,0,0,0);

  const calcDay = (dStr, idx) => {
    const d = dailyData[dStr] || {};
    const fiat_km = consumptionAt(idx, 'fiat');
    const isuzu_km = consumptionAt(idx, 'isuzu');
    const merc_km = consumptionAt(idx, 'merc');
    const iveco_km = consumptionAt(idx, 'iveco');
    const total_km = fiat_km + isuzu_km + merc_km + iveco_km;

    const isFuture = new Date(dStr) > todayDate;

    const transportCost = ((fiat_km * settings.fiat_l_100km) + (isuzu_km * settings.isuzu_l_100km) + (merc_km * settings.merc_l_100km) + (iveco_km * settings.iveco_l_100km)) / 100 * settings.fuel_price;
    const elec_usage = consumptionAt(idx, 'elec') * settings.elec_multiplier;
    const elec_cost = elec_usage * settings.elec_price_kwh + (isFuture ? 0 : (settings.elec_fixed_monthly / daysInMonth));
    const gas_prod_usage = consumptionAt(idx, 'gas_prod');
    const gas_prod_cost = gas_prod_usage * settings.gas_prod_price_m3 + (isFuture ? 0 : settings.gas_prod_fixed_daily);
    const gas_heat_usage = consumptionAt(idx, 'gas_heat');
    const gas_heat_cost = gas_heat_usage * settings.gas_heat_price_m3 + (isFuture ? 0 : (settings.gas_heat_fixed_monthly / daysInMonth));
    const water_usage = consumptionAt(idx, 'water');
    const water_cost = water_usage * settings.water_price_m3 + (isFuture ? 0 : (settings.water_fixed_monthly / daysInMonth));
    const hrs = laborHours[dStr] || 0; // łączne godziny z Grafiku pracy
    const worker_cost = hrs * settings.worker_hourly_rate;
    const other_cost = decimalValue(d.other_costs);
    const total_cost = transportCost + elec_cost + gas_prod_cost + gas_heat_cost + water_cost + worker_cost + other_cost;
    const ton = decimalValue(d.ton_zd1) + decimalValue(d.ton_zd2) + decimalValue(d.ton_pralki);
    const pln_kg = ton > 0 ? total_cost / ton : 0;

    return { fiat_km, isuzu_km, merc_km, iveco_km, total_km, elec_usage, gas_prod_usage, gas_heat_usage, water_usage, transportCost, elec_cost, gas_prod_cost, gas_heat_cost, water_cost, worker_cost, total_cost, other_cost, ton, pln_kg };
  };

  // Monthly totals
  const monthlyTotals = days.reduce((acc, dStr, idx) => {
    const c = calcDay(dStr, idx);
    acc.transport += c.transportCost;
    acc.elec += c.elec_cost;
    acc.gasProd += c.gas_prod_cost;
    acc.gasHeat += c.gas_heat_cost;
    acc.gas += (c.gas_prod_cost + c.gas_heat_cost);
    acc.water += c.water_cost;
    acc.workers += c.worker_cost;
    acc.other += c.other_cost;
    acc.total += c.total_cost;
    // consumption totals
    acc.kmFiat += c.fiat_km; acc.kmIsuzu += c.isuzu_km; acc.kmMerc += c.merc_km; acc.kmIveco += c.iveco_km;
    acc.kWh += c.elec_usage; acc.m3GasProd += c.gas_prod_usage; acc.m3GasHeat += c.gas_heat_usage; acc.m3Water += c.water_usage;
    return acc;
  }, { transport: 0, elec: 0, gasProd: 0, gasHeat: 0, gas: 0, water: 0, workers: 0, other: 0, total: 0,
       kmFiat: 0, kmIsuzu: 0, kmMerc: 0, kmIveco: 0, kWh: 0, m3GasProd: 0, m3GasHeat: 0, m3Water: 0 });

  // Performance totals
  const perfTotals = days.reduce((acc, dStr) => {
    const dt = dailyData[dStr] || {};
    const ts = timelineStats[dStr]?.roles || {};
    const kgZd1 = decimalValue(dt.ton_zd1);
    const kgZd2 = decimalValue(dt.ton_zd2);
    const kgPralki = decimalValue(dt.ton_pralki);
    acc.zd1 += kgZd1;
    acc.zd2 += kgZd2;
    acc.pralki += kgPralki;
    acc.kg += kgZd1 + kgZd2 + kgPralki;
    acc.hZd1 += ts.ZD1?.hrs || 0;
    acc.hZd2 += ts.ZD2?.hrs || 0;
    acc.hKier += ts.Kierowcy?.hrs || 0;
    acc.h += (ts.ZD1?.hrs || 0) + (ts.ZD2?.hrs || 0) + (ts.Kierowcy?.hrs || 0);
    return acc;
  }, { zd1: 0, zd2: 0, pralki: 0, kg: 0, hZd1: 0, hZd2: 0, hKier: 0, h: 0 });
  // Fix floating-point accumulation artifacts (e.g. 2384.6000000000004 → 2384.6)
  perfTotals.zd1 = +perfTotals.zd1.toFixed(10);
  perfTotals.zd2 = +perfTotals.zd2.toFixed(10);
  perfTotals.pralki = +perfTotals.pralki.toFixed(10);
  perfTotals.kg = +perfTotals.kg.toFixed(10);

  const plnPerKg = perfTotals.kg > 0 ? monthlyTotals.total / perfTotals.kg : 0;
  const avgPerDay = monthlyTotals.total / daysInMonth;

  // Bieżący miesiąc jako punkt historii (z policzonych totali → spójny z KPI) + miesiące wstecz
  const currentPoint = {
    mk: monthKey, year, month,
    transport: monthlyTotals.transport, elec: monthlyTotals.elec, gasProd: monthlyTotals.gasProd, gasHeat: monthlyTotals.gasHeat,
    gas: monthlyTotals.gas, water: monthlyTotals.water, workers: monthlyTotals.workers, other: monthlyTotals.other,
    total: monthlyTotals.total, kg: perfTotals.kg, plnPerKg,
  };
  const monthsHistory = [...history, currentPoint];

  // Rozbicie kosztu aut: suma km per auto → kwota (od sumy km)
  const fuelPrice = settings.fuel_price || 0;
  const carBreakdown = [
    { name: 'Fiat',  km: monthlyTotals.kmFiat,  cost: monthlyTotals.kmFiat  * (settings.fiat_l_100km  || 0) / 100 * fuelPrice },
    { name: 'Isuzu', km: monthlyTotals.kmIsuzu, cost: monthlyTotals.kmIsuzu * (settings.isuzu_l_100km || 0) / 100 * fuelPrice },
    { name: 'Merc.', km: monthlyTotals.kmMerc,  cost: monthlyTotals.kmMerc  * (settings.merc_l_100km  || 0) / 100 * fuelPrice },
    { name: 'Iveco', km: monthlyTotals.kmIveco, cost: monthlyTotals.kmIveco * (settings.iveco_l_100km || 0) / 100 * fuelPrice },
  ];
  // Koszt dzienny BEZ jednorazowych „Inne" — lumpy wpis nie zaburza wykresu (Inne nadal liczone w sumach i KPI)
  const dailyTotals = days.map((d, idx) => { const c = calcDay(d, idx); return c.total_cost - c.other_cost; });
  // Dni wolne (weekendy + święta) — pomijane na krzywej, żeby trend nie skakał do zera
  const isDayOff = (dStr) => { const d = new Date(dStr); return d.getDay() === 0 || d.getDay() === 6 || !!isHoliday(d); };
  const offFlags = days.map(isDayOff);
  const workVals = dailyTotals.filter((_, i) => !offFlags[i]);
  const trendAvg = workVals.length ? workVals.reduce((s, v) => s + v, 0) / workVals.length : 0;

  // Eksport do Excela (analogicznie do Grafiku) — arkusz Koszty + arkusz Wydajność
  const exportToExcel = async () => {
    const r2 = (n) => Math.round((n || 0) * 100) / 100;
    const dayLabel = (dStr) => { const d = new Date(dStr); return `${String(d.getDate()).padStart(2, '0')}.${String(month).padStart(2, '0')} ${weekdays[d.getDay()]}`; };

    // Arkusz 1: Koszty
    const costsHead = t('costs.exportCostsHead', { returnObjects: true });
    const costsRows = days.map((dStr, idx) => {
      const c = calcDay(dStr, idx);
      return [dayLabel(dStr), r2(c.fiat_km), r2(c.isuzu_km), r2(c.merc_km), r2(c.iveco_km), r2(c.transportCost),
        r2(c.elec_usage), r2(c.elec_cost), r2(c.gas_prod_usage), r2(c.gas_prod_cost), r2(c.gas_heat_usage), r2(c.gas_heat_cost),
        r2(c.water_usage), r2(c.water_cost), r2(c.worker_cost), r2(c.other_cost), r2(c.total_cost), c.pln_kg > 0 ? r2(c.pln_kg) : ''];
    });
    const totalsForExport = monthlyTotals;
    const costsTotal = [t('costs.total'), r2(totalsForExport.kmFiat), r2(totalsForExport.kmIsuzu), r2(totalsForExport.kmMerc), r2(totalsForExport.kmIveco), r2(totalsForExport.transport), r2(totalsForExport.kWh), r2(totalsForExport.elec),
      r2(totalsForExport.m3GasProd), r2(totalsForExport.gasProd), r2(totalsForExport.m3GasHeat), r2(totalsForExport.gasHeat), r2(totalsForExport.m3Water), r2(totalsForExport.water), r2(totalsForExport.workers), r2(totalsForExport.other), r2(totalsForExport.total), perfTotals.kg > 0 ? r2(totalsForExport.total / perfTotals.kg) : ''];
    const costsData = [[t('costs.exportCostsTitle', { month: months[month - 1], year })], [], costsHead, ...costsRows, [], costsTotal];

    // Arkusz 2: Wydajność
    const perfHead = t('costs.exportPerformanceHead', { returnObjects: true });
    const perfRows = days.map((dStr) => {
      const dt = dailyData[dStr] || {};
      const ts = timelineStats[dStr]?.roles || {};
      const kgZd1 = decimalValue(dt.ton_zd1);
      const kgZd2 = decimalValue(dt.ton_zd2);
      const kgPralki = decimalValue(dt.ton_pralki);
      const kgZd2pr = kgZd2 + kgPralki;
      const tSuma = kgZd1 + kgZd2pr;
      const hZd1 = ts.ZD1?.hrs || 0, hZd2 = ts.ZD2?.hrs || 0, hKier = ts.Kierowcy?.hrs || 0;
      const hSuma = hZd1 + hZd2 + hKier;
      return [dayLabel(dStr), kgZd1 || '', kgZd2 || '', kgPralki || '', tSuma || '',
        hZd1 ? r2(hZd1) : '', hZd2 ? r2(hZd2) : '', hKier ? r2(hKier) : '', hSuma ? r2(hSuma) : '',
        hZd1 > 0 ? r2(kgZd1 / hZd1) : '', hZd2 > 0 ? r2(kgZd2pr / hZd2) : '', hSuma > 0 ? r2(tSuma / hSuma) : ''];
    });
    const performanceData = [[t('costs.exportPerformanceTitle', { month: months[month - 1], year })], [], perfHead, ...perfRows];

    try {
      await exportSheetsAsXlsx([
        { sheet: t('costs.sheetCosts'), data: costsData },
        { sheet: t('costs.sheetPerformance'), data: performanceData },
      ], `${t('costs.filePrefix')}_${months[month - 1]}_${year}.xlsx`);
    } catch {
      toastError(t('common.error'));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '2px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}>
      <style>{COSTS_CSS}</style>

      {/* HEADER */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px',
        background: IOS_THEME.cardBg, padding: '16px 20px', borderRadius: IOS_THEME.radius,
        boxShadow: IOS_THEME.shadow, border: `1px solid ${IOS_THEME.border}`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {(() => { const atMin = year === 2026 && month === 1; return (
            <button disabled={atMin} onClick={() => { if (!atMin) setCurrentDate(new Date(year, month - 2, 1)); }} style={{ ...navBtnStyle, opacity: atMin ? 0.4 : 1, cursor: atMin ? 'not-allowed' : 'pointer' }}>‹</button>
          ); })()}
          <div style={{ fontWeight: 700, fontSize: '17px', minWidth: '140px', textAlign: 'center' }}>
            {months[month - 1]} {year}
          </div>
          <button onClick={() => setCurrentDate(new Date(year, month, 1))} style={navBtnStyle}>›</button>
        </div>

        <div style={{ display: 'flex', background: '#EEEEEE', padding: '2px', borderRadius: '10px', gap: '2px' }}>
          {[['overview', t('costs.tabOverview')], ['entry', t('costs.tabEntry')], ['performance', t('costs.tabPerformance')]].map(([key, label]) => (
            <button key={key} onClick={() => setActiveTab(key)}
              style={{ ...segmentBtnStyle, color: activeTab === key ? IOS_THEME.textPrimary : IOS_THEME.textSecondary, background: activeTab === key ? '#FFFFFF' : 'transparent', boxShadow: activeTab === key ? '0 2px 8px rgba(0,0,0,0.1)' : 'none' }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={exportToExcel} title={t('costs.exportExcel')} style={{ ...navBtnStyle, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: IOS_THEME.textSecondary }}>
            <Download size={16}/> Excel
          </button>
          <button onClick={() => setShowRates(v => !v)} title={t('costs.rates')} style={{ ...navBtnStyle, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: showRates ? IOS_THEME.accent : IOS_THEME.textSecondary }}>
            <Settings size={16}/> {t('costs.rates')}
          </button>
          {isAdmin && <button onClick={saveAll} disabled={saving} className="costs-save-btn" title={t('costs.saveAllNow')} style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: autoSave === 'saved' ? '#34C759' : autoSave === 'saving' ? IOS_THEME.warning : IOS_THEME.accent,
            color: '#fff', border: 'none', padding: '10px 22px', borderRadius: '12px', fontWeight: 600, fontSize: '14px',
            letterSpacing: '0.2px', boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
            cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1, transition: 'background 0.2s'
          }}>
            <Save size={18}/> {saving ? t('costs.saving') : autoSave === 'saving' ? t('costs.autoSaving') : autoSave === 'saved' ? t('costs.savedCheck') : t('common.save')}
          </button>}
        </div>
      </div>

      {/* RATES PANEL */}
      {showRates && <RatesPanel settings={settings} onChange={handleSettingChange} readOnly={!isAdmin} />}

      {loading ? (
        <div style={{ ...cardStyle, padding: '60px', textAlign: 'center', color: IOS_THEME.textSecondary, fontSize: '15px' }}>{t('costs.loadingFinancialData')}</div>
      ) : (
        <>
          {activeTab === 'overview' && (
            <OverviewTab totals={monthlyTotals} plnPerKg={plnPerKg} ton={perfTotals.kg} avgPerDay={avgPerDay} dailyTotals={dailyTotals} trendAvg={trendAvg} days={days} offFlags={offFlags} carBreakdown={carBreakdown} monthsHistory={monthsHistory} />
          )}

          {activeTab === 'entry' && (
            <EntryGrid days={days} weekdays={weekdays} dailyData={dailyData} calcDay={calcDay} totals={monthlyTotals} onChange={handleCostChange} readOnly={!isAdmin} laborHours={laborHours} />
          )}

          {activeTab === 'performance' && (
            <PerformanceGrid days={days} weekdays={weekdays} dailyData={dailyData} timelineStats={timelineStats} totals={perfTotals} onChange={handleCostChange} progi={progi} onProgiChange={updateProgi} readOnly={!isAdmin} />
          )}
        </>
      )}
    </div>
  );
}

/* ───────────── OVERVIEW (dashboard) ───────────── */
function OverviewTab({ totals, plnPerKg, ton, avgPerDay, dailyTotals, trendAvg, days, offFlags = [], carBreakdown = [], monthsHistory = [] }) {
  const { t } = useTranslation();
  const cats = [
    { name: t('costs.transport'), color: CAT.transport, value: totals.transport, icon: <Truck size={16}/> },
    { name: t('costs.energy'), color: CAT.elec, value: totals.elec, icon: <Zap size={16}/> },
    { name: t('costs.gas'), color: CAT.gas, value: totals.gas, icon: <Flame size={16}/> },
    { name: t('costs.water'), color: CAT.water, value: totals.water, icon: <Droplet size={16}/> },
    { name: t('costs.employees'), color: CAT.workers, value: totals.workers, icon: <Users size={16}/> },
    { name: t('costs.other'), color: CAT.other, value: totals.other, icon: <Sigma size={16}/> },
  ].sort((a, b) => b.value - a.value);
  const sum = totals.total || 1;

  // Porównanie miesiąc-do-miesiąca (MoM) + serie do sparkline
  const H = monthsHistory;
  const cur = H[H.length - 1] || null;
  const prev = H.length > 1 ? H[H.length - 2] : null;
  const dIM = (p) => new Date(p.year, p.month, 0).getDate();
  const momPct = (c, p) => (p != null && p > 0 && c > 0) ? ((c - p) / p) * 100 : null;
  const dTotal = (prev && prev.total > 0) ? ((cur.total - prev.total) / prev.total) * 100 : null;
  const dPpk = momPct(cur?.plnPerKg, prev?.plnPerKg);
  const dKg = momPct(cur?.kg, prev?.kg);
  const dAvg = (prev && prev.total > 0) ? ((cur.total / dIM(cur) - prev.total / dIM(prev)) / (prev.total / dIM(prev))) * 100 : null;
  const sTotal = H.map(p => p.total);
  const sPpk = H.map(p => p.plnPerKg);
  const sKg = H.map(p => p.kg);
  const sAvg = H.map(p => p.total / dIM(p));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* KPI HERO — z porównaniem MoM i sparkline */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <KpiCard label={t('costs.kpiTotalCosts')} value={FMT(totals.total)} unit={t('costs.currency')} icon={<Sigma size={22}/>} color={IOS_THEME.accent} hero delta={dTotal} goodWhenDown spark={sTotal} />
        <KpiCard label={t('costs.kpiCostPerKg')} value={plnPerKg > 0 ? FMT3(plnPerKg) : '—'} unit={t('costs.currencyPerKg')} icon={<Scale size={22}/>} color={CAT.transport} delta={dPpk} goodWhenDown spark={sPpk} />
        <KpiCard label={t('costs.kpiTonnage')} value={ton > 0 ? FMT0(ton) : '—'} unit="kg" icon={<Package size={22}/>} color={CAT.workers} delta={dKg} spark={sKg} />
        <KpiCard label={t('costs.kpiAvgPerDay')} value={FMT(avgPerDay)} unit={t('costs.currency')} icon={<CalendarDays size={22}/>} color={CAT.water} delta={dAvg} goodWhenDown spark={sAvg} />
      </div>

      {/* zł/kg ROZBITE NA DRIVERY + MOST MoM */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
        <DriversCard cur={cur} />
        <WaterfallCard cur={cur} prev={prev} />
      </div>

      {/* TREND WIELOMIESIĘCZNY zł/kg + cel */}
      <div style={cardStyle}>
        <div style={{ ...cardTitleStyle, marginBottom: '4px' }}>{t('costs.plnPerKgOverTime', { year: cur?.year || '' })}</div>
        <div style={{ fontSize: '11px', color: IOS_THEME.textSecondary, marginBottom: '14px' }}>{t('costs.multiMonthHint')}</div>
        <MultiMonthTrend months={H} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {/* COST STRUCTURE */}
        <div style={cardStyle}>
          <div style={cardTitleStyle}>{t('costs.costStructure')}</div>
          {/* stacked bar */}
          <div style={{ display: 'flex', height: '14px', borderRadius: '7px', overflow: 'hidden', margin: '4px 0 20px' }}>
            {cats.filter(c => c.value > 0).map(c => (
              <div key={c.name} title={`${c.name}: ${FMT(c.value)} ${t('costs.currency')}`} style={{ width: `${(c.value / sum) * 100}%`, background: c.color }} />
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {cats.map(c => {
              const pct = (c.value / sum) * 100;
              return (
                <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '8px', background: tint(c.color, 0.12), color: c.color, flexShrink: 0 }}>{c.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '5px' }}>
                      <span style={{ fontWeight: 600 }}>{c.name}</span>
                      <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{FMT(c.value)} <span style={{ color: IOS_THEME.textSecondary, fontWeight: 500 }}>{t('costs.currency')} · {pct.toFixed(1)}%</span></span>
                    </div>
                    <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(60,60,67,0.08)', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: c.color, borderRadius: '3px', transition: 'width 0.4s' }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* KOSZT AUT — km per auto → kwota */}
        <div style={cardStyle}>
          <div style={{ ...cardTitleStyle, display: 'flex', alignItems: 'center', gap: '8px' }}><Truck size={16}/> {t('costs.carCostKm')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '12px', fontSize: '11px', fontWeight: 700, color: IOS_THEME.textSecondary, textTransform: 'uppercase', letterSpacing: '0.4px', padding: '0 4px 8px' }}>
              <span>{t('costs.car')}</span><span style={{ textAlign: 'right' }}>{t('costs.sumKm')}</span><span style={{ textAlign: 'right', minWidth: '90px' }}>{t('costs.amount')}</span>
            </div>
            {carBreakdown.map((car, i) => (
              <div key={car.name} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '12px', alignItems: 'center', padding: '10px 4px', borderTop: i === 0 ? 'none' : `1px solid ${IOS_THEME.border}`, fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ display: 'flex', width: '26px', height: '26px', borderRadius: '7px', background: tint(CAT.transport, 0.12), color: CAT.transport, alignItems: 'center', justifyContent: 'center' }}><Truck size={14}/></span>
                  {car.name}
                </span>
                <span style={{ textAlign: 'right', fontSize: '14px', fontWeight: 600, color: IOS_THEME.textSecondary }}>{car.km > 0 ? `${FMT0(car.km)} km` : '—'}</span>
                <span style={{ textAlign: 'right', minWidth: '90px', fontSize: '14px', fontWeight: 700, color: CAT.transport }}>{car.cost > 0 ? `${FMT(car.cost)} ${t('costs.currency')}` : '—'}</span>
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '12px', alignItems: 'center', padding: '12px 4px 2px', borderTop: `2px solid ${IOS_THEME.border}`, fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ fontSize: '13px', fontWeight: 800 }}>{t('costs.total')}</span>
              <span style={{ textAlign: 'right', fontSize: '14px', fontWeight: 700, color: IOS_THEME.textSecondary }}>{FMT0(carBreakdown.reduce((s, c) => s + c.km, 0))} km</span>
              <span style={{ textAlign: 'right', minWidth: '90px', fontSize: '15px', fontWeight: 800, color: CAT.transport }}>{FMT(carBreakdown.reduce((s, c) => s + c.cost, 0))} {t('costs.currency')}</span>
            </div>
          </div>
        </div>

        {/* DAILY TREND */}
        <div style={cardStyle}>
          <div style={{ ...cardTitleStyle, marginBottom: '4px' }}>{t('costs.dailyCost')}</div>
          <div style={{ fontSize: '11px', color: IOS_THEME.textSecondary, marginBottom: '12px' }}>{t('costs.dailyCostHint')}</div>
          <TrendChart data={dailyTotals} days={days} avg={trendAvg} offFlags={offFlags} />
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, unit, icon, color, hero, delta, goodWhenDown, spark }) {
  const { t } = useTranslation();
  const hasDelta = delta != null && isFinite(delta);
  const good = hasDelta && (goodWhenDown ? delta <= 0 : delta >= 0);
  const up = hasDelta && delta >= 0;
  const deltaColor = !hasDelta ? IOS_THEME.textSecondary : good ? '#10B981' : '#EF4444';
  return (
    <div style={{
      background: hero ? color : IOS_THEME.cardBg, padding: '18px', borderRadius: IOS_THEME.radius,
      boxShadow: hero ? `0 8px 24px ${tint(color, 0.35)}` : IOS_THEME.shadow,
      border: hero ? 'none' : `1px solid ${IOS_THEME.border}`, borderLeft: hero ? 'none' : `3px solid ${color}`,
      display: 'flex', flexDirection: 'column', gap: '12px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: hero ? '#fff' : color }}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '9px', background: hero ? 'rgba(255,255,255,0.2)' : tint(color, 0.12) }}>{icon}</span>
        <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', opacity: hero ? 0.95 : 1 }}>{label}</span>
      </div>
      <div style={{ fontSize: '26px', fontWeight: 800, color: hero ? '#fff' : IOS_THEME.textPrimary, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {value} <span style={{ fontSize: '13px', fontWeight: 600, opacity: 0.7 }}>{unit}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', minHeight: '26px' }}>
        {hasDelta ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '12px', fontWeight: 800, fontVariantNumeric: 'tabular-nums',
            padding: '3px 8px', borderRadius: '7px', color: deltaColor,
            background: hero ? 'rgba(255,255,255,0.18)' : tint(good ? '#10B981' : '#EF4444', 0.14) }}>
            {up ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}% <span style={{ fontWeight: 600, opacity: 0.8 }}>{t('costs.monthOverMonthShort')}</span>
          </span>
        ) : (
          <span style={{ fontSize: '11px', fontWeight: 600, color: hero ? 'rgba(255,255,255,0.7)' : IOS_THEME.textSecondary }}>{t('costs.noComparison')}</span>
        )}
        {spark && spark.some(v => v > 0) && <Sparkline data={spark} color={color} hero={hero} />}
      </div>
    </div>
  );
}

// Mini-wykres ostatnich ~6 miesięcy
function Sparkline({ data, color, hero }) {
  const pts = data.slice(-6);
  const W = 84, Hh = 26;
  const max = Math.max(...pts, 1), min = Math.min(...pts, 0);
  const rng = (max - min) || 1;
  const x = (i) => pts.length <= 1 ? W : (i / (pts.length - 1)) * W;
  const y = (v) => (Hh - 3) - ((v - min) / rng) * (Hh - 6);
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const stroke = hero ? 'rgba(255,255,255,0.95)' : color;
  const last = pts.length - 1;
  return (
    <svg width={W} height={Hh} style={{ flexShrink: 0, overflow: 'visible' }}>
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      {pts[last] > 0 && <circle cx={x(last)} cy={y(pts[last])} r="2.4" fill={stroke} />}
    </svg>
  );
}

// zł/kg rozbite na drivery (bieżący miesiąc) — koszt na kilogram per kategoria
function DriversCard({ cur }) {
  const { t } = useTranslation();
  const kg = cur?.kg || 0;
  const totalPerKg = kg > 0 ? cur.total / kg : 0;
  const drivers = [
    { name: t('costs.employees'), color: CAT.workers, v: cur?.workers || 0 },
    { name: t('costs.energy'), color: CAT.elec, v: cur?.elec || 0 },
    { name: t('costs.gas'), color: CAT.gas, v: cur?.gas || 0 },
    { name: t('costs.water'), color: CAT.water, v: cur?.water || 0 },
    { name: t('costs.transport'), color: CAT.transport, v: cur?.transport || 0 },
    { name: t('costs.other'), color: CAT.other, v: cur?.other || 0 },
  ].map(d => ({ ...d, perKg: kg > 0 ? d.v / kg : 0 })).sort((a, b) => b.perKg - a.perKg);

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={cardTitleStyle}>{t('costs.costPerKgDrivers')}</div>
        <div style={{ fontSize: '20px', fontWeight: 800, color: CAT.transport, fontVariantNumeric: 'tabular-nums' }}>
          {totalPerKg > 0 ? FMT3(totalPerKg) : '—'} <span style={{ fontSize: '12px', fontWeight: 600, color: IOS_THEME.textSecondary }}>{t('costs.currencyPerKg')}</span>
        </div>
      </div>
      {kg <= 0 ? (
        <div style={{ padding: '24px 0', textAlign: 'center', fontSize: '13px', color: IOS_THEME.textSecondary }}>{t('costs.noTonnageCostPerKg')}</div>
      ) : (
        <>
          <div style={{ display: 'flex', height: '14px', borderRadius: '7px', overflow: 'hidden', margin: '0 0 18px' }}>
            {drivers.filter(d => d.perKg > 0).map(d => (
              <div key={d.name} title={`${d.name}: ${FMT3(d.perKg)} ${t('costs.currencyPerKg')}`} style={{ width: `${(d.perKg / totalPerKg) * 100}%`, background: d.color }} />
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {drivers.map(d => {
              const pct = totalPerKg > 0 ? (d.perKg / totalPerKg) * 100 : 0;
              return (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                  <span style={{ width: '90px', fontSize: '13px', fontWeight: 600 }}>{d.name}</span>
                  <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: 'rgba(60,60,67,0.08)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: d.color, borderRadius: '3px' }} />
                  </div>
                  <span style={{ width: '92px', textAlign: 'right', fontSize: '13px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {FMT3(d.perKg)} <span style={{ fontSize: '11px', fontWeight: 500, color: IOS_THEME.textSecondary }}>{t('costs.currencyPerKg')}</span>
                  </span>
                  <span style={{ width: '44px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: IOS_THEME.textSecondary, fontVariantNumeric: 'tabular-nums' }}>{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// Most MoM (waterfall): koszt poprzedniego miesiąca → wkłady kategorii → koszt bieżącego
function WaterfallCard({ cur, prev }) {
  const { t } = useTranslation();
  const months = monthNames();
  if (!prev || prev.total <= 0 || !cur) {
    return (
      <div style={cardStyle}>
        <div style={cardTitleStyle}>{t('costs.whatChangedMom')}</div>
        <div style={{ padding: '24px 0', textAlign: 'center', fontSize: '13px', color: IOS_THEME.textSecondary }}>{t('costs.needPreviousMonth')}</div>
      </div>
    );
  }
  const catDefs = [
    { name: t('costs.transport'), d: cur.transport - prev.transport },
    { name: t('costs.energy'), d: cur.elec - prev.elec },
    { name: t('costs.gas'), d: cur.gas - prev.gas },
    { name: t('costs.water'), d: cur.water - prev.water },
    { name: t('costs.people'), d: cur.workers - prev.workers },
    { name: t('costs.other'), d: cur.other - prev.other },
  ];
  const cols = [{ label: months[prev.month - 1].slice(0, 3), type: 'edge', val: prev.total }];
  let run = prev.total;
  catDefs.forEach(c => { cols.push({ label: c.name, type: 'delta', from: run, to: run + c.d, d: c.d }); run += c.d; });
  cols.push({ label: months[cur.month - 1].slice(0, 3), type: 'edge', val: cur.total });

  const W = 580, Hh = 210, P = 28, axisB = 34;
  const maxV = Math.max(prev.total, cur.total, ...cols.map(c => c.type === 'delta' ? Math.max(c.from, c.to) : c.val)) * 1.06;
  const slot = (W - 2 * P) / cols.length;
  const bw = Math.min(slot * 0.6, 46);
  const cx = (i) => P + slot * (i + 0.5);
  const y = (v) => (Hh - axisB) - (v / maxV) * (Hh - axisB - 10);
  const net = cur.total - prev.total;

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={cardTitleStyle}>{t('costs.whatChangedMom')}</div>
        <div style={{ fontSize: '14px', fontWeight: 800, color: net <= 0 ? '#10B981' : '#EF4444', fontVariantNumeric: 'tabular-nums' }}>
          {net >= 0 ? '+' : '−'}{FMT(Math.abs(net))} {t('costs.currency')}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${Hh}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {cols.map((c, i) => {
          const isEdge = c.type === 'edge';
          const top = isEdge ? y(c.val) : y(Math.max(c.from, c.to));
          const h = isEdge ? (Hh - axisB) - y(c.val) : Math.abs(y(c.from) - y(c.to));
          const fill = isEdge ? IOS_THEME.accent : (c.d <= 0 ? '#10B981' : '#EF4444');
          const lbl = isEdge ? FMT0(c.val) : `${c.d >= 0 ? '+' : '−'}${FMT0(Math.abs(c.d))}`;
          return (
            <g key={i}>
              {!isEdge && i > 0 && <line x1={cx(i - 1)} x2={cx(i) - bw / 2} y1={y(c.from)} y2={y(c.from)} stroke="rgba(0,0,0,0.15)" strokeWidth="1" strokeDasharray="2 2" />}
              <rect x={cx(i) - bw / 2} y={top} width={bw} height={Math.max(h, 1)} rx="3" fill={fill} opacity={isEdge ? 1 : 0.9} />
              <text x={cx(i)} y={top - 5} textAnchor="middle" fontSize="10" fontWeight="700" fill={isEdge ? IOS_THEME.textPrimary : fill}>{lbl}</text>
              <text x={cx(i)} y={Hh - axisB + 14} textAnchor="middle" fontSize="10" fontWeight="600" fill={IOS_THEME.textSecondary}>{c.label}</text>
            </g>
          );
        })}
        <line x1={P} x2={W - P} y1={Hh - axisB} y2={Hh - axisB} stroke="rgba(0,0,0,0.12)" strokeWidth="1" />
      </svg>
    </div>
  );
}

// Trend wielomiesięczny: słupki zł/kg + linia celu (śr. z miesięcy z danymi), tonaż pod spodem
function MultiMonthTrend({ months }) {
  const { t } = useTranslation();
  const monthList = monthNames();
  const pts = months;
  const vals = pts.map(p => p.plnPerKg);
  const withData = vals.filter(v => v > 0);
  const target = withData.length ? withData.reduce((a, b) => a + b, 0) / withData.length : 0;
  if (!withData.length) {
    return <div style={{ padding: '24px 0', textAlign: 'center', fontSize: '13px', color: IOS_THEME.textSecondary }}>{t('costs.noMonthsWithTonnage')}</div>;
  }
  const W = 720, Hh = 200, P = 28, axisB = 40;
  const maxV = Math.max(...vals, target) * 1.18;
  const slot = (W - 2 * P) / pts.length;
  const bw = Math.min(slot * 0.5, 48);
  const cx = (i) => P + slot * (i + 0.5);
  const y = (v) => (Hh - axisB) - (v / maxV) * (Hh - axisB - 12);

  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {/* linia celu */}
      <line x1={P} x2={W - P} y1={y(target)} y2={y(target)} stroke={IOS_THEME.warning} strokeWidth="1.5" strokeDasharray="5 4" />
      <text x={W - P} y={y(target) - 5} textAnchor="end" fontSize="10" fontWeight="700" fill={IOS_THEME.warning}>{t('costs.target')} {FMT3(target)}</text>
      {pts.map((p, i) => {
        const v = p.plnPerKg;
        const has = v > 0;
        const top = has ? y(v) : (Hh - axisB) - 2;
        const h = has ? (Hh - axisB) - y(v) : 2;
        const fill = !has ? 'rgba(0,0,0,0.06)' : v <= target ? '#10B981' : CAT.transport;
        return (
          <g key={p.mk}>
            <rect x={cx(i) - bw / 2} y={top} width={bw} height={Math.max(h, 2)} rx="4" fill={fill} />
            {has && <text x={cx(i)} y={top - 6} textAnchor="middle" fontSize="10" fontWeight="800" fill={IOS_THEME.textPrimary}>{FMT3(v)}</text>}
            <text x={cx(i)} y={Hh - axisB + 15} textAnchor="middle" fontSize="10" fontWeight="700" fill={IOS_THEME.textSecondary}>{monthList[p.month - 1].slice(0, 3)}</text>
            <text x={cx(i)} y={Hh - axisB + 28} textAnchor="middle" fontSize="9" fontWeight="600" fill="rgba(0,0,0,0.35)">{p.kg > 0 ? `${FMT0(p.kg)} kg` : '—'}</text>
          </g>
        );
      })}
      <line x1={P} x2={W - P} y1={Hh - axisB} y2={Hh - axisB} stroke="rgba(0,0,0,0.12)" strokeWidth="1" />
    </svg>
  );
}

function TrendChart({ data, days, avg, offFlags = [] }) {
  const { t } = useTranslation();
  const W = 600, H = 170, P = 10;
  const n = data.length;
  // Tylko dni robocze tworzą wierzchołki linii — pozycja X wg realnego dnia w miesiącu,
  // więc weekendy/święta są płynnie mostkowane prostym odcinkiem (krzywa bez dołków do zera).
  const workIdx = data.map((_, i) => i).filter(i => !offFlags[i]);
  const max = Math.max(...workIdx.map(i => data[i]), 1);
  const x = (i) => P + (n <= 1 ? 0 : (i / (n - 1)) * (W - 2 * P));
  const y = (v) => H - P - (v / max) * (H - 2 * P);
  const linePts = workIdx.map(i => `${x(i).toFixed(1)},${y(data[i]).toFixed(1)}`).join(' ');
  const firstX = workIdx.length ? x(workIdx[0]) : x(0);
  const lastX = workIdx.length ? x(workIdx[workIdx.length - 1]) : x(n - 1);
  const areaPts = `${firstX.toFixed(1)},${(H - P).toFixed(1)} ${linePts} ${lastX.toFixed(1)},${(H - P).toFixed(1)}`;
  const avgY = y(avg);
  let maxIdx = workIdx.length ? workIdx[0] : 0;
  workIdx.forEach(i => { if (data[i] > data[maxIdx]) maxIdx = i; });

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} preserveAspectRatio="none">
        <polygon points={areaPts} fill={tint(IOS_THEME.accent, 0.12)} />
        <line x1={P} y1={avgY} x2={W - P} y2={avgY} stroke={IOS_THEME.textSecondary} strokeWidth="1" strokeDasharray="4 4" />
        <polyline points={linePts} fill="none" stroke={IOS_THEME.accent} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {n > 0 && <circle cx={x(maxIdx)} cy={y(data[maxIdx])} r="3.5" fill={IOS_THEME.accent} vectorEffect="non-scaling-stroke" />}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '11px', color: IOS_THEME.textSecondary, fontVariantNumeric: 'tabular-nums' }}>
        <span>{days.length ? new Date(days[0]).getDate() + '.' + String(new Date(days[0]).getMonth() + 1).padStart(2, '0') : ''}</span>
        <span style={{ color: IOS_THEME.warning, fontWeight: 600 }}>{t('costs.peak')} {FMT(data[maxIdx] || 0)} {t('costs.currency')}</span>
        <span>{t('costs.avgShort')} {FMT(avg)} {t('costs.currency')}</span>
        <span>{days.length ? new Date(days[days.length - 1]).getDate() + '.' + String(new Date(days[days.length - 1]).getMonth() + 1).padStart(2, '0') : ''}</span>
      </div>
    </div>
  );
}

/* ───────────── RATES PANEL ───────────── */
function RatesPanel({ settings, onChange, readOnly = false }) {
  const { t } = useTranslation();
  const groups = [
    { title: t('costs.transport'), color: CAT.transport, fields: [
      ['fiat_l_100km', 'Fiat L/100km'], ['isuzu_l_100km', 'Isuzu L/100km'], ['merc_l_100km', 'Merc. L/100km'],
      ['iveco_l_100km', 'Iveco L/100km'], ['fuel_price', t('costs.fuelRate')],
    ]},
    { title: t('costs.energy'), color: CAT.elec, fields: [
      ['elec_multiplier', t('costs.meterMultiplier')], ['elec_price_kwh', t('costs.ratePerKwh')], ['elec_fixed_monthly', t('costs.fixedMonthly')],
    ]},
    { title: t('costs.productionGas'), color: CAT.gas, fields: [
      ['gas_prod_price_m3', t('costs.ratePerM3')], ['gas_prod_fixed_daily', t('costs.subscriptionDaily')],
    ]},
    { title: t('costs.heatingGas'), color: '#4A148C', fields: [
      ['gas_heat_price_m3', t('costs.ratePerM3')], ['gas_heat_fixed_monthly', t('costs.subscriptionMonthly')],
    ]},
    { title: t('costs.water'), color: CAT.water, fields: [
      ['water_price_m3', t('costs.ratePerM3')], ['water_fixed_monthly', t('costs.subscriptionMonthly')],
    ]},
    { title: t('costs.employees'), color: CAT.workers, fields: [
      ['worker_hourly_rate', t('costs.ratePerWorkHour')],
    ]},
  ];
  return (
    <div style={cardStyle}>
      <div style={{ ...cardTitleStyle, display: 'flex', alignItems: 'center', gap: '8px' }}><Settings size={16}/> {t('costs.rates')} — {' '}<span style={{ fontWeight: 500, color: IOS_THEME.textSecondary, fontSize: '13px' }}>{readOnly ? t('costs.preview') : t('costs.editAndSave')}</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '16px', marginTop: '4px' }}>
        {groups.map(g => (
          <div key={g.title} style={{ borderLeft: `3px solid ${g.color}`, paddingLeft: '12px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: g.color, marginBottom: '10px' }}>{g.title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {g.fields.map(([field, label]) => (
                <label key={field} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', fontSize: '13px' }}>
                  <span style={{ color: IOS_THEME.textSecondary }}>{label}</span>
                  <input type="number" value={settings[field] ?? ''} onChange={(e) => onChange(field, e.target.value)} disabled={readOnly} className="costs-inp" style={{ ...rateInpStyle, opacity: readOnly ? 0.75 : 1 }} />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────────── ENTRY GRID (cumulative meter readings) ───────────── */
function EntryGrid({ days, weekdays, dailyData, calcDay, totals, onChange, readOnly = false, laborHours = {} }) {
  const { t } = useTranslation();
  // each meter = ONE daily reading stored in <base>_end; consumption derived in calcDay
  const meterTh = (icon, label) => (
    <th className="sticky-head" style={newThStyle}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>{icon} {label}</span>
        <span style={{ fontSize: '9px', fontWeight: 500, color: IOS_THEME.textSecondary, opacity: 0.7 }}>{t('costs.meter')}</span>
      </div>
    </th>
  );
  // Komórka wartości: slot główny (wartość/input) + slot jednostki pod spodem (zawsze ta sama wysokość)
  const valCell = (tdStyle, main, sub, subColor, extra = {}) => (
    <td style={{ ...tdStyle, height: '1px', padding: '0 6px' }} className={extra.className} title={extra.title}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', paddingTop: '11px', paddingBottom: '2px' }}>
        <div style={cellMain}>{main}</div>
      <div style={{ ...cellSub, color: subColor || IOS_THEME.textSecondary }}>{sub || ' '}</div>
      </div>
    </td>
  );
  const reading = (dStr, dt, base, cons, unit) => valCell(
    newTdStyle,
    <input type="text" inputMode="numeric" value={dt[`${base}_end`] ?? ''} onChange={(e) => onChange(dStr, `${base}_end`, e.target.value)} disabled={readOnly} className="costs-inp" style={{ ...newInpStyle, opacity: readOnly ? 0.75 : 1 }}/>,
    cons > 0 ? <>{unit === 'm³' ? FMT1(cons) : FMT0(cons)} <span style={{ fontWeight: 500 }}>{unit}</span></> : '',
  );
  const footMeter = (val, unit) => (
    <td style={{ ...footTdStyle, textAlign: 'center', color: IOS_THEME.textSecondary }}>
      {val > 0 ? <>{unit === 'm³' ? FMT1(val) : FMT0(val)} <span style={{ fontWeight: 500, fontSize: '10px' }}>{unit}</span></> : ''}
    </td>
  );
  return (
    <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', borderBottom: `1px solid ${IOS_THEME.border}`, fontSize: '12.5px', color: IOS_THEME.textSecondary, background: '#F9F9FB' }}>
        💡 {t('costs.entryHintPrefix')} <b style={{ color: IOS_THEME.textPrimary }}>{t('costs.meterReading')}</b> {t('costs.entryHintSuffix')}
      </div>
      <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
        <table className="costs-table" style={{ width: '100%', minWidth: '1180px', borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr>
              <th className="sticky-col sticky-head" style={newThStyle}>{t('costs.date')}</th>
              {meterTh(<Truck size={13}/>, 'Fiat')}
              {meterTh(<Truck size={13}/>, 'Isuzu')}
              {meterTh(<Truck size={13}/>, 'Merc.')}
              {meterTh(<Truck size={13}/>, 'Iveco')}
              <th className="sticky-head" style={{ ...newThStyle, color: CAT.transport, background: opaqueTint(CAT.transport, 0.13) }}><span>{t('costs.cost')}</span><br/><span>{t('costs.cars')}</span></th>
              {meterTh(<Zap size={13}/>, t('costs.electricity'))}
              <th className="sticky-head" style={{ ...newThStyle, color: CAT.elec, background: opaqueTint(CAT.elec, 0.13) }}><span>{t('costs.cost')}</span><br/><span>{t('costs.electricity')}</span></th>
              {meterTh(<Flame size={13}/>, t('costs.productionGasShort'))}
              <th className="sticky-head" style={{ ...newThStyle, color: CAT.gas, background: opaqueTint(CAT.gas, 0.13) }}><span>{t('costs.cost')}</span><br/><span>{t('costs.productionShort')}</span></th>
              {meterTh(<Flame size={13}/>, t('costs.heatingGasShort'))}
              <th className="sticky-head" style={{ ...newThStyle, color: '#4A148C', background: opaqueTint('#4A148C', 0.13) }}><span>{t('costs.cost')}</span><br/><span>{t('costs.heatingShort')}</span></th>
              {meterTh(<Droplet size={13}/>, t('costs.water'))}
              <th className="sticky-head" style={{ ...newThStyle, color: CAT.water, background: opaqueTint(CAT.water, 0.13) }}><span>{t('costs.cost')}</span><br/><span>{t('costs.water')}</span></th>
              <th className="sticky-head" style={{ ...newThStyle, color: CAT.workers, background: opaqueTint(CAT.workers, 0.13) }}><span>Pracownicy</span><br/><span>{t('costs.cost')}</span></th>
              <th className="sticky-head" style={newThStyle}>{t('costs.other')}</th>
              <th className="sticky-head" style={{ ...newThStyle, color: IOS_THEME.accent, fontWeight: 800 }}><span>{t('costs.total')}</span><br/><span style={{ fontSize: '9px', opacity: 0.6, fontWeight: 500 }}>{t('costs.currencyPerKg')}</span></th>
            </tr>
          </thead>
          <tbody>
            {days.map((dStr, idx) => {
              const d = new Date(dStr);
              const isHol = isHoliday(d);
              const isWe = d.getDay() === 0 || d.getDay() === 6;
              const isOff = isWe || !!isHol;
              const isToday = dStr === todayStr;
              const c = calcDay(dStr, idx);
              const dt = dailyData[dStr] || {};
              const rowBg = isToday ? tint(IOS_THEME.accent, 0.12) : isOff ? '#EBEBEB' : '#FFFFFF';
              const dateCellBg = isToday ? IOS_THEME.accent : isOff ? '#D5D5D5' : '#FFFFFF';
              const dateCellColor = isToday ? '#FFFFFF' : isOff ? '#888888' : IOS_THEME.textPrimary;
              return (
                <tr key={dStr} className="costs-row" style={{ background: rowBg }}>
                  {valCell(
                    { ...newTdStyle, fontWeight: 700, background: dateCellBg, color: dateCellColor, minWidth: '52px' },
                    <span style={{ fontSize: '15px', fontWeight: 700 }}>{String(d.getDate()).padStart(2, '0')}</span>,
                    <span style={{ textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>{weekdays[d.getDay()]}</span>,
                    dateCellColor,
                    { className: 'sticky-col', title: isHol ? isHol.name : '' }
                  )}
                  {reading(dStr, dt, 'fiat', c.fiat_km, 'km')}
                  {reading(dStr, dt, 'isuzu', c.isuzu_km, 'km')}
                  {reading(dStr, dt, 'merc', c.merc_km, 'km')}
                  {reading(dStr, dt, 'iveco', c.iveco_km, 'km')}
                  {valCell(costCellStyle(CAT.transport),
                    FMT(c.transportCost),
                    c.total_km > 0 ? `${FMT0(c.total_km)} km` : (dt.fiat_end !== undefined || dt.isuzu_end !== undefined || dt.merc_end !== undefined || dt.iveco_end !== undefined) ? '0 km' : '',
                    CAT.transport)}
                  {reading(dStr, dt, 'elec', c.elec_usage, 'kWh')}
                  {valCell(costCellStyle(CAT.elec), FMT(c.elec_cost), '')}
                  {reading(dStr, dt, 'gas_prod', c.gas_prod_usage, 'm³')}
                  {valCell(costCellStyle(CAT.gas), FMT(c.gas_prod_cost), '')}
                  {reading(dStr, dt, 'gas_heat', c.gas_heat_usage, 'm³')}
                  {valCell(costCellStyle('#4A148C'), FMT(c.gas_heat_cost), '')}
                  {reading(dStr, dt, 'water', c.water_usage, 'm³')}
                  {valCell(costCellStyle(CAT.water), FMT(c.water_cost), '')}
                  {valCell(costCellStyle(CAT.workers), c.worker_cost > 0 ? FMT(c.worker_cost) : '—', (laborHours[dStr] || 0) > 0 ? `${FMT1(laborHours[dStr])} h` : '')}
                  {valCell(newTdStyle,
                    <input type="text" inputMode="decimal" value={dt.other_costs ?? ''} onChange={(e) => onChange(dStr, 'other_costs', e.target.value)} disabled={readOnly} className="costs-inp" style={{ ...newInpStyle, opacity: readOnly ? 0.75 : 1 }}/>,
                    '')}
                  {valCell(
                    { ...newTdStyle, fontWeight: 800, background: 'rgba(37,99,235,0.10)', color: IOS_THEME.accent, borderLeft: '2px solid rgba(37,99,235,0.2)', whiteSpace: 'nowrap' },
                    <span style={{ fontSize: '14px' }}>{FMT(c.total_cost)}</span>,
                    c.pln_kg > 0 ? <>{FMT(c.pln_kg)} <span style={{ fontWeight: 500 }}>{t('costs.currencyPerKg')}</span></> : '',
                    IOS_THEME.accent)}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="costs-foot">
              <td className="sticky-col" style={{ ...footTdStyle, textAlign: 'left', background: '#1E293B', color: '#FFFFFF' }}>{t('costs.total')}</td>
              {footMeter(totals.kmFiat, 'km')}
              {footMeter(totals.kmIsuzu, 'km')}
              {footMeter(totals.kmMerc, 'km')}
              {footMeter(totals.kmIveco, 'km')}
              <td style={{ ...footTdStyle, color: CAT.transport, background: opaqueTint(CAT.transport, 0.16), textAlign: 'center' }}>
                <div>{FMT(totals.transport)}</div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: CAT.transport, opacity: 0.6, marginTop: '2px' }}>{(() => { const km = totals.kmFiat + totals.kmIsuzu + totals.kmMerc + totals.kmIveco; return km > 0 ? `${FMT0(km)} km` : ''; })()}</div>
              </td>
              {footMeter(totals.kWh, 'kWh')}
              <td style={{ ...footTdStyle, color: CAT.elec, background: opaqueTint(CAT.elec, 0.16), textAlign: 'center' }}>{FMT(totals.elec)}</td>
              {footMeter(totals.m3GasProd, 'm³')}
              <td style={{ ...footTdStyle, color: CAT.gas, background: opaqueTint(CAT.gas, 0.16), textAlign: 'center' }}>{FMT(totals.gasProd)}</td>
              {footMeter(totals.m3GasHeat, 'm³')}
              <td style={{ ...footTdStyle, color: '#4A148C', background: opaqueTint('#4A148C', 0.16), textAlign: 'center' }}>{FMT(totals.gasHeat)}</td>
              {footMeter(totals.m3Water, 'm³')}
              <td style={{ ...footTdStyle, color: CAT.water, background: opaqueTint(CAT.water, 0.16), textAlign: 'center' }}>{FMT(totals.water)}</td>
              <td style={{ ...footTdStyle, color: CAT.workers, background: opaqueTint(CAT.workers, 0.16), textAlign: 'center' }}>
                <div>{FMT(totals.workers)}</div>
                <div style={{ fontSize: '10px', fontWeight: 700, opacity: 0.6, marginTop: '2px' }}>{(() => { const h = days.reduce((s, dStr) => s + (laborHours[dStr] || 0), 0); return h > 0 ? `${FMT1(h)} h` : ''; })()}</div>
              </td>
              <td style={{ ...footTdStyle, color: IOS_THEME.textSecondary }}>{FMT(totals.other)}</td>
              <td style={{ ...footTdStyle, background: '#2563EB', color: '#FFFFFF', fontWeight: 900, textAlign: 'center', borderLeft: '2px solid rgba(255,255,255,0.3)' }}>
                <div style={{ fontSize: '15px' }}>{FMT(totals.total)}</div>
                <div style={{ fontSize: '10px', fontWeight: 600, opacity: 0.8, marginTop: '3px' }}>
                  {(() => { const kg = days.reduce((s, dStr) => { const d = dailyData[dStr] || {}; return s + decimalValue(d.ton_zd1) + decimalValue(d.ton_zd2) + decimalValue(d.ton_pralki); }, 0); return kg > 0 ? `${FMT(totals.total / kg)} ${t('costs.currencyPerKg')}` : ''; })()}
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ───────────── THRESHOLD EDITOR (progi wydajności) ───────────── */
// Input progu z lokalnym draftem — zatwierdza po opuszczeniu pola / Enter (obsługuje przecinek)
// Formatuje próg w postaci XX.X (np. 4 → "4.0", 5.5 → "5.5")
const fmtProg = (v) => { const n = Number(v); return Number.isFinite(n) ? n.toFixed(1) : String(v ?? ''); };
// Remontowany przez key={...value} u rodzica, więc draft startuje od aktualnej wartości
function ProgInput({ value, onCommit, readOnly = false }) {
  const [draft, setDraft] = useState(fmtProg(value));
  const commit = () => {
    const v = parseFloat(draft.replace(',', '.'));
    onCommit(isNaN(v) ? 0 : v);
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      disabled={readOnly}
      style={{ width: '58px', textAlign: 'center', padding: '6px 4px', borderRadius: '8px', border: `1px solid ${IOS_THEME.border}`, fontWeight: 700, fontSize: '13px', color: IOS_THEME.textPrimary, opacity: readOnly ? 0.75 : 1 }}
    />
  );
}

// Edytor JEDNEGO pasma (kliknięty kolor) — przedział od–do dla każdej grupy (ZD1/ZD2/Ogółem)
function ThresholdEditor({ band, progi, onChange, onClose, readOnly = false }) {
  const { t } = useTranslation();
  const GROUPS = [['ZD1', 'ZD 1'], ['ZD2', 'ZD 2'], ['WSP', t('costs.overall')]];
  const def = PERF_BANDS.find(b => b.id === band);
  const isDefault = JSON.stringify(progi) === JSON.stringify(PROGI_DEFAULT);
  if (!def) return null;

  const setVal = (g, k, v) => onChange({ ...progi, [g]: { ...progi[g], [k]: v } });
  const staticBox = (txt) => (
    <span style={{ width: '58px', textAlign: 'center', padding: '6px 4px', borderRadius: '8px', border: `1px solid ${IOS_THEME.border}`, background: '#F1F1F4', color: IOS_THEME.textSecondary, fontWeight: 700, fontSize: '13px' }}>{txt}</span>
  );
  const lbl = (label) => <span style={{ fontSize: '11px', fontWeight: 600, color: IOS_THEME.textSecondary }}>{label}</span>;

  return (
    <div style={{ padding: '14px 18px', borderBottom: `1px solid ${IOS_THEME.border}`, background: '#FFFFFF' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <span style={{ fontWeight: 800, fontSize: '13px', color: IOS_THEME.textPrimary }}>{t('costs.performanceThreshold')}:</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 11px', borderRadius: '8px', background: def.c.bg, color: def.c.fc, fontWeight: 700, fontSize: '12px' }}>{t(def.labelKey)}</span>
        <span style={{ fontSize: '11px', color: IOS_THEME.textSecondary }}>{t('costs.thresholdHint')}</span>
        <button
          onClick={() => onChange(PROGI_DEFAULT)}
          disabled={isDefault || readOnly}
          style={{ marginLeft: 'auto', padding: '4px 12px', borderRadius: '8px', border: `1px solid ${IOS_THEME.border}`, background: '#FFFFFF', color: isDefault ? IOS_THEME.textSecondary : IOS_THEME.accent, fontWeight: 700, fontSize: '11px', cursor: isDefault ? 'default' : 'pointer', opacity: isDefault ? 0.5 : 1 }}
        >
          {t('costs.restoreDefaults')}
        </button>
        <button
          onClick={onClose}
          title={t('common.close')}
          style={{ width: '26px', height: '26px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', border: `1px solid ${IOS_THEME.border}`, background: '#FFFFFF', color: IOS_THEME.textSecondary, fontWeight: 700, fontSize: '15px', lineHeight: 1, cursor: 'pointer' }}
        >
          ×
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
        {GROUPS.map(([gKey, gLabel]) => (
          <div key={gKey} style={{ border: `1px solid ${IOS_THEME.border}`, borderRadius: '12px', padding: '12px', background: '#FAFAFC', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: '12px', minWidth: '50px', color: IOS_THEME.textPrimary }}>{gLabel}</span>
            {lbl(t('costs.from'))}
            {def.from === null
              ? staticBox('0')
              : <ProgInput key={`${gKey}-from-${progi[gKey][def.from]}`} value={progi[gKey][def.from]} onCommit={(v) => setVal(gKey, def.from, v)} readOnly={readOnly} />}
            {lbl(t('costs.to'))}
            {def.to === null
              ? staticBox('∞')
              : <ProgInput key={`${gKey}-to-${progi[gKey][def.to]}`} value={progi[gKey][def.to]} onCommit={(v) => setVal(gKey, def.to, v)} readOnly={readOnly} />}
            {lbl(t('costs.performanceUnit'))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────────── PERFORMANCE GRID ───────────── */
function PerformanceGrid({ days, weekdays, dailyData, timelineStats, totals, onChange, progi, onProgiChange, readOnly = false }) {
  const { t } = useTranslation();
  const [editBand, setEditBand] = useState(null); // id klikniętego pasma (kolor) lub null
  const effTd = (val, thr, perPerson) => {
    const c = effStyle(val, thr);
    return (
      <td style={{ ...newTdStyle, textAlign: 'center', background: c ? c.bg : undefined, color: c ? c.fc : IOS_THEME.textSecondary }}>
        <div style={{ fontWeight: 800 }}>{val > 0 ? val.toFixed(1) : '—'}</div>
        <div style={{ fontSize: '10px', fontWeight: 600, opacity: 0.75, minHeight: '12px' }}>{perPerson > 0 ? `${FMT0(perPerson)} ${t('costs.kgPerPerson')}` : ''}</div>
      </td>
    );
  };
  // hours cell with crew (obsada) sub-line
  const hoursTd = (hrs, people, color) => (
    <td style={{ ...newTdStyle, textAlign: 'center', color }}>
      <div style={{ fontWeight: 700 }}>{hrs > 0 ? FMT1(hrs) : '—'}</div>
      <div style={{ fontSize: '10px', fontWeight: 600, color: IOS_THEME.textSecondary, minHeight: '12px' }}>{people > 0 ? `${people} ${t('costs.peopleShort')}` : ''}</div>
    </td>
  );

  const effZd1Avg = totals.hZd1 > 0 ? totals.zd1 / totals.hZd1 : 0;
  const effZd2Avg = totals.hZd2 > 0 ? (totals.zd2 + totals.pralki) / totals.hZd2 : 0;
  const effAllAvg = totals.h > 0 ? totals.kg / totals.h : 0;
  // monthly avg kg/person = mean of daily kg/os (days with crew > 0), like the old sheet
  const osAgg = days.reduce((a, dStr) => {
    const dt = dailyData[dStr] || {};
    const ts = timelineStats[dStr]?.roles || {};
    const kgZd1 = decimalValue(dt.ton_zd1);
    const kgZd2pr = decimalValue(dt.ton_zd2) + decimalValue(dt.ton_pralki);
    const pZd1 = ts.ZD1?.emp?.size || 0, pZd2 = ts.ZD2?.emp?.size || 0;
    if (pZd1 > 0 && kgZd1 > 0) { a.z1 += kgZd1 / pZd1; a.n1++; }
    if (pZd2 > 0 && kgZd2pr > 0) { a.z2 += kgZd2pr / pZd2; a.n2++; }
    return a;
  }, { z1: 0, n1: 0, z2: 0, n2: 0 });
  const osZd1Avg = osAgg.n1 ? osAgg.z1 / osAgg.n1 : 0;
  const osZd2Avg = osAgg.n2 ? osAgg.z2 / osAgg.n2 : 0;

  // Dzienna wydajność Ogółem kg/h — do panelu (trend, rozkład pasm, najlepszy/najsłabszy dzień)
  const dayStats = days.map(dStr => {
    const dt = dailyData[dStr] || {};
    const ts = timelineStats[dStr]?.roles || {};
    const t_suma = decimalValue(dt.ton_zd1) + decimalValue(dt.ton_zd2) + decimalValue(dt.ton_pralki);
    const h_suma = (ts.ZD1?.hrs || 0) + (ts.ZD2?.hrs || 0) + (ts.Kierowcy?.hrs || 0);
    return { dStr, effAll: h_suma > 0 ? t_suma / h_suma : 0, t_suma, h_suma };
  });

  return (
    <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
    <div style={{ flex: '3 1 680px', minWidth: 0, ...cardStyle, padding: 0, overflow: 'hidden' }}>
      {/* legend — klik w kolor otwiera edytor TEGO pasma (przedział od–do per grupa) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', padding: '12px 18px', borderBottom: `1px solid ${IOS_THEME.border}`, background: '#F9F9FB', fontSize: '12px' }}>
        <span style={{ fontWeight: 700, color: IOS_THEME.textSecondary }}>{t('costs.performanceKgPerHour')}:</span>
        {PERF_BANDS.map(({ id, labelKey, c }) => {
          const active = editBand === id;
          return (
            <button
              key={id}
              onClick={() => setEditBand(v => (v === id ? null : id))}
              title={t('costs.thresholdButtonTitle', { label: t(labelKey) })}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 11px', borderRadius: '8px', background: c.bg, color: c.fc, fontWeight: 700, fontSize: '12px', border: `1.5px solid ${active ? c.fc : 'transparent'}`, boxShadow: active ? `0 0 0 2px ${c.bg}` : 'none', cursor: 'pointer' }}
            >
              {t(labelKey)}
            </button>
          );
        })}
        <Settings size={13} style={{ color: editBand ? IOS_THEME.accent : IOS_THEME.textSecondary }} />
        <span style={{ color: IOS_THEME.textSecondary, marginLeft: 'auto' }}>{t('costs.performanceLegendHint')}</span>
      </div>
      {editBand && <ThresholdEditor band={editBand} progi={progi} onChange={onProgiChange} onClose={() => setEditBand(null)} readOnly={readOnly} />}
      <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
        <table className="costs-table" style={{ width: '100%', minWidth: '820px', borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr>
              <th className="sticky-col sticky-head" style={newThStyle}>{t('costs.date')}</th>
              <th className="sticky-head" style={newThStyle}>ZD1 (kg)</th>
              <th className="sticky-head" style={newThStyle}>ZD2 (kg)</th>
              <th className="sticky-head" style={newThStyle}>{t('costs.washersKg')}</th>
              <th className="sticky-head" style={{ ...newThStyle, color: CAT.workers, background: opaqueTint(CAT.workers, 0.08) }}>Σ KG</th>
              <th className="sticky-head" style={newThStyle}>ZD1 (h)</th>
              <th className="sticky-head" style={newThStyle}>ZD2 (h)</th>
              <th className="sticky-head" style={newThStyle}>{t('costs.driversHours')}</th>
              <th className="sticky-head" style={{ ...newThStyle, color: '#1565C0', background: opaqueTint('#1565C0', 0.08) }}>Σ H</th>
              <th className="sticky-head" style={{ ...newThStyle, color: CAT.workers, background: opaqueTint(CAT.workers, 0.08) }}>ZD1 kg/h</th>
              <th className="sticky-head" style={{ ...newThStyle, color: CAT.gas, background: opaqueTint(CAT.gas, 0.08) }}>ZD2+Pr. kg/h</th>
              <th className="sticky-head" style={{ ...newThStyle, color: CAT.transport, background: opaqueTint(CAT.transport, 0.08) }}>{t('costs.overallKgH')}</th>
            </tr>
          </thead>
          <tbody>
            {days.map(dStr => {
              const d = new Date(dStr);
              const isHol = isHoliday(d);
              const isWe = d.getDay() === 0 || d.getDay() === 6;
              const isOff = isWe || !!isHol;
              const isToday = dStr === todayStr;
              const dt = dailyData[dStr] || {};
              const ts = timelineStats[dStr]?.roles || {};
              const kgZd1 = decimalValue(dt.ton_zd1);
              const kgZd2pr = decimalValue(dt.ton_zd2) + decimalValue(dt.ton_pralki);
              const t_suma = kgZd1 + kgZd2pr;
              const hZd1 = ts.ZD1?.hrs || 0, hZd2 = ts.ZD2?.hrs || 0, hKier = ts.Kierowcy?.hrs || 0;
              const h_suma = hZd1 + hZd2 + hKier;
              const pZd1 = ts.ZD1?.emp?.size || 0, pZd2 = ts.ZD2?.emp?.size || 0, pKier = ts.Kierowcy?.emp?.size || 0;
              const pAll = pZd1 + pZd2 + pKier;
              const effZd1 = hZd1 > 0 ? kgZd1 / hZd1 : 0;
              const effZd2 = hZd2 > 0 ? kgZd2pr / hZd2 : 0;
              const effAll = h_suma > 0 ? t_suma / h_suma : 0;
              return (
                <tr key={dStr} className="costs-row" style={{ background: isToday ? tint(IOS_THEME.accent, 0.12) : isOff ? '#EBEBEB' : '#FFFFFF' }}>
                  <td className="sticky-col" style={{ ...newTdStyle, fontWeight: 700, background: isToday ? IOS_THEME.accent : isOff ? '#D5D5D5' : '#FFFFFF', color: isToday ? '#FFFFFF' : isOff ? '#888888' : IOS_THEME.textPrimary, textAlign: 'center', minWidth: '52px' }} title={isHol ? isHol.name : ''}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, lineHeight: 1.2 }}>{String(d.getDate()).padStart(2, '0')}</span>
                      <span style={{ fontSize: '10px', fontWeight: 600, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{weekdays[d.getDay()]}</span>
                    </div>
                  </td>
                  <td style={newTdStyle}><input type="number" value={dt.ton_zd1 || ''} onChange={(e) => onChange(dStr, 'ton_zd1', e.target.value)} disabled={readOnly} className="costs-inp" style={{ ...newInpStyle, opacity: readOnly ? 0.75 : 1 }}/></td>
                  <td style={newTdStyle}><input type="number" value={dt.ton_zd2 || ''} onChange={(e) => onChange(dStr, 'ton_zd2', e.target.value)} disabled={readOnly} className="costs-inp" style={{ ...newInpStyle, opacity: readOnly ? 0.75 : 1 }}/></td>
                  <td style={newTdStyle}><input type="number" value={dt.ton_pralki || ''} onChange={(e) => onChange(dStr, 'ton_pralki', e.target.value)} disabled={readOnly} className="costs-inp" style={{ ...newInpStyle, opacity: readOnly ? 0.75 : 1 }}/></td>
                  <td style={{ ...newTdStyle, fontWeight: 700, textAlign: 'center', background: tint(CAT.workers, 0.05) }}>{t_suma > 0 ? FMT1(t_suma) : '—'}</td>
                  {hoursTd(hZd1, ts.ZD1?.emp?.size || 0, IOS_THEME.textPrimary)}
                  {hoursTd(hZd2, ts.ZD2?.emp?.size || 0, IOS_THEME.textPrimary)}
                  {hoursTd(hKier, ts.Kierowcy?.emp?.size || 0, IOS_THEME.textPrimary)}
                  <td style={{ ...newTdStyle, fontWeight: 700, color: '#1565C0', textAlign: 'center', background: tint('#1565C0', 0.05) }}>{h_suma > 0 ? FMT1(h_suma) : '—'}</td>
                  {effTd(effZd1, progi.ZD1, pZd1 > 0 ? kgZd1 / pZd1 : 0)}
                  {effTd(effZd2, progi.ZD2, pZd2 > 0 ? kgZd2pr / pZd2 : 0)}
                  {effTd(effAll, progi.WSP, pAll > 0 ? t_suma / pAll : 0)}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="costs-foot">
              <td className="sticky-col" style={{ ...footTdStyle, textAlign: 'left', background: '#1E293B', color: '#FFFFFF' }}>{t('costs.totalAvg')}</td>
              <td style={{ ...footTdStyle, textAlign: 'center' }}>{totals.zd1 ? FMT1(totals.zd1) : '—'}</td>
              <td style={{ ...footTdStyle, textAlign: 'center' }}>{totals.zd2 ? FMT1(totals.zd2) : '—'}</td>
              <td style={{ ...footTdStyle, textAlign: 'center' }}>{totals.pralki ? FMT1(totals.pralki) : '—'}</td>
              <td style={{ ...footTdStyle, color: CAT.workers, textAlign: 'center' }}>{totals.kg ? FMT1(totals.kg) : '—'}</td>
              <td style={{ ...footTdStyle, textAlign: 'center' }}>{totals.hZd1 ? FMT1(totals.hZd1) : '—'}</td>
              <td style={{ ...footTdStyle, textAlign: 'center' }}>{totals.hZd2 ? FMT1(totals.hZd2) : '—'}</td>
              <td style={{ ...footTdStyle, textAlign: 'center' }}>{totals.hKier ? FMT1(totals.hKier) : '—'}</td>
              <td style={{ ...footTdStyle, color: '#1565C0', textAlign: 'center' }}>{totals.h ? FMT1(totals.h) : '—'}</td>
              <td style={{ ...footTdStyle, color: CAT.workers, textAlign: 'center' }}>
                <div>{effZd1Avg > 0 ? effZd1Avg.toFixed(1) : '—'}</div>
                <div style={{ fontSize: '10px', fontWeight: 600, opacity: 0.75 }}>{osZd1Avg > 0 ? `${FMT0(osZd1Avg)} ${t('costs.kgPerPerson')}` : ''}</div>
              </td>
              <td style={{ ...footTdStyle, color: CAT.gas, textAlign: 'center' }}>
                <div>{effZd2Avg > 0 ? effZd2Avg.toFixed(1) : '—'}</div>
                <div style={{ fontSize: '10px', fontWeight: 600, opacity: 0.75 }}>{osZd2Avg > 0 ? `${FMT0(osZd2Avg)} ${t('costs.kgPerPerson')}` : ''}</div>
              </td>
              <td style={{ ...footTdStyle, color: CAT.transport, textAlign: 'center' }}>{effAllAvg > 0 ? effAllAvg.toFixed(1) : '—'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <PerformanceSidebar
      dayStats={dayStats} progi={progi} totals={totals}
      effZd1Avg={effZd1Avg} effZd2Avg={effZd2Avg} effAllAvg={effAllAvg}
      osZd1Avg={osZd1Avg} osZd2Avg={osZd2Avg}
      weekdays={weekdays}
    />
    </div>
  );
}

/* ───────────── PANEL WIZUALIZACJI (obok tabeli wydajności) ───────────── */
function PerformanceSidebar({ dayStats, progi, totals, effZd1Avg, effZd2Avg, effAllAvg, osZd1Avg, osZd2Avg, weekdays }) {
  const { t } = useTranslation();
  // Rozkład dni wg pasma — na bazie Ogółem kg/h (tylko dni z danymi)
  const dist = { slaba: 0, srednia: 0, dobra: 0, bdb: 0 };
  let activeDays = 0;
  dayStats.forEach(s => { const b = bandOf(s.effAll, progi.WSP); if (b) { dist[b]++; activeDays++; } });
  // Najlepszy / najsłabszy dzień
  const active = dayStats.filter(s => s.effAll > 0);
  const best = active.reduce((a, b) => (b.effAll > (a?.effAll ?? -1) ? b : a), null);
  const worst = active.reduce((a, b) => (b.effAll < (a?.effAll ?? Infinity) ? b : a), null);
  const dLab = (dStr) => { const d = new Date(dStr); return `${String(d.getDate()).padStart(2, '0')} ${weekdays[d.getDay()]}`; };

  return (
    <div style={{ flex: '1 1 320px', minWidth: '300px', maxWidth: '520px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Kafelki podsumowania */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <MiniStat label={t('costs.totalTonnage')} value={totals.kg > 0 ? FMT0(totals.kg) : '—'} unit="kg" color={CAT.workers} />
        <MiniStat label={t('costs.totalHours')} value={totals.h > 0 ? FMT1(totals.h) : '—'} unit="h" color="#1565C0" />
        <MiniStat label={t('costs.bestDay')} value={best ? best.effAll.toFixed(1) : '—'} unit={best ? `kg/h · ${dLab(best.dStr)}` : ''} color={EFF_COLORS.bdb.fc} />
        <MiniStat label={t('costs.weakestDay')} value={worst ? worst.effAll.toFixed(1) : '—'} unit={worst ? `kg/h · ${dLab(worst.dStr)}` : ''} color={EFF_COLORS.slaba.fc} />
      </div>

      {/* Średnia miesięczna vs progi */}
      <div style={cardStyle}>
        <div style={cardTitleStyle}>{t('costs.monthAvgVsThresholds')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <BandGauge label="ZD1" value={effZd1Avg} thr={progi.ZD1} sub={osZd1Avg > 0 ? `${FMT0(osZd1Avg)} ${t('costs.kgPerPerson')}` : ''} />
          <BandGauge label={t('costs.zd2PlusWashers')} value={effZd2Avg} thr={progi.ZD2} sub={osZd2Avg > 0 ? `${FMT0(osZd2Avg)} ${t('costs.kgPerPerson')}` : ''} />
          <BandGauge label={t('costs.overall')} value={effAllAvg} thr={progi.WSP} sub="" />
        </div>
      </div>

      {/* Rozkład dni wg pasma (Ogółem) */}
      <div style={cardStyle}>
        <div style={{ ...cardTitleStyle, marginBottom: '4px' }}>{t('costs.daysByBandOverall')}</div>
        <div style={{ fontSize: '11px', color: IOS_THEME.textSecondary, marginBottom: '14px' }}>
          {activeDays > 0 ? t('costs.daysWithData', { count: activeDays }) : t('costs.noDataThisMonth')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {PERF_BANDS.map(b => {
            const cnt = dist[b.id];
            const pct = activeDays > 0 ? (cnt / activeDays) * 100 : 0;
            return (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ width: '96px', fontSize: '12px', fontWeight: 700, color: b.c.fc }}>{t(b.labelKey)}</span>
                <div style={{ flex: 1, height: '12px', borderRadius: '6px', background: 'rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: b.c.bg, transition: 'width 0.4s' }} />
                </div>
                <span style={{ width: '24px', textAlign: 'right', fontSize: '13px', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: cnt > 0 ? b.c.fc : IOS_THEME.textSecondary }}>{cnt}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Pasek-gauge: 4 pasma proporcjonalne do progów + znacznik wartości średniej
function BandGauge({ label, value, thr, sub }) {
  const max = thr.dobra * 1.45;
  const segs = [
    { c: EFF_COLORS.slaba.bg,   w: thr.slaba },
    { c: EFF_COLORS.srednia.bg, w: thr.srednia - thr.slaba },
    { c: EFF_COLORS.dobra.bg,   w: thr.dobra - thr.srednia },
    { c: EFF_COLORS.bdb.bg,     w: max - thr.dobra },
  ];
  const band = bandOf(value, thr);
  const bc = band ? EFF_COLORS[band] : null;
  const pos = Math.min((value > 0 ? value : 0) / max, 1) * 100;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '7px' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: IOS_THEME.textPrimary }}>{label}</span>
        <span style={{ fontSize: '16px', fontWeight: 800, color: bc ? bc.fc : IOS_THEME.textSecondary, fontVariantNumeric: 'tabular-nums' }}>
          {value > 0 ? value.toFixed(1) : '—'} <span style={{ fontSize: '11px', fontWeight: 600, color: IOS_THEME.textSecondary }}>kg/h</span>
        </span>
      </div>
      <div style={{ position: 'relative', height: '14px' }}>
        <div style={{ display: 'flex', height: '100%', borderRadius: '7px', overflow: 'hidden' }}>
          {segs.map((s, i) => (<div key={i} style={{ width: `${(s.w / max) * 100}%`, background: s.c }} />))}
        </div>
        {value > 0 && (
          <div style={{ position: 'absolute', top: '-3px', left: `${pos}%`, transform: 'translateX(-50%)', width: '3px', height: '20px', borderRadius: '2px', background: IOS_THEME.textPrimary, boxShadow: '0 0 0 2px #fff' }} />
        )}
      </div>
      {sub ? <div style={{ marginTop: '5px', fontSize: '11px', fontWeight: 600, color: IOS_THEME.textSecondary }}>{sub}</div> : null}
    </div>
  );
}

function MiniStat({ label, value, unit, color }) {
  return (
    <div style={{ ...cardStyle, padding: '14px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: IOS_THEME.textSecondary, marginBottom: '7px' }}>{label}</div>
      <div style={{ fontSize: '20px', fontWeight: 800, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}>
        {value} <span style={{ fontSize: '11px', fontWeight: 600, color: IOS_THEME.textSecondary }}>{unit}</span>
      </div>
    </div>
  );
}

/* ───────────── STYLES ───────────── */
const cardStyle = {
  background: IOS_THEME.cardBg, borderRadius: IOS_THEME.radius, boxShadow: IOS_THEME.shadow,
  border: `1px solid ${IOS_THEME.border}`, padding: '20px'
};
const cardTitleStyle = { fontSize: '15px', fontWeight: 700, marginBottom: '16px', color: IOS_THEME.textPrimary };

const navBtnStyle = {
  padding: '6px 14px', borderRadius: '10px', background: '#F2F2F7', border: 'none', fontWeight: 700, fontSize: '18px', cursor: 'pointer'
};
const segmentBtnStyle = {
  padding: '6px 18px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'
};
const newThStyle = {
  padding: '8px 8px', textAlign: 'center', fontWeight: 700, fontSize: '11px', color: IOS_THEME.textSecondary, whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.6px'
};
const newTdStyle = {
  padding: '6px 6px', fontSize: '13px', fontVariantNumeric: 'tabular-nums', verticalAlign: 'middle', textAlign: 'center'
};
const newInpStyle = {
  width: '100%', padding: '5px 4px', border: '1px solid transparent', background: 'rgba(0,0,0,0.04)', borderRadius: '7px', textAlign: 'center', fontSize: '13px', outline: 'none', transition: 'all 0.18s ease', fontVariantNumeric: 'tabular-nums', fontWeight: 500
};
const rateInpStyle = {
  width: '90px', padding: '6px 8px', border: '1px solid transparent', background: 'rgba(0, 0, 0, 0.04)', borderRadius: '8px', textAlign: 'right', fontSize: '13px', fontWeight: 600, outline: 'none', transition: 'all 0.15s', fontVariantNumeric: 'tabular-nums'
};
// Każda komórka wartości ma stały slot na wartość (wyśrodkowaną) + stały slot na
// jednostkę pod spodem → wszystkie wiersze są równej wysokości i wyrównane w pionie.
const cellMain = { minHeight: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1.1 };
const cellSub = { height: '13px', fontSize: '10px', fontWeight: 700, textAlign: 'center', fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginTop: '1px' };
const costCellStyle = (color) => ({
  padding: '6px 6px', fontSize: '13px', fontWeight: 700, color, textAlign: 'center', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', verticalAlign: 'middle',
  background: tint(color, 0.10)
});
const footTdStyle = {
  padding: '10px 8px', fontSize: '13px', fontWeight: 800, textAlign: 'center', color: IOS_THEME.textPrimary, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', background: '#F1F5F9'
};

const COSTS_CSS = `
.costs-table { font-variant-numeric: tabular-nums; }
.costs-table thead th.sticky-head {
  position: sticky; top: 0; z-index: 3;
  background: #FFFFFF;
  border-bottom: 2px solid rgba(0,0,0,0.1);
}
.costs-table tbody tr {
  transition: filter 0.15s ease;
}
.costs-table tbody td {
  border-bottom: 1px solid rgba(0,0,0,0.07);
}
.costs-table thead th { border-bottom: 2px solid rgba(0,0,0,0.1); }
.costs-table .sticky-col {
  position: sticky; left: 0; z-index: 2;
  box-shadow: 2px 0 5px rgba(0,0,0,0.07);
}
.costs-table thead th.sticky-col { z-index: 4; background: #FFFFFF; }
.costs-foot td {
  position: sticky; bottom: 0; z-index: 3;
  border-top: 2px solid rgba(0,0,0,0.15);
}
.costs-foot td.sticky-col { z-index: 5; }
.costs-inp:focus {
  background: #FFFFFF !important;
  border-color: ${IOS_THEME.accent} !important;
  box-shadow: 0 0 0 3px rgba(37,99,235,0.2);
}
.costs-inp:hover { background: rgba(0,0,0,0.07) !important; }
.costs-save-btn:not(:disabled):active { transform: scale(0.96); }
.costs-inp::-webkit-outer-spin-button,
.costs-inp::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.costs-inp { -moz-appearance: textfield; }
`;
