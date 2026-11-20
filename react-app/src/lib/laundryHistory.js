import { laundryBatchKey, warsawCalendarDate } from './laundryDayPlan.js';
import { departureDateOf } from './laundryWashDates.js';

function getEvents(entries, getTime, getPerson) {
  const events = new Map();
  for (const entry of entries) {
    const rawTime = getTime(entry);
    const person = getPerson(entry)?.trim() || null;
    const time = rawTime ? Date.parse(rawTime) : NaN;
    if (!person && !Number.isFinite(time)) continue;
    const key = JSON.stringify([Number.isFinite(time) ? time : null, person]);
    events.set(key, { key, time: Number.isFinite(time) ? time : null, person });
  }
  return [...events.values()].sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity));
}

export function buildLaundryHistoryDays(entries, getPlannedWashDate) {
  const days = new Map();
  for (const entry of entries) {
    const date = warsawCalendarDate(entry.washed_at);
    if (!date || entry.deleted_at) continue;

    const clientName = entry.client_name;
    const washDate = getPlannedWashDate(entry);
    const departureDate = departureDateOf(entry);
    const key = laundryBatchKey({ clientName, routeId: entry.route_id, washDate, departureDate });
    if (!days.has(date)) days.set(date, new Map());
    const batches = days.get(date);
    if (!batches.has(key)) batches.set(key, { key, clientName, washDate, entries: [] });
    batches.get(key).entries.push(entry);
  }

  return [...days.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([date, batches]) => ({
    date,
    batches: [...batches.values()].map(({ key, clientName, washDate, entries }) => ({
      key,
      clientName,
      washDate,
      weight: entries.reduce((sum, entry) => sum + (Number.parseFloat(entry.weight) || 0), 0),
      hasUnknownWeight: entries.some(entry => !(Number.parseFloat(entry.weight) > 0)),
      collected: entries.every(entry => entry.picked_at || entry.picked_by || entry.done),
      washed: getEvents(entries, entry => entry.washed_at, entry => entry.washed_by),
      packed: getEvents(entries, entry => entry.laundry_packed_at || entry.laundry_ready_at, entry => entry.laundry_packed_by),
      picked: getEvents(entries, entry => entry.picked_at, entry => entry.picked_by),
    })),
  }));
}
