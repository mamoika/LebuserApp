begin;

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
      and (
        p.proname = 'admin_create_user'
        or p.proname = 'update_user_role'
      )
  loop
    v_sql := v_func.definition;

    v_sql := replace(v_sql, 'not in (''admin'', ''admin_viewer'', ''admin_viewer_driver'', ''driver'', ''viewer'')', 'not in (''admin'', ''admin_viewer'', ''admin_viewer_driver'', ''driver'', ''viewer'', ''tunnel'', ''packer'')');
    v_sql := replace(v_sql, 'not in (''admin'',''admin_viewer'',''admin_viewer_driver'',''driver'',''viewer'')', 'not in (''admin'',''admin_viewer'',''admin_viewer_driver'',''driver'',''viewer'',''tunnel'',''packer'')');
    
    -- Także sprawdzenie starych wersji na wszelki wypadek
    v_sql := replace(v_sql, 'not in (''admin'', ''admin_viewer'', ''driver'', ''viewer'')', 'not in (''admin'', ''admin_viewer'', ''admin_viewer_driver'', ''driver'', ''viewer'', ''tunnel'', ''packer'')');
    v_sql := replace(v_sql, 'not in (''admin'',''admin_viewer'',''driver'',''viewer'')', 'not in (''admin'',''admin_viewer'',''admin_viewer_driver'',''driver'',''viewer'',''tunnel'',''packer'')');

    if v_sql <> v_func.definition then
      execute v_sql;
    end if;
  end loop;
end
$$;

commit;
