-- ============================================================
--  employee_months — miesięczny snapshot rosteru pracowników
--  Cel: wyłączenie pracownika nie kasuje historii; każdy miesiąc
--       trzyma własny skład, aktywność i grupę.
--
--  URUCHOM w Supabase → SQL Editor (najpierw zrób backup / snapshot bazy).
--  Migracja jest idempotentna — można puścić ponownie bez szkody.
-- ============================================================

-- 1) Tabela snapshotu -----------------------------------------
create table if not exists public.employee_months (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  year        int  not null,
  month       int  not null,                 -- 1..12
  active      boolean not null default true, -- czy należy do rosteru TEGO miesiąca
  group_name  text,                          -- grupa w tym miesiącu (historyczna)
  sort_order  int default 0,                 -- kolejność w tym miesiącu
  updated_at  timestamptz default now(),
  unique (employee_id, year, month)
);

create index if not exists idx_employee_months_ym on public.employee_months (year, month);

-- 2) RLS + uprawnienia (aplikacja łączy się jako rola anon) ----
alter table public.employee_months enable row level security;

drop policy if exists "employee_months access" on public.employee_months;
create policy "employee_months access"
  on public.employee_months
  for all
  to anon, authenticated
  using (true)
  with check (true);

grant all on table public.employee_months to anon, authenticated;

-- 3) BACKFILL — odtwórz roster dla miesięcy, które MAJĄ już dane
--    (kopiujemy obecną grupę/kolejność/aktywność z employees)

-- 3a) z grafiku pracy (schedule_entries: year, month)
insert into public.employee_months (employee_id, year, month, active, group_name, sort_order)
select distinct s.employee_id, s.year, s.month, e.active, e.group_name, e.sort_order
from public.schedule_entries s
join public.employees e on e.id = s.employee_id
on conflict (employee_id, year, month) do nothing;

-- 3b) z osi czasu (timeline_entries: entry_date)
insert into public.employee_months (employee_id, year, month, active, group_name, sort_order)
select distinct t.employee_id,
       extract(year  from t.entry_date)::int,
       extract(month from t.entry_date)::int,
       e.active, e.group_name, e.sort_order
from public.timeline_entries t
join public.employees e on e.id = t.employee_id
on conflict (employee_id, year, month) do nothing;

-- 3c) bieżący miesiąc: wszyscy globalnie aktywni (pełny skład na teraz)
insert into public.employee_months (employee_id, year, month, active, group_name, sort_order)
select e.id,
       extract(year  from now())::int,
       extract(month from now())::int,
       e.active, e.group_name, e.sort_order
from public.employees e
where e.active = true
on conflict (employee_id, year, month) do nothing;

-- ============================================================
--  Po uruchomieniu: sprawdź licznik
--    select year, month, count(*) from public.employee_months
--    group by year, month order by year, month;
-- ============================================================
