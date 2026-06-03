-- ============================================================
--  Globalne ustawienia aplikacji (wspólne dla wszystkich adminów/urządzeń)
--  Generyczny magazyn klucz → wartość (jsonb). Pierwsze użycie:
--    key = 'performance_progi' → progi wydajności kg/rbh (ZD1/ZD2/WSP)
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

-- Wartość startowa progów (te same co domyślne w kodzie); nie nadpisuje jeśli już istnieje
insert into public.app_settings (key, value)
values (
  'performance_progi',
  '{"ZD1":{"slaba":4.0,"srednia":5.5,"dobra":8.0},"ZD2":{"slaba":14,"srednia":21,"dobra":26},"WSP":{"slaba":15,"srednia":20,"dobra":27}}'::jsonb
)
on conflict (key) do nothing;

-- ============================================================
--  Po uruchomieniu edycja progów w zakładce Wydajność zapisuje się globalnie.
-- ============================================================
