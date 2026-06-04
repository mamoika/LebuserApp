-- ============================================================
--  Trasa kierowcy: wybór tras na starcie (multi-trasa) + zważone kg.
--  - driver_trips.routes: które trasy kierowca obsługuje na tej trasie
--    (CSV id tras), bo bywa nieregularnie / z różnych tras naraz.
--  - entries.weighed_kg: rzeczywista waga brudnego, wpisywana po
--    zważeniu w pralni (kg znane dopiero po powrocie).
--  Zawiera też (idempotentnie) kolumny karty na wypadek, gdyby
--  driver_card_migration.sql nie zostało jeszcze uruchomione.
--  URUCHOM w Supabase → SQL Editor. Bezpieczne, idempotentne.
-- ============================================================

alter table public.driver_trips add column if not exists routes text;

alter table public.entries add column if not exists delivered_baskets integer;
alter table public.entries add column if not exists picked_baskets    integer;
alter table public.entries add column if not exists driver_note        text;
alter table public.entries add column if not exists weighed_kg         numeric;
