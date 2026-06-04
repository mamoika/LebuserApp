-- Miękkie usuwanie wpisów (przyjazdów/odbiorów)
-- Zamiast fizycznie kasować wpis, oznaczamy go jako usunięty.
-- Dzięki temu nic nie przepada z historii.

ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS deleted_by TEXT;

-- Indeks przyspiesza filtrowanie aktywnych wpisów (deleted_at IS NULL)
CREATE INDEX IF NOT EXISTS entries_deleted_at_idx ON public.entries (deleted_at);
