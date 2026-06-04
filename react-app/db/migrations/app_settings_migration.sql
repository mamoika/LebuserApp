-- ============================================================
--  Ustawienia aplikacji wspólne dla wszystkich adminów/urządzeń.
--  Generyczny magazyn klucz → wartość (jsonb). Użycie:
--    key = 'performance_progi_<YYYY-MM>' → progi wydajności kg/rbh
--    (ZD1/ZD2/WSP) OSOBNE DLA KAŻDEGO MIESIĄCA. Wiersze tworzą się
--    automatycznie przy pierwszej edycji progów danego miesiąca.
--  URUCHOM w Supabase → SQL Editor. Bezpieczne, idempotentne.
-- ============================================================

create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- RLS spójne z resztą aplikacji (aplikacja = rola anon; gating admina po stronie klienta)
alter table public.app_settings enable row level security;

drop policy if exists "app_settings access" on public.app_settings;
create policy "app_settings access" on public.app_settings
  for all to anon, authenticated
  using (true) with check (true);

grant all on table public.app_settings to anon, authenticated;

-- ============================================================
--  Po uruchomieniu edycja progów w zakładce Wydajność zapisuje się
--  per miesiąc (osobny wiersz performance_progi_<YYYY-MM>), wspólnie
--  dla wszystkich urządzeń. Domyślne progi są w kodzie aplikacji.
-- ============================================================
