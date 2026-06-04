-- ============================================================
--  Naprawa zapisu Kosztów: RLS + uprawnienia dla daily_costs i cost_settings
--  Problem: zapis zwracał 42501 "row-level security policy" — tabele miały
--           włączone RLS bez polityki zapisu dla roli anon (aplikacja = anon).
--  URUCHOM w Supabase → SQL Editor. Bezpieczne, idempotentne.
-- ============================================================

-- daily_costs ------------------------------------------------
alter table public.daily_costs enable row level security;

drop policy if exists "daily_costs access" on public.daily_costs;
create policy "daily_costs access" on public.daily_costs
  for all to anon, authenticated
  using (true) with check (true);

grant all on table public.daily_costs to anon, authenticated;

-- klucz konfliktu dla upsert po dacie (jeśli jeszcze nie ma)
create unique index if not exists daily_costs_entry_date_key
  on public.daily_costs (entry_date);

-- cost_settings ----------------------------------------------
alter table public.cost_settings enable row level security;

drop policy if exists "cost_settings access" on public.cost_settings;
create policy "cost_settings access" on public.cost_settings
  for all to anon, authenticated
  using (true) with check (true);

grant all on table public.cost_settings to anon, authenticated;

-- klucz konfliktu dla upsert po miesiącu (jeśli jeszcze nie ma)
create unique index if not exists cost_settings_month_key_key
  on public.cost_settings (month_key);

-- ============================================================
--  Po uruchomieniu zapis w Kosztach zacznie działać (POST → 201).
-- ============================================================
