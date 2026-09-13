import { isHoliday } from '../utils/holidays.js';

export function parseHours(value) {
  const v = String(value || '').trim().toUpperCase();
  if (!v || v === 'W' || v === 'UW' || v === 'L4' || v === 'NU' || v === 'NN' || v === 'I' || v === 'END') return 0;

  if (v.includes('-')) {
    const parts = v.split('-');
    if (parts.length === 2 && (parts[0].includes(':') || parts[1].includes(':'))) {
      const clockToMinutes = (t) => {
        const [h, m] = String(t || '').split(':').map(Number);
        return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
      };
      const startMinutes = clockToMinutes(parts[0]);
      const endMinutes = clockToMinutes(parts[1]);
      if (startMinutes != null && endMinutes != null) {
        const minutes = endMinutes >= startMinutes ? endMinutes - startMinutes : 1440 - startMinutes + endMinutes;
        return minutes / 60;
      }
    }
    const st = parseFloat(parts[0].replace(',', '.'));
    const en = parseFloat(parts[1].replace(',', '.'));
    if (!isNaN(st) && !isNaN(en)) {
      return en >= st ? en - st : (24 - st) + en;
    }
  }

  if (v.includes('+')) return parseFloat(v.split('+')[1].replace(',', '.')) || 0;
  return parseFloat(v.replace(',', '.')) || 0;
}

/**
 * Oblicza zindywidualizowaną normę miesięczną dla pracownika:
 * - Dla UoP (Kodeks Pracy art. 130 § 3): każdy dzień roboczy urlopu wypoczynkowego (UW),
 *   zwolnienia lekarskiego (L4) lub nieobecności usprawiedliwionej (NU) obniża wymiar czasu pracy o 8 godzin.
 * - Dla UZ (zlecenie): norma bazowa miesiąca pełnego etatu (jako punkt odniesienia).
 */
export function getEmployeeMonthNorm(emp, baseNorm, days, year, month, getValue) {
  const contractType = emp?.contract_type || 'UoP';
  if (contractType !== 'UoP') {
    return baseNorm;
  }

  const excusedDays = days.filter(d => {
    const dateObj = new Date(year, month - 1, d);
    const dw = dateObj.getDay();
    const isWorkDay = dw !== 0 && dw !== 6 && !isHoliday(dateObj);
    if (!isWorkDay) return false;
    const v = String(getValue(emp, d) || '').trim().toUpperCase();
    return v === 'UW' || v === 'L4' || v === 'NU';
  }).length;

  return Math.max(0, baseNorm - excusedDays * 8);
}

export function formatDiff(diff) {
  if (diff === 0) return '0';
  const sign = diff > 0 ? '+' : '-';
  const abs = Math.abs(diff);
  const rounded = Math.round(abs * 10) / 10;
  return `${sign}${rounded}`;
}
