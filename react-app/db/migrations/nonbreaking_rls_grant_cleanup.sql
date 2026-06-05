-- Non-breaking RLS/grant cleanup for the current custom-auth frontend.
--
-- The React app still performs direct table reads/writes with the anon key,
-- so this migration intentionally does NOT revoke SELECT/INSERT/UPDATE/DELETE
-- from operational tables yet. That stricter move needs an RPC/session-token
-- write layer first.

do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('revoke truncate, trigger, references on table %I.%I from anon, authenticated', r.schemaname, r.tablename);
  end loop;
end;
$$;

-- These tables are intentionally accessed only through SECURITY DEFINER RPCs.
revoke all on table public.users from anon, authenticated;
revoke all on table public.user_sessions from anon, authenticated;

-- Remove duplicate/performance-noisy policies without changing effective access.
drop policy if exists "Dostęp dla zalogowanych cost_settings" on public.cost_settings;
drop policy if exists "Dostęp dla zalogowanych daily_costs" on public.daily_costs;

drop policy if exists "Admin reads logs" on public.logs;
drop policy if exists "Anyone inserts logs" on public.logs;
drop policy if exists "public_logs" on public.logs;

drop policy if exists "Anyone reads employees" on public.employees;
drop policy if exists "Anyone reads schedule" on public.schedule_entries;
drop policy if exists "Anyone reads timeline" on public.timeline_entries;
