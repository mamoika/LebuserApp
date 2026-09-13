-- Plan tras jest edytowalny dla wszystkich ról administracyjnych.
-- Uprawnienie modułowe nadal może odebrać dostęp konkretnej osobie.

begin;

create or replace function private.default_module_access(p_role text, p_module text)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select case
    when p_role = 'admin' then 2
    when p_role = 'admin_viewer' and p_module = 'route_plan' then 2
    when p_role = 'admin_viewer' and p_module in (
      'clients', 'map', 'schedule', 'wash', 'warehouse', 'history',
      'live_routes', 'work_schedule', 'costs'
    ) then 1
    when p_role = 'admin_viewer_driver' and p_module in (
      'route', 'route_plan', 'schedule', 'wash', 'warehouse'
    ) then 2
    when p_role = 'admin_viewer_driver' and p_module in (
      'clients', 'map', 'history', 'live_routes', 'work_schedule', 'costs'
    ) then 1
    when p_role = 'driver' and p_module in ('route', 'schedule') then 2
    when p_role = 'driver' and p_module in (
      'clients', 'map', 'wash', 'warehouse', 'history'
    ) then 1
    when p_role in ('tunnel', 'packer') and p_module in ('wash', 'warehouse') then 2
    when p_role in ('tunnel', 'packer') and p_module in (
      'clients', 'map', 'schedule', 'history'
    ) then 1
    when p_role = 'viewer' and p_module in ('clients', 'map', 'schedule', 'history') then 1
    else 0
  end::smallint;
$$;

-- Wcześniej role administracyjne miały tu wymuszony poziom 0, więc nie była
-- to świadoma konfiguracja użytkownika. Podnosimy go do nowej wartości domyślnej.
insert into public.user_module_permissions (
  user_id, module, access_level, base_role, updated_at, updated_by
)
select app_user.id, 'route_plan', 2, app_user.role, now(), null
from public.users app_user
where app_user.role in ('admin_viewer', 'admin_viewer_driver')
on conflict (user_id, module) do update
set access_level = 2,
    base_role = excluded.base_role,
    updated_at = now(),
    updated_by = null;

create or replace function private.require_route_plan_editor(p_session_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver')
     or private.user_module_access(v_user.id, 'route_plan') < 2 then
    raise exception 'Route plan edit access required' using errcode = '42501';
  end if;
  return v_user.id;
end;
$$;

revoke all on function private.require_route_plan_editor(text)
  from public, anon, authenticated;

-- Zachowujemy aktualne implementacje i zabezpieczenia funkcji planu, zmieniając
-- wyłącznie ich kontrolę dostępu z pełnego admina na edytora planu tras.
do $$
declare
  v_signature text;
  v_oid regprocedure;
  v_definition text;
  v_updated text;
begin
  foreach v_signature in array array[
    'public.admin_upsert_weekly_route_assignment(text,integer,date,uuid,text,timestamp with time zone)',
    'public.admin_remove_weekly_route_assignment(text,integer,date)',
    'public.admin_copy_weekly_route_plan(text,date,date)',
    'public.admin_publish_weekly_route_plan(text,date)',
    'public.admin_save_weekly_route_plan_visibility(text,jsonb,timestamp with time zone)'
  ] loop
    v_oid := to_regprocedure(v_signature);
    if v_oid is null then
      raise exception 'Missing route plan function: %', v_signature;
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
      raise exception 'Could not update route plan authorization: %', v_signature;
    end if;
    if v_updated <> v_definition then execute v_updated; end if;
  end loop;
end;
$$;

commit;
