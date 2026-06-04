-- ============================================================
--  Trasa kierowcy: doraźnie dodane punkty (klienci) spoza wybranych tras.
--  extra_clients: JSON z listą nazw klientów dorzuconych do tej trasy,
--  np. ["Hotel X","Pensjonat Y"]. Pozwala dołożyć pojedynczy punkt
--  z obcej trasy bez dodawania całej trasy.
--  URUCHOM w Supabase → SQL Editor. Bezpieczne, idempotentne.
-- ============================================================

alter table public.driver_trips add column if not exists extra_clients text;
