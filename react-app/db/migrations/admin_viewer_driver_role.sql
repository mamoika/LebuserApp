-- ============================================================
--  Composite app role: admin_viewer_driver
--
--  This role can view admin dashboards like admin_viewer and can use driver
--  flows like driver. It is not a full admin and cannot pass require_admin().
-- ============================================================

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
