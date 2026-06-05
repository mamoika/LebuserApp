-- ============================================================
--  Revoke direct table writes from the browser roles.
--
--  IMPORTANT DEPLOY ORDER:
--  1) Run and verify:
--     - driver_trips_rpc.sql
--     - admin_costs_settings_rpc.sql
--     - logs_rpc.sql
--  2) Deploy the frontend that writes through those RPCs.
--  3) Only then run this migration.
--
--  This migration intentionally keeps SELECT available for now because the
--  current frontend still performs direct reads. Read hardening is a separate
--  phase.
-- ============================================================

revoke insert, update, delete on table
  public.driver_trips,
  public.daily_costs,
  public.cost_settings,
  public.app_settings,
  public.logs
from anon, authenticated;

-- Defense in depth: keep known write-only helpers callable from anon, while
-- table writes above are blocked. These grants are repeated here so the final
-- state is explicit if migrations are inspected out of order.
grant execute on function public.driver_set_trip_extra_clients(text, uuid, text) to anon, authenticated;
grant execute on function public.driver_start_trip(text, uuid, date, text, text) to anon, authenticated;
grant execute on function public.admin_plan_driver_trip(text, uuid, date, text, text, text) to anon, authenticated;
grant execute on function public.driver_finish_trip(text, uuid, numeric) to anon, authenticated;
grant execute on function public.driver_change_trip_car(text, uuid, text) to anon, authenticated;
grant execute on function public.driver_cancel_trip(text, uuid) to anon, authenticated;
grant execute on function public.admin_update_trip_end_km(text, uuid, numeric) to anon, authenticated;
grant execute on function public.admin_delete_driver_trip(text, uuid) to anon, authenticated;

grant execute on function public.admin_upsert_app_setting(text, text, jsonb) to anon, authenticated;
grant execute on function public.admin_upsert_cost_settings(text, jsonb) to anon, authenticated;
grant execute on function public.admin_upsert_daily_costs(text, jsonb) to anon, authenticated;

grant execute on function public.insert_log(text, text, text, text, text) to anon, authenticated;
