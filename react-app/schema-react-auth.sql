-- Dodanie kolumny auth_id do tabeli drivers
ALTER TABLE public.drivers 
ADD COLUMN IF NOT EXISTS auth_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Funkcja i Trigger automatycznie tworzący profil kierowcy po rejestracji
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.drivers (auth_id, name, routes)
  VALUES (NEW.id, split_part(NEW.email, '@', 1), '');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Usuwamy trigger jesli istnieje
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- WŁĄCZAMY RLS
ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;

-- USUWANIE STARYCH POLITYK PUBLICZNYCH (Z poprzedniej wersji)
DROP POLICY IF EXISTS "Publiczna widoczność tras" ON public.routes;
DROP POLICY IF EXISTS "Publiczna widoczność klientów" ON public.clients;
DROP POLICY IF EXISTS "Publiczna widoczność wpisów" ON public.entries;
DROP POLICY IF EXISTS "Publiczna widoczność logów" ON public.logs;
DROP POLICY IF EXISTS "Publiczna widoczność kierowców" ON public.drivers;

-- TWORZENIE POLITYK DLA ZALOGOWANYCH UŻYTKOWNIKÓW (authenticated)
-- Dajemy pełen dostęp do odczytu i zapisu dla zalogowanych (na razie prosty wariant dla wszystkich kierowców)
-- Jeśli chcesz, żeby kierowca widział TYLKO swoje trasy, można to tutaj obostrzyć, ale na ten moment 
-- robimy pełen dostęp dla wszystkich zweryfikowanych.

CREATE POLICY "Dostęp dla zalogowanych do tras" ON public.routes FOR ALL TO authenticated USING (true);
CREATE POLICY "Dostęp dla zalogowanych do klientów" ON public.clients FOR ALL TO authenticated USING (true);
CREATE POLICY "Dostęp dla zalogowanych do wpisów" ON public.entries FOR ALL TO authenticated USING (true);
CREATE POLICY "Dostęp dla zalogowanych do logów" ON public.logs FOR ALL TO authenticated USING (true);
CREATE POLICY "Dostęp dla zalogowanych do kierowców" ON public.drivers FOR ALL TO authenticated USING (true);
