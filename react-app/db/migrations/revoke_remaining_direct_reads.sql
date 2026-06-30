-- ============================================================
--  Final read hardening.
--
--  Run only after:
--   1. remaining_read_rpc.sql has been run,
--   2. the matching frontend has been deployed,
--   3. the smoke test in SECURITY_DEPLOYMENT_CHECKLIST.md passes.
-- ============================================================

do $$
declare
  v_table text;
  v_tables text[] := array[
    'clients',
    'routes',
    'entries',
    'logs',
    'driver_trips',
    'daily_costs',
    'cost_settings',
    'app_settings',
    'employees',
    'schedule_entries',
    'timeline_entries',
    'employee_months',
    'groups',
    'laundry_receipts',
    'laundry_trolley_cycles',
    'tunnel_bags'
  ];
begin
  foreach v_table in array v_tables
  loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format('revoke select on table public.%I from anon, authenticated', v_table);
    end if;
  end loop;
end;
$$;

revoke execute on function public.get_month_roster(integer, integer, boolean) from public, anon, authenticated;
