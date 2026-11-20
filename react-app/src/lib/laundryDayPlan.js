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

export function effectiveLaundryWashDate(entry, getDerivedWashDate) {
  return entry?.laundry_planned_date || getDerivedWashDate(entry);
}

function hasWorkflowColumns(entry) {
  return Object.prototype.hasOwnProperty.call(entry, 'laundry_status')
    || Object.prototype.hasOwnProperty.call(entry, 'laundry_ready_at')
    || Object.prototype.hasOwnProperty.call(entry, 'laundry_packed_at')
    || Object.prototype.hasOwnProperty.call(entry, 'laundry_trolley_no');
}

export function isReadyForDriver(entry) {
  if (entry?.done) return true;
  if (hasWorkflowColumns(entry)) {
    return Boolean(
      entry.laundry_ready_at
      || entry.laundry_packed_at
      || ['packed', 'released', 'at_client', 'returned'].includes(entry.laundry_status)
    );
  }
  return Boolean(entry?.washed);
}

export function isLaundryWashed(entry) {
  return isReadyForDriver(entry) || (entry.washed ?? Boolean(warsawCalendarDate(entry.washed_at)));
}

export function calculateLaundryDayMetrics(entries, selectedDate, getWashDate, getDepartureDate) {
  // Metryki mają opisywać dokładnie ten sam aktywny plan, który operator widzi
  // na liście Pralni. Wpisy zakończone oraz miękko usunięte pozostają w historii,
  // ale nie mogą podbijać bieżących kilogramów po zniknięciu z listy pracy.
  const activeEntries = entries.filter(entry => entry?.id && !entry.deleted_at && !entry.done);
  const plannedEntries = activeEntries.filter(entry => getWashDate(entry) === selectedDate);
  const sumWeight = items => Number(items
    .reduce((sum, entry) => sum + numericWeight(entry), 0)
    .toFixed(1));

  return {
    plannedKg: sumWeight(plannedEntries),
    washedKg: sumWeight(plannedEntries.filter(isLaundryWashed)),
    // Pakowanie kończy się ustawieniem laundry_packed_at / laundry_ready_at
    // („Zakończ pakowanie”) — tak samo jak gotowość na liście Pralni.
    packedKg: sumWeight(activeEntries.filter(entry => warsawCalendarDate(entry.laundry_packed_at || entry.laundry_ready_at) === selectedDate)),
    departureKg: sumWeight(activeEntries.filter(entry => getDepartureDate(entry) === selectedDate)),
  };
}
