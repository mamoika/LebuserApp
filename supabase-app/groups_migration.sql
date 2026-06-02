-- 1. Tworzenie tabeli groups
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  color TEXT DEFAULT '#455a64',
  sort_order INTEGER DEFAULT 9999
);

-- 2. Zezwolenie na publiczny odczyt (aby aplikacja React mogła je pobierać)
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_groups" ON groups FOR ALL USING (true);

-- 3. Wrzucenie domyślnych danych
INSERT INTO groups (name, color, sort_order) VALUES 
('BIURO', '#d35400', 10),
('TECHNICZNY', '#607d8b', 20),
('ZD 1', '#2e7d32', 30),
('ZD 2', '#c62828', 40),
('KIEROWCY', '#1565c0', 50);

-- UWAGA: pracownicy posiadają już zaktualizowane wartości w kolumnie `group_name` 
-- na nazwy w języku polskim (BIURO, TECHNICZNY, KIEROWCY), co odpowiada wpisom w tabeli `groups`.
