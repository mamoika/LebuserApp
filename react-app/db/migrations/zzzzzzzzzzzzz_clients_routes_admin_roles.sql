-- Wszystkie role administracyjne mogą edytować moduł „Klienci i Trasy”.
-- Dostęp pozostaje ograniczony indywidualnym poziomem uprawnienia modułowego.

begin;

create or replace function private.default_module_access(p_role text, p_module text)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select case
    when p_role = 'admin' then 2
    when p_role = 'admin_viewer' and p_module in ('clients', 'route_plan') then 2
    when p_role = 'admin_viewer' and p_module in (
      'map', 'schedule', 'wash', 'warehouse', 'history',
      'live_routes', 'work_schedule', 'costs'
    ) then 1
    when p_role = 'admin_viewer_driver' and p_module in (
      'route', 'clients', 'route_plan', 'schedule', 'wash', 'warehouse'
    ) then 2
    when p_role = 'admin_viewer_driver' and p_module in (
      'map', 'history', 'live_routes', 'work_schedule', 'costs'
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

-- Poziom 1 był dotychczasowym maksimum roli, więc podnosimy go do nowej
-- wartości domyślnej. Świadomie ukryty moduł (poziom 0) pozostaje ukryty.
insert into public.user_module_permissions (
  user_id, module, access_level, base_role, updated_at, updated_by
)
select app_user.id, 'clients', 2, app_user.role, now(), null
from public.users app_user
where app_user.role in ('admin_viewer', 'admin_viewer_driver')
on conflict (user_id, module) do update
set access_level = excluded.access_level,
    base_role = excluded.base_role,
    updated_at = now(),
    updated_by = null
where public.user_module_permissions.base_role is distinct from excluded.base_role
   or public.user_module_permissions.access_level = 1;

create or replace function private.require_clients_routes_editor(p_session_token text)
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
     or private.user_module_access(v_user.id, 'clients') < 2 then
    raise exception 'Clients and routes edit access required' using errcode = '42501';
  end if;
  return v_user.id;
end;
$$;

revoke all on function private.require_clients_routes_editor(text)
  from public, anon, authenticated;

-- Zmieniamy kontrolę dostępu wyłącznie w funkcjach składających się na
-- ekran „Klienci i Trasy”. Pozostałe funkcje administratora nadal wymagają
-- public.require_admin().
do $$
declare
  v_signature text;
  v_oid regprocedure;
  v_definition text;
  v_updated text;
begin
  foreach v_signature in array array[
    'public.admin_create_route(text,text,text,integer,boolean)',
    'public.admin_update_route(text,integer,text,text,boolean)',
    'public.admin_delete_route(text,integer)',
    'public.admin_save_route_service_rules(text,integer,jsonb)',
    'public.admin_insert_client(text,text,integer)',
    'public.admin_update_client(text,uuid,text,integer,numeric,numeric)',
    'public.admin_save_client_service_rules(text,uuid,text,jsonb)',
    'public.admin_update_client_with_service_rules(text,uuid,text,integer,numeric,numeric,text,jsonb)',
    'public.admin_archive_client(text,uuid)',
    'public.admin_restore_client(text,uuid)',
    'public.admin_get_archived_clients(text)',
    'public.admin_merge_clients(text,uuid,uuid)',
    'public.admin_reorder_clients(text,jsonb)',
    'public.admin_reorder_routes(text,jsonb)',
    'public.admin_move_route_card(text,integer,integer)'
  ] loop
    v_oid := to_regprocedure(v_signature);
    if v_oid is null then
      raise exception 'Missing clients/routes function: %', v_signature;
    end if;

    v_definition := pg_get_functiondef(v_oid);
    v_updated := replace(
      v_definition,
      'public.require_admin(p_session_token)',
      'private.require_clients_routes_editor(p_session_token)'
    );

    if v_updated = v_definition
       and position('private.require_clients_routes_editor(p_session_token)' in v_definition) = 0 then
      raise exception 'Could not update clients/routes authorization: %', v_signature;
    end if;
    if v_updated <> v_definition then execute v_updated; end if;
  end loop;
end;
$$;

commit;
