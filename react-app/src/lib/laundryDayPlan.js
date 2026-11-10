const numericWeight = entry => Number.parseFloat(entry?.weight) || 0;

export function warsawCalendarDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = type => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function laundryBatchKey({ clientName, routeId, washDate, departureDate }) {
  return [clientName || '—', routeId || 0, washDate || 'no-wash-date', departureDate || 'no-departure-date'].join('|');
}

export function calculateLaundryDayMetrics(entries, selectedDate, getWashDate, getDepartureDate) {
  const activeEntries = entries.filter(entry => entry?.id && !entry.deleted_at);
  const sumFor = predicate => Number(activeEntries
    .filter(predicate)
    .reduce((sum, entry) => sum + numericWeight(entry), 0)
    .toFixed(1));

  return {
    plannedKg: sumFor(entry => getWashDate(entry) === selectedDate),
    washedKg: sumFor(entry => warsawCalendarDate(entry.washed_at) === selectedDate),
    departureKg: sumFor(entry => getDepartureDate(entry) === selectedDate),
  };
}
