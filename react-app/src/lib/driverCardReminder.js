export const DRIVER_CARD_DOWNLOAD_INTERVAL_DAYS = 28;
export const DRIVER_CARD_WARNING_DAYS = 7;

function parseLocalDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toLocalYmd(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDriverCardDueDate(lastDownloadedOn) {
  const lastDownload = parseLocalDate(lastDownloadedOn);
  if (!lastDownload) return null;
  lastDownload.setDate(lastDownload.getDate() + DRIVER_CARD_DOWNLOAD_INTERVAL_DAYS);
  return toLocalYmd(lastDownload);
}

export function getDriverCardReminder(card, today = new Date()) {
  const dueOn = getDriverCardDueDate(card?.last_downloaded_on);
  if (!dueOn) return { ...card, state: 'missing', dueOn: null, daysRemaining: null };

  const dueDate = parseLocalDate(dueOn);
  const todayDate = parseLocalDate(toLocalYmd(today));
  const daysRemaining = Math.round((dueDate - todayDate) / 86400000);
  const state = daysRemaining < 0
    ? 'overdue'
    : daysRemaining <= DRIVER_CARD_WARNING_DAYS
      ? 'dueSoon'
      : 'ok';

  return { ...card, state, dueOn, daysRemaining };
}

export function driverCardBadgeText(reminder, t) {
  if (!reminder) return '';
  if (reminder.state === 'missing') return t('course.driverCard.missing');
  if (reminder.daysRemaining < 0) return t('course.driverCard.overdueDays', { count: Math.abs(reminder.daysRemaining) });
  if (reminder.daysRemaining === 0) return t('course.driverCard.dueToday');
  if (reminder.daysRemaining === 1) return t('course.driverCard.dueTomorrow');
  return t('course.driverCard.dueDays', { count: reminder.daysRemaining });
}

export function groupDriverCardsByEmployeeDueDay(cards, year, month) {
  return cards.reduce((result, card) => {
    const dueOn = getDriverCardDueDate(card?.last_downloaded_on);
    const match = dueOn?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match || Number(match[1]) !== year || Number(match[2]) !== month) return result;
    result.set(`${card.employee_id}_${Number(match[3])}`, { ...card, dueOn });
    return result;
  }, new Map());
}

export function groupDriverCardHistoryByEmployeeDay(history, year, month) {
  return history.reduce((result, event) => {
    const match = String(event?.downloaded_on || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match || Number(match[1]) !== year || Number(match[2]) !== month) return result;
    result.set(`${event.employee_id}_${Number(match[3])}`, event);
    return result;
  }, new Map());
}

export function addDriverCardHistoryEvent(history, event) {
  return [
    event,
    ...history.filter(item => !(
      item.employee_id === event.employee_id
      && item.downloaded_on === event.downloaded_on
    )),
  ];
}

export function applyDriverCardDownload(cards, employeeId, downloadedOn) {
  return cards.map(card => (
    card.employee_id === employeeId
      ? {
          ...card,
          last_downloaded_on: !card.last_downloaded_on || downloadedOn > card.last_downloaded_on
            ? downloadedOn
            : card.last_downloaded_on,
        }
      : card
  ));
}
