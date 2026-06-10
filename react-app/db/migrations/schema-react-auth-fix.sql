DROP POLICY IF EXISTS "Dostęp dla zalogowanych do tras" ON public.routes;
DROP POLICY IF EXISTS "Dostęp dla zalogowanych do klientów" ON public.clients;
DROP POLICY IF EXISTS "Dostęp dla zalogowanych do wpisów" ON public.entries;
DROP POLICY IF EXISTS "Dostęp dla zalogowanych do logów" ON public.logs;
DROP POLICY IF EXISTS "Dostęp dla zalogowanych do kierowców" ON public.drivers;

CREATE POLICY "Dostęp dla zalogowanych do tras" ON public.routes FOR ALL TO anon, authenticated USING (true);
CREATE POLICY "Dostęp dla zalogowanych do klientów" ON public.clients FOR ALL TO anon, authenticated USING (true);
CREATE POLICY "Dostęp dla zalogowanych do wpisów" ON public.entries FOR ALL TO anon, authenticated USING (true);
CREATE POLICY "Dostęp dla zalogowanych do logów" ON public.logs FOR ALL TO anon, authenticated USING (true);
CREATE POLICY "Dostęp dla zalogowanych do kierowców" ON public.drivers FOR ALL TO anon, authenticated USING (true);
