-- ============================================================
--  Tryb trasy kierowcy: potwierdzanie dostaw + sesje tras (driver_trips).
--  - entries: dodaj potwierdzenie dostawy (analogicznie do odbioru).
--  - driver_trips: jedna sesja trasy = (kierowca, dzień, auto), z czasem
--    startu/końca i końcowym stanem licznika (km).
--  Domyślne auto kierowcy trzymane jest w app_settings pod kluczem
--  'driver_cars' (jsonb: { "<user_id>": "fiat" }), więc nie ruszamy
--  funkcji logowania.
--  URUCHOM w Supabase → SQL Editor. Bezpieczne, idempotentne.
-- ============================================================

-- 1) Potwierdzenie dostawy na wpisie -------------------------
alter table public.entries add column if not exists delivered     boolean default false;
alter table public.entries add column if not exists delivered_by  text;
alter table public.entries add column if not exists delivered_at  timestamptz;

-- 2) Sesje tras kierowców ------------------------------------
create table if not exists public.driver_trips (
  id          uuid primary key default gen_random_uuid(),
  driver_id   uuid,
  driver_name text,
  trip_date   date not null,
  car         text not null,            -- fiat | isuzu | merc | iveco
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  end_km      numeric,
  status      text not null default 'active'  -- active | finished
);

alter table public.driver_trips enable row level security;
drop policy if exists "driver_trips access" on public.driver_trips;
create policy "driver_trips access" on public.driver_trips
  for all to anon, authenticated
  using (true) with check (true);
grant all on table public.driver_trips to anon, authenticated;

create index if not exists driver_trips_driver_date_idx
  on public.driver_trips (driver_id, trip_date);

-- ============================================================
--  Po uruchomieniu: kierowca może rozpocząć/zakończyć trasę,
--  potwierdzać dostawy (godzina automatyczna), a końcowy licznik
--  zapisuje się w daily_costs.{auto}_end dla bieżącego dnia.
-- ============================================================
