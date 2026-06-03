import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { toastError, toastSuccess } from '../lib/toast';
import { Droplet, Zap, Flame, Truck, Users, Save, Sigma, Settings, Scale, Package, CalendarDays, Download } from 'lucide-react';
import { isHoliday } from '../utils/holidays';
import * as XLSX from 'xlsx';

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

const MONTHS_PL = ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec","Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];
const WEEKDAYS_PL = ["Nd","Pn","Wt","Śr","Cz","Pt","So"];

const FMT = (num) => typeof num === 'number' && isFinite(num) ? num.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---';
const FMT0 = (num) => typeof num === 'number' && isFinite(num) ? num.toLocaleString('pl-PL', { maximumFractionDigits: 0 }) : '---';
const FMT1 = (num) => typeof num === 'number' && isFinite(num) ? num.toLocaleString('pl-PL', { maximumFractionDigits: 1 }) : '---';
const FMT3 = (num) => typeof num === 'number' && isFinite(num) ? num.toLocaleString('pl-PL', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '---';

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
const PROGI_LS_KEY = 'lebuser_progi_v1'; // cache lokalny (szybki start / offline)
const PROGI_DB_KEY = 'performance_progi'; // klucz w tabeli app_settings (źródło prawdy, wspólne dla wszystkich)
// Domknij surowy obiekt progów domyślnymi (odporne na braki pól / starszy kształt)
const normalizeProgi = (p) => {
  if (!(p?.ZD1 && p?.ZD2 && p?.WSP)) return null;
  return {
    ZD1: { ...PROGI_DEFAULT.ZD1, ...p.ZD1 },
    ZD2: { ...PROGI_DEFAULT.ZD2, ...p.ZD2 },
    WSP: { ...PROGI_DEFAULT.WSP, ...p.WSP },
  };
};
// Wczytaj progi z cache localStorage; DB nadpisze je po zalogowaniu
const loadProgi = () => {
  try {
    const p = normalizeProgi(JSON.parse(localStorage.getItem(PROGI_LS_KEY)));
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
// Pasma wydajności: id, etykieta, kolor + granice przedziału od/do (klucze w progach; null = 0 / ∞)
const PERF_BANDS = [
  { id: 'slaba',   label: 'Słaba',        c: EFF_COLORS.slaba,   from: null,      to: 'slaba'   },
  { id: 'srednia', label: 'Średnia',      c: EFF_COLORS.srednia, from: 'slaba',   to: 'srednia' },
  { id: 'dobra',   label: 'Dobra',        c: EFF_COLORS.dobra,   from: 'srednia', to: 'dobra'   },
  { id: 'bdb',     label: 'Bardzo dobra', c: EFF_COLORS.bdb,     from: 'dobra',   to: null      },
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

export default function CostsView() {
  const { isAdmin } = useAuth();

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
  const [progi, setProgi] = useState(loadProgi); // edytowalne progi wydajności (kg/rbh) — wspólne (app_settings)
  const updateProgi = useCallback(async (next) => {
    setProgi(next);
    try { localStorage.setItem(PROGI_LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    const { error } = await supabase.from('app_settings')
      .upsert({ key: PROGI_DB_KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) toastError('Nie udało się zapisać progów');
  }, []);

  const [settings, setSettings] = useState({});
  const [dailyData, setDailyData] = useState({});
  const [timelineStats, setTimelineStats] = useState({});
  const [laborHours, setLaborHours] = useState({}); // dateStr → łączne godziny grafiku (do kosztu pracownika)
  const [prevReadings, setPrevReadings] = useState({}); // last meter readings before this month (for day-1 baseline)
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

  const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
  const monthKeyRef = useRef(monthKey);
  useEffect(() => { monthKeyRef.current = monthKey; }, [monthKey]);

  const fetchData = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const daysInMonth = new Date(year, month, 0).getDate();
    const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`;
    const dateTo = `${year}-${String(month).padStart(2, '0')}-${daysInMonth}`;

    const [
      { data: sets },
      { data: costs },
      { data: timeline },
      { data: prevRows },
      { data: emps }
    ] = await Promise.all([
      supabase.from('cost_settings').select('*').eq('month_key', monthKey).single(),
      supabase.from('daily_costs').select('*').gte('entry_date', dateFrom).lte('entry_date', dateTo),
      supabase.from('timeline_entries').select('entry_date, role, employee_id, hour').gte('entry_date', dateFrom).lte('entry_date', dateTo),
      supabase.from('daily_costs').select('*').lt('entry_date', dateFrom).order('entry_date', { ascending: false }).limit(150),
      supabase.from('employees').select('id, group_name, default_start')
    ]);

    // Grafik miesiąca — do ustalenia godziny startu każdej osoby w danym dniu (dla przerw)
    const { data: sched } = await supabase
      .from('schedule_entries')
      .select('employee_id, day, value')
      .eq('year', year).eq('month', month);

    // Stawki: jeśli miesiąc nie ma własnych, dziedzicz z ostatniego ZAPISANEGO wcześniejszego miesiąca.
    // Domyślne z kodu tylko gdy nie ma żadnej historii.
    if (sets) {
      setSettings(sets);
    } else {
      const { data: prevSet } = await supabase
        .from('cost_settings').select('*')
        .lt('month_key', monthKey).order('month_key', { ascending: false }).limit(1).maybeSingle();
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

    setLoading(false);
  }, [currentDate, monthKey, isAdmin]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Progi wydajności są globalne — wczytaj z app_settings (źródło prawdy), zsynchronizuj cache
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    (async () => {
      const { data } = await supabase.from('app_settings').select('value').eq('key', PROGI_DB_KEY).maybeSingle();
      const p = data?.value ? normalizeProgi(data.value) : null;
      if (alive && p) {
        setProgi(p);
        try { localStorage.setItem(PROGI_LS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
      }
    })();
    return () => { alive = false; };
  }, [isAdmin]);

  // Auto-zapis z debounce — zapisuje tylko „brudne" dni i ewentualnie stawki
  const flushSave = useCallback(async () => {
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
        const { error } = await supabase.from('cost_settings')
          .upsert({ ...settingsRef.current, month_key: setKey, updated_at: new Date().toISOString() }, { onConflict: 'month_key' });
        if (error) throw error;
      }
      const rows = days
        .map(ds => dailyDataRef.current[ds])
        .filter(d => d && Object.keys(d).length > 1)
        .map(d => ({ ...d, updated_at: new Date().toISOString() }));
      if (rows.length) {
        const { error } = await supabase.from('daily_costs').upsert(rows, { onConflict: 'entry_date' });
        if (error) throw error;
      }
      setAutoSave('saved');
      setTimeout(() => setAutoSave(s => (s === 'saved' ? 'idle' : s)), 1500);
    } catch {
      // przywróć „brudne" wpisy, żeby ponowić zapis i pokaż błąd zamiast fałszywego „Zapisano"
      days.forEach(d => dirtyDays.current.add(d));
      if (setDirty) { dirtySettings.current = true; dirtySettingsMonthKey.current = setKey; }
      setAutoSave('idle');
      toastError('Nie udało się zapisać — zmiany niezapisane');
    }
  }, []);

  const scheduleAutoSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { flushSave(); }, 700);
  }, [flushSave]);

  // Zapisz oczekujące zmiany przy zmianie miesiąca / odmontowaniu
  useEffect(() => () => { flushSave(); }, [monthKey, flushSave]);

  const handleCostChange = (dateStr, field, value) => {
    let parsed = value;
    if (value === '') {
      parsed = null;
    } else if (field.endsWith('_end')) {
      parsed = value.trim(); // preserve leading zeros
    } else {
      parsed = parseFloat(value.replace(',', '.'));
    }
    
    setDailyData(prev => ({
      ...prev,
      [dateStr]: { ...prev[dateStr], entry_date: dateStr, [field]: parsed }
    }));
    dirtyDays.current.add(dateStr);
    scheduleAutoSave();
  };

  const handleSettingChange = (field, value) => {
    const num = value === '' ? null : parseFloat(value);
    setSettings(prev => ({ ...prev, [field]: num }));
    dirtySettings.current = true;
    dirtySettingsMonthKey.current = monthKey;
    scheduleAutoSave();
  };

  const saveAll = async () => {
    setSaving(true);
    const { error: setErr } = await supabase.from('cost_settings').upsert({
      ...settings, month_key: monthKey, updated_at: new Date().toISOString()
    }, { onConflict: 'month_key' });
    const toSave = Object.values(dailyData).filter(d => Object.keys(d).length > 1);
    let dayErr = null;
    if (toSave.length > 0) {
      ({ error: dayErr } = await supabase.from('daily_costs').upsert(
        toSave.map(d => ({ ...d, updated_at: new Date().toISOString() })),
        { onConflict: 'entry_date' }
      ));
    }
    setSaving(false);
    if (setErr || dayErr) { toastError('Nie udało się zapisać'); return; }
    toastSuccess('Zapisano');
    fetchData();
  };

  if (!isAdmin) return <div style={{ padding: '40px', textAlign: 'center' }}>Brak dostępu.</div>;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
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
    const other_cost = d.other_costs || 0;
    const total_cost = transportCost + elec_cost + gas_prod_cost + gas_heat_cost + water_cost + worker_cost + other_cost;
    const ton = (d.ton_zd1 || 0) + (d.ton_zd2 || 0) + (d.ton_pralki || 0);
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
    acc.zd1 += dt.ton_zd1 || 0;
    acc.zd2 += dt.ton_zd2 || 0;
    acc.pralki += dt.ton_pralki || 0;
    acc.kg += (dt.ton_zd1 || 0) + (dt.ton_zd2 || 0) + (dt.ton_pralki || 0);
    acc.hZd1 += ts.ZD1?.hrs || 0;
    acc.hZd2 += ts.ZD2?.hrs || 0;
    acc.hKier += ts.Kierowcy?.hrs || 0;
    acc.h += (ts.ZD1?.hrs || 0) + (ts.ZD2?.hrs || 0) + (ts.Kierowcy?.hrs || 0);
    return acc;
  }, { zd1: 0, zd2: 0, pralki: 0, kg: 0, hZd1: 0, hZd2: 0, hKier: 0, h: 0 });

  const plnPerKg = perfTotals.kg > 0 ? monthlyTotals.total / perfTotals.kg : 0;
  const avgPerDay = monthlyTotals.total / daysInMonth;

  // Rozbicie kosztu aut: suma km per auto → kwota (od sumy km)
  const fuelPrice = settings.fuel_price || 0;
  const carBreakdown = [
    { name: 'Fiat',  km: monthlyTotals.kmFiat,  cost: monthlyTotals.kmFiat  * (settings.fiat_l_100km  || 0) / 100 * fuelPrice },
    { name: 'Isuzu', km: monthlyTotals.kmIsuzu, cost: monthlyTotals.kmIsuzu * (settings.isuzu_l_100km || 0) / 100 * fuelPrice },
    { name: 'Merc.', km: monthlyTotals.kmMerc,  cost: monthlyTotals.kmMerc  * (settings.merc_l_100km  || 0) / 100 * fuelPrice },
    { name: 'Iveco', km: monthlyTotals.kmIveco, cost: monthlyTotals.kmIveco * (settings.iveco_l_100km || 0) / 100 * fuelPrice },
  ];
  const dailyTotals = days.map((d, idx) => calcDay(d, idx).total_cost);

  // Eksport do Excela (analogicznie do Grafiku) — arkusz Koszty + arkusz Wydajność
  const exportToExcel = () => {
    const r2 = (n) => Math.round((n || 0) * 100) / 100;
    const dayLabel = (dStr) => { const d = new Date(dStr); return `${String(d.getDate()).padStart(2, '0')}.${String(month).padStart(2, '0')} ${WEEKDAYS_PL[d.getDay()]}`; };

    // Arkusz 1: Koszty
    const costsHead = ['Data', 'Fiat (km)', 'Isuzu (km)', 'Merc. (km)', 'Iveco (km)', 'Koszt auta (zł)', 'Prąd (kWh)', 'Koszt prąd (zł)', 'Gaz prod. (m³)', 'Koszt prod. (zł)', 'Gaz grz. (m³)', 'Koszt grz. (zł)', 'Woda (m³)', 'Koszt woda (zł)', 'Ludzie (zł)', 'Inne (zł)', 'SUMA (zł)', 'zł/kg'];
    const costsRows = days.map((dStr, idx) => {
      const c = calcDay(dStr, idx);
      return [dayLabel(dStr), r2(c.fiat_km), r2(c.isuzu_km), r2(c.merc_km), r2(c.iveco_km), r2(c.transportCost),
        r2(c.elec_usage), r2(c.elec_cost), r2(c.gas_prod_usage), r2(c.gas_prod_cost), r2(c.gas_heat_usage), r2(c.gas_heat_cost),
        r2(c.water_usage), r2(c.water_cost), r2(c.worker_cost), r2(c.other_cost), r2(c.total_cost), c.pln_kg > 0 ? r2(c.pln_kg) : ''];
    });
    const t = monthlyTotals;
    const costsTotal = ['SUMA', r2(t.kmFiat), r2(t.kmIsuzu), r2(t.kmMerc), r2(t.kmIveco), r2(t.transport), r2(t.kWh), r2(t.elec),
      r2(t.m3GasProd), r2(t.gasProd), r2(t.m3GasHeat), r2(t.gasHeat), r2(t.m3Water), r2(t.water), r2(t.workers), r2(t.other), r2(t.total), perfTotals.kg > 0 ? r2(t.total / perfTotals.kg) : ''];
    const wsCosts = XLSX.utils.aoa_to_sheet([[`Koszty — ${MONTHS_PL[month - 1]} ${year}`], [], costsHead, ...costsRows, [], costsTotal]);

    // Arkusz 2: Wydajność
    const perfHead = ['Data', 'ZD1 (kg)', 'ZD2 (kg)', 'Pralki (kg)', 'Σ KG', 'ZD1 (h)', 'ZD2 (h)', 'Kier. (h)', 'Σ H', 'ZD1 kg/h', 'ZD2+Pr. kg/h', 'Ogółem kg/h'];
    const perfRows = days.map((dStr) => {
      const dt = dailyData[dStr] || {};
      const ts = timelineStats[dStr]?.roles || {};
      const kgZd1 = dt.ton_zd1 || 0, kgZd2pr = (dt.ton_zd2 || 0) + (dt.ton_pralki || 0);
      const tSuma = kgZd1 + kgZd2pr;
      const hZd1 = ts.ZD1?.hrs || 0, hZd2 = ts.ZD2?.hrs || 0, hKier = ts.Kierowcy?.hrs || 0;
      const hSuma = hZd1 + hZd2 + hKier;
      return [dayLabel(dStr), dt.ton_zd1 || '', dt.ton_zd2 || '', dt.ton_pralki || '', tSuma || '',
        hZd1 ? r2(hZd1) : '', hZd2 ? r2(hZd2) : '', hKier ? r2(hKier) : '', hSuma ? r2(hSuma) : '',
        hZd1 > 0 ? r2(kgZd1 / hZd1) : '', hZd2 > 0 ? r2(kgZd2pr / hZd2) : '', hSuma > 0 ? r2(tSuma / hSuma) : ''];
    });
    const wsPerf = XLSX.utils.aoa_to_sheet([[`Wydajność — ${MONTHS_PL[month - 1]} ${year}`], [], perfHead, ...perfRows]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsCosts, 'Koszty');
    XLSX.utils.book_append_sheet(wb, wsPerf, 'Wydajność');
    XLSX.writeFile(wb, `Koszty_${MONTHS_PL[month - 1]}_${year}.xlsx`);
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
            {MONTHS_PL[month - 1]} {year}
          </div>
          <button onClick={() => setCurrentDate(new Date(year, month, 1))} style={navBtnStyle}>›</button>
        </div>

        <div style={{ display: 'flex', background: '#EEEEEE', padding: '2px', borderRadius: '10px', gap: '2px' }}>
          {[['overview','Przegląd'],['entry','Wprowadzanie'],['performance','Wydajność']].map(([key, label]) => (
            <button key={key} onClick={() => setActiveTab(key)}
              style={{ ...segmentBtnStyle, color: activeTab === key ? IOS_THEME.textPrimary : IOS_THEME.textSecondary, background: activeTab === key ? '#FFFFFF' : 'transparent', boxShadow: activeTab === key ? '0 2px 8px rgba(0,0,0,0.1)' : 'none' }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={exportToExcel} title="Eksportuj do Excela" style={{ ...navBtnStyle, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: IOS_THEME.textSecondary }}>
            <Download size={16}/> Excel
          </button>
          <button onClick={() => setShowRates(v => !v)} title="Stawki" style={{ ...navBtnStyle, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: showRates ? IOS_THEME.accent : IOS_THEME.textSecondary }}>
            <Settings size={16}/> Stawki
          </button>
          <button onClick={saveAll} disabled={saving} className="costs-save-btn" title="Zapisz wszystko teraz" style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: autoSave === 'saved' ? '#34C759' : autoSave === 'saving' ? IOS_THEME.warning : IOS_THEME.accent,
            color: '#fff', border: 'none', padding: '10px 22px', borderRadius: '12px', fontWeight: 600, fontSize: '14px',
            letterSpacing: '0.2px', boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
            cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1, transition: 'background 0.2s'
          }}>
            <Save size={18}/> {saving ? 'Zapisuję...' : autoSave === 'saving' ? 'Auto-zapis…' : autoSave === 'saved' ? 'Zapisano ✓' : 'Zapisz'}
          </button>
        </div>
      </div>

      {/* RATES PANEL */}
      {showRates && <RatesPanel settings={settings} onChange={handleSettingChange} />}

      {loading ? (
        <div style={{ ...cardStyle, padding: '60px', textAlign: 'center', color: IOS_THEME.textSecondary, fontSize: '15px' }}>Ładowanie danych finansowych...</div>
      ) : (
        <>
          {activeTab === 'overview' && (
            <OverviewTab totals={monthlyTotals} plnPerKg={plnPerKg} ton={perfTotals.kg} avgPerDay={avgPerDay} dailyTotals={dailyTotals} days={days} carBreakdown={carBreakdown} />
          )}

          {activeTab === 'entry' && (
            <EntryGrid days={days} month={month} dailyData={dailyData} calcDay={calcDay} totals={monthlyTotals} onChange={handleCostChange} />
          )}

          {activeTab === 'performance' && (
            <PerformanceGrid days={days} dailyData={dailyData} timelineStats={timelineStats} totals={perfTotals} onChange={handleCostChange} progi={progi} onProgiChange={updateProgi} />
          )}
        </>
      )}
    </div>
  );
}

/* ───────────── OVERVIEW (dashboard) ───────────── */
function OverviewTab({ totals, plnPerKg, ton, avgPerDay, dailyTotals, days, carBreakdown = [] }) {
  const cats = [
    { name: 'Transport', color: CAT.transport, value: totals.transport, icon: <Truck size={16}/> },
    { name: 'Energia', color: CAT.elec, value: totals.elec, icon: <Zap size={16}/> },
    { name: 'Gaz', color: CAT.gas, value: totals.gas, icon: <Flame size={16}/> },
    { name: 'Woda', color: CAT.water, value: totals.water, icon: <Droplet size={16}/> },
    { name: 'Pracownicy', color: CAT.workers, value: totals.workers, icon: <Users size={16}/> },
    { name: 'Inne', color: CAT.other, value: totals.other, icon: <Sigma size={16}/> },
  ].sort((a, b) => b.value - a.value);
  const sum = totals.total || 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* KPI HERO */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <KpiCard label="Koszty razem" value={FMT(totals.total)} unit="zł" icon={<Sigma size={22}/>} color={IOS_THEME.accent} hero />
        <KpiCard label="Koszt na kg" value={plnPerKg > 0 ? FMT3(plnPerKg) : '—'} unit="zł/kg" icon={<Scale size={22}/>} color={CAT.transport} />
        <KpiCard label="Tonaż" value={ton > 0 ? FMT0(ton) : '—'} unit="kg" icon={<Package size={22}/>} color={CAT.workers} />
        <KpiCard label="Średnio / dzień" value={FMT(avgPerDay)} unit="zł" icon={<CalendarDays size={22}/>} color={CAT.water} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {/* COST STRUCTURE */}
        <div style={cardStyle}>
          <div style={cardTitleStyle}>Struktura kosztów</div>
          {/* stacked bar */}
          <div style={{ display: 'flex', height: '14px', borderRadius: '7px', overflow: 'hidden', margin: '4px 0 20px' }}>
            {cats.filter(c => c.value > 0).map(c => (
              <div key={c.name} title={`${c.name}: ${FMT(c.value)} zł`} style={{ width: `${(c.value / sum) * 100}%`, background: c.color }} />
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
                      <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{FMT(c.value)} <span style={{ color: IOS_THEME.textSecondary, fontWeight: 500 }}>zł · {pct.toFixed(1)}%</span></span>
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
          <div style={{ ...cardTitleStyle, display: 'flex', alignItems: 'center', gap: '8px' }}><Truck size={16}/> Koszt aut — km</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '12px', fontSize: '11px', fontWeight: 700, color: IOS_THEME.textSecondary, textTransform: 'uppercase', letterSpacing: '0.4px', padding: '0 4px 8px' }}>
              <span>Samochód</span><span style={{ textAlign: 'right' }}>Suma km</span><span style={{ textAlign: 'right', minWidth: '90px' }}>Kwota</span>
            </div>
            {carBreakdown.map((car, i) => (
              <div key={car.name} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '12px', alignItems: 'center', padding: '10px 4px', borderTop: i === 0 ? 'none' : `1px solid ${IOS_THEME.border}`, fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ display: 'flex', width: '26px', height: '26px', borderRadius: '7px', background: tint(CAT.transport, 0.12), color: CAT.transport, alignItems: 'center', justifyContent: 'center' }}><Truck size={14}/></span>
                  {car.name}
                </span>
                <span style={{ textAlign: 'right', fontSize: '14px', fontWeight: 600, color: IOS_THEME.textSecondary }}>{car.km > 0 ? `${FMT0(car.km)} km` : '—'}</span>
                <span style={{ textAlign: 'right', minWidth: '90px', fontSize: '14px', fontWeight: 700, color: CAT.transport }}>{car.cost > 0 ? `${FMT(car.cost)} zł` : '—'}</span>
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '12px', alignItems: 'center', padding: '12px 4px 2px', borderTop: `2px solid ${IOS_THEME.border}`, fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ fontSize: '13px', fontWeight: 800 }}>Razem</span>
              <span style={{ textAlign: 'right', fontSize: '14px', fontWeight: 700, color: IOS_THEME.textSecondary }}>{FMT0(carBreakdown.reduce((s, c) => s + c.km, 0))} km</span>
              <span style={{ textAlign: 'right', minWidth: '90px', fontSize: '15px', fontWeight: 800, color: CAT.transport }}>{FMT(carBreakdown.reduce((s, c) => s + c.cost, 0))} zł</span>
            </div>
          </div>
        </div>

        {/* DAILY TREND */}
        <div style={cardStyle}>
          <div style={cardTitleStyle}>Koszt dzienny</div>
          <TrendChart data={dailyTotals} days={days} avg={avgPerDay} />
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, unit, icon, color, hero }) {
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
    </div>
  );
}

function TrendChart({ data, days, avg }) {
  const W = 600, H = 170, P = 10;
  const n = data.length;
  const max = Math.max(...data, 1);
  const x = (i) => P + (n <= 1 ? 0 : (i / (n - 1)) * (W - 2 * P));
  const y = (v) => H - P - (v / max) * (H - 2 * P);
  const linePts = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const areaPts = `${x(0).toFixed(1)},${(H - P).toFixed(1)} ${linePts} ${x(n - 1).toFixed(1)},${(H - P).toFixed(1)}`;
  const avgY = y(avg);
  const maxIdx = data.indexOf(Math.max(...data));

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
        <span style={{ color: IOS_THEME.warning, fontWeight: 600 }}>szczyt {FMT(data[maxIdx] || 0)} zł</span>
        <span>śr. {FMT(avg)} zł</span>
        <span>{days.length ? new Date(days[days.length - 1]).getDate() + '.' + String(new Date(days[days.length - 1]).getMonth() + 1).padStart(2, '0') : ''}</span>
      </div>
    </div>
  );
}

/* ───────────── RATES PANEL ───────────── */
function RatesPanel({ settings, onChange }) {
  const groups = [
    { title: 'Transport', color: CAT.transport, fields: [
      ['fiat_l_100km', 'Fiat L/100km'], ['isuzu_l_100km', 'Isuzu L/100km'], ['merc_l_100km', 'Merc. L/100km'],
      ['iveco_l_100km', 'Iveco L/100km'], ['fuel_price', 'Paliwo zł/l'],
    ]},
    { title: 'Energia', color: CAT.elec, fields: [
      ['elec_multiplier', 'Mnożnik licznika'], ['elec_price_kwh', 'Stawka zł/kWh'], ['elec_fixed_monthly', 'Stała zł/mies.'],
    ]},
    { title: 'Gaz produkcyjny', color: CAT.gas, fields: [
      ['gas_prod_price_m3', 'Stawka zł/m³'], ['gas_prod_fixed_daily', 'Abonament zł/dzień'],
    ]},
    { title: 'Gaz grzewczy', color: '#4A148C', fields: [
      ['gas_heat_price_m3', 'Stawka zł/m³'], ['gas_heat_fixed_monthly', 'Abonament zł/mies.'],
    ]},
    { title: 'Woda', color: CAT.water, fields: [
      ['water_price_m3', 'Stawka zł/m³'], ['water_fixed_monthly', 'Abonament zł/mies.'],
    ]},
    { title: 'Pracownicy', color: CAT.workers, fields: [
      ['worker_hourly_rate', 'Stawka zł/rbh'],
    ]},
  ];
  return (
    <div style={cardStyle}>
      <div style={{ ...cardTitleStyle, display: 'flex', alignItems: 'center', gap: '8px' }}><Settings size={16}/> Stawki — {' '}<span style={{ fontWeight: 500, color: IOS_THEME.textSecondary, fontSize: '13px' }}>edytuj i kliknij „Zapisz"</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '16px', marginTop: '4px' }}>
        {groups.map(g => (
          <div key={g.title} style={{ borderLeft: `3px solid ${g.color}`, paddingLeft: '12px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: g.color, marginBottom: '10px' }}>{g.title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {g.fields.map(([field, label]) => (
                <label key={field} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', fontSize: '13px' }}>
                  <span style={{ color: IOS_THEME.textSecondary }}>{label}</span>
                  <input type="number" value={settings[field] ?? ''} onChange={(e) => onChange(field, e.target.value)} className="costs-inp" style={{ ...rateInpStyle }} />
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
function EntryGrid({ days, month, dailyData, calcDay, totals, onChange }) {
  // each meter = ONE daily reading stored in <base>_end; consumption derived in calcDay
  const meterTh = (icon, label) => (
    <th className="sticky-head" style={newThStyle}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>{icon} {label}</span>
        <span style={{ fontSize: '9px', fontWeight: 500, color: IOS_THEME.textSecondary, opacity: 0.7 }}>licznik</span>
      </div>
    </th>
  );
  const reading = (dStr, dt, base, cons, unit) => (
    <td style={newTdStyle}>
      <input type="text" inputMode="numeric" value={dt[`${base}_end`] ?? ''} onChange={(e) => onChange(dStr, `${base}_end`, e.target.value)} className="costs-inp" style={newInpStyle}/>
      <div style={{ fontSize: '10px', fontWeight: 700, color: IOS_THEME.textSecondary, textAlign: 'center', marginTop: '3px', minHeight: '12px', fontVariantNumeric: 'tabular-nums' }}>
        {cons > 0 ? <>{unit === 'm³' ? FMT1(cons) : FMT0(cons)} <span style={{ fontWeight: 500 }}>{unit}</span></> : ''}
      </div>
    </td>
  );
  const footMeter = (val, unit) => (
    <td style={{ ...footTdStyle, textAlign: 'center', color: IOS_THEME.textSecondary }}>
      {val > 0 ? <>{unit === 'm³' ? FMT1(val) : FMT0(val)} <span style={{ fontWeight: 500, fontSize: '10px' }}>{unit}</span></> : ''}
    </td>
  );
  return (
    <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', borderBottom: `1px solid ${IOS_THEME.border}`, fontSize: '12.5px', color: IOS_THEME.textSecondary, background: '#F9F9FB' }}>
        💡 Wpisuj <b style={{ color: IOS_THEME.textPrimary }}>stan licznika</b> na koniec dnia (auta — przebieg, media — odczyt). Zużycie i koszt liczą się automatycznie z różnicy względem poprzedniego dnia.
      </div>
      <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
        <table className="costs-table" style={{ width: '100%', minWidth: '1180px', borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr>
              <th className="sticky-col sticky-head" style={newThStyle}>Data</th>
              {meterTh(<Truck size={13}/>, 'Fiat')}
              {meterTh(<Truck size={13}/>, 'Isuzu')}
              {meterTh(<Truck size={13}/>, 'Merc.')}
              {meterTh(<Truck size={13}/>, 'Iveco')}
              <th className="sticky-head" style={{ ...newThStyle, color: CAT.transport, background: opaqueTint(CAT.transport, 0.13) }}><span>Koszt</span><br/><span>Auta</span></th>
              {meterTh(<Zap size={13}/>, 'Prąd')}
              <th className="sticky-head" style={{ ...newThStyle, color: CAT.elec, background: opaqueTint(CAT.elec, 0.13) }}><span>Koszt</span><br/><span>Prąd</span></th>
              {meterTh(<Flame size={13}/>, 'Gaz prod.')}
              <th className="sticky-head" style={{ ...newThStyle, color: CAT.gas, background: opaqueTint(CAT.gas, 0.13) }}><span>Koszt</span><br/><span>Prod.</span></th>
              {meterTh(<Flame size={13}/>, 'Gaz grz.')}
              <th className="sticky-head" style={{ ...newThStyle, color: '#4A148C', background: opaqueTint('#4A148C', 0.13) }}><span>Koszt</span><br/><span>Grz.</span></th>
              {meterTh(<Droplet size={13}/>, 'Woda')}
              <th className="sticky-head" style={{ ...newThStyle, color: CAT.water, background: opaqueTint(CAT.water, 0.13) }}><span>Koszt</span><br/><span>Woda</span></th>
              <th className="sticky-head" style={{ ...newThStyle, color: CAT.workers, background: opaqueTint(CAT.workers, 0.13) }}>Ludzie</th>
              <th className="sticky-head" style={{ ...newThStyle, color: '#4B5563', background: '#EAECEF' }}>Inne</th>
              <th className="sticky-head" style={{ ...newThStyle, color: IOS_THEME.accent, fontWeight: 800 }}><span>SUMA</span><br/><span style={{ fontSize: '9px', opacity: 0.6, fontWeight: 500 }}>zł/kg</span></th>
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
                  <td className="sticky-col" style={{ ...newTdStyle, fontWeight: 700, background: dateCellBg, color: dateCellColor, textAlign: 'center', minWidth: '52px' }} title={isHol ? isHol.name : ''}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, lineHeight: 1.2 }}>{String(d.getDate()).padStart(2, '0')}</span>
                      <span style={{ fontSize: '10px', fontWeight: 600, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{WEEKDAYS_PL[d.getDay()]}</span>
                    </div>
                  </td>
                  {reading(dStr, dt, 'fiat', c.fiat_km, 'km')}
                  {reading(dStr, dt, 'isuzu', c.isuzu_km, 'km')}
                  {reading(dStr, dt, 'merc', c.merc_km, 'km')}
                  {reading(dStr, dt, 'iveco', c.iveco_km, 'km')}
                  <td style={costCellStyle(CAT.transport)}>
                    <div>{FMT(c.transportCost)}</div>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: CAT.transport, opacity: 0.7, marginTop: '3px', minHeight: '12px' }}>
                      {c.total_km > 0 ? `${FMT0(c.total_km)} km` : (dt.fiat_end !== undefined || dt.isuzu_end !== undefined || dt.merc_end !== undefined || dt.iveco_end !== undefined) ? '0 km' : ''}
                    </div>
                  </td>
                  {reading(dStr, dt, 'elec', c.elec_usage, 'kWh')}
                  <td style={costCellStyle(CAT.elec)}>{FMT(c.elec_cost)}</td>
                  {reading(dStr, dt, 'gas_prod', c.gas_prod_usage, 'm³')}
                  <td style={costCellStyle(CAT.gas)}>{FMT(c.gas_prod_cost)}</td>
                  {reading(dStr, dt, 'gas_heat', c.gas_heat_usage, 'm³')}
                  <td style={costCellStyle('#4A148C')}>{FMT(c.gas_heat_cost)}</td>
                  {reading(dStr, dt, 'water', c.water_usage, 'm³')}
                  <td style={costCellStyle(CAT.water)}>{FMT(c.water_cost)}</td>
                  <td style={costCellStyle(CAT.workers)}>{c.worker_cost > 0 ? FMT(c.worker_cost) : '—'}</td>
                  <td style={{ ...costCellStyle('#6B7280'), background: '#EAECEF' }}><input type="text" inputMode="decimal" value={dt.other_costs ?? ''} onChange={(e) => onChange(dStr, 'other_costs', e.target.value)} className="costs-inp" style={{ ...newInpStyle, background: 'transparent', textAlign: 'center' }}/></td>
                  <td style={{ ...newTdStyle, fontWeight: 800, background: 'rgba(37,99,235,0.10)', color: IOS_THEME.accent, textAlign: 'center', borderLeft: '2px solid rgba(37,99,235,0.2)', whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: '14px' }}>{FMT(c.total_cost)}</div>
                    <div style={{ fontSize: '10px', fontWeight: 600, opacity: 0.65, marginTop: '3px', minHeight: '12px' }}>
                      {c.pln_kg > 0 ? <>{FMT(c.pln_kg)} <span style={{ fontWeight: 500 }}>zł/kg</span></> : ''}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="costs-foot">
              <td className="sticky-col" style={{ ...footTdStyle, textAlign: 'left', background: '#1E293B', color: '#FFFFFF' }}>SUMA</td>
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
              <td style={{ ...footTdStyle, color: CAT.workers, background: opaqueTint(CAT.workers, 0.16), textAlign: 'center' }}>{FMT(totals.workers)}</td>
              <td style={{ ...footTdStyle, background: '#EAECEF', textAlign: 'center', color: '#4B5563' }}>{FMT(totals.other)}</td>
              <td style={{ ...footTdStyle, background: '#2563EB', color: '#FFFFFF', fontWeight: 900, textAlign: 'center', borderLeft: '2px solid rgba(255,255,255,0.3)' }}>
                <div style={{ fontSize: '15px' }}>{FMT(totals.total)}</div>
                <div style={{ fontSize: '10px', fontWeight: 600, opacity: 0.8, marginTop: '3px' }}>
                  {(() => { const kg = days.reduce((s, dStr) => { const d = dailyData[dStr] || {}; return s + (d.ton_zd1 || 0) + (d.ton_zd2 || 0) + (d.ton_pralki || 0); }, 0); return kg > 0 ? `${FMT(totals.total / kg)} zł/kg` : ''; })()}
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
function ProgInput({ value, onCommit }) {
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
      style={{ width: '58px', textAlign: 'center', padding: '6px 4px', borderRadius: '8px', border: `1px solid ${IOS_THEME.border}`, fontWeight: 700, fontSize: '13px', color: IOS_THEME.textPrimary }}
    />
  );
}

// Edytor JEDNEGO pasma (kliknięty kolor) — przedział od–do dla każdej grupy (ZD1/ZD2/Ogółem)
function ThresholdEditor({ band, progi, onChange, onClose }) {
  const GROUPS = [['ZD1', 'ZD 1'], ['ZD2', 'ZD 2'], ['WSP', 'Ogółem']];
  const def = PERF_BANDS.find(b => b.id === band);
  const isDefault = JSON.stringify(progi) === JSON.stringify(PROGI_DEFAULT);
  if (!def) return null;

  const setVal = (g, k, v) => onChange({ ...progi, [g]: { ...progi[g], [k]: v } });
  const staticBox = (txt) => (
    <span style={{ width: '58px', textAlign: 'center', padding: '6px 4px', borderRadius: '8px', border: `1px solid ${IOS_THEME.border}`, background: '#F1F1F4', color: IOS_THEME.textSecondary, fontWeight: 700, fontSize: '13px' }}>{txt}</span>
  );
  const lbl = (t) => <span style={{ fontSize: '11px', fontWeight: 600, color: IOS_THEME.textSecondary }}>{t}</span>;

  return (
    <div style={{ padding: '14px 18px', borderBottom: `1px solid ${IOS_THEME.border}`, background: '#FFFFFF' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <span style={{ fontWeight: 800, fontSize: '13px', color: IOS_THEME.textPrimary }}>Próg wydajności:</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 11px', borderRadius: '8px', background: def.c.bg, color: def.c.fc, fontWeight: 700, fontSize: '12px' }}>{def.label}</span>
        <span style={{ fontSize: '11px', color: IOS_THEME.textSecondary }}>kg/rbh · format XX.X · kolory na żywo</span>
        <button
          onClick={() => onChange(PROGI_DEFAULT)}
          disabled={isDefault}
          style={{ marginLeft: 'auto', padding: '4px 12px', borderRadius: '8px', border: `1px solid ${IOS_THEME.border}`, background: '#FFFFFF', color: isDefault ? IOS_THEME.textSecondary : IOS_THEME.accent, fontWeight: 700, fontSize: '11px', cursor: isDefault ? 'default' : 'pointer', opacity: isDefault ? 0.5 : 1 }}
        >
          Przywróć domyślne
        </button>
        <button
          onClick={onClose}
          title="Zamknij"
          style={{ width: '26px', height: '26px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', border: `1px solid ${IOS_THEME.border}`, background: '#FFFFFF', color: IOS_THEME.textSecondary, fontWeight: 700, fontSize: '15px', lineHeight: 1, cursor: 'pointer' }}
        >
          ×
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
        {GROUPS.map(([gKey, gLabel]) => (
          <div key={gKey} style={{ border: `1px solid ${IOS_THEME.border}`, borderRadius: '12px', padding: '12px', background: '#FAFAFC', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: '12px', minWidth: '50px', color: IOS_THEME.textPrimary }}>{gLabel}</span>
            {lbl('od')}
            {def.from === null
              ? staticBox('0')
              : <ProgInput key={`${gKey}-from-${progi[gKey][def.from]}`} value={progi[gKey][def.from]} onCommit={(v) => setVal(gKey, def.from, v)} />}
            {lbl('do')}
            {def.to === null
              ? staticBox('∞')
              : <ProgInput key={`${gKey}-to-${progi[gKey][def.to]}`} value={progi[gKey][def.to]} onCommit={(v) => setVal(gKey, def.to, v)} />}
            {lbl('kg/rbh')}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────────── PERFORMANCE GRID ───────────── */
function PerformanceGrid({ days, dailyData, timelineStats, totals, onChange, progi, onProgiChange }) {
  const [editBand, setEditBand] = useState(null); // id klikniętego pasma (kolor) lub null
  const effTd = (val, thr, perPerson) => {
    const c = effStyle(val, thr);
    return (
      <td style={{ ...newTdStyle, textAlign: 'center', background: c ? c.bg : undefined, color: c ? c.fc : IOS_THEME.textSecondary }}>
        <div style={{ fontWeight: 800 }}>{val > 0 ? val.toFixed(1) : '—'}</div>
        <div style={{ fontSize: '10px', fontWeight: 600, opacity: 0.75, minHeight: '12px' }}>{perPerson > 0 ? `${FMT0(perPerson)} kg/os` : ''}</div>
      </td>
    );
  };
  // hours cell with crew (obsada) sub-line
  const hoursTd = (hrs, people, color) => (
    <td style={{ ...newTdStyle, textAlign: 'center', color }}>
      <div style={{ fontWeight: 700 }}>{hrs > 0 ? FMT1(hrs) : '—'}</div>
      <div style={{ fontSize: '10px', fontWeight: 600, color: IOS_THEME.textSecondary, minHeight: '12px' }}>{people > 0 ? `${people} os.` : ''}</div>
    </td>
  );

  const effZd1Avg = totals.hZd1 > 0 ? totals.zd1 / totals.hZd1 : 0;
  const effZd2Avg = totals.hZd2 > 0 ? (totals.zd2 + totals.pralki) / totals.hZd2 : 0;
  const effAllAvg = totals.h > 0 ? totals.kg / totals.h : 0;
  // monthly avg kg/person = mean of daily kg/os (days with crew > 0), like the old sheet
  const osAgg = days.reduce((a, dStr) => {
    const dt = dailyData[dStr] || {};
    const ts = timelineStats[dStr]?.roles || {};
    const kgZd1 = dt.ton_zd1 || 0, kgZd2pr = (dt.ton_zd2 || 0) + (dt.ton_pralki || 0);
    const pZd1 = ts.ZD1?.emp?.size || 0, pZd2 = ts.ZD2?.emp?.size || 0;
    if (pZd1 > 0 && kgZd1 > 0) { a.z1 += kgZd1 / pZd1; a.n1++; }
    if (pZd2 > 0 && kgZd2pr > 0) { a.z2 += kgZd2pr / pZd2; a.n2++; }
    return a;
  }, { z1: 0, n1: 0, z2: 0, n2: 0 });
  const osZd1Avg = osAgg.n1 ? osAgg.z1 / osAgg.n1 : 0;
  const osZd2Avg = osAgg.n2 ? osAgg.z2 / osAgg.n2 : 0;

  return (
    <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
      {/* legend — klik w kolor otwiera edytor TEGO pasma (przedział od–do per grupa) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', padding: '12px 18px', borderBottom: `1px solid ${IOS_THEME.border}`, background: '#F9F9FB', fontSize: '12px' }}>
        <span style={{ fontWeight: 700, color: IOS_THEME.textSecondary }}>Wydajność kg/rbh:</span>
        {PERF_BANDS.map(({ id, label, c }) => {
          const active = editBand === id;
          return (
            <button
              key={id}
              onClick={() => setEditBand(v => (v === id ? null : id))}
              title={`Kliknij, aby ustawić przedział „${label}" (ZD1 / ZD2 / Ogółem)`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 11px', borderRadius: '8px', background: c.bg, color: c.fc, fontWeight: 700, fontSize: '12px', border: `1.5px solid ${active ? c.fc : 'transparent'}`, boxShadow: active ? `0 0 0 2px ${c.bg}` : 'none', cursor: 'pointer' }}
            >
              {label}
            </button>
          );
        })}
        <Settings size={13} style={{ color: editBand ? IOS_THEME.accent : IOS_THEME.textSecondary }} />
        <span style={{ color: IOS_THEME.textSecondary, marginLeft: 'auto' }}>kg/h kolorowane · kg/os pod spodem · godziny i obsada z osi czasu</span>
      </div>
      {editBand && <ThresholdEditor band={editBand} progi={progi} onChange={onProgiChange} onClose={() => setEditBand(null)} />}
      <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
        <table className="costs-table" style={{ width: '100%', minWidth: '1000px', borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr>
              <th className="sticky-col sticky-head" style={newThStyle}>Data</th>
              <th className="sticky-head" style={newThStyle}>ZD1 (kg)</th>
              <th className="sticky-head" style={newThStyle}>ZD2 (kg)</th>
              <th className="sticky-head" style={newThStyle}>Pralki (kg)</th>
              <th className="sticky-head" style={{ ...newThStyle, color: CAT.workers, background: opaqueTint(CAT.workers, 0.08) }}>Σ KG</th>
              <th className="sticky-head" style={newThStyle}>ZD1 (h)</th>
              <th className="sticky-head" style={newThStyle}>ZD2 (h)</th>
              <th className="sticky-head" style={newThStyle}>Kier. (h)</th>
              <th className="sticky-head" style={{ ...newThStyle, color: '#1565C0', background: opaqueTint('#1565C0', 0.08) }}>Σ H</th>
              <th className="sticky-head" style={{ ...newThStyle, color: CAT.workers, background: opaqueTint(CAT.workers, 0.08) }}>ZD1 kg/h</th>
              <th className="sticky-head" style={{ ...newThStyle, color: CAT.gas, background: opaqueTint(CAT.gas, 0.08) }}>ZD2+Pr. kg/h</th>
              <th className="sticky-head" style={{ ...newThStyle, color: CAT.transport, background: opaqueTint(CAT.transport, 0.08) }}>Ogółem kg/h</th>
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
              const kgZd1 = dt.ton_zd1 || 0;
              const kgZd2pr = (dt.ton_zd2 || 0) + (dt.ton_pralki || 0);
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
                      <span style={{ fontSize: '10px', fontWeight: 600, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{WEEKDAYS_PL[d.getDay()]}</span>
                    </div>
                  </td>
                  <td style={newTdStyle}><input type="number" value={dt.ton_zd1 || ''} onChange={(e) => onChange(dStr, 'ton_zd1', e.target.value)} className="costs-inp" style={newInpStyle}/></td>
                  <td style={newTdStyle}><input type="number" value={dt.ton_zd2 || ''} onChange={(e) => onChange(dStr, 'ton_zd2', e.target.value)} className="costs-inp" style={newInpStyle}/></td>
                  <td style={newTdStyle}><input type="number" value={dt.ton_pralki || ''} onChange={(e) => onChange(dStr, 'ton_pralki', e.target.value)} className="costs-inp" style={newInpStyle}/></td>
                  <td style={{ ...newTdStyle, fontWeight: 700, textAlign: 'center', background: tint(CAT.workers, 0.05) }}>{t_suma > 0 ? t_suma : '—'}</td>
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
              <td className="sticky-col" style={{ ...footTdStyle, textAlign: 'left', background: '#1E293B', color: '#FFFFFF' }}>SUMA / Ø</td>
              <td style={{ ...footTdStyle, textAlign: 'center' }}>{totals.zd1 || '—'}</td>
              <td style={{ ...footTdStyle, textAlign: 'center' }}>{totals.zd2 || '—'}</td>
              <td style={{ ...footTdStyle, textAlign: 'center' }}>{totals.pralki || '—'}</td>
              <td style={{ ...footTdStyle, color: CAT.workers, textAlign: 'center' }}>{totals.kg || '—'}</td>
              <td style={{ ...footTdStyle, textAlign: 'center' }}>{totals.hZd1 ? FMT1(totals.hZd1) : '—'}</td>
              <td style={{ ...footTdStyle, textAlign: 'center' }}>{totals.hZd2 ? FMT1(totals.hZd2) : '—'}</td>
              <td style={{ ...footTdStyle, textAlign: 'center' }}>{totals.hKier ? FMT1(totals.hKier) : '—'}</td>
              <td style={{ ...footTdStyle, color: '#1565C0', textAlign: 'center' }}>{totals.h ? FMT1(totals.h) : '—'}</td>
              <td style={{ ...footTdStyle, color: CAT.workers, textAlign: 'center' }}>
                <div>{effZd1Avg > 0 ? effZd1Avg.toFixed(1) : '—'}</div>
                <div style={{ fontSize: '10px', fontWeight: 600, opacity: 0.75 }}>{osZd1Avg > 0 ? `${FMT0(osZd1Avg)} kg/os` : ''}</div>
              </td>
              <td style={{ ...footTdStyle, color: CAT.gas, textAlign: 'center' }}>
                <div>{effZd2Avg > 0 ? effZd2Avg.toFixed(1) : '—'}</div>
                <div style={{ fontSize: '10px', fontWeight: 600, opacity: 0.75 }}>{osZd2Avg > 0 ? `${FMT0(osZd2Avg)} kg/os` : ''}</div>
              </td>
              <td style={{ ...footTdStyle, color: CAT.transport, textAlign: 'center' }}>{effAllAvg > 0 ? effAllAvg.toFixed(1) : '—'}</td>
            </tr>
          </tfoot>
        </table>
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
  padding: '5px 6px', fontSize: '13px', fontVariantNumeric: 'tabular-nums', verticalAlign: 'middle'
};
const newInpStyle = {
  width: '100%', padding: '5px 4px', border: '1px solid transparent', background: 'rgba(0,0,0,0.04)', borderRadius: '7px', textAlign: 'center', fontSize: '13px', outline: 'none', transition: 'all 0.18s ease', fontVariantNumeric: 'tabular-nums', fontWeight: 500
};
const rateInpStyle = {
  width: '90px', padding: '6px 8px', border: '1px solid transparent', background: 'rgba(0, 0, 0, 0.04)', borderRadius: '8px', textAlign: 'right', fontSize: '13px', fontWeight: 600, outline: 'none', transition: 'all 0.15s', fontVariantNumeric: 'tabular-nums'
};
const costCellStyle = (color) => ({
  padding: '5px 8px', fontSize: '13px', fontWeight: 700, color, textAlign: 'center', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', verticalAlign: 'middle',
  background: tint(color, 0.10)
});
const footTdStyle = {
  padding: '10px 8px', fontSize: '13px', fontWeight: 800, textAlign: 'right', color: IOS_THEME.textPrimary, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', background: '#F1F5F9'
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
