-- ============================================================
--  Revoke direct log reads from browser roles.
--
--  DEPLOY ORDER:
--  1) Run db/migrations/logs_read_rpc.sql.
--  2) Deploy the frontend that reads logs through RPC.
--  3) Smoke test admin logs and entry change history.
--  4) Run this migration.
-- ============================================================

revoke select on table public.logs from anon, authenticated;

grant execute on function public.get_logs_page(text, integer, integer) to anon, authenticated;
grant execute on function public.get_entry_logs(text, text) to anon, authenticated;
