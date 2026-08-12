function formatClock(decimalHour) {
  const normalized = ((decimalHour % 24) + 24) % 24;
  const totalMinutes = Math.round(normalized * 60) % (24 * 60);
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function getShiftEndMarker(endHour, visibleStart = 5, visibleEnd = 22) {
  if (!Number.isFinite(endHour)) return null;

  const marker = {
    label: formatClock(endHour),
    decimalHour: endHour,
  };

  // Koniec po północy należy do zmiany rozpoczętej poprzedniego dnia, więc pokazujemy
  // go przy prawej krawędzi osi zamiast sugerować zakończenie przed rozpoczęciem zmiany.
  if (endHour > 24 || endHour > visibleEnd) {
    return { ...marker, cellHour: visibleEnd - 1, offset: 1, outside: 'after' };
  }

  if (endHour < visibleStart) {
    return { ...marker, cellHour: visibleStart, offset: 0, outside: 'before' };
  }

  if (endHour === visibleEnd) {
    return { ...marker, cellHour: visibleEnd - 1, offset: 1, outside: null };
  }

  return {
    ...marker,
    cellHour: Math.floor(endHour),
    offset: endHour - Math.floor(endHour),
    outside: null,
  };
}
