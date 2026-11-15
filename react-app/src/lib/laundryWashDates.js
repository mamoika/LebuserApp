import { effectiveLaundryWashDate } from './laundryDayPlan.js';

// Daty cyklu prania wyliczane z tygodnia/dnia przyjazdu i wyjazdu wpisu.
// Wspólne dla Pralni i Panelu sterującego, żeby kilogramy "na dziś" znaczyły
// w obu miejscach dokładnie to samo.

function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseMonday(weekKey) {
  const [y, m, d] = (weekKey || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function addDaysToWeekKey(weekKey, days) {
  const dt = parseMonday(weekKey);
  if (!dt) return weekKey;
  dt.setDate(dt.getDate() + days);
  return ymd(dt);
}

function dayWeekToTime(day, weekKey) {
  const dt = parseMonday(weekKey);
  if (!dt) return 0;
  dt.setDate(dt.getDate() + (Number(day) - 1));
  return dt.getTime();
}

export function slotToDate(slot) {
  if (!slot) return null;
  const [weekKey, day] = slot.split('|');
  const dt = parseMonday(weekKey);
  if (!dt) return null;
  dt.setDate(dt.getDate() + (Number(day) - 1));
  return ymd(dt);
}

// Dzień wyjazdu (odbiór czystego przez kierowcę) — różny od dnia prania, który
// wypada dzień wcześniej. Wyznacza górną granicę okna, w którym wpis ma sens
// pokazywać się w Pralni na dany dzień.
export function departureDateOf(entry) {
  if (!entry?.pick_day || !entry?.pick_week_key) return null;
  return slotToDate(`${entry.pick_week_key}|${entry.pick_day}`);
}

export function arrivalDateOf(entry) {
  if (!entry?.arr_day || !entry?.week_key) return null;
  return slotToDate(`${entry.week_key}|${entry.arr_day}`);
}

export function washSlotOf(entry, scheduleByRoute, dailyServiceByClient) {
  const arrDay = Number(entry.arr_day);
  const arrWeek = entry.week_key;
  const depDay = Number(entry.pick_day);
  const depWeek = entry.pick_week_key;
  const isDaily = dailyServiceByClient.has(entry.client_name)
    ? dailyServiceByClient.get(entry.client_name)
    : (scheduleByRoute.get(entry.route_id) || 'other') === 'daily';

  if (!depDay || !depWeek) {
    if (!arrDay || !arrWeek) return null;
    if (isDaily) return `${arrWeek}|${arrDay}`;
    if (arrDay < 5) return `${arrWeek}|${arrDay + 1}`;
    return `${addDaysToWeekKey(arrWeek, 7)}|1`;
  }

  let washDay;
  let washWeek;
  if (depDay > 1) {
    washDay = depDay - 1;
    washWeek = depWeek;
  } else {
    washDay = 5;
    washWeek = addDaysToWeekKey(depWeek, -7);
  }

  if (!isDaily && arrDay && arrWeek) {
    if (dayWeekToTime(washDay, washWeek) <= dayWeekToTime(arrDay, arrWeek)) {
      washDay = depDay;
      washWeek = depWeek;
    }
  }

  return `${washWeek}|${washDay}`;
}

export function plannedWashDateOf(entry, scheduleByRoute, dailyServiceByClient) {
  return effectiveLaundryWashDate(
    entry,
    item => slotToDate(washSlotOf(item, scheduleByRoute, dailyServiceByClient)),
  );
}
