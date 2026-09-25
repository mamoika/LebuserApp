-- Przywraca modułową kontrolę edycji planu tras po ponownym wdrożeniu
-- weekly_route_plan_vehicle_guard.sql. Starsza wersja tej migracji nadpisywała
-- funkcję zapisu i ponownie wymagała pełnej sesji administratora.

begin;

do $$
declare
  v_oid regprocedure := to_regprocedure(
    'public.admin_upsert_weekly_route_assignment(text,integer,date,uuid,text,timestamp with time zone)'
  );
  v_definition text;
  v_updated text;
begin
  if v_oid is null then
    raise exception 'Missing route plan function: admin_upsert_weekly_route_assignment';
  end if;

  v_definition := pg_get_functiondef(v_oid);
  v_updated := replace(
    v_definition,
    'perform public.require_admin(p_session_token);',
    'perform private.require_route_plan_editor(p_session_token);'
  );
  v_updated := replace(
    v_updated,
    'PERFORM public.require_admin(p_session_token);',
    'PERFORM private.require_route_plan_editor(p_session_token);'
  );

  if v_updated = v_definition
     and position('private.require_route_plan_editor(p_session_token)' in v_definition) = 0 then
    raise exception 'Could not update route plan assignment authorization';
  end if;

  if v_updated <> v_definition then execute v_updated; end if;
end;
$$;

commit;
