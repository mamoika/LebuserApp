const EPSILON = 1e-9;

function cleanHours(value) {
  return Math.round((Number(value) || 0) * 1e6) / 1e6;
}

function normalizedShift(startHour, endHour) {
  const start = Number(startHour);
  let end = Number(endHour);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (end < start) end += 24;
  if (end <= start) return null;
  return { start, end };
}

/**
 * Zwraca faktyczną część godzinnej komórki stanowiska, która pokrywa się ze zmianą.
 * Dla zmian nocnych godziny 0–23 są dopasowywane również do następnej doby.
 */
export function getShiftHourSegment(hour, startHour, endHour) {
  const shift = normalizedShift(startHour, endHour);
  const rawHour = Number(hour);
  if (!shift || !Number.isFinite(rawHour)) return null;

  const clockHour = ((rawHour % 24) + 24) % 24;
  let best = null;

  [clockHour, clockHour + 24].forEach((cellStart) => {
    const start = Math.max(cellStart, shift.start);
    const end = Math.min(cellStart + 1, shift.end);
    if (end - start <= EPSILON) return;
    if (!best || end - start > best.end - best.start) best = { start, end };
  });

  return best;
}

export function getShiftHourOverlap(hour, startHour, endHour) {
  const segment = getShiftHourSegment(hour, startHour, endHour);
  return segment ? cleanHours(segment.end - segment.start) : 0;
}

/** Roboczogodziny stanowiskowe: przecięcie ze zmianą pomniejszone o dwie przerwy po 15 min. */
export function getProductiveTimelineHours(hour, startHour, endHour) {
  const segment = getShiftHourSegment(hour, startHour, endHour);
  const shift = normalizedShift(startHour, endHour);
  if (!segment || !shift) return 0;

  let hours = segment.end - segment.start;
  [shift.start + 3, shift.start + 6].forEach((breakStart) => {
    const overlapStart = Math.max(segment.start, breakStart);
    const overlapEnd = Math.min(segment.end, breakStart + 0.25, shift.end);
    if (overlapEnd > overlapStart) hours -= overlapEnd - overlapStart;
  });

  return cleanHours(Math.max(0, hours));
}

/** Łączny czas zegarowy przedziałów — nakładające się osoby liczą się tylko raz. */
export function getIntervalUnionHours(intervals = []) {
  const sorted = intervals
    .filter(interval => Number.isFinite(interval?.start) && Number.isFinite(interval?.end) && interval.end > interval.start)
    .map(interval => ({ start: interval.start, end: interval.end }))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  if (!sorted.length) return 0;

  let total = 0;
  let current = sorted[0];
  for (let i = 1; i < sorted.length; i += 1) {
    const next = sorted[i];
    if (next.start <= current.end + EPSILON) {
      current.end = Math.max(current.end, next.end);
    } else {
      total += current.end - current.start;
      current = next;
    }
  }
  total += current.end - current.start;
  return cleanHours(total);
}
