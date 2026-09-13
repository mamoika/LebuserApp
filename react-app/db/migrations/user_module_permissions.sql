-- Konfigurowalne per użytkownik poziomy dostępu do modułów aplikacji.
-- Są ograniczeniem istniejącej roli: nie mogą rozszerzyć jej bazowych praw.

begin;

create schema if not exists private;

create table if not exists public.user_module_permissions (
  user_id uuid not null references public.users(id) on delete cascade,
  module text not null check (module in (
    'route', 'clients', 'route_plan', 'map', 'schedule', 'wash', 'warehouse',
    'history', 'live_routes', 'work_schedule', 'costs', 'admin'
  )),
  access_level smallint not null check (access_level between 0 and 2),
  check (module <> 'route' or access_level <> 1),
  base_role text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null,
  primary key (user_id, module)
);

alter table public.user_module_permissions enable row level security;
revoke all on table public.user_module_permissions from public, anon, authenticated;

create or replace function private.default_module_access(p_role text, p_module text)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select case
    when p_role = 'admin' then 2
    when p_role = 'admin_viewer' and p_module in (
      'clients', 'map', 'schedule', 'wash', 'warehouse', 'history',
      'live_routes', 'work_schedule', 'costs'
    ) then 1
    when p_role = 'admin_viewer_driver' and p_module in (
      'route', 'schedule', 'wash', 'warehouse'
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
      private.default_module_access(app_user.role, p_module),
      coalesce(permission.access_level, private.default_module_access(app_user.role, p_module))
    )::smallint
  end
  from public.users app_user
  left join public.user_module_permissions permission
    on permission.user_id = app_user.id
   and permission.module = p_module
   and permission.base_role = app_user.role
  where app_user.id = p_user_id;
$$;

create or replace function public.get_my_module_permissions(p_session_token text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_access jsonb;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  select jsonb_object_agg(modules.module, private.user_module_access(v_user.id, modules.module))
  into v_access
  from unnest(array[
    'route', 'clients', 'route_plan', 'map', 'schedule', 'wash', 'warehouse',
    'history', 'live_routes', 'work_schedule', 'costs', 'admin'
  ]::text[]) as modules(module);

  return json_build_object('ok', true, 'module_access', v_access);
end;
$$;

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
      select jsonb_object_agg(modules.module, private.default_module_access(app_user.role, modules.module))
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
        private.default_module_access(v_role, modules.module),
        coalesce((p_module_access->>modules.module)::smallint, private.default_module_access(v_role, modules.module))
      ) = 1 then 0
      else least(
        private.default_module_access(v_role, modules.module),
        coalesce((p_module_access->>modules.module)::smallint, private.default_module_access(v_role, modules.module))
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

revoke all on function private.default_module_access(text, text) from public, anon, authenticated;
revoke all on function private.user_module_access(uuid, text) from public, anon, authenticated;
revoke all on function public.get_my_module_permissions(text) from public, anon, authenticated;
revoke all on function public.admin_get_user_module_permissions(text) from public, anon, authenticated;
revoke all on function public.admin_save_user_module_permissions(text, uuid, jsonb) from public, anon, authenticated;

grant execute on function public.get_my_module_permissions(text) to anon, authenticated;
grant execute on function public.admin_get_user_module_permissions(text) to anon, authenticated;
grant execute on function public.admin_save_user_module_permissions(text, uuid, jsonb) to anon, authenticated;

commit;
