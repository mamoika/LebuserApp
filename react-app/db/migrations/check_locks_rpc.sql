create or replace function public.check_pg_locks()
returns table(pid integer, state text, query text, wait_event_type text, wait_event text)
language sql security definer as $$
  select pid, state, query, wait_event_type, wait_event
  from pg_stat_activity
  where state = 'active' and pid <> pg_backend_pid();
$$;
