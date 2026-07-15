/**
 * Compares calendar date keys without parsing them as UTC timestamps.
 * ISO YYYY-MM-DD keys sort in the same order as calendar dates.
 */
export function isFutureCalendarDate(dateKey, todayKey) {
  return dateKey > todayKey;
}
