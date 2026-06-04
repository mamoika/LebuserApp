-- ============================================================
--  Naprawa dziennika (logs): brakujące kolumny + RLS + uprawnienia.
--  Dwie przyczyny pustych logów:
--   1) tabela nie miała wszystkich kolumn, których używa aplikacja
--      (m.in. entry_id, details) → insert cicho się wywalał,
--   2) aplikacja działa jako rola anon (własne sesje, nie Supabase Auth),
--      a tabela miała politykę RLS tylko dla authenticated.
--  URUCHOM w Supabase → SQL Editor. Bezpieczne, idempotentne.
-- ============================================================

-- 1) Brakujące kolumny (zgodne z tym, co zapisuje logger.js) ---
alter table public.logs add column if not exists user_name   text;
alter table public.logs add column if not exists action      text;
alter table public.logs add column if not exists client_name text;
alter table public.logs add column if not exists entry_id    text;
alter table public.logs add column if not exists details     text;
alter table public.logs add column if not exists created_at  timestamptz default now();

-- 2) RLS + uprawnienia dla roli anon -------------------------
alter table public.logs enable row level security;

drop policy if exists "Dostęp dla zalogowanych do logów" on public.logs;
drop policy if exists "logs access" on public.logs;
create policy "logs access" on public.logs
  for all to anon, authenticated
  using (true) with check (true);

grant all on table public.logs to anon, authenticated;

-- 3) Indeks pod oś czasu wpisu (logi danego wpisu po dacie) ---
create index if not exists logs_entry_id_idx on public.logs (entry_id);

-- ============================================================
--  Po uruchomieniu nowe akcje (dodanie/edycja/odbiór/usunięcie)
--  zaczną trafiać do dziennika i będą widoczne w panelu admina
--  oraz w "Historii zmian" przy wpisach.
-- ============================================================
