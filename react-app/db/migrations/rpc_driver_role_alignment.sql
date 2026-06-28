-- ============================================================
--  Re-apply driver RPC role alignment.
--
--  Run after any driver/read RPC migration if admin_viewer_driver accounts
--  should be able to use the driver route screen.
-- ============================================================

create or replace function public.require_driver(p_session_token text)
returns table(id uuid, name text, routes text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;

  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role not in ('admin', 'admin_viewer_driver', 'driver') then
    raise exception 'Driver session required' using errcode = '42501';
  end if;

  id := v_user.id;
  name := v_user.name;
  routes := v_user.routes;
  return next;
end;
$$;

revoke all on function public.require_driver(text) from public, anon, authenticated;

create or replace function public.list_drivers(p_session_token text)
returns table(id uuid, name text, role text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller record;
begin
  select * into v_caller from public.session_user(p_session_token) limit 1;
  if v_caller.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  return query
  select u.id, u.name, u.role
  from public.users u
  where u.role in ('admin', 'admin_viewer_driver', 'driver')
  order by u.name;
end;
$$;

grant execute on function public.list_drivers(text) to anon, authenticated;

do $$
declare
  v_func record;
  v_sql text;
begin
  for v_func in
    select p.oid, pg_get_functiondef(p.oid) as definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and pg_get_functiondef(p.oid) like '%role%'
      and (
        pg_get_functiondef(p.oid) like '%admin_viewer%'
        or pg_get_functiondef(p.oid) like '%driver%'
      )
  loop
    v_sql := v_func.definition;

    v_sql := replace(v_sql, 'not in (''admin'', ''admin_viewer'', ''driver'', ''viewer'')', 'not in (''admin'', ''admin_viewer'', ''admin_viewer_driver'', ''driver'', ''viewer'')');
    v_sql := replace(v_sql, 'not in (''admin'',''admin_viewer'',''driver'',''viewer'')', 'not in (''admin'',''admin_viewer'',''admin_viewer_driver'',''driver'',''viewer'')');

    v_sql := replace(v_sql, 'role not in (''admin'', ''driver'')', 'role not in (''admin'', ''admin_viewer_driver'', ''driver'')');
    v_sql := replace(v_sql, 'role not in (''admin'',''driver'')', 'role not in (''admin'',''admin_viewer_driver'',''driver'')');
    v_sql := replace(v_sql, 'role in (''admin'', ''driver'')', 'role in (''admin'', ''admin_viewer_driver'', ''driver'')');
    v_sql := replace(v_sql, 'role in (''admin'',''driver'')', 'role in (''admin'',''admin_viewer_driver'',''driver'')');

    v_sql := replace(v_sql, 'role not in (''admin'', ''admin_viewer'')', 'role not in (''admin'', ''admin_viewer'', ''admin_viewer_driver'')');
    v_sql := replace(v_sql, 'role not in (''admin'',''admin_viewer'')', 'role not in (''admin'',''admin_viewer'',''admin_viewer_driver'')');

    if v_sql <> v_func.definition then
      execute v_sql;
    end if;
  end loop;
end
$$;

grant execute on function public.admin_create_user(text, text, text, text) to anon, authenticated;
grant execute on function public.update_user_role(text, uuid, text) to anon, authenticated;
grant execute on function public.list_drivers(text) to anon, authenticated;
