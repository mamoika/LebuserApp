begin;

create or replace function public.admin_get_database_status(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin(p_session_token);

  return pg_catalog.jsonb_build_object(
    'database_bytes', pg_catalog.pg_database_size(pg_catalog.current_database()),
    'checked_at', pg_catalog.statement_timestamp()
  );
end;
$$;

revoke all on function public.admin_get_database_status(text) from public;
grant execute on function public.admin_get_database_status(text) to anon, authenticated;

commit;
