-- Remove table privileges that the current frontend does not use directly.
-- This keeps the app's existing direct-table write model working, but reduces
-- damage from accidental or malicious calls made with the anon key.

-- These tables are never deleted from by the React app.
revoke delete on table
  public.app_settings,
  public.cost_settings,
  public.daily_costs,
  public.employees,
  public.entries,
  public.logs,
  public.schedule_entries
from anon, authenticated;

-- Logs are append-only/read-only in the app.
revoke update on table public.logs from anon, authenticated;
