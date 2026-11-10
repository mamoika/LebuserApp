import { useState, useEffect, useCallback, useRef, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { toastError, toastSuccess } from '../lib/toast';
import { upsertCostSettings, upsertCostsPerformanceProgi, upsertDailyCosts } from '../lib/adminRpc';
import { getCostsHistory, getCostsIntegrityReport, getCostsMonth, getMonthRoster, getPerformanceProgi } from '../lib/readRpc';
import { Droplet, Zap, Flame, Truck, Users, Save, Sigma, Settings, Scale, Package, CalendarDays, Download, Info, ChevronLeft, ChevronRight, BarChart3, TrendingUp, ShieldAlert, X } from 'lucide-react';
import { isHoliday } from '../utils/holidays';
import { currentLocale, dayNamesSunSat, monthNames } from '../lib/dateUtils';
import { exportSheetsAsXlsx } from '../lib/excelExport';
import { isFutureCalendarDate } from '../lib/calendarDate';
import { scheduleDayHours } from '../lib/workTime';
import { lockPageScroll } from '../lib/modalScrollLock';
import {
  buildDailyCostPatches,
  buildTimelineStats,
  countAccruedDays,
  COST_METER_FIELDS,
  dailyPerformanceMetrics,
  electricityMonthlyCost,
  electricityMonthlyFees,
  electricityReconciliation,
  gasProductionDailyCost,
  gasProductionKwh,
  gasProductionMonthlyCost,
  gasProductionReconciliation,
  DEFAULT_GAS_PROD_KWH_PER_M3,
  DEFAULT_GAS_PROD_PRICE_KWH,
  invalidCostSettingFields,
  meterUsageSeries,
  parseMeterReading,
  plantThroughputDayExtremes,
  productionThroughput,
} from '../lib/costEngine';
import DataError from './DataError';

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function useTodayKey() {
  const [key, setKey] = useState(() => toDateStr(new Date()));
  useEffect(() => {
    let timer;
    const scheduleNextMidnight = () => {
      const now = new Date();
      const next = new Date(now);
      next.setHours(24, 0, 0, 50);
      timer = setTimeout(() => {
        setKey(toDateStr(new Date()));
        scheduleNextMidnight();
      }, next.getTime() - now.getTime());
    };
    scheduleNextMidnight();
    return () => clearTimeout(timer);
  }, []);
  return key;
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
  const off = ['', 'W', 'UW', 'L4', 'NU', 'NN', 'END'];
  if (off.includes(v)) return defaultStartH;
  if (v.includes('-')) { const s = parseHour(v.split('-')[0]); if (Number.isFinite(s)) return s; }
  if (v.includes('+')) { const s = parseHour(v.split('+')[0]); if (Number.isFinite(s)) return s; }
  return defaultStartH; // sama liczba = długość zmiany, start bez zmian
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

// Apple HIG Design Constants
const IOS_THEME = {
  bg: '#F5F5F7',
  cardBg: '#FFFFFF',
  textPrimary: '#1D1D1F',
  textSecondary: '#6E6E73',
  textTertiary: '#86868B',
  accent: '#0071E3',
  accentHover: '#0077ED',
  success: '#34C759',
  successText: '#248A3D',
  successBg: 'rgba(52, 199, 89, 0.12)',
  warning: '#FF9500',
  warningText: '#B25000',
  warningBg: 'rgba(255, 149, 0, 0.12)',
  danger: '#FF3B30',
  dangerText: '#D70015',
  dangerBg: 'rgba(255, 59, 48, 0.12)',
  border: 'rgba(0, 0, 0, 0.06)',
  borderHover: 'rgba(0, 0, 0, 0.12)',
  radius: '18px',
  radiusSm: '12px',
  radiusPill: '999px',
  shadow: '0 1px 3px rgba(0, 0, 0, 0.02), 0 8px 24px rgba(0, 0, 0, 0.04)',
  shadowHover: '0 2px 8px rgba(0, 0, 0, 0.04), 0 14px 32px rgba(0, 0, 0, 0.07)'
};

// Category colors (Apple HIG balanced palette)
const CAT = {
  transport: '#0071E3',
  elec: '#D97706',
  gas: '#8E44AD',
  water: '#0284C7',
  workers: '#16A34A',
  other: '#71717A'
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

// Performance thresholds (kg/rbh) — same as the old spreadsheet (PROGI)
const PROGI_DEFAULT = {
  ZD1: { slaba: 4.0, srednia: 5.5, dobra: 8.0 },
  ZD2: { slaba: 14, srednia: 21, dobra: 26 },
  WSP: { slaba: 15, srednia: 20, dobra: 27 },
};
// Progi są PER MIESIĄC — osobny klucz w app_settings i osobny cache na każdy month_key
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
  elec_power_fee_monthly: 0, elec_reactive_monthly: 0,
  elec_invoice_kwh: null, elec_invoice_net: null,
  gas_prod_price_m3: 1.95, gas_prod_fixed_daily: 173.51,
  gas_prod_kwh_per_m3: DEFAULT_GAS_PROD_KWH_PER_M3,
  gas_prod_price_kwh: DEFAULT_GAS_PROD_PRICE_KWH,
  gas_prod_fixed_monthly: 5205.24,
  gas_prod_invoice_kwh: null, gas_prod_invoice_net: null,
  gas_heat_price_m3: 6.15, gas_heat_fixed_monthly: 49.78,
  water_price_m3: 16.25, water_fixed_monthly: 20.10,
  worker_hourly_rate: 45.82,
  target_cost_per_kg: null,
};

/* ───────────── HISTORIA MIESIĘCZNA (silnik dla Przeglądu) ───────────── */
// Stawki dla danego miesiąca: własne, inaczej z ostatniego wcześniejszego (jak w fetchData)
function settingsForMonth(monthKey, settsAsc) {
  let chosen = null;
  for (const s of settsAsc) { if (s.month_key <= monthKey) chosen = s; else break; }
  const exact = settsAsc.find(s => s.month_key === monthKey);
  return {
    ...DEFAULT_SETTINGS,
    ...(chosen || {}),
    elec_invoice_kwh: exact?.elec_invoice_kwh ?? null,
    elec_invoice_net: exact?.elec_invoice_net ?? null,
    gas_prod_invoice_kwh: exact?.gas_prod_invoice_kwh ?? null,
    gas_prod_invoice_net: exact?.gas_prod_invoice_net ?? null,
    target_cost_per_kg: exact?.target_cost_per_kg ?? chosen?.target_cost_per_kg ?? null,
  };
}
// Zużycie licznika kumulatywnego, z obsługą jawnej wymiany/resetu licznika.
function meterMonthUsage(base, costsAsc, monthStart, monthEnd) {
  let previous = null, usage = 0;
  for (const c of costsAsc) {
    const raw = c[`${base}_end`];
    const n = (raw === '' || raw == null) ? null : parseFloat(String(raw).replace(',', '.'));
    if (n == null || isNaN(n)) continue;
    if (c.entry_date > monthEnd) break;
    if (c[`${base}_reset`]) {
      previous = n;
      continue;
    }
    if (c.entry_date >= monthStart && previous != null && n >= previous) usage += n - previous;
    previous = n;
  }
  return usage;
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
  const kWh = u('elec') * s.elec_multiplier;
  const elec = electricityMonthlyCost(kWh, s);
  const gasProdUsage = u('gas_prod');
  const gasProd = gasProductionMonthlyCost(gasProdUsage, s, daysInMonth);
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
  return {
    mk, year, month, dayCount: daysInMonth, transport, elec, gasProd, gasHeat,
    gas: gasProd + gasHeat, water, workers, other, total, kg, kWh,
    electricityReconciliation: electricityReconciliation(s, kWh, elec),
    plnPerKg: kg > 0 ? total / kg : 0,
  };
}

export default function CostsView() {
  const { t } = useTranslation();
  const { isAdmin, canViewAdminData, canEditModule, sessionToken } = useAuth();
  const canEditCosts = canEditModule('costs');
  const currentDateStr = useTodayKey();

  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0,0,0,0);
    return d;
  });

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [integrityReport, setIntegrityReport] = useState(null);
  const [showIntegrityModal, setShowIntegrityModal] = useState(false);
  const [highlightedDate, setHighlightedDate] = useState(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'entry' | 'performance'
  const [showRates, setShowRates] = useState(false);
  const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
  // progi wydajności (kg/rbh) — PER MIESIĄC (app_settings: performance_progi_<month>)
  const [progi, setProgi] = useState(() => loadProgiCache(`${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`));
  const updateProgi = useCallback(async (next) => {
    if (!canEditCosts) return;
    const mk = monthKey;
    setProgi(next);
    try { localStorage.setItem(progiLsKey(mk), JSON.stringify(next)); } catch { /* ignore */ }
    try {
      await upsertCostsPerformanceProgi(sessionToken, mk, next);
    } catch {
      toastError(t('costs.errSaveThresholds'));
    }
  }, [canEditCosts, monthKey, sessionToken, t]);

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
  const dirtyFields = useRef(new Map());
  const dirtySettings = useRef(false);
  const dirtySettingsMonthKey = useRef(null);
  const saveTimer = useRef(null);
  const fetchSequence = useRef(0);

  const fetchData = useCallback(async () => {
    if (!canViewAdminData) return;
    const sequence = ++fetchSequence.current;
    setLoading(true);
    setLoadError(null);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;

    try {
      const [monthData, monthRoster, report] = await Promise.all([
        getCostsMonth(sessionToken, monthKey),
        getMonthRoster(sessionToken, year, month),
        isAdmin ? getCostsIntegrityReport(sessionToken).catch(() => null) : Promise.resolve(null),
      ]);
      if (sequence !== fetchSequence.current) return;
      setIntegrityReport(report);
      const sets = monthData?.settings || null;
      const prevSet = monthData?.previous_settings || null;
      const costs = monthData?.daily_costs || [];
      const prevRows = monthData?.previous_daily_costs || [];
      const emps = monthRoster || [];
      const sched = monthData?.schedule_entries || [];
      const timeline = monthData?.timeline_entries || [];

    // Stawki: jeśli miesiąc nie ma własnych, dziedzicz z ostatniego ZAPISANEGO wcześniejszego miesiąca.
    // Domyślne z kodu tylko gdy nie ma żadnej historii.
    if (sets) {
      setSettings({ ...DEFAULT_SETTINGS, ...sets });
    } else {
      if (prevSet) {
        // odrzucamy id (i znacznik czasu), żeby zapis utworzył NOWY wiersz dla tego miesiąca, nie nadpisał poprzedni
        const rates = { ...prevSet };
        ['id', 'updated_at', 'elec_invoice_kwh', 'elec_invoice_net', 'gas_prod_invoice_kwh', 'gas_prod_invoice_net']
          .forEach(field => delete rates[field]);
        setSettings({
          ...rates,
          month_key: monthKey,
          elec_invoice_kwh: null,
          elec_invoice_net: null,
          gas_prod_invoice_kwh: null,
          gas_prod_invoice_net: null,
        });
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

    // employee_id → awaryjny koszyk wydajności dla starszych odpowiedzi RPC;
    // podstawowy koszyk wynika z grupy faktycznie malowanego stanowiska.
    // Dodatkowo zapisujemy domyślną godzinę startu.
    const empBucket = {};
    const empDefaultStart = {};
    (emps || []).forEach(e => {
      const g = (e.group_name || '').replace(/\s+/g, '').toUpperCase();
      empBucket[e.id] = g.startsWith('ZD1') ? 'ZD1' : g.startsWith('ZD2') ? 'ZD2' : g.includes('KIEROW') ? 'Kierowcy' : null;
      empDefaultStart[e.id] = parseHour(e.default_start);
    });

    // Początek i koniec zmiany per (pracownik, dzień) z grafiku. Oba są potrzebne,
    // żeby stare malowanie poza aktualną zmianą nie trafiało do podsumowań.
    // workingMap: czy dzień jest przepracowany wg grafiku (nieobecność UW/L4/... = false)
    const startMap = {};
    const endMap = {};
    const workingMap = {};
    (sched || []).forEach(s => {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(s.day).padStart(2, '0')}`;
      const key = `${s.employee_id}_${dateStr}`;
      const start = shiftStartHour(s.value, empDefaultStart[s.employee_id] ?? 0);
      const duration = scheduleDayHours(s.value);
      startMap[key] = start;
      endMap[key] = start + duration;
      workingMap[key] = duration > 0;
    });
    const startFor = (empId, dateStr) => startMap[`${empId}_${dateStr}`] ?? (empDefaultStart[empId] ?? 0);
    const endFor = (empId, dateStr) => endMap[`${empId}_${dateStr}`] ?? startFor(empId, dateStr);

    // Koszt pracownika: łączne godziny z Grafiku pracy per dzień (suma wszystkich osób)
    const labor = {};
    (sched || []).forEach(s => {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(s.day).padStart(2, '0')}`;
      labor[dateStr] = (labor[dateStr] || 0) + scheduleDayHours(s.value);
    });
    setLaborHours(labor);

    // Timeline stats (wydajność): godziny stanowiskowe z osi czasu, godzina z przerwą = 0.75.
    // Malowanie zakryte nieobecnością w grafiku (UW/L4/...) nie liczy się do wydajności.
    const tStats = buildTimelineStats(timeline, {
      workingMap,
      startFor,
      endFor,
      employeeBuckets: empBucket,
    });
    setTimelineStats(tStats);
    } catch (err) {
      if (sequence === fetchSequence.current) setLoadError(err?.message || String(err));
    } finally {
      if (sequence === fetchSequence.current) setLoading(false);
    }
  }, [currentDate, monthKey, canViewAdminData, isAdmin, sessionToken]);

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
        const now = new Date();
        const lastClosedMonth = y < now.getFullYear() ? 12 : y === now.getFullYear() ? now.getMonth() : 0;
        for (let mm = 1; mm <= Math.min(m - 1, lastClosedMonth); mm++) {
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
    if (!canEditCosts) return;
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const dirtySnapshot = [...dirtyFields.current].map(([dateStr, fields]) => [dateStr, [...fields]]);
    const setDirty = dirtySettings.current;
    const setKey = dirtySettingsMonthKey.current;
    if (!dirtySnapshot.length && !setDirty) return true;

    const patches = buildDailyCostPatches(dailyDataRef.current, dirtySnapshot);
    const hasInvalidMeter = patches.some(row => COST_METER_FIELDS.some(field => (
      field in row && row[field] != null && parseMeterReading(row[field]).status === 'invalid'
    )));
    if (hasInvalidMeter) {
      setAutoSave('idle');
      toastError(t('costs.errInvalidMeter'));
      return false;
    }
    const hasInvalidTonnage = patches.some(row => ['ton_zd1', 'ton_zd2', 'ton_pralki'].some(field => (
      field in row && row[field] != null && (!Number.isFinite(Number(row[field])) || Number(row[field]) < 0)
    )));
    if (hasInvalidTonnage) {
      setAutoSave('idle');
      toastError(t('costs.errInvalidTonnage'));
      return false;
    }
    const hasInvalidOtherCost = patches.some(row => (
      'other_costs' in row && row.other_costs != null && row.other_costs !== '' && parseDecimalInput(row.other_costs) == null
    ));
    if (hasInvalidOtherCost) {
      setAutoSave('idle');
      toastError(t('costs.errInvalidOtherCost'));
      return false;
    }
    if (setDirty && invalidCostSettingFields(settingsRef.current).length) {
      setAutoSave('idle');
      toastError(t('costs.errInvalidRates'));
      return false;
    }

    dirtySnapshot.forEach(([dateStr, fields]) => {
      const current = dirtyFields.current.get(dateStr);
      fields.forEach(field => current?.delete(field));
      if (current?.size === 0) dirtyFields.current.delete(dateStr);
    });
    dirtySettings.current = false;
    setAutoSave('saving');
    try {
      if (setDirty && setKey) {
        const savedSettings = await upsertCostSettings(sessionToken, {
          ...settingsRef.current,
          month_key: setKey,
          expected_updated_at: settingsRef.current.updated_at ?? null,
        });
        if (savedSettings?.updated_at) {
          setSettings(prev => ({ ...prev, updated_at: savedSettings.updated_at }));
        }
      }
      const rows = patches.map(normalizeDailyCostRow);
      if (rows.length) {
        const savedRows = await upsertDailyCosts(sessionToken, rows);
        if (Array.isArray(savedRows)) {
          setDailyData(prev => {
            const next = { ...prev };
            savedRows.forEach(row => {
              next[row.entry_date] = { ...next[row.entry_date], updated_at: row.updated_at };
            });
            return next;
          });
        }
      }
      setAutoSave('saved');
      setTimeout(() => setAutoSave(s => (s === 'saved' ? 'idle' : s)), 1500);
      return true;
    } catch (err) {
      // przywróć „brudne" wpisy, żeby ponowić zapis i pokaż błąd zamiast fałszywego „Zapisano"
      dirtySnapshot.forEach(([dateStr, fields]) => {
        const current = dirtyFields.current.get(dateStr) || new Set();
        fields.forEach(field => current.add(field));
        dirtyFields.current.set(dateStr, current);
      });
      if (setDirty) { dirtySettings.current = true; dirtySettingsMonthKey.current = setKey; }
      setAutoSave('idle');
      const concurrent = /CONCURRENT_MODIFICATION|zmienione przez innego/i.test(err?.message || '');
      toastError(t(concurrent ? 'costs.errConcurrentChange' : 'costs.errUnsavedChanges'));
      return false;
    }
  }, [canEditCosts, sessionToken, t]);

  const scheduleAutoSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { flushSave(); }, 700);
  }, [flushSave]);

  // Zapisz oczekujące zmiany przy zmianie miesiąca / odmontowaniu
  useEffect(() => () => { flushSave(); }, [monthKey, flushSave]);

  const handleCostChange = (dateStr, field, value) => {
    if (!canEditCosts) return;
    let parsed = value;
    if (value === '') {
      parsed = null;
    } else if (field.endsWith('_reset')) {
      parsed = Boolean(value);
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
    const fields = dirtyFields.current.get(dateStr) || new Set();
    fields.add(field);
    dirtyFields.current.set(dateStr, fields);
    scheduleAutoSave();
  };

  const handleSettingChange = (field, value) => {
    if (!canEditCosts) return;
    const num = parseDecimalInput(value);
    setSettings(prev => ({ ...prev, [field]: num }));
    dirtySettings.current = true;
    dirtySettingsMonthKey.current = monthKey;
    scheduleAutoSave();
  };

  const saveAll = async () => {
    if (!canEditCosts) return;
    setSaving(true);
    dirtySettings.current = true;
    dirtySettingsMonthKey.current = monthKey;
    const saved = await flushSave();
    setSaving(false);
    if (!saved) return;
    toastSuccess(t('admin.saved'));
  };

  const handleNavigateToIssue = useCallback((entryDate) => {
    if (!entryDate) return;
    const [y, m] = entryDate.split('-');
    const targetYear = parseInt(y, 10);
    const targetMonth = parseInt(m, 10);

    setCurrentDate(new Date(targetYear, targetMonth - 1, 1));
    setActiveTab('entry');
    setHighlightedDate(entryDate);
    setShowIntegrityModal(false);
  }, []);

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

  const meterBases = ['fiat', 'isuzu', 'merc', 'iveco', 'elec', 'gas_prod', 'gas_heat', 'water'];
  const meterSeries = Object.fromEntries(meterBases.map(base => [
    base,
    meterUsageSeries(
      days.map(day => getReading(day, base)),
      prevReadings?.[`${base}_end`],
      days.map(day => Boolean(dailyData[day]?.[`${base}_reset`])),
    ),
  ]));
  const consumptionAt = (idx, base) => meterSeries[base]?.[idx]?.usage || 0;
  const meterIssueAt = (idx, base) => meterSeries[base]?.[idx]?.status || 'missing';
  const gasProdUsageForMonth = meterSeries.gas_prod.reduce((sum, reading) => sum + (reading.usage || 0), 0);

  const calcDay = (dStr, idx, { includeFuture = false } = {}) => {
    const d = dailyData[dStr] || {};
    const suppressed = isFutureCalendarDate(dStr, currentDateStr) && !includeFuture;
    const fiat_km = suppressed ? 0 : consumptionAt(idx, 'fiat');
    const isuzu_km = suppressed ? 0 : consumptionAt(idx, 'isuzu');
    const merc_km = suppressed ? 0 : consumptionAt(idx, 'merc');
    const iveco_km = suppressed ? 0 : consumptionAt(idx, 'iveco');
    const total_km = fiat_km + isuzu_km + merc_km + iveco_km;

    const transportCost = suppressed ? 0 : ((fiat_km * settings.fiat_l_100km) + (isuzu_km * settings.isuzu_l_100km) + (merc_km * settings.merc_l_100km) + (iveco_km * settings.iveco_l_100km)) / 100 * settings.fuel_price;
    const elec_usage = suppressed ? 0 : consumptionAt(idx, 'elec') * settings.elec_multiplier;
    const elecMonthlyFees = electricityMonthlyFees(settings);
    const elec_cost = elec_usage * settings.elec_price_kwh + (suppressed ? 0 : (elecMonthlyFees / daysInMonth));
    const gas_prod_usage = suppressed ? 0 : consumptionAt(idx, 'gas_prod');
    const gas_prod_kwh = suppressed ? 0 : gasProductionKwh(gas_prod_usage, settings);
    const gas_prod_cost = suppressed
      ? 0
      : gasProductionDailyCost(gas_prod_usage, gasProdUsageForMonth, settings, daysInMonth);
    const gas_heat_usage = suppressed ? 0 : consumptionAt(idx, 'gas_heat');
    const gas_heat_cost = gas_heat_usage * settings.gas_heat_price_m3 + (suppressed ? 0 : (settings.gas_heat_fixed_monthly / daysInMonth));
    const water_usage = suppressed ? 0 : consumptionAt(idx, 'water');
    const water_cost = water_usage * settings.water_price_m3 + (suppressed ? 0 : (settings.water_fixed_monthly / daysInMonth));
    const hrs = laborHours[dStr] || 0; // łączne godziny z Grafiku pracy
    const worker_cost = suppressed ? 0 : hrs * settings.worker_hourly_rate;
    const other_cost = suppressed ? 0 : decimalValue(d.other_costs);
    const total_cost = transportCost + elec_cost + gas_prod_cost + gas_heat_cost + water_cost + worker_cost + other_cost;
    const ton = suppressed ? 0 : decimalValue(d.ton_zd1) + decimalValue(d.ton_zd2) + decimalValue(d.ton_pralki);
    const pln_kg = ton > 0 ? total_cost / ton : 0;
    const meterIssues = Object.fromEntries(meterBases.map(base => [base, meterIssueAt(idx, base)]));

    return { fiat_km, isuzu_km, merc_km, iveco_km, total_km, elec_usage, gas_prod_usage, gas_prod_kwh, gas_heat_usage, water_usage, transportCost, elec_cost, gas_prod_cost, gas_heat_cost, water_cost, worker_cost, total_cost, other_cost, ton, pln_kg, meterIssues };
  };

  // Monthly totals
  const calculateTotals = (includeFuture) => days.reduce((acc, dStr, idx) => {
    const c = calcDay(dStr, idx, { includeFuture });
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
    acc.kWh += c.elec_usage; acc.m3GasProd += c.gas_prod_usage; acc.kWhGasProd += c.gas_prod_kwh; acc.m3GasHeat += c.gas_heat_usage; acc.m3Water += c.water_usage;
    return acc;
  }, { transport: 0, elec: 0, gasProd: 0, gasHeat: 0, gas: 0, water: 0, workers: 0, other: 0, total: 0,
       kmFiat: 0, kmIsuzu: 0, kmMerc: 0, kmIveco: 0, kWh: 0, m3GasProd: 0, kWhGasProd: 0, m3GasHeat: 0, m3Water: 0 });
  const monthlyTotals = calculateTotals(false);
  const forecastTotals = calculateTotals(true);
  const elecReconciliation = electricityReconciliation(settings, forecastTotals.kWh, forecastTotals.elec);
  const gasProdReconciliation = gasProductionReconciliation(settings, forecastTotals.m3GasProd, forecastTotals.gasProd, daysInMonth);
  const plannedCosts = Math.max(0, forecastTotals.total - monthlyTotals.total);

  // Performance totals
  const perfTotals = days.reduce((acc, dStr) => {
    if (isFutureCalendarDate(dStr, currentDateStr)) return acc;
    const dt = dailyData[dStr] || {};
    const dayTimeline = timelineStats[dStr] || {};
    const kgZd1 = decimalValue(dt.ton_zd1);
    const kgZd2 = decimalValue(dt.ton_zd2);
    const kgPralki = decimalValue(dt.ton_pralki);
    const metrics = dailyPerformanceMetrics({ kgZd1, kgZd2, kgWashers: kgPralki, timelineDay: dayTimeline });
    acc.zd1 += kgZd1;
    acc.zd2 += kgZd2;
    acc.pralki += kgPralki;
    acc.kg += metrics.totalKg;
    acc.hZd1 += metrics.zd1LaborHours;
    acc.hZd2 += metrics.zd2LaborHours;
    acc.hKier += metrics.driverLaborHours;
    acc.h += metrics.totalLaborHours;
    acc.productionClockHours += metrics.productionClockHourCount;
    if (metrics.productionClockHourCount > 0) acc.kgWithProductionClockData += metrics.totalKg;
    return acc;
  }, { zd1: 0, zd2: 0, pralki: 0, kg: 0, hZd1: 0, hZd2: 0, hKier: 0, h: 0, productionClockHours: 0, kgWithProductionClockData: 0 });
  // Fix floating-point accumulation artifacts (e.g. 2384.6000000000004 → 2384.6)
  perfTotals.zd1 = +perfTotals.zd1.toFixed(10);
  perfTotals.zd2 = +perfTotals.zd2.toFixed(10);
  perfTotals.pralki = +perfTotals.pralki.toFixed(10);
  perfTotals.kg = +perfTotals.kg.toFixed(10);

  const plnPerKg = perfTotals.kg > 0 ? monthlyTotals.total / perfTotals.kg : 0;
  const accruedDays = countAccruedDays(days, currentDateStr);
  const avgPerDay = accruedDays > 0 ? monthlyTotals.total / accruedDays : 0;
  const meaningfulMeterIssues = (integrityReport?.meter_issues || []).filter(issue => {
    const raw = String(issue?.raw ?? '').trim();
    return raw !== '' && raw !== '-' && raw !== '—';
  });
  const meaningfulMeterIssueCount = meaningfulMeterIssues.length;
  const courseIssues = integrityReport?.course_issues || [];
  const courseIssueCount = integrityReport?.course_issue_count || courseIssues.length;

  const outsideMonthKeys = Array.from(new Set([
    ...courseIssues.map(ci => ci.entry_date?.slice(0, 7)),
    ...meaningfulMeterIssues.map(mi => mi.entry_date?.slice(0, 7)),
  ])).filter(mk => mk && mk !== monthKey);

  const outsideMonthsSummary = outsideMonthKeys.length > 0
    ? outsideMonthKeys.map(mk => {
        const [y, m] = mk.split('-');
        const monthIdx = parseInt(m, 10) - 1;
        const name = monthNames[monthIdx] || mk;
        return `${name} ${y}`;
      }).join(', ')
    : '';

  // Bieżący miesiąc jako punkt historii (z policzonych totali → spójny z KPI) + miesiące wstecz
  const currentPoint = {
    mk: monthKey, year, month, dayCount: accruedDays,
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
  const offFlags = days.map(dStr => isDayOff(dStr) || isFutureCalendarDate(dStr, currentDateStr));
  const workVals = dailyTotals.filter((_, i) => !offFlags[i]);
  const trendAvg = workVals.length ? workVals.reduce((s, v) => s + v, 0) / workVals.length : 0;

  // Eksport do Excela (analogicznie do Grafiku) — arkusz Koszty + arkusz Wydajność
  const exportToExcel = async () => {
    if (invalidCostSettingFields(settings).length) {
      toastError(t('costs.errInvalidRates'));
      return;
    }
    const r2 = (n) => Number.isFinite(n) ? Math.round(n * 100) / 100 : '';
    const dayLabel = (dStr) => { const d = new Date(dStr); return `${String(d.getDate()).padStart(2, '0')}.${String(month).padStart(2, '0')} ${weekdays[d.getDay()]}`; };

    // Arkusz 1: Koszty
    const costsHead = t('costs.exportCostsHead', { returnObjects: true });
    const costsRows = days.map((dStr, idx) => {
      const c = calcDay(dStr, idx, { includeFuture: true });
      return [dayLabel(dStr), r2(c.fiat_km), r2(c.isuzu_km), r2(c.merc_km), r2(c.iveco_km), r2(c.transportCost),
        r2(c.elec_usage), r2(c.elec_cost), r2(c.gas_prod_usage), r2(c.gas_prod_cost), r2(c.gas_heat_usage), r2(c.gas_heat_cost),
        r2(c.water_usage), r2(c.water_cost), r2(c.worker_cost), r2(c.other_cost), r2(c.total_cost), c.pln_kg > 0 ? r2(c.pln_kg) : ''];
    });
    const totalsForExport = forecastTotals;
    const costsTotal = [t('costs.total'), r2(totalsForExport.kmFiat), r2(totalsForExport.kmIsuzu), r2(totalsForExport.kmMerc), r2(totalsForExport.kmIveco), r2(totalsForExport.transport), r2(totalsForExport.kWh), r2(totalsForExport.elec),
      r2(totalsForExport.m3GasProd), r2(totalsForExport.gasProd), r2(totalsForExport.m3GasHeat), r2(totalsForExport.gasHeat), r2(totalsForExport.m3Water), r2(totalsForExport.water), r2(totalsForExport.workers), r2(totalsForExport.other), r2(totalsForExport.total), perfTotals.kg > 0 ? r2(totalsForExport.total / perfTotals.kg) : ''];
    const costsData = [[t('costs.exportCostsTitle', { month: months[month - 1], year })], [], costsHead, ...costsRows, [], costsTotal];

    // Arkusz 2: Wydajność
    const perfHead = t('costs.exportPerformanceHead', { returnObjects: true });
    const perfRows = days.map((dStr) => {
      const dt = dailyData[dStr] || {};
      const dayTimeline = timelineStats[dStr] || {};
      const kgZd1 = decimalValue(dt.ton_zd1);
      const kgZd2 = decimalValue(dt.ton_zd2);
      const kgPralki = decimalValue(dt.ton_pralki);
      const metrics = dailyPerformanceMetrics({ kgZd1, kgZd2, kgWashers: kgPralki, timelineDay: dayTimeline });
      return [dayLabel(dStr), kgZd1 || '', kgZd2 || '', kgPralki || '', metrics.totalKg || '',
        metrics.productionClockHourCount || '', metrics.plantThroughputKgPerHour ? r2(metrics.plantThroughputKgPerHour) : '',
        metrics.zd1LaborHours ? r2(metrics.zd1LaborHours) : '', metrics.zd2LaborHours ? r2(metrics.zd2LaborHours) : '',
        metrics.driverLaborHours ? r2(metrics.driverLaborHours) : '', metrics.totalLaborHours ? r2(metrics.totalLaborHours) : '',
        metrics.zd1KgPerLaborHour ? r2(metrics.zd1KgPerLaborHour) : '',
        metrics.zd2WashersKgPerLaborHour ? r2(metrics.zd2WashersKgPerLaborHour) : '',
        metrics.overallKgPerLaborHour ? r2(metrics.overallKgPerLaborHour) : ''];
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
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px',
        background: IOS_THEME.cardBg, padding: '14px 20px', borderRadius: IOS_THEME.radius,
        boxShadow: IOS_THEME.shadow, border: `1px solid ${IOS_THEME.border}`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {(() => { const atMin = year === 2026 && month === 1; return (
            <button
              disabled={atMin}
              onClick={() => { if (!atMin) setCurrentDate(new Date(year, month - 2, 1)); }}
              style={{
                width: '32px', height: '32px', borderRadius: '10px',
                background: atMin ? 'transparent' : 'rgba(0,0,0,0.04)',
                border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: atMin ? 'not-allowed' : 'pointer', opacity: atMin ? 0.3 : 1,
                color: IOS_THEME.textPrimary, transition: 'all 0.15s ease'
              }}
              title="Poprzedni miesiąc"
            >
              <ChevronLeft size={18} />
            </button>
          ); })()}
          <div style={{ fontWeight: 700, fontSize: '16px', minWidth: '140px', textAlign: 'center', color: IOS_THEME.textPrimary, letterSpacing: '-0.01em' }}>
            {months[month - 1]} {year}
          </div>
          <button
            onClick={() => setCurrentDate(new Date(year, month, 1))}
            style={{
              width: '32px', height: '32px', borderRadius: '10px',
              background: 'rgba(0,0,0,0.04)',
              border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: IOS_THEME.textPrimary, transition: 'all 0.15s ease'
            }}
            title="Następny miesiąc"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="costs-view-tabs" role="tablist" aria-label={t('pages.costs.title')}>
          {[['overview', t('costs.tabOverview')], ['entry', t('costs.tabEntry')], ['performance', t('costs.tabPerformance')]].map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              className={`costs-view-tab ${activeTab === key ? 'active' : ''}`}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={exportToExcel}
            title={t('costs.exportExcel')}
            style={{
              ...navBtnStyle,
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            <Download size={15} color={IOS_THEME.textSecondary} /> Excel
          </button>
          <button
            onClick={() => setShowRates(v => !v)}
            title={t('costs.rates')}
            style={{
              ...navBtnStyle,
              display: 'flex', alignItems: 'center', gap: '6px',
              color: showRates ? IOS_THEME.accent : IOS_THEME.textPrimary,
              background: showRates ? 'rgba(0, 113, 227, 0.08)' : '#FFFFFF',
              border: showRates ? '1px solid rgba(0, 113, 227, 0.25)' : `1px solid ${IOS_THEME.border}`,
            }}
          >
            <Settings size={15} color={showRates ? IOS_THEME.accent : IOS_THEME.textSecondary} /> {t('costs.rates')}
          </button>
          {canEditCosts && <button onClick={saveAll} disabled={saving} className="costs-save-btn" title={t('costs.saveAllNow')} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: autoSave === 'saved' ? IOS_THEME.success : autoSave === 'saving' ? IOS_THEME.warning : IOS_THEME.accent,
            color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '10px', fontWeight: 600, fontSize: '13px',
            letterSpacing: '-0.01em', boxShadow: '0 2px 8px rgba(0, 113, 227, 0.22)',
            cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1, transition: 'all 0.2s ease'
          }}>
            <Save size={15} /> {saving ? t('costs.saving') : autoSave === 'saving' ? t('costs.autoSaving') : autoSave === 'saved' ? t('costs.savedCheck') : t('common.save')}
          </button>}
        </div>
      </div>

      {/* RATES PANEL */}
      {showRates && <RatesPanel settings={settings} onChange={handleSettingChange} readOnly={!canEditCosts} />}

      {isAdmin && integrityReport && (meaningfulMeterIssueCount + courseIssueCount > 0) && (
        <div role="alert" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px',
          background: IOS_THEME.warningBg, border: '1px solid rgba(255, 149, 0, 0.22)',
          borderRadius: '14px', padding: '12px 18px', color: IOS_THEME.warningText, fontSize: '13px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(255, 149, 0, 0.18)', color: IOS_THEME.warningText, flexShrink: 0 }}>
              <ShieldAlert size={18} />
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontWeight: 600, lineHeight: 1.4 }}>
                {t('costs.integrityWarning', { meter: meaningfulMeterIssueCount, course: courseIssueCount })}
              </span>
              {outsideMonthsSummary && (
                <span style={{ fontSize: '12px', opacity: 0.9, fontWeight: 500 }}>
                  Wykryto rozbieżności poza bieżącym miesiącem: <b>{outsideMonthsSummary}</b>
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowIntegrityModal(true)}
            style={{
              background: 'rgba(255, 149, 0, 0.16)', border: 'none', borderRadius: '8px',
              padding: '7px 16px', fontSize: '12.5px', fontWeight: 700, color: IOS_THEME.warningText,
              cursor: 'pointer', transition: 'background 0.15s ease'
            }}
          >
            Pokaż szczegóły i przejdź ›
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ ...cardStyle, padding: '60px', textAlign: 'center', color: IOS_THEME.textSecondary, fontSize: '15px' }}>{t('costs.loadingFinancialData')}</div>
      ) : loadError ? (
        <div style={{ ...cardStyle, padding: '32px' }}><DataError error={loadError} onRetry={fetchData} /></div>
      ) : (
        <>
          {activeTab === 'overview' && (
            <OverviewTab
              totals={monthlyTotals}
              forecastTotal={forecastTotals.total}
              plannedCosts={plannedCosts}
              plnPerKg={plnPerKg}
              ton={perfTotals.kg}
              perfTotals={perfTotals}
              avgPerDay={avgPerDay}
              dailyTotals={dailyTotals}
              trendAvg={trendAvg}
              days={days}
              offFlags={offFlags}
              carBreakdown={carBreakdown}
              monthsHistory={monthsHistory}
              elecReconciliation={elecReconciliation}
              gasProdReconciliation={gasProdReconciliation}
              currentDateStr={currentDateStr}
              settings={settings}
            />
          )}

          {activeTab === 'entry' && (
            <EntryGrid
              days={days}
              weekdays={weekdays}
              dailyData={dailyData}
              calcDay={calcDay}
              totals={forecastTotals}
              onChange={handleCostChange}
              readOnly={!canEditCosts}
              laborHours={laborHours}
              todayKey={currentDateStr}
              highlightedDate={highlightedDate}
              courseIssues={courseIssues}
            />
          )}

          {activeTab === 'performance' && (
            <PerformanceGrid days={days} weekdays={weekdays} dailyData={dailyData} timelineStats={timelineStats} totals={perfTotals} onChange={handleCostChange} progi={progi} onProgiChange={updateProgi} readOnly={!canEditCosts} todayKey={currentDateStr} />
          )}
        </>
      )}

      {showIntegrityModal && (
        <IntegrityReportModal
          isOpen={showIntegrityModal}
          onClose={() => setShowIntegrityModal(false)}
          courseIssues={courseIssues}
          meterIssues={meaningfulMeterIssues}
          onNavigateToIssue={handleNavigateToIssue}
        />
      )}
    </div>
  );
}

/* ───────────── OVERVIEW (dashboard) ───────────── */
function OverviewTab({
  totals,
  forecastTotal,
  plannedCosts,
  plnPerKg,
  ton,
  perfTotals,
  avgPerDay,
  dailyTotals,
  trendAvg,
  days,
  offFlags = [],
  carBreakdown = [],
  monthsHistory = [],
  elecReconciliation,
  gasProdReconciliation,
  currentDateStr,
  settings,
}) {
  const { t } = useTranslation();
  const cats = [
    { name: t('costs.transport'), color: CAT.transport, value: totals.transport, icon: <Truck size={15}/> },
    { name: t('costs.energy'), color: CAT.elec, value: totals.elec, icon: <Zap size={15}/> },
    { name: t('costs.gas'), color: CAT.gas, value: totals.gas, icon: <Flame size={15}/> },
    { name: t('costs.water'), color: CAT.water, value: totals.water, icon: <Droplet size={15}/> },
    { name: t('costs.employees'), color: CAT.workers, value: totals.workers, icon: <Users size={15}/> },
    { name: t('costs.other'), color: CAT.other, value: totals.other, icon: <Sigma size={15}/> },
  ].sort((a, b) => b.value - a.value);
  const sum = totals.total || 1;

  // Porównanie miesiąc-do-miesiąca (MoM) + rzetelna analityka LfL (Like-for-Like)
  const H = monthsHistory;
  const cur = H[H.length - 1] || null;
  const prev = H.length > 1 ? H[H.length - 2] : null;

  const dIM = (p) => p.dayCount || new Date(p.year, p.month, 0).getDate();
  const daysInMonth = days.length;
  const accruedDays = countAccruedDays(days, currentDateStr);
  const now = new Date();
  const isCurrentMonth = cur && cur.year === now.getFullYear() && cur.month === (now.getMonth() + 1);
  const isOngoing = isCurrentMonth && accruedDays < daysInMonth;

  const momPct = (c, p) => (p != null && p > 0 && c > 0) ? ((c - p) / p) * 100 : null;

  // Koszt całkowity
  const prevDailyCost = prev && dIM(prev) > 0 ? prev.total / dIM(prev) : 0;
  const curDailyCost = accruedDays > 0 ? totals.total / accruedDays : 0;
  const dDailyCost = prevDailyCost > 0 ? ((curDailyCost - prevDailyCost) / prevDailyCost) * 100 : null;
  const dTotal = (prev && prev.total > 0) ? ((cur.total - prev.total) / prev.total) * 100 : null;

  // Koszt na kg (plnPerKg)
  const dPpk = momPct(cur?.plnPerKg, prev?.plnPerKg);

  // Tonaż: w trakcie miesiąca porównujemy Like-for-Like średnią dzienną (zapobiega fałszywemu -73%!)
  const prevDailyKg = prev && dIM(prev) > 0 ? prev.kg / dIM(prev) : 0;
  const curDailyKg = accruedDays > 0 ? ton / accruedDays : 0;
  const dKgDaily = prevDailyKg > 0 ? ((curDailyKg - prevDailyKg) / prevDailyKg) * 100 : null;
  const dKg = isOngoing ? dKgDaily : momPct(cur?.kg, prev?.kg);

  // Średnio na dzień
  const dAvg = (prev && prev.total > 0 && prevDailyCost > 0)
    ? ((curDailyCost - prevDailyCost) / prevDailyCost) * 100
    : null;

  // Prognoza run-rate na cały miesiąc (oparta na tempie dziennym)
  const projectedMonthRunRate = accruedDays > 0 ? (totals.total / accruedDays) * daysInMonth : forecastTotal;
  const prevMonthTotal = prev?.total || 0;
  const dRunRate = prevMonthTotal > 0 ? ((projectedMonthRunRate - prevMonthTotal) / prevMonthTotal) * 100 : null;
  const dForecast = (prev && prev.total > 0)
    ? ((forecastTotal - prev.total) / prev.total) * 100
    : null;

  const sTotal = H.map(p => p.total);
  const sPpk = H.map(p => p.plnPerKg);
  const sKg = H.map(p => p.kg);
  const sAvg = H.map(p => p.total / dIM(p));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* KPI GRID — 6 zbalansowanych kart w stylu Apple */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '16px' }}>
        <KpiCard
          label={t('costs.kpiCostsToDate')}
          value={FMT(totals.total)}
          unit={t('costs.currency')}
          icon={<Sigma size={20}/>}
          color={IOS_THEME.accent}
          hero
          badge={isOngoing ? `Dzień ${accruedDays}/${daysInMonth}` : null}
          delta={isOngoing ? dDailyCost : dTotal}
          deltaLabel={isOngoing ? '/ dzień' : 'm/m'}
          deltaTitle={isOngoing ? `Średnia dzienna Like-for-Like vs ub. m-c: ${FMT(curDailyCost)} zł vs ${FMT(prevDailyCost)} zł` : undefined}
          goodWhenDown
          spark={sTotal}
        />
        <KpiCard
          label={t('costs.kpiPlannedCosts')}
          value={FMT(plannedCosts)}
          unit={t('costs.currency')}
          icon={<CalendarDays size={20}/>}
          color={IOS_THEME.warning}
          subtitle={isOngoing ? `pozostało na ${Math.max(0, daysInMonth - accruedDays)} dni` : 'koniec miesiąca'}
        />
        <KpiCard
          label={t('costs.kpiMonthForecast')}
          value={FMT(forecastTotal)}
          unit={t('costs.currency')}
          icon={<TrendingUp size={20}/>}
          color={CAT.gas}
          delta={isOngoing ? dRunRate : dForecast}
          deltaLabel="vs ub. m-c"
          subtitle={isOngoing ? `Wprowadzone ${FMT0(totals.total)} zł + plan ${FMT0(plannedCosts)} zł` : undefined}
          goodWhenDown
        />
        <KpiCard
          label={t('costs.kpiCostPerKg')}
          value={plnPerKg > 0 ? FMT3(plnPerKg) : '—'}
          unit={t('costs.currencyPerKg')}
          icon={<Scale size={20}/>}
          color={CAT.transport}
          delta={dPpk}
          deltaLabel="m/m"
          goodWhenDown
          spark={sPpk}
        />
        <KpiCard
          label={t('costs.kpiTonnage')}
          value={ton > 0 ? FMT0(ton) : '—'}
          unit="kg"
          icon={<Package size={20}/>}
          color={CAT.workers}
          delta={dKg}
          deltaLabel={isOngoing ? '/ dzień' : 'm/m'}
          deltaTitle={isOngoing ? `Średnia dzienna tonażu vs ub. m-c: ${FMT0(curDailyKg)} kg vs ${FMT0(prevDailyKg)} kg` : undefined}
          goodWhenDown={false}
          spark={sKg}
        />
        <KpiCard
          label={t('costs.kpiAvgPerDay')}
          value={FMT(avgPerDay)}
          unit={t('costs.currency')}
          icon={<CalendarDays size={20}/>}
          color={CAT.water}
          delta={dAvg}
          deltaLabel="m/m"
          goodWhenDown
          spark={sAvg}
        />
      </div>

      {(elecReconciliation?.hasInvoiceKwh || elecReconciliation?.hasInvoiceNet) && (
        <ElectricityReconciliationCard reconciliation={elecReconciliation} />
      )}

      {(gasProdReconciliation?.hasInvoiceKwh || gasProdReconciliation?.hasInvoiceNet) && (
        <GasProductionReconciliationCard reconciliation={gasProdReconciliation} />
      )}

      {/* zł/kg ROZBITE NA DRIVERY + MOST MoM */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px', alignItems: 'stretch' }}>
        <DriversCard cur={cur} perfTotals={perfTotals} settings={settings} />
        <WaterfallCard cur={cur} prev={prev} />
      </div>

      {/* TREND WIELOMIESIĘCZNY zł/kg + cel */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
          <div style={cardTitleStyle}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '8px', background: tint(IOS_THEME.accent, 0.12), color: IOS_THEME.accent }}>
              <BarChart3 size={16}/>
            </span>
            <span>{t('costs.plnPerKgOverTime', { year: cur?.year || '' })}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px', color: IOS_THEME.textSecondary, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#D97706', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ display: 'inline-block', width: '12px', height: '0', borderTop: '2px dashed #F59E0B' }} />
              <span>Cel: {FMT3(settings?.target_cost_per_kg && Number(settings.target_cost_per_kg) > 0 ? Number(settings.target_cost_per_kg) : (H.map(p => p.plnPerKg).filter(v => v > 0).length ? H.map(p => p.plnPerKg).filter(v => v > 0).reduce((a, b) => a + b, 0) / H.map(p => p.plnPerKg).filter(v => v > 0).length : 0))} zł/kg</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: IOS_THEME.success }} />
              <span>Poniżej celu</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: IOS_THEME.warning }} />
              <span>Powyżej celu</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: IOS_THEME.accent }} />
              <span>Bieżący</span>
            </span>
          </div>
        </div>
        <MultiMonthTrend months={H} targetCostPerKg={settings?.target_cost_per_kg} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {/* STRUKTURA KOSZTÓW */}
        <div style={cardStyle}>
          <div style={cardTitleStyle}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '8px', background: tint(CAT.workers, 0.12), color: CAT.workers }}>
              <Sigma size={16}/>
            </span>
            <span>{t('costs.costStructure')}</span>
          </div>
          {/* stacked bar */}
          <div style={{ display: 'flex', height: '10px', borderRadius: '5px', overflow: 'hidden', margin: '4px 0 18px', background: 'rgba(0,0,0,0.04)' }}>
            {cats.filter(c => c.value > 0).map(c => (
              <div key={c.name} title={`${c.name}: ${FMT(c.value)} ${t('costs.currency')}`} style={{ width: `${(c.value / sum) * 100}%`, background: c.color }} />
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {cats.map(c => {
              const pct = (c.value / sum) * 100;
              return (
                <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '8px', background: tint(c.color, 0.12), color: c.color, flexShrink: 0 }}>
                    {c.icon}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600, color: IOS_THEME.textPrimary }}>{c.name}</span>
                      <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: IOS_THEME.textPrimary }}>
                        {FMT(c.value)} <span style={{ color: IOS_THEME.textSecondary, fontWeight: 500 }}>{t('costs.currency')} · {pct.toFixed(1)}%</span>
                      </span>
                    </div>
                    <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(0,0,0,0.04)', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: c.color, borderRadius: '3px', transition: 'width 0.4s ease' }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* KOSZT AUT — km per auto → kwota */}
        <div style={cardStyle}>
          <div style={cardTitleStyle}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '8px', background: tint(CAT.transport, 0.12), color: CAT.transport }}>
              <Truck size={16}/>
            </span>
            <span>{t('costs.carCostKm')}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '12px', fontSize: '11px', fontWeight: 700, color: IOS_THEME.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 4px 10px' }}>
              <span>{t('costs.car')}</span>
              <span style={{ textAlign: 'right' }}>{t('costs.sumKm')}</span>
              <span style={{ textAlign: 'right', minWidth: '90px' }}>{t('costs.amount')}</span>
            </div>
            {carBreakdown.map((car, i) => (
              <div key={car.name} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '12px', alignItems: 'center', padding: '10px 4px', borderTop: i === 0 ? 'none' : `1px solid ${IOS_THEME.border}`, fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', color: IOS_THEME.textPrimary }}>
                  <span style={{ display: 'flex', width: '26px', height: '26px', borderRadius: '7px', background: tint(CAT.transport, 0.12), color: CAT.transport, alignItems: 'center', justifyContent: 'center' }}>
                    <Truck size={13}/>
                  </span>
                  {car.name}
                </span>
                <span style={{ textAlign: 'right', fontSize: '13.5px', fontWeight: 600, color: IOS_THEME.textSecondary }}>
                  {car.km > 0 ? `${FMT0(car.km)} km` : '—'}
                </span>
                <span style={{ textAlign: 'right', minWidth: '90px', fontSize: '14px', fontWeight: 700, color: IOS_THEME.textPrimary }}>
                  {car.cost > 0 ? `${FMT(car.cost)} ${t('costs.currency')}` : '—'}
                </span>
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '12px', alignItems: 'center', padding: '12px 4px 2px', borderTop: `2px solid ${IOS_THEME.border}`, fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: IOS_THEME.textPrimary }}>{t('costs.total')}</span>
              <span style={{ textAlign: 'right', fontSize: '14px', fontWeight: 700, color: IOS_THEME.textSecondary }}>
                {FMT0(carBreakdown.reduce((s, c) => s + c.km, 0))} km
              </span>
              <span style={{ textAlign: 'right', minWidth: '90px', fontSize: '15px', fontWeight: 800, color: IOS_THEME.accent }}>
                {FMT(carBreakdown.reduce((s, c) => s + c.cost, 0))} {t('costs.currency')}
              </span>
            </div>
          </div>
        </div>

        {/* DAILY TREND */}
        <div style={cardStyle}>
          <div style={cardTitleStyle}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '8px', background: tint(CAT.water, 0.12), color: CAT.water }}>
              <CalendarDays size={16}/>
            </span>
            <span>{t('costs.dailyCost')}</span>
          </div>
          <div style={{ fontSize: '12px', color: IOS_THEME.textSecondary, marginBottom: '12px' }}>{t('costs.dailyCostHint')}</div>
          <TrendChart data={dailyTotals} days={days} avg={trendAvg} offFlags={offFlags} />
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, unit, icon, color, hero, delta, deltaLabel, deltaTitle, goodWhenDown, spark, subtitle, badge }) {
  const { t } = useTranslation();
  const hasDelta = delta != null && isFinite(delta);
  const good = hasDelta && (goodWhenDown ? delta <= 0 : delta >= 0);
  const up = hasDelta && delta >= 0;
  const deltaColor = !hasDelta ? IOS_THEME.textSecondary : good ? IOS_THEME.successText : IOS_THEME.dangerText;
  const deltaBg = !hasDelta ? 'rgba(0,0,0,0.04)' : good ? IOS_THEME.successBg : IOS_THEME.dangerBg;

  return (
    <div style={{
      background: IOS_THEME.cardBg,
      padding: '20px',
      borderRadius: IOS_THEME.radius,
      boxShadow: hero ? '0 2px 8px rgba(0, 113, 227, 0.06), 0 12px 28px rgba(0, 113, 227, 0.08)' : IOS_THEME.shadow,
      border: hero ? '1px solid rgba(0, 113, 227, 0.28)' : `1px solid ${IOS_THEME.border}`,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      gap: '12px',
      position: 'relative',
      overflow: 'hidden',
      transition: 'transform 0.18s ease, box-shadow 0.18s ease'
    }}>
      {hero && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
          background: 'linear-gradient(90deg, #0071E3 0%, #34C759 100%)'
        }} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
          <span style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '34px', height: '34px', borderRadius: '10px',
            background: tint(color, 0.10), color: color, flexShrink: 0
          }}>
            {icon}
          </span>
          <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: IOS_THEME.textSecondary, whiteSpace: 'nowrap' }}>
            {label}
          </span>
        </div>
        {badge && (
          <span style={{
            fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '999px',
            background: 'rgba(0, 113, 227, 0.08)', color: IOS_THEME.accent, letterSpacing: '0.02em',
            whiteSpace: 'nowrap', flexShrink: 0
          }}>
            {badge}
          </span>
        )}
      </div>

      <div style={{ fontSize: '27px', fontWeight: 700, color: IOS_THEME.textPrimary, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
        {value} <span style={{ fontSize: '13px', fontWeight: 500, color: IOS_THEME.textTertiary, letterSpacing: 'normal' }}>{unit}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', minHeight: '24px' }}>
        {hasDelta ? (
          <span
            title={deltaTitle || undefined}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
              padding: '2.5px 7px', borderRadius: '999px', color: deltaColor, background: deltaBg,
              whiteSpace: 'nowrap', flexShrink: 0
            }}
          >
            {up ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}% <span style={{ fontWeight: 600, opacity: 0.85 }}>{deltaLabel || t('costs.monthOverMonthShort')}</span>
          </span>
        ) : subtitle ? (
          <span style={{ fontSize: '11.5px', fontWeight: 600, color: IOS_THEME.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {subtitle}
          </span>
        ) : (
          <span style={{ fontSize: '11px', fontWeight: 500, color: IOS_THEME.textTertiary, whiteSpace: 'nowrap' }}>{t('costs.noComparison')}</span>
        )}
        {spark && spark.some(v => v > 0) && <Sparkline data={spark} color={color} />}
      </div>
    </div>
  );
}

// Mini-wykres ostatnich ~6 miesięcy ze zmiękczonym gradientem Apple
function Sparkline({ data, color }) {
  const pts = data.slice(-6);
  const W = 72, Hh = 24;
  const max = Math.max(...pts, 1), min = Math.min(...pts, 0);
  const rng = (max - min) || 1;
  const x = (i) => pts.length <= 1 ? W : (i / (pts.length - 1)) * W;
  const y = (v) => (Hh - 4) - ((v - min) / rng) * (Hh - 8);
  const linePath = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${x(pts.length - 1).toFixed(1)} ${Hh} L${x(0).toFixed(1)} ${Hh} Z`;
  const gradId = useId();
  const last = pts.length - 1;

  return (
    <svg width={W} height={Hh} style={{ flexShrink: 0, overflow: 'visible' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {pts[last] > 0 && (
        <>
          <circle cx={x(last)} cy={y(pts[last])} r="4" fill={color} opacity="0.25" />
          <circle cx={x(last)} cy={y(pts[last])} r="2.2" fill={color} />
        </>
      )}
    </svg>
  );
}

// zł/kg rozbite na drivery (bieżący miesiąc) + operacyjny insight o wydajności pracy
function DriversCard({ cur, perfTotals, settings }) {
  const { t } = useTranslation();
  const kg = cur?.kg || 0;
  const totalPerKg = kg > 0 ? cur.total / kg : 0;
  const overallKgPerH = (perfTotals?.h > 0 && perfTotals?.kg > 0) ? perfTotals.kg / perfTotals.h : 0;
  const drivers = [
    { name: t('costs.employees'), color: CAT.workers, v: cur?.workers || 0, icon: <Users size={14}/> },
    { name: t('costs.gas'), color: CAT.gas, v: cur?.gas || 0, icon: <Flame size={14}/> },
    { name: t('costs.energy'), color: CAT.elec, v: cur?.elec || 0, icon: <Zap size={14}/> },
    { name: t('costs.transport'), color: CAT.transport, v: cur?.transport || 0, icon: <Truck size={14}/> },
    { name: t('costs.water'), color: CAT.water, v: cur?.water || 0, icon: <Droplet size={14}/> },
    { name: t('costs.other'), color: CAT.other, v: cur?.other || 0, icon: <Sigma size={14}/> },
  ].map(d => ({ ...d, perKg: kg > 0 ? d.v / kg : 0 })).sort((a, b) => b.perKg - a.perKg);

  return (
    <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={cardTitleStyle}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '8px', background: tint(CAT.workers, 0.12), color: CAT.workers }}>
              <Scale size={16}/>
            </span>
            <span>{t('costs.costPerKgDrivers')}</span>
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'baseline', gap: '4px',
            background: 'rgba(0, 113, 227, 0.08)', padding: '5px 12px', borderRadius: '10px'
          }}>
            <span style={{ fontSize: '20px', fontWeight: 800, color: IOS_THEME.accent, fontVariantNumeric: 'tabular-nums' }}>
              {totalPerKg > 0 ? FMT3(totalPerKg) : '—'}
            </span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: IOS_THEME.textSecondary }}>{t('costs.currencyPerKg')}</span>
          </div>
        </div>

        {kg <= 0 ? (
          <div style={{ padding: '36px 0', textAlign: 'center', fontSize: '13px', color: IOS_THEME.textSecondary }}>{t('costs.noTonnageCostPerKg')}</div>
        ) : (
          <>
            <div style={{ display: 'flex', height: '10px', borderRadius: '6px', overflow: 'hidden', margin: '0 0 16px', background: 'rgba(0,0,0,0.04)' }}>
              {drivers.filter(d => d.perKg > 0).map(d => (
                <div key={d.name} title={`${d.name}: ${FMT3(d.perKg)} ${t('costs.currencyPerKg')}`} style={{ width: `${(d.perKg / totalPerKg) * 100}%`, background: d.color }} />
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {drivers.map(d => {
                const pct = totalPerKg > 0 ? (d.perKg / totalPerKg) * 100 : 0;
                return (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: '24px', height: '24px', borderRadius: '7px',
                      background: tint(d.color, 0.12), color: d.color, flexShrink: 0
                    }}>
                      {d.icon}
                    </span>
                    <div style={{ width: '90px', fontSize: '13px', fontWeight: 600, color: IOS_THEME.textPrimary }}>
                      {d.name}
                    </div>
                    <div style={{ flex: 1, height: '7px', borderRadius: '4px', background: 'rgba(0,0,0,0.04)', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: d.color, borderRadius: '4px', transition: 'width 0.4s ease' }} />
                    </div>
                    <span style={{ width: '90px', textAlign: 'right', fontSize: '13px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: IOS_THEME.textPrimary }}>
                      {FMT3(d.perKg)} <span style={{ fontSize: '10px', fontWeight: 500, color: IOS_THEME.textSecondary }}>{t('costs.currencyPerKg')}</span>
                    </span>
                    <span style={{ width: '38px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: IOS_THEME.textSecondary, fontVariantNumeric: 'tabular-nums' }}>
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Operational Insight: 4 zrównoważone kolumny wiążące koszt pracownika z wydajnością operacyjną */}
      <div style={{
        marginTop: '16px', padding: '12px 14px', borderRadius: '12px',
        background: 'rgba(0, 0, 0, 0.025)', border: `1px solid ${IOS_THEME.border}`,
        display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px', alignItems: 'center'
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: IOS_THEME.textTertiary, whiteSpace: 'nowrap' }}>
            Wydajność
          </div>
          <div style={{ fontSize: '13.5px', fontWeight: 700, color: IOS_THEME.textPrimary, fontVariantNumeric: 'tabular-nums', marginTop: '2px', whiteSpace: 'nowrap' }}>
            {overallKgPerH > 0 ? `${FMT1(overallKgPerH)} kg/rbh` : '—'}
          </div>
        </div>
        <div style={{ minWidth: 0, borderLeft: `1px solid ${IOS_THEME.border}`, paddingLeft: '10px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: IOS_THEME.textTertiary, whiteSpace: 'nowrap' }}>
            Godziny rbh
          </div>
          <div style={{ fontSize: '13.5px', fontWeight: 700, color: IOS_THEME.textPrimary, fontVariantNumeric: 'tabular-nums', marginTop: '2px', whiteSpace: 'nowrap' }}>
            {FMT0(perfTotals?.h || 0)} rbh
          </div>
        </div>
        <div style={{ minWidth: 0, borderLeft: `1px solid ${IOS_THEME.border}`, paddingLeft: '10px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: IOS_THEME.textTertiary, whiteSpace: 'nowrap' }}>
            Stawka rbh
          </div>
          <div style={{ fontSize: '13.5px', fontWeight: 700, color: IOS_THEME.textPrimary, fontVariantNumeric: 'tabular-nums', marginTop: '2px', whiteSpace: 'nowrap' }}>
            {FMT(settings?.worker_hourly_rate || 45.82)} zł/h
          </div>
        </div>
        <div style={{ minWidth: 0, borderLeft: `1px solid ${IOS_THEME.border}`, paddingLeft: '10px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: IOS_THEME.textTertiary, whiteSpace: 'nowrap' }}>
            Koszt pracy
          </div>
          <div style={{ fontSize: '13.5px', fontWeight: 700, color: IOS_THEME.textPrimary, fontVariantNumeric: 'tabular-nums', marginTop: '2px', whiteSpace: 'nowrap' }}>
            {cur?.workers > 0 ? `${FMT0(cur.workers)} zł` : '—'}
          </div>
        </div>
      </div>
    </div>
  );
}

// Most MoM (waterfall): koszt poprzedniego miesiąca → wkłady kategorii → koszt bieżącego (brak uciętych liczb!)
function WaterfallCard({ cur, prev }) {
  const { t } = useTranslation();
  const months = monthNames();
  const [hoveredIdx, setHoveredIdx] = useState(null);

  if (!prev || prev.total <= 0 || !cur) {
    return (
      <div style={cardStyle}>
        <div style={cardTitleStyle}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '8px', background: tint(IOS_THEME.accent, 0.12), color: IOS_THEME.accent }}>
            <BarChart3 size={16}/>
          </span>
          <span>{t('costs.whatChangedMom')}</span>
        </div>
        <div style={{ padding: '36px 0', textAlign: 'center', fontSize: '13px', color: IOS_THEME.textSecondary }}>{t('costs.needPreviousMonth')}</div>
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
  const cols = [{ label: months[prev.month - 1].slice(0, 3), type: 'edge', val: prev.total, name: `${months[prev.month - 1]} ${prev.year}` }];
  let run = prev.total;
  catDefs.forEach(c => { cols.push({ label: c.name, type: 'delta', from: run, to: run + c.d, d: c.d, name: c.name }); run += c.d; });
  cols.push({ label: months[cur.month - 1].slice(0, 3), type: 'edge', val: cur.total, name: `${months[cur.month - 1]} ${cur.year}` });

  const W = 620, Hh = 220, P = 40, axisB = 36;
  const maxV = Math.max(prev.total, cur.total, ...cols.map(c => c.type === 'delta' ? Math.max(c.from, c.to) : c.val)) * 1.08;
  const slot = (W - 2 * P) / cols.length;
  const bw = Math.min(slot * 0.58, 44);
  const cx = (i) => P + slot * (i + 0.5);
  const y = (v) => (Hh - axisB) - (v / maxV) * (Hh - axisB - 12);
  const net = cur.total - prev.total;

  return (
    <div style={{ ...cardStyle, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={cardTitleStyle}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '8px', background: tint(IOS_THEME.accent, 0.12), color: IOS_THEME.accent }}>
            <BarChart3 size={16}/>
          </span>
          <span>{t('costs.whatChangedMom')}</span>
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          padding: '4px 12px', borderRadius: '999px',
          fontSize: '13px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
          background: net <= 0 ? IOS_THEME.successBg : IOS_THEME.dangerBg,
          color: net <= 0 ? IOS_THEME.successText : IOS_THEME.dangerText,
        }}>
          <span style={{ fontSize: '11px', fontWeight: 600, opacity: 0.85 }}>Zmiana:</span>
          <span>{net >= 0 ? '+' : '−'}{FMT(Math.abs(net))} {t('costs.currency')}</span>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${Hh}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {cols.map((c, i) => {
          const isEdge = c.type === 'edge';
          const top = isEdge ? y(c.val) : y(Math.max(c.from, c.to));
          const h = isEdge ? (Hh - axisB) - y(c.val) : Math.abs(y(c.from) - y(c.to));
          const isGood = c.d <= 0;
          const fill = isEdge ? IOS_THEME.accent : isGood ? IOS_THEME.success : IOS_THEME.danger;
          const lbl = isEdge ? FMT0(c.val) : `${c.d >= 0 ? '+' : '−'}${FMT0(Math.abs(c.d))}`;
          const isHovered = hoveredIdx === i;

          return (
            <g
              key={i}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{ cursor: 'pointer' }}
            >
              {!isEdge && i > 0 && (
                <line x1={cx(i - 1)} x2={cx(i) - bw / 2} y1={y(c.from)} y2={y(c.from)} stroke="rgba(0,0,0,0.12)" strokeWidth="1" strokeDasharray="3 3" />
              )}
              <rect
                x={cx(i) - bw / 2}
                y={top}
                width={bw}
                height={Math.max(h, 2)}
                rx="4"
                fill={fill}
                opacity={isHovered ? 1 : 0.9}
                style={{ transition: 'opacity 0.15s ease' }}
              />
              <text
                x={cx(i)}
                y={Math.max(top - 6, 12)}
                textAnchor="middle"
                fontSize="10"
                fontWeight="700"
                fontVariantNumeric="tabular-nums"
                fill={isEdge ? IOS_THEME.textPrimary : fill}
              >
                {lbl}
              </text>
              <text
                x={cx(i)}
                y={Hh - axisB + 16}
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill={IOS_THEME.textSecondary}
              >
                {c.label}
              </text>
            </g>
          );
        })}
        <line x1={P} x2={W - P} y1={Hh - axisB} y2={Hh - axisB} stroke="rgba(0,0,0,0.08)" strokeWidth="1" />
      </svg>
    </div>
  );
}

// Trend wielomiesięczny: słupki zł/kg + linia celu (zdefiniowany w Stawkach lub śr. z miesięcy z danymi), tonaż pod spodem
function MultiMonthTrend({ months, targetCostPerKg = null }) {
  const { t } = useTranslation();
  const monthList = monthNames();
  const pts = months;
  const vals = pts.map(p => p.plnPerKg);
  const withData = vals.filter(v => v > 0);
  const autoTarget = withData.length ? withData.reduce((a, b) => a + b, 0) / withData.length : 0;

  const numericTarget = typeof targetCostPerKg === 'number' && Number.isFinite(targetCostPerKg) && targetCostPerKg > 0
    ? targetCostPerKg
    : (targetCostPerKg && !isNaN(parseFloat(targetCostPerKg)) && parseFloat(targetCostPerKg) > 0 ? parseFloat(targetCostPerKg) : null);

  const target = numericTarget != null ? numericTarget : autoTarget;
  const [hoveredMonth, setHoveredMonth] = useState(null);

  if (!withData.length) {
    return <div style={{ padding: '36px 0', textAlign: 'center', fontSize: '13px', color: IOS_THEME.textSecondary }}>{t('costs.noMonthsWithTonnage')}</div>;
  }

  const W = 740, Hh = 220, P = 42, axisB = 40;
  const maxV = Math.max(...vals, target) * 1.18;
  const slot = (W - 2 * P) / pts.length;
  const bw = Math.min(slot * 0.52, 44);
  const cx = (i) => P + slot * (i + 0.5);
  const y = (v) => (Hh - axisB) - (v / maxV) * (Hh - axisB - 18);
  const currentIdx = pts.length - 1;

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${Hh}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {/* linia celu */}
        <line x1={P} x2={W - P} y1={y(target)} y2={y(target)} stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.9" />

        {/* Etykieta celu na osi pionowej po LEWEJ stronie — poza zakresem słupków, bez zakrywania danych */}
        <text
          x={P - 6}
          y={y(target) + 3.5}
          textAnchor="end"
          fontSize="9.5"
          fontWeight="700"
          fontVariantNumeric="tabular-nums"
          fill="#D97706"
        >
          {FMT3(target)}
        </text>

        {pts.map((p, i) => {
          const v = p.plnPerKg;
          const has = v > 0;
          const top = has ? y(v) : (Hh - axisB) - 2;
          const h = has ? (Hh - axisB) - y(v) : 2;
          const isCurrent = i === currentIdx;
          const fill = !has ? 'rgba(0,0,0,0.05)' : isCurrent ? IOS_THEME.accent : v <= target ? IOS_THEME.success : IOS_THEME.warning;
          const isHovered = hoveredMonth === i;

          return (
            <g
              key={p.mk}
              onMouseEnter={() => setHoveredMonth(i)}
              onMouseLeave={() => setHoveredMonth(null)}
              style={{ cursor: 'pointer' }}
            >
              <rect
                x={cx(i) - bw / 2}
                y={top}
                width={bw}
                height={Math.max(h, 2)}
                rx="5"
                fill={fill}
                opacity={isHovered ? 1 : 0.9}
                style={{ transition: 'opacity 0.15s ease' }}
              />
              {has && (
                <text
                  x={cx(i)}
                  y={top - 6}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="800"
                  fontVariantNumeric="tabular-nums"
                  fill={isCurrent ? IOS_THEME.accent : IOS_THEME.textPrimary}
                  style={{
                    paintOrder: 'stroke fill',
                    stroke: '#FFFFFF',
                    strokeWidth: '4px',
                    strokeLinejoin: 'round',
                  }}
                >
                  {FMT3(v)}
                </text>
              )}
              <text
                x={cx(i)}
                y={Hh - axisB + 16}
                textAnchor="middle"
                fontSize="11"
                fontWeight={isCurrent ? '800' : '600'}
                fill={isCurrent ? IOS_THEME.accent : IOS_THEME.textPrimary}
              >
                {monthList[p.month - 1].slice(0, 3)}
              </text>
              <text
                x={cx(i)}
                y={Hh - axisB + 30}
                textAnchor="middle"
                fontSize="9.5"
                fontWeight="500"
                fontVariantNumeric="tabular-nums"
                fill={IOS_THEME.textTertiary}
              >
                {p.kg > 0 ? `${FMT0(p.kg)} kg` : '—'}
              </text>
            </g>
          );
        })}
        <line x1={P} x2={W - P} y1={Hh - axisB} y2={Hh - axisB} stroke="rgba(0,0,0,0.08)" strokeWidth="1" />
      </svg>
    </div>
  );
}

function TrendChart({ data, days, avg, offFlags = [] }) {
  const { t } = useTranslation();
  const W = 600, H = 175, P = 12;
  const n = data.length;
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
  const gradId = useId();

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={IOS_THEME.accent} stopOpacity="0.18" />
            <stop offset="100%" stopColor={IOS_THEME.accent} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        <polygon points={areaPts} fill={`url(#${gradId})`} />
        <line x1={P} y1={avgY} x2={W - P} y2={avgY} stroke={IOS_THEME.textSecondary} strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />
        <polyline points={linePts} fill="none" stroke={IOS_THEME.accent} strokeWidth="2.2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        {n > 0 && (
          <>
            <circle cx={x(maxIdx)} cy={y(data[maxIdx])} r="5" fill={IOS_THEME.accent} opacity="0.25" vectorEffect="non-scaling-stroke" />
            <circle cx={x(maxIdx)} cy={y(data[maxIdx])} r="2.8" fill={IOS_THEME.accent} vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', fontSize: '11px', color: IOS_THEME.textSecondary, fontVariantNumeric: 'tabular-nums' }}>
        <span>{days.length ? new Date(days[0]).getDate() + '.' + String(new Date(days[0]).getMonth() + 1).padStart(2, '0') : ''}</span>
        <span style={{ color: IOS_THEME.warningText, fontWeight: 700, background: IOS_THEME.warningBg, padding: '2px 8px', borderRadius: '6px' }}>
          {t('costs.peak')}: {FMT(data[maxIdx] || 0)} {t('costs.currency')}
        </span>
        <span style={{ fontWeight: 600 }}>{t('costs.avgShort')} {FMT(avg)} {t('costs.currency')}</span>
        <span>{days.length ? new Date(days[days.length - 1]).getDate() + '.' + String(new Date(days[days.length - 1]).getMonth() + 1).padStart(2, '0') : ''}</span>
      </div>
    </div>
  );
}

/* ───────────── RATES PANEL ───────────── */
function RatesPanel({ settings, onChange, readOnly = false }) {
  const { t } = useTranslation();
  const groups = [
    { title: t('costs.targetCostGroup'), color: '#D97706', fields: [
      ['target_cost_per_kg', t('costs.targetCostPerKg')],
    ], hint: t('costs.targetCostPerKgHint') },
    { title: t('costs.transport'), color: CAT.transport, fields: [
      ['fiat_l_100km', 'Fiat L/100km'], ['isuzu_l_100km', 'Isuzu L/100km'], ['merc_l_100km', 'Merc. L/100km'],
      ['iveco_l_100km', 'Iveco L/100km'], ['fuel_price', t('costs.fuelRate')],
    ]},
    { title: t('costs.energy'), color: CAT.elec, fields: [
      ['elec_multiplier', t('costs.meterMultiplier')],
      ['elec_price_kwh', t('costs.ratePerKwh')],
      ['elec_fixed_monthly', t('costs.fixedMonthly')],
      ['elec_power_fee_monthly', t('costs.powerFeeMonthly')],
      ['elec_reactive_monthly', t('costs.reactiveEnergyMonthly')],
    ]},
    { title: t('costs.electricityInvoice'), color: '#B45309', isInvoiceSection: true, fields: [
      ['elec_invoice_kwh', t('costs.invoiceKwh')],
      ['elec_invoice_net', t('costs.invoiceNet')],
    ]},
    { title: t('costs.productionGas'), color: CAT.gas, fields: [
      ['gas_prod_kwh_per_m3', t('costs.gasKwhPerM3')], ['gas_prod_price_kwh', t('costs.ratePerKwh')], ['gas_prod_fixed_monthly', t('costs.subscriptionMonthly')],
    ], explanation: [
      t('costs.gasFormulaConversion'),
      t('costs.gasFormulaVariableRate'),
      t('costs.gasFormulaFixedRate'),
      t('costs.gasFormulaDailyCost'),
    ]},
    { title: t('costs.productionGasInvoice'), color: CAT.gas, isInvoiceSection: true, fields: [
      ['gas_prod_invoice_kwh', t('costs.invoiceKwh')],
      ['gas_prod_invoice_net', t('costs.invoiceNet')],
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
                  <input type="number" min="0" step="any" value={settings[field] ?? ''} onChange={(e) => onChange(field, e.target.value)} disabled={readOnly} className="costs-inp" style={{ ...rateInpStyle, opacity: readOnly ? 0.75 : 1 }} />
                </label>
              ))}
            </div>
            {g.hint && (
              <div style={{ marginTop: '8px', fontSize: '11px', color: IOS_THEME.textSecondary, lineHeight: 1.4 }}>
                {g.hint}
              </div>
            )}
            {g.isInvoiceSection && (
              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: `1px solid ${IOS_THEME.border}`, color: IOS_THEME.textSecondary, fontSize: '12px' }}>
                <div style={{ color: IOS_THEME.textSecondary }}>{t('costs.invoiceDataHint')}</div>
              </div>
            )}
            {g.explanation && (
              <div style={{ marginTop: '12px', padding: '10px 11px', borderRadius: '9px', background: opaqueTint(g.color, 0.07), color: IOS_THEME.textSecondary, fontSize: '11.5px', lineHeight: 1.45 }}>
                <div style={{ color: g.color, fontWeight: 700, marginBottom: '5px' }}>{t('costs.gasFormulaTitle')}</div>
                {g.explanation.map((line, index) => <div key={line} style={{ marginTop: index ? '4px' : 0 }}>{line}</div>)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ElectricityReconciliationCard({ reconciliation }) {
  const { t } = useTranslation();
  return (
    <div style={cardStyle}>
      <div style={cardTitleStyle}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '8px', background: tint(CAT.elec, 0.12), color: CAT.elec }}>
          <Zap size={16}/>
        </span>
        <span>{t('costs.electricityReconciliation')}</span>
      </div>
      <div style={{ color: IOS_THEME.textSecondary, fontSize: '12px', marginBottom: '14px', lineHeight: 1.45 }}>
        {t('costs.reconciliationHint')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '12px' }}>
        {reconciliation.hasInvoiceKwh && (
          <ReconciliationMetric
            label={t('costs.energyConsumption')}
            calculated={`${FMT1(reconciliation.calculatedKwh)} kWh`}
            invoice={`${FMT1(reconciliation.invoiceKwh)} kWh`}
            difference={reconciliation.usageDifference}
            differencePct={reconciliation.usageDifferencePct}
            unit="kWh"
          />
        )}
        {reconciliation.hasInvoiceNet && (
          <ReconciliationMetric
            label={t('costs.energyNetCost')}
            calculated={`${FMT(reconciliation.calculatedNet)} ${t('costs.currency')}`}
            invoice={`${FMT(reconciliation.invoiceNet)} ${t('costs.currency')}`}
            difference={reconciliation.costDifference}
            differencePct={reconciliation.costDifferencePct}
            unit={t('costs.currency')}
          />
        )}
      </div>
    </div>
  );
}

function GasProductionReconciliationCard({ reconciliation }) {
  const { t } = useTranslation();
  return (
    <div style={cardStyle}>
      <div style={cardTitleStyle}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '8px', background: tint(CAT.gas, 0.12), color: CAT.gas }}>
          <Flame size={16}/>
        </span>
        <span>{t('costs.productionGasReconciliation')}</span>
      </div>
      <div style={{ color: IOS_THEME.textSecondary, fontSize: '12px', marginBottom: '14px', lineHeight: 1.45 }}>
        {t('costs.productionGasReconciliationHint')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '12px' }}>
        {reconciliation.hasInvoiceKwh && (
          <div style={{ padding: '14px', borderRadius: '12px', background: 'rgba(0,0,0,0.02)', border: `1px solid ${IOS_THEME.border}` }}>
            <div style={{ fontWeight: 700, marginBottom: '8px', fontSize: '13px', color: IOS_THEME.textPrimary }}>{t('costs.productionGasConsumption')}</div>
            <div style={{ display: 'grid', gap: '6px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ color: IOS_THEME.textSecondary }}>{t('costs.appMeter')}</span>
                <strong>{FMT1(reconciliation.calculatedM3)} m³</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ color: IOS_THEME.textSecondary }}>{t('costs.invoiceValue')}</span>
                <strong>{FMT1(reconciliation.invoiceKwh)} kWh</strong>
              </div>
            </div>
            {reconciliation.impliedKwhPerM3 != null && (
              <div style={{ color: CAT.gas, textAlign: 'right', marginTop: '8px', fontWeight: 700, fontSize: '12px', display: 'grid', gap: '3px' }}>
                <span>{t('costs.impliedGasConversion')}: {FMT3(reconciliation.impliedKwhPerM3)} kWh/m³</span>
                {reconciliation.invoiceDerivedPriceM3 != null && (
                  <span>{t('costs.invoiceDerivedGasRate')}: {FMT3(reconciliation.invoiceDerivedPriceM3)} {t('costs.currency')}/m³</span>
                )}
              </div>
            )}
          </div>
        )}
        {reconciliation.hasInvoiceNet && (
          <ReconciliationMetric
            label={t('costs.productionGasNetCost')}
            calculated={`${FMT(reconciliation.calculatedNet)} ${t('costs.currency')}`}
            invoice={`${FMT(reconciliation.invoiceNet)} ${t('costs.currency')}`}
            difference={reconciliation.costDifference}
            differencePct={reconciliation.costDifferencePct}
            unit={t('costs.currency')}
          />
        )}
      </div>
    </div>
  );
}

function ReconciliationMetric({ label, calculated, invoice, difference, differencePct, unit }) {
  const { t } = useTranslation();
  const isGood = Math.abs(difference || 0) < 0.005;
  const color = isGood ? IOS_THEME.successText : IOS_THEME.warningText;
  const bg = isGood ? IOS_THEME.successBg : IOS_THEME.warningBg;
  const sign = difference > 0 ? '+' : '';
  const pct = differencePct == null ? '' : ` (${sign}${FMT1(differencePct)}%)`;
  return (
    <div style={{ padding: '14px', borderRadius: '12px', background: 'rgba(0,0,0,0.02)', border: `1px solid ${IOS_THEME.border}` }}>
      <div style={{ fontWeight: 700, marginBottom: '8px', fontSize: '13px', color: IOS_THEME.textPrimary }}>{label}</div>
      <div style={{ display: 'grid', gap: '6px', fontSize: '13px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
          <span style={{ color: IOS_THEME.textSecondary }}>{t('costs.appCalculation')}</span>
          <strong style={{ color: IOS_THEME.textPrimary }}>{calculated}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
          <span style={{ color: IOS_THEME.textSecondary }}>{t('costs.invoiceValue')}</span>
          <strong style={{ color: IOS_THEME.textPrimary }}>{invoice}</strong>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
        <span style={{ color, background: bg, padding: '3px 8px', borderRadius: '6px', fontWeight: 700, fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>
          Δ {sign}{unit === 'kWh' ? FMT1(difference) : FMT(difference)} {unit}{pct}
        </span>
      </div>
    </div>
  );
}

/* ───────────── ENTRY GRID (cumulative meter readings) ───────────── */
function EntryGrid({
  days,
  weekdays,
  dailyData,
  calcDay,
  totals,
  onChange,
  readOnly = false,
  laborHours = {},
  todayKey,
  highlightedDate = null,
  courseIssues = [],
}) {
  const { t } = useTranslation();

  useEffect(() => {
    if (highlightedDate) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`costs-row-${highlightedDate}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [highlightedDate, days]);

  // each meter = ONE daily reading stored in <base>_end; consumption derived in calcDay
  const meterTh = (icon, label, meterLabel = t('costs.meter')) => (
    <th className="sticky-head" style={newThStyle}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>{icon} {label}</span>
        <span style={{ fontSize: '9px', fontWeight: 500, color: IOS_THEME.textSecondary, opacity: 0.7 }}>{meterLabel}</span>
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
  const meterIssueText = (status) => ({
    invalid: t('costs.invalidMeter'),
    decreased: t('costs.decreasedMeter'),
    missing_baseline: t('costs.missingMeterBaseline'),
  })[status] || '';
  const reading = (dStr, dt, base, cons, unit, status, calculatedUnit = '') => {
    const carKey = base === 'merc' ? ['merc', 'mercedes'] : [base];
    const carIssue = courseIssues?.find(ci => ci.entry_date === dStr && carKey.includes(ci.car));
    const meterErr = meterIssueText(status);

    const cellBorder = carIssue
      ? 'inset 0 0 0 2px #FF9500'
      : meterErr
      ? `inset 0 0 0 2px ${status === 'missing_baseline' ? IOS_THEME.warning : '#EF4444'}`
      : undefined;

    const cellTitle = carIssue
      ? `Rozbieżność kursu: zatwierdzony licznik kursu wynosi ${Number(carIssue.expected_end_km).toLocaleString('pl-PL')} km, a w kosztach brak odczytu`
      : meterErr;

    const subContent = carIssue ? (
      <span style={{ color: '#D97706', fontWeight: 700, fontSize: '10px' }}>
        ⚠️ Kurs: {carIssue.expected_end_km} km
      </span>
    ) : status === 'reset' ? (
      t('costs.meterResetShort')
    ) : cons > 0 ? (
      <>{unit === 'm³' ? FMT1(cons) : FMT0(cons)} <span style={{ fontWeight: 500 }}>{unit}</span>{calculatedUnit ? <> · {calculatedUnit}</> : ''}</>
    ) : '';

    return valCell(
      cellBorder ? { ...newTdStyle, boxShadow: cellBorder } : newTdStyle,
      <input
        type="text"
        inputMode="numeric"
        value={dt[`${base}_end`] ?? ''}
        onChange={(e) => onChange(dStr, `${base}_end`, e.target.value)}
        disabled={readOnly}
        className="costs-inp"
        style={{ ...newInpStyle, opacity: readOnly ? 0.75 : 1 }}
      />,
      subContent,
      carIssue ? '#D97706' : undefined,
      { title: cellTitle }
    );
  };
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
              {meterTh(<Flame size={13}/>, t('costs.productionGasShort'), t('costs.productionGasMeterLabel'))}
              <th className="sticky-head" style={{ ...newThStyle, color: CAT.gas, background: opaqueTint(CAT.gas, 0.13) }}><span>{t('costs.cost')}</span><br/><span>{t('costs.productionShort')}</span></th>
              {meterTh(<Flame size={13}/>, t('costs.heatingGasShort'))}
              <th className="sticky-head" style={{ ...newThStyle, color: '#4A148C', background: opaqueTint('#4A148C', 0.13) }}><span>{t('costs.cost')}</span><br/><span>{t('costs.heatingShort')}</span></th>
              {meterTh(<Droplet size={13}/>, t('costs.water'))}
              <th className="sticky-head" style={{ ...newThStyle, color: CAT.water, background: opaqueTint(CAT.water, 0.13) }}><span>{t('costs.cost')}</span><br/><span>{t('costs.water')}</span></th>
              <th className="sticky-head" style={{ ...newThStyle, color: CAT.workers, background: opaqueTint(CAT.workers, 0.13) }}><span>{t('costs.employees')}</span><br/><span>{t('costs.cost')}</span></th>
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
              const isToday = dStr === todayKey;
              const isHighlighted = dStr === highlightedDate;
              const hasDateIssue = courseIssues?.some(ci => ci.entry_date === dStr);
              const c = calcDay(dStr, idx, { includeFuture: true });
              const dt = dailyData[dStr] || {};
              const rowBg = isHighlighted
                ? 'rgba(255, 149, 0, 0.16)'
                : hasDateIssue
                ? 'rgba(255, 149, 0, 0.08)'
                : isToday
                ? tint(IOS_THEME.accent, 0.12)
                : isOff
                ? '#EBEBEB'
                : '#FFFFFF';
              const dateCellBg = isHighlighted
                ? '#FF9500'
                : isToday
                ? IOS_THEME.accent
                : isOff
                ? '#D5D5D5'
                : '#FFFFFF';
              const dateCellColor = (isHighlighted || isToday) ? '#FFFFFF' : isOff ? '#888888' : IOS_THEME.textPrimary;
              return (
                <tr
                  key={dStr}
                  id={`costs-row-${dStr}`}
                  className="costs-row"
                  style={{
                    background: rowBg,
                    boxShadow: isHighlighted ? 'inset 0 0 0 2px #FF9500' : undefined,
                    transition: 'all 0.2s ease',
                  }}
                >
                  {valCell(
                    { ...newTdStyle, fontWeight: 700, background: dateCellBg, color: dateCellColor, minWidth: '52px' },
                    <span style={{ fontSize: '15px', fontWeight: 700 }}>{String(d.getDate()).padStart(2, '0')}</span>,
                    <span style={{ textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>{weekdays[d.getDay()]}</span>,
                    dateCellColor,
                    { className: 'sticky-col', title: isHol ? isHol.name : '' }
                  )}
                  {reading(dStr, dt, 'fiat', c.fiat_km, 'km', c.meterIssues.fiat)}
                  {reading(dStr, dt, 'isuzu', c.isuzu_km, 'km', c.meterIssues.isuzu)}
                  {reading(dStr, dt, 'merc', c.merc_km, 'km', c.meterIssues.merc)}
                  {reading(dStr, dt, 'iveco', c.iveco_km, 'km', c.meterIssues.iveco)}
                  {valCell(costCellStyle(CAT.transport),
                    FMT(c.transportCost),
                    c.total_km > 0 ? `${FMT0(c.total_km)} km` : (dt.fiat_end !== undefined || dt.isuzu_end !== undefined || dt.merc_end !== undefined || dt.iveco_end !== undefined) ? '0 km' : '',
                    CAT.transport)}
                  {reading(dStr, dt, 'elec', c.elec_usage, 'kWh', c.meterIssues.elec)}
                  {valCell(costCellStyle(CAT.elec), FMT(c.elec_cost), '')}
                  {reading(dStr, dt, 'gas_prod', c.gas_prod_usage, 'm³', c.meterIssues.gas_prod)}
                  {valCell(costCellStyle(CAT.gas), FMT(c.gas_prod_cost), c.gas_prod_kwh > 0 ? `${FMT0(c.gas_prod_kwh)} kWh` : '')}
                  {reading(dStr, dt, 'gas_heat', c.gas_heat_usage, 'm³', c.meterIssues.gas_heat)}
                  {valCell(costCellStyle('#4A148C'), FMT(c.gas_heat_cost), '')}
                  {reading(dStr, dt, 'water', c.water_usage, 'm³', c.meterIssues.water)}
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
              <td className="sticky-col" style={{ ...footTdStyle, textAlign: 'left', background: '#1E293B', color: '#FFFFFF' }}>{t('costs.totalMonth')}</td>
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
function PerformanceGrid({ days, weekdays, dailyData, timelineStats, totals, onChange, progi, onProgiChange, readOnly = false, todayKey }) {
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
  const throughputAvg = productionThroughput(totals.kgWithProductionClockData, totals.productionClockHours);
  // monthly avg kg/person = mean of daily kg/os (days with crew > 0), like the old sheet
  const osAgg = days.reduce((a, dStr) => {
    if (isFutureCalendarDate(dStr, todayKey)) return a;
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

  // Dzienne wskaźniki do panelu: pasma wg kg/rbh, najlepszy/najsłabszy dzień wg przepustowości kg/h.
  const dayStats = days.map(dStr => {
    if (isFutureCalendarDate(dStr, todayKey)) return { dStr, effAll: 0, plantThroughputKgPerHour: 0 };
    const dt = dailyData[dStr] || {};
    const dayTimeline = timelineStats[dStr] || {};
    const metrics = dailyPerformanceMetrics({
      kgZd1: decimalValue(dt.ton_zd1),
      kgZd2: decimalValue(dt.ton_zd2),
      kgWashers: decimalValue(dt.ton_pralki),
      timelineDay: dayTimeline,
    });
    return { dStr, effAll: metrics.overallKgPerLaborHour, plantThroughputKgPerHour: metrics.plantThroughputKgPerHour };
  });

  return (
    <div className="performance-layout">
      <div className="performance-workspace">
        <PerformanceSummary
          dayStats={dayStats}
          totals={totals}
          throughputAvg={throughputAvg}
          weekdays={weekdays}
        />
        <section className="performance-table-card" aria-label={t('costs.sheetPerformance')} style={{ minWidth: 0, ...cardStyle, padding: 0, overflow: 'hidden' }}>
      {/* legend — klik w kolor otwiera edytor TEGO pasma (przedział od–do per grupa) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', padding: '12px 18px', borderBottom: `1px solid ${IOS_THEME.border}`, background: '#F9F9FB', fontSize: '12px' }}>
        <span style={{ fontWeight: 700, color: IOS_THEME.textSecondary }}>{t('costs.performanceKgPerLaborHour')}:</span>
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
      <div role="note" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px 18px', borderBottom: `1px solid ${IOS_THEME.border}`, background: opaqueTint('#00796B', 0.07), color: IOS_THEME.textPrimary }}>
        <Info size={17} style={{ flex: '0 0 auto', marginTop: '1px', color: '#00796B' }} aria-hidden="true" />
        <div>
          <div style={{ fontSize: '12px', fontWeight: 800, color: '#00695C', marginBottom: '3px' }}>{t('costs.throughputExplanationTitle')}</div>
          <div style={{ fontSize: '12px', fontWeight: 700, lineHeight: 1.45 }}>{t('costs.throughputExplanationFormula')}</div>
          <div style={{ fontSize: '11px', color: IOS_THEME.textSecondary, lineHeight: 1.45, marginTop: '2px' }}>{t('costs.throughputExplanationDetail')}</div>
        </div>
      </div>
      {editBand && <ThresholdEditor band={editBand} progi={progi} onChange={onProgiChange} onClose={() => setEditBand(null)} readOnly={readOnly} />}
      <div className="performance-table-scroll">
        <table className="costs-table performance-data-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
          <colgroup>
            <col className="performance-col-date" />
            <col className="performance-col-zd1-kg" />
            <col className="performance-col-zd2-kg" />
            <col className="performance-col-washers" />
            <col className="performance-col-total-kg" />
            <col className="performance-col-production" />
            <col className="performance-col-throughput" />
            <col className="performance-col-zd1-hours" />
            <col className="performance-col-zd2-hours" />
            <col className="performance-col-driver-hours" />
            <col className="performance-col-total-hours" />
            <col className="performance-col-zd1-efficiency" />
            <col className="performance-col-zd2-efficiency" />
            <col className="performance-col-total-efficiency" />
          </colgroup>
          <thead>
            <tr>
              <th className="sticky-col sticky-head" style={newThStyle}>{t('costs.date')}</th>
              <th className="sticky-head" style={newThStyle}>ZD1 (kg)</th>
              <th className="sticky-head" style={newThStyle}>ZD2 (kg)</th>
              <th className="sticky-head" style={newThStyle}>{t('costs.washersKg')}</th>
              <th className="sticky-head" style={{ ...newThStyle, color: CAT.workers, background: opaqueTint(CAT.workers, 0.08) }}>Σ KG</th>
              <th className="sticky-head" title={t('costs.throughputHint')} style={{ ...newThStyle, color: '#00796B', background: opaqueTint('#00796B', 0.08) }}>{t('costs.productionClockHoursShort')}</th>
              <th className="sticky-head performance-throughput-cell performance-throughput-head" title={t('costs.throughputHint')} style={{ ...newThStyle, whiteSpace: 'normal', color: '#00796B', background: opaqueTint('#00796B', 0.12) }}>{t('costs.throughputKgH')}</th>
              <th className="sticky-head" style={newThStyle}>{t('costs.zd1LaborHours')}</th>
              <th className="sticky-head" style={newThStyle}>{t('costs.zd2LaborHours')}</th>
              <th className="sticky-head" style={newThStyle}>{t('costs.driversHours')}</th>
              <th className="sticky-head" style={{ ...newThStyle, color: '#1565C0', background: opaqueTint('#1565C0', 0.08) }}>{t('costs.totalLaborHours')}</th>
              <th className="sticky-head" style={{ ...newThStyle, color: CAT.workers, background: opaqueTint(CAT.workers, 0.08) }}>{t('costs.zd1KgPerLaborHour')}</th>
              <th className="sticky-head" style={{ ...newThStyle, color: CAT.gas, background: opaqueTint(CAT.gas, 0.08) }}>{t('costs.zd2WashersKgPerLaborHour')}</th>
              <th className="sticky-head" style={{ ...newThStyle, color: CAT.transport, background: opaqueTint(CAT.transport, 0.08) }}>{t('costs.overallKgPerLaborHour')}</th>
            </tr>
          </thead>
          <tbody>
            {days.map(dStr => {
              const d = new Date(dStr);
              const isHol = isHoliday(d);
              const isWe = d.getDay() === 0 || d.getDay() === 6;
              const isOff = isWe || !!isHol;
              const isToday = dStr === todayKey;
              const isFuture = isFutureCalendarDate(dStr, todayKey);
              const dt = dailyData[dStr] || {};
              const dayTimeline = timelineStats[dStr] || {};
              const ts = dayTimeline.roles || {};
              const kgZd1 = isFuture ? 0 : decimalValue(dt.ton_zd1);
              const kgZd2 = isFuture ? 0 : decimalValue(dt.ton_zd2);
              const kgWashers = isFuture ? 0 : decimalValue(dt.ton_pralki);
              const metrics = dailyPerformanceMetrics({ kgZd1, kgZd2, kgWashers, timelineDay: isFuture ? {} : dayTimeline });
              const pZd1 = ts.ZD1?.emp?.size || 0, pZd2 = ts.ZD2?.emp?.size || 0, pKier = ts.Kierowcy?.emp?.size || 0;
              const pAll = pZd1 + pZd2 + pKier;
              return (
                <tr key={dStr} className="costs-row" style={{ background: isToday ? tint(IOS_THEME.accent, 0.12) : isOff ? '#EBEBEB' : '#FFFFFF' }}>
                  <td className="sticky-col" style={{ ...newTdStyle, fontWeight: 700, background: isToday ? IOS_THEME.accent : isOff ? '#D5D5D5' : '#FFFFFF', color: isToday ? '#FFFFFF' : isOff ? '#888888' : IOS_THEME.textPrimary, textAlign: 'center', minWidth: '52px' }} title={isHol ? isHol.name : ''}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, lineHeight: 1.2 }}>{String(d.getDate()).padStart(2, '0')}</span>
                      <span style={{ fontSize: '10px', fontWeight: 600, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{weekdays[d.getDay()]}</span>
                    </div>
                  </td>
                  <td style={newTdStyle}><input type="number" min="0" step="any" value={dt.ton_zd1 || ''} onChange={(e) => onChange(dStr, 'ton_zd1', e.target.value)} disabled={readOnly} className="costs-inp" style={{ ...newInpStyle, opacity: readOnly ? 0.75 : 1 }}/></td>
                  <td style={newTdStyle}><input type="number" min="0" step="any" value={dt.ton_zd2 || ''} onChange={(e) => onChange(dStr, 'ton_zd2', e.target.value)} disabled={readOnly} className="costs-inp" style={{ ...newInpStyle, opacity: readOnly ? 0.75 : 1 }}/></td>
                  <td style={newTdStyle}><input type="number" min="0" step="any" value={dt.ton_pralki || ''} onChange={(e) => onChange(dStr, 'ton_pralki', e.target.value)} disabled={readOnly} className="costs-inp" style={{ ...newInpStyle, opacity: readOnly ? 0.75 : 1 }}/></td>
                  <td style={{ ...newTdStyle, fontWeight: 700, textAlign: 'center', background: tint(CAT.workers, 0.05) }}>{metrics.totalKg > 0 ? FMT1(metrics.totalKg) : '—'}</td>
                  <td style={{ ...newTdStyle, fontWeight: 700, color: '#00796B', textAlign: 'center', background: tint('#00796B', 0.05) }}>{metrics.productionClockHourCount > 0 ? FMT1(metrics.productionClockHourCount) : '—'}</td>
                  <td className="performance-throughput-cell" style={{ ...newTdStyle, fontWeight: 800, color: '#00796B', textAlign: 'center', background: tint('#00796B', 0.12) }}>{metrics.plantThroughputKgPerHour > 0 ? metrics.plantThroughputKgPerHour.toFixed(1) : '—'}</td>
                  {hoursTd(metrics.zd1LaborHours, ts.ZD1?.emp?.size || 0, IOS_THEME.textPrimary)}
                  {hoursTd(metrics.zd2LaborHours, ts.ZD2?.emp?.size || 0, IOS_THEME.textPrimary)}
                  {hoursTd(metrics.driverLaborHours, ts.Kierowcy?.emp?.size || 0, IOS_THEME.textPrimary)}
                  <td style={{ ...newTdStyle, fontWeight: 700, color: '#1565C0', textAlign: 'center', background: tint('#1565C0', 0.05) }}>{metrics.totalLaborHours > 0 ? FMT1(metrics.totalLaborHours) : '—'}</td>
                  {effTd(metrics.zd1KgPerLaborHour, progi.ZD1, pZd1 > 0 ? kgZd1 / pZd1 : 0)}
                  {effTd(metrics.zd2WashersKgPerLaborHour, progi.ZD2, pZd2 > 0 ? metrics.zd2WashersKg / pZd2 : 0)}
                  {effTd(metrics.overallKgPerLaborHour, progi.WSP, pAll > 0 ? metrics.totalKg / pAll : 0)}
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
              <td style={{ ...footTdStyle, color: '#00796B', textAlign: 'center' }}>{totals.productionClockHours ? FMT1(totals.productionClockHours) : '—'}</td>
              <td className="performance-throughput-cell" style={{ ...footTdStyle, color: '#00796B', textAlign: 'center' }}>{throughputAvg > 0 ? throughputAvg.toFixed(1) : '—'}</td>
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
        </section>
      </div>

      <PerformanceInsights
        dayStats={dayStats} progi={progi}
        effZd1Avg={effZd1Avg} effZd2Avg={effZd2Avg} effAllAvg={effAllAvg}
        osZd1Avg={osZd1Avg} osZd2Avg={osZd2Avg}
      />
    </div>
  );
}

/* ───────────── PANEL KPI WYDAJNOŚCI ───────────── */
function PerformanceSummary({ dayStats, totals, throughputAvg, weekdays }) {
  const { t } = useTranslation();
  const { best, weakest } = plantThroughputDayExtremes(dayStats);
  const dLab = (dStr) => { const d = new Date(dStr); return `${String(d.getDate()).padStart(2, '0')} ${weekdays[d.getDay()]}`; };

  return (
    <section className="performance-summary" aria-label={t('costs.totalAvg')} style={{ ...cardStyle, padding: '6px' }}>
      <div className="performance-kpi-grid">
        <MiniStat featured label={t('costs.throughputKgH')} value={throughputAvg > 0 ? throughputAvg.toFixed(1) : '—'} unit={throughputAvg > 0 ? 'kg/h' : ''} color="#00796B" />
        <MiniStat label={t('costs.totalTonnage')} value={totals.kg > 0 ? FMT0(totals.kg) : '—'} unit="kg" color={CAT.workers} />
        <MiniStat label={t('costs.productionClockHours')} value={totals.productionClockHours > 0 ? FMT1(totals.productionClockHours) : '—'} unit="h" color="#00796B" />
        <MiniStat label={t('costs.bestDay')} value={best ? best.plantThroughputKgPerHour.toFixed(1) : '—'} unit={best ? `kg/h · ${dLab(best.dStr)}` : ''} color="#00796B" />
        <MiniStat label={t('costs.weakestDay')} value={weakest ? weakest.plantThroughputKgPerHour.toFixed(1) : '—'} unit={weakest ? `kg/h · ${dLab(weakest.dStr)}` : ''} color={EFF_COLORS.slaba.fc} />
        <MiniStat label={t('costs.totalHours')} value={totals.h > 0 ? FMT1(totals.h) : '—'} unit={t('costs.laborHourUnit')} color="#1565C0" />
      </div>
    </section>
  );
}

/* ───────────── ANALITYKA POD TABELĄ WYDAJNOŚCI ───────────── */
function PerformanceInsights({ dayStats, progi, effZd1Avg, effZd2Avg, effAllAvg, osZd1Avg, osZd2Avg }) {
  const { t } = useTranslation();
  // Rozkład dni wg pasma — na bazie Ogółem kg/rbh (tylko dni z danymi)
  const dist = { slaba: 0, srednia: 0, dobra: 0, bdb: 0 };
  let activeDays = 0;
  dayStats.forEach(s => { const b = bandOf(s.effAll, progi.WSP); if (b) { dist[b]++; activeDays++; } });

  return (
    <div className="performance-insights-grid">

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
  const { t } = useTranslation();
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
          {value > 0 ? value.toFixed(1) : '—'} <span style={{ fontSize: '11px', fontWeight: 600, color: IOS_THEME.textSecondary }}>{t('costs.performanceUnit')}</span>
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

function MiniStat({ label, value, unit, color, featured = false }) {
  return (
    <div className={`performance-kpi-tile${featured ? ' is-featured' : ''}`}>
      <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: IOS_THEME.textSecondary, marginBottom: '7px' }}>{label}</div>
      <div style={{ fontSize: '20px', fontWeight: 800, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}>
        {value} <span style={{ fontSize: '11px', fontWeight: 600, color: IOS_THEME.textSecondary }}>{unit}</span>
      </div>
    </div>
  );
}

/* ───────────── STYLES ───────────── */
const cardStyle = {
  background: IOS_THEME.cardBg,
  borderRadius: IOS_THEME.radius,
  boxShadow: IOS_THEME.shadow,
  border: `1px solid ${IOS_THEME.border}`,
  padding: '22px',
  transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
};
const cardTitleStyle = {
  fontSize: '15px',
  fontWeight: 700,
  marginBottom: '14px',
  color: IOS_THEME.textPrimary,
  letterSpacing: '-0.01em',
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
};

const navBtnStyle = {
  padding: '7px 14px',
  borderRadius: '10px',
  background: '#FFFFFF',
  border: `1px solid ${IOS_THEME.border}`,
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
  fontWeight: 600,
  fontSize: '13px',
  color: IOS_THEME.textPrimary,
  cursor: 'pointer',
  transition: 'all 0.15s ease'
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

/* ───────────── INTEGRITY REPORT MODAL ───────────── */
function IntegrityReportModal({
  isOpen,
  onClose,
  courseIssues = [],
  meterIssues = [],
  onNavigateToIssue,
}) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!isOpen) return;
    const unlock = lockPageScroll();
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      unlock();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const vehicleNames = {
    fiat: 'Fiat',
    isuzu: 'Isuzu',
    merc: 'Mercedes',
    mercedes: 'Mercedes',
    iveco: 'Iveco',
  };

  const meterNames = {
    fiat: 'Fiat (licznik)',
    isuzu: 'Isuzu (licznik)',
    merc: 'Mercedes (licznik)',
    iveco: 'Iveco (licznik)',
    elec: 'Prąd (kWh)',
    gas_prod: 'Gaz prod. (m³)',
    gas_heat: 'Gaz grzewczy (m³)',
    water: 'Woda (m³)',
  };

  const formatDateLabel = (dStr) => {
    if (!dStr) return '';
    try {
      const [y, m, d] = dStr.split('-');
      const monthIdx = parseInt(m, 10) - 1;
      const monthName = monthNames[monthIdx] || m;
      return `${parseInt(d, 10)} ${monthName} ${y} (${dStr})`;
    } catch {
      return dStr;
    }
  };

  return (
    <div
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="integrity-modal-title"
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '85vh',
          background: '#FFFFFF',
          borderRadius: '20px',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.22), 0 4px 16px rgba(0, 0, 0, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid rgba(0, 0, 0, 0.08)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderBottom: `1px solid ${IOS_THEME.border}`,
          background: '#FBFBFC',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'rgba(255, 149, 0, 0.15)',
              color: '#D97706',
              flexShrink: 0,
            }}>
              <ShieldAlert size={20} />
            </span>
            <div>
              <h3 id="integrity-modal-title" style={{ margin: 0, fontSize: '16.5px', fontWeight: 700, color: IOS_THEME.textPrimary, letterSpacing: '-0.3px' }}>
                Szczegóły rozbieżności i kontroli odczytów
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: IOS_THEME.textSecondary }}>
                Wykryto niezgodności w raportach z ostatnich 12 miesięcy
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij"
            style={{
              background: 'rgba(0, 0, 0, 0.05)',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: IOS_THEME.textSecondary,
              transition: 'background 0.15s ease',
            }}
          >
            <X size={17} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Section: Course Issues */}
          {courseIssues.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: IOS_THEME.textPrimary, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  Rozbieżności kursów kierowców
                </span>
                <span style={{
                  background: 'rgba(255, 149, 0, 0.16)',
                  color: '#D97706',
                  fontSize: '11px',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: '10px',
                }}>
                  {courseIssues.length}
                </span>
              </div>
              <p style={{ margin: '0 0 12px', fontSize: '12.5px', color: IOS_THEME.textSecondary, lineHeight: 1.45 }}>
                Kurs został zatwierdzony z odczytem licznika końcowego, ale w tabeli kosztów na ten dzień stan licznika pojazdu jest pusty.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {courseIssues.map((issue, idx) => {
                  const carName = vehicleNames[issue.car] || issue.car;
                  return (
                    <div
                      key={`ci-${issue.entry_date}-${issue.car}-${idx}`}
                      style={{
                        background: '#F9F9FB',
                        border: '1px solid rgba(0, 0, 0, 0.07)',
                        borderRadius: '14px',
                        padding: '14px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 700, color: IOS_THEME.textPrimary }}>
                            {formatDateLabel(issue.entry_date)}
                          </span>
                          <span style={{
                            fontSize: '11.5px',
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: '6px',
                            background: 'rgba(0, 113, 227, 0.10)',
                            color: '#0071E3',
                          }}>
                            {carName}
                          </span>
                        </div>
                        <div style={{ fontSize: '12.5px', color: IOS_THEME.textSecondary }}>
                          Zatwierdzony stan z kursu: <b style={{ color: IOS_THEME.textPrimary }}>{Number(issue.expected_end_km).toLocaleString('pl-PL')} km</b>
                          {' · '}
                          Wpis w kosztach: <span style={{ color: '#EF4444', fontWeight: 600 }}>{issue.actual_end_km || 'brak (null)'}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onNavigateToIssue(issue.entry_date, issue.car)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: '#0071E3',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '10px',
                          padding: '8px 14px',
                          fontSize: '12.5px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          boxShadow: '0 2px 8px rgba(0, 113, 227, 0.25)',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        Przejdź do tego dnia <ChevronRight size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section: Meaningful Meter Issues */}
          {meterIssues.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: IOS_THEME.textPrimary, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  Problemy z odczytami liczników
                </span>
                <span style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: '#EF4444',
                  fontSize: '11px',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: '10px',
                }}>
                  {meterIssues.length}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {meterIssues.map((issue, idx) => {
                  const mName = meterNames[issue.meter] || issue.meter;
                  return (
                    <div
                      key={`mi-${issue.entry_date}-${issue.meter}-${idx}`}
                      style={{
                        background: '#F9F9FB',
                        border: '1px solid rgba(0, 0, 0, 0.07)',
                        borderRadius: '14px',
                        padding: '14px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 700, color: IOS_THEME.textPrimary }}>
                            {formatDateLabel(issue.entry_date)}
                          </span>
                          <span style={{ fontSize: '11.5px', fontWeight: 700, padding: '2px 7px', borderRadius: '6px', background: 'rgba(0, 0, 0, 0.06)', color: IOS_THEME.textPrimary }}>
                            {mName}
                          </span>
                        </div>
                        <div style={{ fontSize: '12.5px', color: IOS_THEME.textSecondary }}>
                          Wpisana wartość: <b style={{ color: '#EF4444' }}>{issue.raw}</b>
                          {issue.previous_reading && (
                            <> (poprzedni stan: {issue.previous_reading})</>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onNavigateToIssue(issue.entry_date, issue.meter)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: '#0071E3',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '10px',
                          padding: '8px 14px',
                          fontSize: '12.5px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          boxShadow: '0 2px 8px rgba(0, 113, 227, 0.25)',
                        }}
                      >
                        Przejdź do tego dnia <ChevronRight size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '16px 24px',
          borderTop: `1px solid ${IOS_THEME.border}`,
          background: '#FBFBFC',
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#FFFFFF',
              border: `1px solid ${IOS_THEME.border}`,
              borderRadius: '10px',
              padding: '8px 18px',
              fontSize: '13px',
              fontWeight: 600,
              color: IOS_THEME.textPrimary,
              cursor: 'pointer',
            }}
          >
            {t('common.close', 'Zamknij')}
          </button>
        </div>
      </div>
    </div>
  );
}

const COSTS_CSS = `
.costs-view-tabs {
  display: flex !important;
  gap: 3px !important;
  padding: 3px !important;
  border: 1px solid rgba(0, 0, 0, 0.06) !important;
  border-radius: 12px !important;
  background: rgba(120, 120, 128, 0.10) !important;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.04) !important;
}
.costs-view-tab {
  min-height: 32px !important;
  padding: 5px 16px !important;
  border: 0 !important;
  border-radius: 9px !important;
  background: transparent !important;
  color: #6E6E73 !important;
  font-family: inherit !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  cursor: pointer !important;
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1) !important;
}
.costs-view-tab:hover {
  background: rgba(255, 255, 255, 0.5) !important;
  color: #1D1D1F !important;
}
.costs-view-tab.active {
  background: #FFFFFF !important;
  color: #1D1D1F !important;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04) !important;
  font-weight: 700 !important;
}
.performance-layout {
  display: grid;
  gap: 16px;
  width: 100%;
  min-width: 0;
}
.performance-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(244px, 272px);
  grid-template-areas: "table summary";
  gap: 16px;
  align-items: start;
  min-width: 0;
}
.performance-table-card { grid-area: table; }
.performance-summary {
  grid-area: summary;
  position: sticky;
  top: 16px;
}
.performance-kpi-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 6px;
}
.performance-kpi-tile {
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid rgba(15, 23, 42, 0.06);
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.025);
}
.performance-kpi-tile.is-featured {
  border-color: rgba(0, 121, 107, 0.18);
  background: linear-gradient(145deg, rgba(0, 121, 107, 0.12), rgba(0, 121, 107, 0.04));
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.5);
}
.performance-table-scroll {
  overflow-x: hidden;
  overflow-y: auto;
  max-height: min(68dvh, 760px);
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
.performance-data-table { table-layout: fixed; min-width: 0; }
.performance-col-date { width: 5.4%; }
.performance-col-zd1-kg,
.performance-col-zd2-kg,
.performance-col-washers { width: 7.2%; }
.performance-col-total-kg { width: 6%; }
.performance-col-production { width: 5.6%; }
.performance-col-throughput { width: 7.7%; }
.performance-col-zd1-hours,
.performance-col-zd2-hours { width: 6.8%; }
.performance-col-driver-hours { width: 7.2%; }
.performance-col-total-hours { width: 5.7%; }
.performance-col-zd1-efficiency { width: 7.2%; }
.performance-col-zd2-efficiency,
.performance-col-total-efficiency { width: 10%; }
.performance-data-table thead th {
  padding-left: 3px !important;
  padding-right: 3px !important;
  white-space: normal !important;
  overflow-wrap: anywhere;
  line-height: 1.15;
}
.performance-data-table tbody td,
.performance-data-table tfoot td {
  padding-left: 3px !important;
  padding-right: 3px !important;
}
.performance-data-table .costs-inp {
  min-width: 0;
  box-sizing: border-box;
  padding-left: 2px !important;
  padding-right: 2px !important;
}
.costs-table thead th.performance-throughput-head {
  white-space: normal;
  line-height: 1.2;
}
.performance-insights-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.65fr);
  gap: 16px;
  align-items: start;
}
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
@media (max-width: 1380px) {
  .performance-workspace {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: "summary" "table";
  }
  .performance-summary { position: static; }
  .performance-kpi-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 980px) {
  .performance-insights-grid { grid-template-columns: 1fr; }
  .performance-table-scroll { max-height: 66dvh; }
}
@media (max-width: 760px) {
  .performance-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 480px) {
  .performance-kpi-grid { grid-template-columns: 1fr; }
}
`;
