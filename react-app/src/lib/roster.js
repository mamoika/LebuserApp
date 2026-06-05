import { supabase } from './supabaseClient';

function sortRoster(list) {
  return [...list].sort((a, b) =>
    (a.sort_order - b.sort_order) || String(a.name || '').localeCompare(String(b.name || ''))
  );
}

// Zwraca roster danego miesiąca. Snapshot miesiąca jest tworzony po stronie bazy,
// bez bezpośredniego prawa zapisu do employee_months z przeglądarki.
export async function loadMonthRoster(year, month, { includeInactive = false } = {}) {
  const { data, error } = await supabase.rpc('get_month_roster', {
    p_year: year,
    p_month: month,
    p_include_inactive: includeInactive,
  });

  if (error) {
    console.error('loadMonthRoster failed', error);
    return [];
  }
  return sortRoster(data || []);
}
