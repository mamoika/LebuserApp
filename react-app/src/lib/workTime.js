const NON_WORK_VALUES = new Set(['W', 'UW', 'L4', 'NN', 'I', 'END', '']);

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
