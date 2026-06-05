-- ============================================================
--  Prywatny status „wyprane" na wpisie przyjazdu.
--  - NIE wpływa na odbiór (done), dostawę ani na flow kierowcy.
--  - Służy tylko do oznaczenia, że pranie zostało już zrobione
--    (np. wcześniej niż zaplanowano) i pomniejsza licznik
--    „Do prania" w harmonogramie.
--  Tabela entries ma już RLS dla anon/authenticated (appka działa
--  na roli anon), więc nowe kolumny dziedziczą dostęp — wystarczy ALTER.
--  URUCHOM w Supabase → SQL Editor. Bezpieczne, idempotentne.
-- ============================================================

alter table public.entries add column if not exists washed     boolean default false;
alter table public.entries add column if not exists washed_at  timestamptz;
alter table public.entries add column if not exists washed_by   text;
