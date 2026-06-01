-- Utworzenie tabel dla Lebuser App

-- 1. Tabele ze słownikami
CREATE TABLE routes (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  route_id INTEGER REFERENCES routes(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 9999,
  lat NUMERIC,
  lng NUMERIC
);

CREATE TABLE drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  routes TEXT -- Trasy przypisane do kierowcy
);

-- 2. Tabela zamówień / harmonogramu
CREATE TABLE entries (
  id TEXT PRIMARY KEY, -- Zachowujemy tekstowe ID (ID_12345) dla zgodności z kodem
  week_key TEXT NOT NULL, 
  client_name TEXT NOT NULL,
  arr_day INTEGER NOT NULL,
  pick_day INTEGER NOT NULL,
  done BOOLEAN DEFAULT false,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  pick_week_key TEXT NOT NULL,
  weight NUMERIC,
  route_id INTEGER REFERENCES routes(id) ON DELETE SET NULL,
  type TEXT DEFAULT 'P',
  added_by TEXT,
  picked_by TEXT,
  picked_at TEXT,
  comment TEXT,
  urgent BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 9999
);

-- 3. Tabela logów
CREATE TABLE logs (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_name TEXT,
  action TEXT,
  target_id TEXT,
  details TEXT
);

-- Włączenie RLS (Row Level Security) dla bezpieczeństwa 
-- Na początek pozwalamy na odczyt i zapis ze wszystkimi akcjami, docelowo zablokujemy.
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_routes" ON routes FOR ALL USING (true);
CREATE POLICY "public_clients" ON clients FOR ALL USING (true);
CREATE POLICY "public_drivers" ON drivers FOR ALL USING (true);
CREATE POLICY "public_entries" ON entries FOR ALL USING (true);
CREATE POLICY "public_logs" ON logs FOR ALL USING (true);

-- Dodanie domyślnej trasy na start
INSERT INTO routes (id, name) VALUES (1, 'Trasa 1');
