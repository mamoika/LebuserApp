-- Thomas Müller może edytować grafik pracy bez pełnej roli administratora.
-- Uprawnienie korzysta z istniejącej macierzy modułów, a zapisy grafiku nadal
-- przechodzą przez audytowane RPC i triggery schedule_entries/timeline_entries.

begin;

create or replace function private.max_module_access(
  p_user_id uuid,
  p_role text,
  p_module text
)
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when lower(trim(app_user.username)) = 'muller' and p_module = 'work_schedule'
      then 2::smallint
    else private.default_module_access(p_role, p_module)
  end
  from public.users app_user
  where app_user.id = p_user_id;
$$;

create or replace function private.user_module_access(p_user_id uuid, p_module text)
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when app_user.role = 'admin' then 2::smallint
    else least(
      private.max_module_access(app_user.id, app_user.role, p_module),
      coalesce(
        permission.access_level,
        private.default_module_access(app_user.role, p_module)
      )
    )::smallint
  end
  from public.users app_user
  left join public.user_module_permissions permission
    on permission.user_id = app_user.id
   and permission.module = p_module
   and permission.base_role = app_user.role
  where app_user.id = p_user_id;
$$;

insert into public.user_module_permissions (
  user_id, module, access_level, base_role, updated_at, updated_by
)
select id, 'work_schedule', 2, role, now(), null
from public.users
where lower(trim(username)) = 'muller'
on conflict (user_id, module) do update
set access_level = excluded.access_level,
    base_role = excluded.base_role,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

create or replace function public.admin_get_user_module_permissions(p_session_token text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_users jsonb;
begin
  perform public.require_admin(p_session_token);

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', app_user.id,
    'role', app_user.role,
    'module_access', (
      select jsonb_object_agg(modules.module, private.user_module_access(app_user.id, modules.module))
      from unnest(array[
        'route', 'clients', 'route_plan', 'map', 'schedule', 'wash', 'warehouse',
        'history', 'live_routes', 'work_schedule', 'costs', 'admin'
      ]::text[]) as modules(module)
    ),
    'max_access', (
      select jsonb_object_agg(
        modules.module,
        private.max_module_access(app_user.id, app_user.role, modules.module)
      )
      from unnest(array[
        'route', 'clients', 'route_plan', 'map', 'schedule', 'wash', 'warehouse',
        'history', 'live_routes', 'work_schedule', 'costs', 'admin'
      ]::text[]) as modules(module)
    )
  ) order by app_user.created_at), '[]'::jsonb)
  into v_users
  from public.users app_user;

  return json_build_object('ok', true, 'users', v_users);
end;
$$;

create or replace function public.admin_save_user_module_permissions(
  p_session_token text,
  p_user_id uuid,
  p_module_access jsonb
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_role text;
  v_access jsonb;
begin
  v_admin_id := public.require_admin(p_session_token);
  if p_module_access is null or jsonb_typeof(p_module_access) <> 'object' then
    raise exception 'module_access must be an object' using errcode = '22023';
  end if;

  select role into v_role from public.users where id = p_user_id for update;
  if v_role is null then return json_build_object('error', 'Nie znaleziono użytkownika'); end if;
  if v_role = 'admin' then
    return json_build_object('error', 'Uprawnienia administratora są chronione');
  end if;

  if exists (
    select 1 from jsonb_each_text(p_module_access) item
    where item.key not in (
      'route', 'clients', 'route_plan', 'map', 'schedule', 'wash', 'warehouse',
      'history', 'live_routes', 'work_schedule', 'costs', 'admin'
    ) or item.value !~ '^[0-2]$'
  ) then
    raise exception 'Invalid module access matrix' using errcode = '22023';
  end if;

  delete from public.user_module_permissions where user_id = p_user_id;

  insert into public.user_module_permissions (
    user_id, module, access_level, base_role, updated_at, updated_by
  )
  select
    p_user_id,
    modules.module,
    case
      when modules.module = 'route' and least(
        private.max_module_access(p_user_id, v_role, modules.module),
        coalesce(
          (p_module_access->>modules.module)::smallint,
          private.default_module_access(v_role, modules.module)
        )
      ) = 1 then 0
      else least(
        private.max_module_access(p_user_id, v_role, modules.module),
        coalesce(
          (p_module_access->>modules.module)::smallint,
          private.default_module_access(v_role, modules.module)
        )
      )
    end,
    v_role,
    now(),
    v_admin_id
  from unnest(array[
    'route', 'clients', 'route_plan', 'map', 'schedule', 'wash', 'warehouse',
    'history', 'live_routes', 'work_schedule', 'costs', 'admin'
  ]::text[]) as modules(module);

  select jsonb_object_agg(modules.module, private.user_module_access(p_user_id, modules.module))
  into v_access
  from unnest(array[
    'route', 'clients', 'route_plan', 'map', 'schedule', 'wash', 'warehouse',
    'history', 'live_routes', 'work_schedule', 'costs', 'admin'
  ]::text[]) as modules(module);

  perform public.insert_log(
    p_session_token,
    'user_permissions_updated',
    null,
    null,
    'Zmieniono uprawnienia użytkownika',
    'security',
    'user',
    p_user_id::text,
    jsonb_build_object('module_access', v_access)
  );

  return json_build_object('ok', true, 'user_id', p_user_id, 'module_access', v_access);
end;
$$;

create or replace function public.admin_save_schedule_entry(
  p_session_token text,
  p_employee_id uuid,
  p_year integer,
  p_month integer,
  p_day integer,
  p_value text,
  p_updated_by text default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_value text;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if private.user_module_access(v_user.id, 'work_schedule') < 2 then
    raise exception 'Work schedule edit access required' using errcode = '42501';
  end if;

  if p_employee_id is null then
    return json_build_object('error', 'Brak pracownika');
  end if;
  if p_year is null or p_month is null or p_month < 1 or p_month > 12
    or p_day is null or p_day < 1 or p_day > 31
  then
    return json_build_object('error', 'Nieprawidłowa data grafiku');
  end if;

  v_value := nullif(trim(coalesce(p_value, '')), '');
  if v_value is null then
    return json_build_object('error', 'Brak wartości grafiku');
  end if;

  insert into public.schedule_entries (
    employee_id, year, month, day, value, updated_at, updated_by
  ) values (
    p_employee_id, p_year, p_month, p_day, upper(v_value), now(), v_user.name
  )
  on conflict (employee_id, year, month, day)
  do update set
    value = excluded.value,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

  return json_build_object('ok', true);
end;
$$;

create or replace function public.admin_save_timeline_entry(
  p_session_token text,
  p_employee_id uuid,
  p_entry_date date,
  p_hour integer,
  p_role text,
  p_updated_by text default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_role text;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if private.user_module_access(v_user.id, 'work_schedule') < 2 then
    raise exception 'Work schedule edit access required' using errcode = '42501';
  end if;

  if p_employee_id is null then
    return json_build_object('error', 'Brak pracownika');
  end if;
  if p_entry_date is null or p_hour is null or p_hour < 0 or p_hour > 23 then
    return json_build_object('error', 'Nieprawidłowy termin osi czasu');
  end if;

  v_role := nullif(trim(coalesce(p_role, '')), '');

  if v_role is null then
    delete from public.timeline_entries
    where employee_id = p_employee_id
      and entry_date = p_entry_date
      and hour = p_hour;
  else
    insert into public.timeline_entries (
      employee_id, entry_date, hour, role, updated_at, updated_by
    ) values (
      p_employee_id, p_entry_date, p_hour, v_role, now(), v_user.name
    )
    on conflict (employee_id, entry_date, hour)
    do update set
      role = excluded.role,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;
  end if;

  return json_build_object('ok', true);
end;
$$;

revoke all on function private.max_module_access(uuid, text, text) from public, anon, authenticated;
revoke all on function private.user_module_access(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_get_user_module_permissions(text) from public, anon, authenticated;
revoke all on function public.admin_save_user_module_permissions(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.admin_save_schedule_entry(text, uuid, integer, integer, integer, text, text) from public, anon, authenticated;
revoke all on function public.admin_save_timeline_entry(text, uuid, date, integer, text, text) from public, anon, authenticated;

grant execute on function public.admin_get_user_module_permissions(text) to anon, authenticated;
grant execute on function public.admin_save_user_module_permissions(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.admin_save_schedule_entry(text, uuid, integer, integer, integer, text, text) to anon, authenticated;
grant execute on function public.admin_save_timeline_entry(text, uuid, date, integer, text, text) to anon, authenticated;

commit;
