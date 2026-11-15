import { isHoliday } from '../utils/holidays.js';
import { getEmployeeMonthNorm, parseHours } from './rosterHelpers.js';
import { isAbsent } from './scheduleStatus.js';

// Czysta logika Panelu sterującego. Liczy dokładnie tak jak Grafik
// (domyślne W/I, okresy zatrudnienia, norma UoP), żeby liczby w panelu
// zgadzały się z tym, co admin widzi w tabeli grafiku.

const OFF_VALUES = new Set(['W', 'END']);

function pad(value) {
  return String(value).padStart(2, '0');
}

export function monthDayKey(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function isWorkingCalendarDay(year, month, day) {
  const date = new Date(year, month - 1, day);
  const weekday = date.getDay();
  return weekday !== 0 && weekday !== 6 && !isHoliday(date);
}

export function workingDaysInMonth(year, month) {
  const total = new Date(year, month, 0).getDate();
  let count = 0;
  for (let day = 1; day <= total; day += 1) {
    if (isWorkingCalendarDay(year, month, day)) count += 1;
  }
  return count;
}

function defaultScheduleValue(year, month, day) {
  return isWorkingCalendarDay(year, month, day) ? 'I' : 'W';
}

function buildEmploymentCheck(employmentPeriods = []) {
  const byEmployee = new Map();
  employmentPeriods.forEach(period => {
    const list = byEmployee.get(period.employee_id) || [];
    list.push(period);
    byEmployee.set(period.employee_id, list);
  });
  return (employeeId, dateKey) => (byEmployee.get(employeeId) || []).some(period => (
    period.started_on <= dateKey && (!period.ended_on || period.ended_on >= dateKey)
  ));
}

function buildScheduleLookup(scheduleEntries = []) {
  const map = new Map();
  scheduleEntries.forEach(entry => {
    map.set(`${entry.employee_id}_${Number(entry.day)}`, entry.value);
  });
  return map;
}

// Status jednego pracownika w danym dniu: working / absent / off / outside.
export function classifyScheduleValue(value) {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return 'outside';
  if (isAbsent(raw)) return 'absent';
  if (OFF_VALUES.has(raw)) return 'off';
  if (raw === 'I' || parseHours(raw) > 0) return 'working';
  return 'off';
}

export function buildTeamDay({ roster = [], scheduleEntries = [], employmentPeriods = [], year, month, day }) {
  const isEmployed = buildEmploymentCheck(employmentPeriods);
  const schedule = buildScheduleLookup(scheduleEntries);
  const dateKey = monthDayKey(year, month, day);
  const groups = new Map();
  const absent = [];
  let working = 0;
  let off = 0;
  let total = 0;

  roster.forEach(employee => {
    if (!isEmployed(employee.id, dateKey)) return;
    const key = `${employee.id}_${day}`;
    const value = schedule.has(key) ? schedule.get(key) : defaultScheduleValue(year, month, day);
    const status = classifyScheduleValue(value);
    if (status === 'outside') return;

    total += 1;
    const groupName = employee.group_name || '—';
    const group = groups.get(groupName) || { name: groupName, working: 0, total: 0 };
    group.total += 1;

    if (status === 'working') {
      working += 1;
      group.working += 1;
    } else if (status === 'absent') {
      absent.push({ id: employee.id, name: employee.name, value: String(value).trim().toUpperCase(), group: groupName });
    } else {
      off += 1;
    }
    groups.set(groupName, group);
  });

  absent.sort((a, b) => String(a.name).localeCompare(String(b.name), 'pl'));
  return {
    total,
    working,
    absentCount: absent.length,
    off,
    absent,
    groups: [...groups.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pl')),
  };
}

// Nieobecności w najbliższych dniach (w obrębie miesiąca grafiku), sklejone w zakresy.
export function buildUpcomingAbsences({ roster = [], scheduleEntries = [], employmentPeriods = [], year, month, fromDay, days = 7 }) {
  const isEmployed = buildEmploymentCheck(employmentPeriods);
  const schedule = buildScheduleLookup(scheduleEntries);
  const lastDay = Math.min(new Date(year, month, 0).getDate(), fromDay + days - 1);
  const result = [];

  roster.forEach(employee => {
    let current = null;
    for (let day = fromDay; day <= lastDay; day += 1) {
      const dateKey = monthDayKey(year, month, day);
      const raw = isEmployed(employee.id, dateKey) ? schedule.get(`${employee.id}_${day}`) : null;
      const value = String(raw ?? '').trim().toUpperCase();
      if (isAbsent(value)) {
        if (current && current.value === value && current.lastDay === day - 1) {
          current.lastDay = day;
        } else {
          current = { id: `${employee.id}-${day}`, name: employee.name, value, firstDay: day, lastDay: day };
          result.push(current);
        }
      } else if (current && !OFF_VALUES.has(value)) {
        current = null;
      }
    }
  });

  return result.sort((a, b) => a.firstDay - b.firstDay || String(a.name).localeCompare(String(b.name), 'pl'));
}

export function workingDaysUpTo(year, month, uptoDay) {
  const last = Math.min(new Date(year, month, 0).getDate(), Math.max(0, uptoDay));
  let count = 0;
  for (let day = 1; day <= last; day += 1) {
    if (isWorkingCalendarDay(year, month, day)) count += 1;
  }
  return count;
}

const round1 = value => Math.round(value * 10) / 10;

// Godziny zalogowanej osoby w miesiącu, liczone jak kolumny Σh / Norm. / Różn. w Grafiku.
// `uptoDay` dodaje porównanie „do dziś”: godziny do tego dnia vs proporcjonalna norma,
// żeby w połowie miesiąca nie straszyć różnicą liczoną od pełnej normy.
export function buildMyMonthHours({ employee, scheduleEntries = [], year, month, uptoDay = null }) {
  if (!employee) return null;
  const totalDays = new Date(year, month, 0).getDate();
  const days = Array.from({ length: totalDays }, (_, index) => index + 1);
  const byDay = new Map(scheduleEntries.map(entry => [Number(entry.day), entry.value]));
  const getValue = (_emp, day) => (byDay.has(day) ? byDay.get(day) : defaultScheduleValue(year, month, day));
  const hours = days.reduce((sum, day) => sum + parseHours(getValue(employee, day)), 0);
  const norm = getEmployeeMonthNorm(employee, workingDaysInMonth(year, month) * 8, days, year, month, getValue);
  const limit = uptoDay == null ? totalDays : Math.min(totalDays, uptoDay);
  const hoursToDate = days.filter(day => day <= limit).reduce((sum, day) => sum + parseHours(getValue(employee, day)), 0);
  const totalWorkdays = workingDaysInMonth(year, month);
  const normToDate = totalWorkdays ? norm * (workingDaysUpTo(year, month, limit) / totalWorkdays) : 0;
  return {
    hours: round1(hours),
    norm,
    diff: round1(hours - norm),
    hoursToDate: round1(hoursToDate),
    normToDate: round1(normToDate),
    diffToDate: round1(hoursToDate - normToDate),
  };
}

function parseYmd(value) {
  const [year, month, day] = String(value).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function toYmd(date) {
  return monthDayKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

// Najbliższy dzień pracy pralni po danej dacie: pon.–sob., bez świąt.
export function nextShiftYmd(fromYmd) {
  const date = parseYmd(fromYmd);
  for (let i = 0; i < 14; i += 1) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0 && !isHoliday(date)) return toYmd(date);
  }
  return toYmd(date);
}

// Ten sam dzień poprzedniego miesiąca (przycięty do jego długości) — do porównań „do dziś”.
export function previousMonthSameDay(year, month, day) {
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevDay = Math.min(day, new Date(prevYear, prevMonth, 0).getDate());
  return { year: prevYear, month: prevMonth, day: prevDay, ymd: monthDayKey(prevYear, prevMonth, prevDay) };
}

// Zmiana procentowa; null, gdy nie ma z czym porównać.
export function percentChange(current, previous) {
  const cur = Number(current);
  const prev = Number(previous);
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

// Nazwy grup z grafiku bywają pisane WIELKIMI literami; skróty typu „ZD 2” zostają bez zmian.
export function prettyGroupName(name) {
  const text = String(name || '').trim();
  if (!text || text !== text.toLocaleUpperCase('pl')) return text;
  return text
    .split(/(\s+)/)
    .map(part => (part.length >= 4 && /\p{L}/u.test(part)
      ? part.charAt(0) + part.slice(1).toLocaleLowerCase('pl')
      : part))
    .join('');
}

// Wszystko, co czeka na decyzję admina, w jednej liście ułożonej od najpilniejszego.
export function collectApprovals({ workTimeReports = [], boardTrips = [], driverCardReminders = [] }) {
  const items = [];

  boardTrips.forEach(trip => {
    if (trip.isVirtual) return;
    if (trip.board_status === 'settlement') {
      const kmPending = Boolean(trip.end_km) && trip.km_approval_status !== 'approved';
      const hasHours = Boolean(trip.work_time_report_id || trip.reported_hours);
      const hoursPending = hasHours && trip.hours_status !== 'approved';
      if (kmPending || hoursPending) {
        items.push({ kind: 'settlement', priority: 1, id: `trip-${trip.id}`, trip, kmPending, hoursPending });
      }
    }
    if (trip.board_status === 'planning' && !trip.driver_id) {
      items.push({ kind: 'noDriver', priority: 2, id: `nodriver-${trip.id}`, trip });
    }
  });

  workTimeReports
    .filter(report => report.status === 'pending')
    .forEach(report => items.push({ kind: 'workTime', priority: 1, id: `report-${report.id}`, report }));

  driverCardReminders
    .filter(reminder => reminder.state && reminder.state !== 'ok')
    .forEach(reminder => items.push({
      kind: 'driverCard',
      priority: reminder.state === 'dueSoon' ? 3 : 1,
      id: `card-${reminder.employee_id}`,
      reminder,
    }));

  return items.sort((a, b) => a.priority - b.priority);
}
