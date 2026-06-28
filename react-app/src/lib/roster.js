import { getMonthRoster } from './readRpc';

function sortRoster(list) {
  return [...list].sort((a, b) =>
    (a.sort_order - b.sort_order) || String(a.name || '').localeCompare(String(b.name || ''))
  );
}

// Zwraca roster danego miesiąca. Snapshot miesiąca jest tworzony po stronie bazy,
// bez bezpośredniego prawa zapisu ani odczytu employee_months z przeglądarki.
export async function loadMonthRoster(sessionToken, year, month, { includeInactive = false } = {}) {
  try {
    const rows = await getMonthRoster(sessionToken, year, month, { includeInactive });
    return sortRoster(rows || []);
  } catch (error) {
    console.error('loadMonthRoster failed', error);
    return [];
  }
}
