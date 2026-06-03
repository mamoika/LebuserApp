import { supabase } from './supabaseClient';

// Mapuje wiersz employee_months (z dołączonym employees) na płaski obiekt pracownika,
// z atrybutami miesięcznymi (grupa/kolejność/aktywność) i stałymi z employees.
function mapRow(r) {
  const e = r.employees || {};
  return {
    id: r.employee_id,
    name: e.name,
    default_start: e.default_start,
    default_end: e.default_end,
    contract_type: e.contract_type,
    group_name: r.group_name ?? e.group_name,
    sort_order: r.sort_order ?? e.sort_order ?? 0,
    active: r.active,
    _ym_id: r.id,
  };
}

function sortRoster(list) {
  return [...list].sort((a, b) =>
    (a.sort_order - b.sort_order) || String(a.name || '').localeCompare(String(b.name || ''))
  );
}

// Zasiewa snapshot miesiąca: kopiuje aktywny roster z ostatniego wcześniejszego miesiąca,
// a gdy historii brak — z globalnie aktywnych pracowników.
async function seedMonth(year, month) {
  const { data: latest } = await supabase
    .from('employee_months')
    .select('year, month')
    .or(`year.lt.${year},and(year.eq.${year},month.lt.${month})`)
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(1);

  let inserts;
  if (latest && latest.length) {
    const { year: pY, month: pM } = latest[0];
    const { data: prevRows } = await supabase
      .from('employee_months')
      .select('employee_id, group_name, sort_order')
      .eq('year', pY).eq('month', pM).eq('active', true);
    inserts = (prevRows || []).map(r => ({
      employee_id: r.employee_id, year, month, active: true,
      group_name: r.group_name, sort_order: r.sort_order,
    }));
  } else {
    const { data: emps } = await supabase
      .from('employees').select('id, group_name, sort_order').eq('active', true);
    inserts = (emps || []).map(e => ({
      employee_id: e.id, year, month, active: true,
      group_name: e.group_name, sort_order: e.sort_order,
    }));
  }

  if (inserts.length) {
    await supabase.from('employee_months').upsert(inserts, { onConflict: 'employee_id,year,month' });
  }
  const { data: rows } = await supabase
    .from('employee_months').select('*, employees(*)').eq('year', year).eq('month', month);
  return rows || [];
}

// Zwraca roster danego miesiąca (snapshot). Jeśli miesiąc nie ma snapshotu — zasiewa go.
// includeInactive=false → tylko aktywni w tym miesiącu (do Grafiku/Osi czasu).
export async function loadMonthRoster(year, month, { includeInactive = false } = {}) {
  let { data: rows } = await supabase
    .from('employee_months').select('*, employees(*)').eq('year', year).eq('month', month);

  if (!rows || rows.length === 0) {
    rows = await seedMonth(year, month);
  }

  const mapped = (rows || []).filter(r => r.employees).map(mapRow);
  return sortRoster(includeInactive ? mapped : mapped.filter(r => r.active));
}
