-- Utworzenie tabel dla Lebuser App

-- Rozszerzenie pgcrypto do hashowania haseł (bcrypt)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

-- 2. Tabela użytkowników (własny system auth, bez Supabase Auth)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'driver', -- 'admin' lub 'driver'
  routes TEXT, -- Trasy przypisane do kierowcy (np. "1,2,3")
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Tabela zamówień / harmonogramu
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

-- 4. Tabela logów
CREATE TABLE logs (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_name TEXT,
  action TEXT,
  target_id TEXT,
  details TEXT
);

-- Włączenie RLS (Row Level Security)
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_routes" ON routes FOR ALL USING (true);
CREATE POLICY "public_clients" ON clients FOR ALL USING (true);
CREATE POLICY "public_entries" ON entries FOR ALL USING (true);
CREATE POLICY "public_logs" ON logs FOR ALL USING (true);

-- Tabela users: zablokowany bezpośredni dostęp — tylko przez RPC (SECURITY DEFINER)
-- Brak publicznej polityki = brak bezpośredniego odczytu haseł z klienta

-- ========== FUNKCJE AUTH (RPC) ==========

-- Funkcja logowania — sprawdza hasło po stronie PostgreSQL, zwraca dane usera (bez hasła)
CREATE OR REPLACE FUNCTION login_user(p_username TEXT, p_password TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER -- wykonuje się z uprawnieniami twórcy, omija RLS
AS $$
DECLARE
  v_user RECORD;
BEGIN
  SELECT id, username, name, role, routes
  INTO v_user
  FROM users
  WHERE username = lower(trim(p_username))
    AND password_hash = crypt(p_password, password_hash);
  
  IF v_user.id IS NULL THEN
    RETURN json_build_object('error', 'Nieprawidłowa nazwa użytkownika lub hasło');
  END IF;
  
  RETURN json_build_object(
    'ok', true,
    'id', v_user.id,
    'username', v_user.username,
    'name', v_user.name,
    'role', v_user.role,
    'routes', v_user.routes
  );
END;
$$;

-- Funkcja rejestracji — hashuje hasło bcryptem, tworzy usera
CREATE OR REPLACE FUNCTION register_user(p_username TEXT, p_password TEXT, p_name TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_clean_username TEXT;
BEGIN
  v_clean_username := lower(trim(p_username));
  
  -- Sprawdź czy username jest zajęty
  IF EXISTS (SELECT 1 FROM users WHERE username = v_clean_username) THEN
    RETURN json_build_object('error', 'Ta nazwa użytkownika jest już zajęta');
  END IF;
  
  -- Utwórz użytkownika z hashowanym hasłem (bcrypt)
  INSERT INTO users (username, password_hash, name)
  VALUES (v_clean_username, crypt(p_password, gen_salt('bf')), p_name)
  RETURNING id INTO v_user_id;
  
  RETURN json_build_object('ok', true, 'id', v_user_id);
END;
$$;

-- Funkcja zmiany hasła
CREATE OR REPLACE FUNCTION change_password(p_user_id UUID, p_old_password TEXT, p_new_password TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Sprawdź stare hasło
  IF NOT EXISTS (
    SELECT 1 FROM users 
    WHERE id = p_user_id 
      AND password_hash = crypt(p_old_password, password_hash)
  ) THEN
    RETURN json_build_object('error', 'Nieprawidłowe aktualne hasło');
  END IF;
  
  -- Ustaw nowe hasło
  UPDATE users 
  SET password_hash = crypt(p_new_password, gen_salt('bf'))
  WHERE id = p_user_id;
  
  RETURN json_build_object('ok', true);
END;
$$;

-- ========== DANE STARTOWE ==========

-- Domyślna trasa
INSERT INTO routes (id, name) VALUES (1, 'Trasa 1');

-- Domyślny admin (username: admin, hasło: admin123)
INSERT INTO users (username, password_hash, name, role)
VALUES ('admin', crypt('admin123', gen_salt('bf')), 'Administrator', 'admin');

-- ========== FUNKCJE ADMINA (RPC) ==========

-- Lista wszystkich użytkowników (bez haseł)
CREATE OR REPLACE FUNCTION get_all_users()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT json_agg(
      json_build_object(
        'id', id,
        'username', username,
        'name', name,
        'role', role,
        'routes', routes,
        'created_at', created_at
      ) ORDER BY created_at
    )
    FROM users
  );
END;
$$;

-- Aktualizacja tras użytkownika
CREATE OR REPLACE FUNCTION update_user_routes(p_user_id UUID, p_routes TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE users SET routes = p_routes WHERE id = p_user_id;
  RETURN json_build_object('ok', true);
END;
$$;

-- Aktualizacja roli użytkownika
CREATE OR REPLACE FUNCTION update_user_role(p_user_id UUID, p_role TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE users SET role = p_role WHERE id = p_user_id;
  RETURN json_build_object('ok', true);
END;
$$;
