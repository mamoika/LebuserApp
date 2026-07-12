/** Kalendarzowa data w strefie Europe/Warsaw. */
export function warsawDate(date = new Date()) {
  return new Date(date.toLocaleString('en-US', { timeZone: 'Europe/Warsaw' }));
}

/**
 * Dzień operacyjny: pon–pt bez zmian; sobota i niedziela → poprzedni piątek.
 * W weekend aplikacja pracuje jak w piątek (brak tras w sobotę/niedzielę).
 */
export function operationalDate(date = new Date()) {
  const d = warsawDate(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  if (dow === 6) d.setDate(d.getDate() - 1);
  else if (dow === 0) d.setDate(d.getDate() - 2);
  return d;
}

export function operationalYmd(date = new Date()) {
  const d = operationalDate(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 1 = poniedziałek … 5 = piątek (weekend → 5). */
export function operationalWeekday(date = new Date()) {
  const d = operationalDate(date);
  return Math.min(5, Math.max(1, (d.getDay() + 6) % 7 + 1));
}

export function isOperationalWeekend(date = new Date()) {
  const dow = warsawDate(date).getDay();
  return dow === 0 || dow === 6;
}

/** Czy data YYYY-MM-DD wpada w podany miesiąc (month 1–12). */
export function dateInMonth(dateStr, year, month) {
  if (!dateStr) return false;
  const [y, m] = String(dateStr).split('-').map(Number);
  return y === year && m === month;
}

export function getWeekKey(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() + 3 - (dt.getDay() + 6) % 7);
  return dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0'); // formatu używanego w bazie (Poniedziałek danego tygodnia)
}

export function getCurrentMonday() {
  const d = new Date();
  const day = d.getDay() || 7;
  if (day !== 1) d.setHours(-24 * (day - 1));
  d.setHours(0,0,0,0);
  return d;
}

export function formatWeekKey(mondayDate) {
  const y = mondayDate.getFullYear();
  const m = String(mondayDate.getMonth() + 1).padStart(2, '0');
  const d = String(mondayDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

import i18n from '../i18n';

// Zlokalizowane nazwy dni/miesięcy — czytane z aktualnego języka i18n.
// Funkcje (nie stałe), bo język może się zmienić w trakcie sesji.
const arr = (key, fallback) => {
  const v = i18n.t(key, { returnObjects: true });
  return Array.isArray(v) ? v : fallback;
};

// Pełne nazwy dni roboczych, indeks 0 = Poniedziałek.
export const dayNamesFull = () => arr('dates.dayFull', ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek']);
// Skróty Pn–Pt, indeks 0 = Poniedziałek.
export const dayNamesShort = () => arr('dates.dayShortMonFri', ['Pn', 'Wt', 'Śr', 'Cz', 'Pt']);
// Skróty Nd–So, indeks 0 = Niedziela (zgodne z Date.getDay()).
export const dayNamesSunSat = () => arr('dates.dayShortSunSat', ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So']);
// Pełne nazwy dni całego tygodnia, indeks 0 = Poniedziałek (Pn–Nd).
export const weekdayFull = () => arr('dates.weekdayFull', ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela']);
// Nazwy miesięcy, indeks 0 = Styczeń.
export const monthNames = () => arr('dates.months', ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień']);

// Locale BCP-47 dla Intl wg aktualnego języka i18n.
export const currentLocale = () => (i18n.language?.startsWith('de') ? 'de-DE' : 'pl-PL');

// Zachowane dla zgodności wstecznej (statyczny snapshot na moment importu).
export const DAY_NAMES = dayNamesFull();
