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
