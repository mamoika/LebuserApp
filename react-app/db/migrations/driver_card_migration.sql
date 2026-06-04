-- ============================================================
--  Cyfrowa "Karta pracy kierowcy": ilość koszy per odbiór/dostawa
--  oraz uwagi kierowcy do przystanku.
--  Odbiór (brudne od klienta) i dostawa (czyste do klienta) to dwie
--  osobne czynności na jednym przystanku — każda z własną godziną
--  (delivered_at / picked_at już istnieją) i liczbą koszy.
--  URUCHOM w Supabase → SQL Editor. Bezpieczne, idempotentne.
-- ============================================================

alter table public.entries add column if not exists delivered_baskets integer;
alter table public.entries add column if not exists picked_baskets    integer;
alter table public.entries add column if not exists driver_note        text;

-- ============================================================
--  Kolumny entries.delivered / picked (+ *_at, *_by) dodano wcześniej
--  w driver_routes_migration.sql. RLS na entries jest już dla anon.
-- ============================================================
