import { isHoliday } from '../utils/holidays';
import { warsawDate } from './dateUtils';

const NON_WORK_VALUES = new Set(['W', 'UW', 'L4', 'NN', 'I', 'END', '']);

export function isSchedulePlanned(value) {
  const raw = String(value ?? '').trim().toUpperCase();
  return !raw || raw === 'I';
}

export function isScheduleWorkDay(value) {
  return scheduleDayHours(value) > 0;
}

function monthDateStr(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function calendarTodayYmd(date = new Date()) {
  const d = warsawDate(date);
  return monthDateStr(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Jak w Grafiku: domyślne W/I gdy brak wpisu w bazie. */
export function effectiveScheduleValue(day, year, month, scheduleByDay) {
  if (scheduleByDay?.has(day)) return String(scheduleByDay.get(day)).trim();
  const dateObj = new Date(year, month - 1, day);
  const dw = dateObj.getDay();
  const isWe = dw === 0 || dw === 6;
  if (isWe || isHoliday(dateObj)) return 'W';
  return 'I';
}

/** Godziny zmiany z wartości grafiku — ta sama logika co GrafikView / Koszty. */
export function scheduleDayHours(value) {
  const v = String(value ?? '').trim().toUpperCase();
  if (!v || NON_WORK_VALUES.has(v)) return 0;

  if (v.includes('-')) {
    const parts = v.split('-');
    if (parts.length === 2 && (parts[0].includes(':') || parts[1].includes(':'))) {
      const startMinutes = clockToMinutes(parts[0]);
      const endMinutes = clockToMinutes(parts[1]);
      if (startMinutes != null && endMinutes != null) {
        const minutes = endMinutes >= startMinutes ? endMinutes - startMinutes : 1440 - startMinutes + endMinutes;
        return minutes / 60;
      }
    }
    const st = parseFloat(parts[0].replace(',', '.'));
    const en = parseFloat(parts[1].replace(',', '.'));
    if (!Number.isNaN(st) && !Number.isNaN(en)) {
      return en >= st ? en - st : (24 - st) + en;
    }
  }

  if (v.includes('+')) return parseFloat(v.split('+')[1].replace(',', '.')) || 0;
  return parseFloat(v.replace(',', '.')) || 0;
}

function scheduleAttachment(employee, scheduleValue) {
  const raw = String(scheduleValue ?? '').trim();
  if (!raw || isSchedulePlanned(raw) || !isScheduleWorkDay(raw)) return null;
  const plan = resolveWorkPlan(employee, raw);
  const hours = scheduleDayHours(raw);
  return {
    value: raw,
    start: plan.start,
    end: plan.end,
    minutes: plan.minutes || Math.round(hours * 60),
  };
}

/** Łączy zgłoszenia godzin z dniami z grafiku — pomija status „zaplanowane” (I). */
export function buildDriverWorkHistory({
  year,
  month,
  employee = null,
  scheduleEntries = [],
  reports = [],
  todayYmd = calendarTodayYmd(),
}) {
  const reportByDate = new Map((reports || []).map(report => [report.work_date, report]));
  const scheduleByDay = new Map((scheduleEntries || []).map(entry => [Number(entry.day), entry.value]));
  const daysInMonth = new Date(year, month, 0).getDate();
  const rows = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateStr = monthDateStr(year, month, day);
    const report = reportByDate.get(dateStr);
    const explicitSchedule = scheduleByDay.has(day) ? String(scheduleByDay.get(day)).trim() : null;

    if (report) {
      rows.push({
        kind: 'report',
        dateStr,
        report,
        schedule: scheduleAttachment(employee, explicitSchedule),
      });
      continue;
    }

    if (!explicitSchedule || isSchedulePlanned(explicitSchedule) || !isScheduleWorkDay(explicitSchedule)) continue;
    if (dateStr >= todayYmd) continue;

    const plan = resolveWorkPlan(employee, explicitSchedule);
    const hours = scheduleDayHours(explicitSchedule);
    rows.push({
      kind: 'schedule',
      dateStr,
      scheduleValue: explicitSchedule,
      start: plan.start,
      end: plan.end,
      minutes: plan.minutes || Math.round(hours * 60),
    });
  }

  return rows.sort((a, b) => b.dateStr.localeCompare(a.dateStr));
}

export function normalizeClock(value, fallback = '') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;

  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    const [hours, minutes] = raw.split(':').map(Number);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }

  if (/^\d{1,2}([,.]\d{1,2})?$/.test(raw)) {
    const [hoursPart, minutesPart] = raw.split(/[,.]/);
    const hours = Number(hoursPart);
    const minutes = minutesPart ? Number(minutesPart.padEnd(2, '0')) : 0;
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }

  return fallback;
}

export function clockToMinutes(value) {
  const normalized = normalizeClock(value);
  if (!normalized) return null;
  const [hours, minutes] = normalized.split(':').map(Number);
  return hours * 60 + minutes;
}

export function addMinutesToClock(value, minutesToAdd) {
  const start = clockToMinutes(value);
  const delta = Number(minutesToAdd);
  if (start == null || !Number.isFinite(delta)) return '';
  const total = ((start + Math.round(delta)) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function minutesBetweenClocks(startValue, endValue) {
  const start = clockToMinutes(startValue);
  const end = clockToMinutes(endValue);
  if (start == null || end == null) return null;
  const minutes = end >= start ? end - start : 1440 - start + end;
  return minutes > 0 ? minutes : null;
}

export function decimalHoursToMinutes(value) {
  const hours = Number(String(value ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(hours) || hours <= 0 || hours >= 24) return null;
  return Math.round(hours * 60);
}

export function formatWorkDuration(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return '0 h';
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function resolveWorkPlan(employee, scheduleValue) {
  const defaultStart = normalizeClock(employee?.default_start, '07:00');
  const defaultEnd = normalizeClock(employee?.default_end, '15:00');
  const raw = String(scheduleValue ?? '').trim().toUpperCase();

  const range = raw.match(/^(\d{1,2}(?::\d{2}|[,.]\d{1,2})?)-(\d{1,2}(?::\d{2}|[,.]\d{1,2})?)$/);
  if (range) {
    const start = normalizeClock(range[1], defaultStart);
    const end = normalizeClock(range[2], defaultEnd);
    const minutes = minutesBetweenClocks(start, end);
    if (minutes) return { start, end, minutes, source: 'schedule' };
  }

  if (raw.includes('+')) {
    const [startPart, durationPart] = raw.split('+');
    const start = normalizeClock(startPart, defaultStart);
    const durationMinutes = decimalHoursToMinutes(durationPart);
    if (durationMinutes) {
      return {
        start,
        end: addMinutesToClock(start, durationMinutes),
        minutes: durationMinutes,
        source: 'schedule',
      };
    }
  }

  if (raw && !NON_WORK_VALUES.has(raw)) {
    const durationMinutes = decimalHoursToMinutes(raw);
    if (durationMinutes) {
      return {
        start: defaultStart,
        end: addMinutesToClock(defaultStart, durationMinutes),
        minutes: durationMinutes,
        source: 'schedule',
      };
    }
  }

  return {
    start: defaultStart,
    end: defaultEnd,
    minutes: minutesBetweenClocks(defaultStart, defaultEnd) || 480,
    source: 'default',
  };
}

export function timeForInput(value) {
  return normalizeClock(String(value || '').slice(0, 5));
}
